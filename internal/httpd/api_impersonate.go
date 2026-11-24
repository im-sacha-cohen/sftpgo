// Copyright (C) 2019 Nicola Murino
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, version 3.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

package httpd

import (
	"fmt"
	"net/http"
	"slices"
	"time"

	"github.com/go-chi/render"
	"github.com/sftpgo/sdk"

	"github.com/drakkan/sftpgo/v2/internal/dataprovider"
	"github.com/drakkan/sftpgo/v2/internal/jwt"
	"github.com/drakkan/sftpgo/v2/internal/logger"
	"github.com/drakkan/sftpgo/v2/internal/util"
)

// impersonationTokenDuration is the lifetime of a token an administrator gets
// to act as a user. It is short on purpose: the Console asks for a new one.
const impersonationTokenDuration = 15 * time.Minute

// impersonateUser returns a user API token so that an administrator can use
// the user REST API on behalf of the user. It is not a user login: no password,
// second factor or user IP filter is checked and the last login is not updated.
// Without the edit_users permission the token is read-only.
func (s *httpdServer) impersonateUser(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
	claims, err := jwt.FromContext(r.Context())
	if err != nil || claims.Username == "" {
		sendAPIResponse(w, r, err, "Invalid token claims", http.StatusBadRequest)
		return
	}
	if claims.ImpersonatedBy != "" {
		sendAPIResponse(w, r, nil, "Not allowed when acting as this user", http.StatusForbidden)
		return
	}
	username := getURLParam(r, "username")
	user, err := dataprovider.GetUserWithGroupSettings(username, claims.Role)
	if err != nil {
		sendAPIResponse(w, r, err, "", getRespStatus(err))
		return
	}
	if err := user.CheckAccountValidity(); err != nil {
		sendAPIResponse(w, r, err, "Unable to act as this user", http.StatusForbidden)
		return
	}
	permissions := slices.Clone(user.Filters.WebClient)
	if !claims.HasPerm(dataprovider.PermAdminChangeUsers) {
		for _, perm := range []string{sdk.WebClientWriteDisabled, sdk.WebClientSharesDisabled} {
			if !slices.Contains(permissions, perm) {
				permissions = append(permissions, perm)
			}
		}
	}
	c := &jwt.Claims{
		Username:       user.Username,
		Permissions:    permissions,
		Role:           user.Role,
		ImpersonatedBy: claims.Username,
	}
	c.Subject = user.GetSignature()

	ipAddr := util.GetIPFromRemoteAddress(r.RemoteAddr)
	token, err := s.tokenAuth.SignWithParams(c, tokenAudienceAPIUser, ipAddr, impersonationTokenDuration)
	if err != nil {
		sendAPIResponse(w, r, err, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	}
	logger.Info(logSender, "", "admin %q is now acting as user %q, ip %q, read only: %t",
		claims.Username, user.Username, ipAddr, !claims.HasPerm(dataprovider.PermAdminChangeUsers))
	render.JSON(w, r, c.BuildTokenResponse(token))
}

// checkImpersonatedToken is checked on every request made with a token an
// administrator got to act as a user. Unlike a user's own token, it is always
// bound to the user's signature, whatever the token validation mode: editing
// the user invalidates it. It also stops working when the administrator is
// disabled, loses the permissions it was issued with or moves to another role.
func checkImpersonatedToken(r *http.Request, claims *jwt.Claims) error {
	if err := validateSignatureForToken(claims, dataprovider.GetUserSignature); err != nil {
		return err
	}
	admin, err := dataprovider.AdminExists(claims.ImpersonatedBy)
	if err != nil {
		return fmt.Errorf("unable to get admin %q: %w", claims.ImpersonatedBy, err)
	}
	if err := admin.CanLogin(util.GetIPFromRemoteAddress(r.RemoteAddr)); err != nil {
		return err
	}
	if !admin.HasPermission(dataprovider.PermAdminViewUserFiles) {
		return fmt.Errorf("admin %q no longer has the %q permission", admin.Username, dataprovider.PermAdminViewUserFiles)
	}
	if !admin.HasPermission(dataprovider.PermAdminChangeUsers) &&
		(!claims.HasPerm(sdk.WebClientWriteDisabled) || !claims.HasPerm(sdk.WebClientSharesDisabled)) {
		return fmt.Errorf("admin %q no longer has the %q permission", admin.Username, dataprovider.PermAdminChangeUsers)
	}
	if admin.Role != "" && admin.Role != claims.Role {
		return fmt.Errorf("admin %q has role %q, the user has role %q", admin.Username, admin.Role, claims.Role)
	}
	return nil
}

// forbidImpersonation refuses the account management APIs (password, profile,
// second factor, recovery codes) to an administrator acting as the user.
func forbidImpersonation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, err := jwt.FromContext(r.Context())
		if err != nil {
			sendAPIResponse(w, r, err, "Invalid token claims", http.StatusBadRequest)
			return
		}
		if claims.ImpersonatedBy != "" {
			sendAPIResponse(w, r, nil, "Not allowed when acting as this user", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
