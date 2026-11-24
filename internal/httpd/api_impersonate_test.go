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

package httpd_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/drakkan/sftpgo/v2/internal/dataprovider"
	"github.com/drakkan/sftpgo/v2/internal/httpdtest"
)

func impersonateURL(username string) string {
	return userPath + "/" + url.PathEscape(username) + "/impersonate"
}

// doWithToken runs a request with a bearer token and returns code and body.
func doWithToken(t *testing.T, method, target, token string, body io.Reader) (int, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, target, body)
	require.NoError(t, err)
	setBearerForReq(req, token)
	rr := executeRequest(req)
	return rr.Code, rr.Body.Bytes()
}

func impersonate(t *testing.T, adminToken, username string) (int, string) {
	t.Helper()
	code, body := doWithToken(t, http.MethodPost, impersonateURL(username), adminToken, nil)
	if code != http.StatusOK {
		return code, ""
	}
	var resp map[string]any
	require.NoError(t, json.Unmarshal(body, &resp))
	assert.NotEmpty(t, resp["expires_at"])
	token, _ := resp["access_token"].(string)
	require.NotEmpty(t, token)
	return code, token
}

func TestImpersonateUser(t *testing.T) {
	u := getTestUser()
	// The user's own restrictions on how it logs in do not apply to the admin.
	u.Filters.AllowedIP = []string{"10.0.0.0/8"}
	user, _, err := httpdtest.AddUser(u, http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveUser(user, http.StatusOK)
		assert.NoError(t, err)
		assert.NoError(t, os.RemoveAll(user.GetHomeDir()))
	}()
	require.NoError(t, os.MkdirAll(filepath.Join(user.GetHomeDir(), "docs"), os.ModePerm))

	adminToken, err := getJWTAPITokenFromTestServer(defaultTokenAuthUser, defaultTokenAuthPass)
	require.NoError(t, err)

	code, _ := impersonate(t, adminToken, "missing-user")
	assert.Equal(t, http.StatusNotFound, code)

	code, token := impersonate(t, adminToken, user.Username)
	require.Equal(t, http.StatusOK, code)

	code, body := doWithToken(t, http.MethodGet, userDirsPath+"?path=%2F", token, nil)
	require.Equal(t, http.StatusOK, code, string(body))
	var entries []map[string]any
	require.NoError(t, json.Unmarshal(body, &entries))
	if assert.Len(t, entries, 1) {
		assert.Equal(t, "docs", entries[0]["name"])
	}
	// An admin with edit_users can write and share.
	code, body = doWithToken(t, http.MethodPost, userDirsPath+"?path=%2Fnew", token, nil)
	assert.Equal(t, http.StatusCreated, code, string(body))
	assert.DirExists(t, filepath.Join(user.GetHomeDir(), "new"))
	share, err := json.Marshal(dataprovider.Share{Name: "s", Scope: dataprovider.ShareScopeRead,
		Paths: []string{"/docs"}, Password: defaultPassword})
	require.NoError(t, err)
	code, body = doWithToken(t, http.MethodPost, userSharesPath, token, bytes.NewBuffer(share))
	assert.Equal(t, http.StatusCreated, code, string(body))
	code, _ = doWithToken(t, http.MethodGet, userProfilePath, token, nil)
	assert.Equal(t, http.StatusOK, code)

	// The token is not an admin token and cannot impersonate again.
	code, _ = doWithToken(t, http.MethodGet, userPath, token, nil)
	assert.Equal(t, http.StatusUnauthorized, code)
	code, _ = doWithToken(t, http.MethodPost, impersonateURL(user.Username), token, nil)
	assert.Equal(t, http.StatusUnauthorized, code)
	// Nor a web client cookie.
	req, err := http.NewRequest(http.MethodGet, webClientFilesPath, nil)
	require.NoError(t, err)
	req.Header.Set("Cookie", "jwt="+token)
	rr := executeRequest(req)
	assert.Equal(t, http.StatusFound, rr.Code)
	assert.Contains(t, rr.Header().Get("Location"), webClientLoginPath)

	// The user's own token is refused on the admin endpoint.
	userToken, err := getJWTAPIUserTokenFromTestServerWithAddr(defaultUsername, defaultPassword, "10.1.1.1:1234")
	require.NoError(t, err)
	req, err = http.NewRequest(http.MethodPost, impersonateURL(user.Username), nil)
	require.NoError(t, err)
	req.RemoteAddr = "10.1.1.1:1234"
	setBearerForReq(req, userToken)
	rr = executeRequest(req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)

	// Logout invalidates the token.
	code, _ = doWithToken(t, http.MethodGet, userLogoutPath, token, nil)
	assert.Equal(t, http.StatusOK, code)
	code, _ = doWithToken(t, http.MethodGet, userDirsPath, token, nil)
	assert.Equal(t, http.StatusUnauthorized, code)
}

func TestImpersonateUserAccountRoutesForbidden(t *testing.T) {
	user, _, err := httpdtest.AddUser(getTestUser(), http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveUser(user, http.StatusOK)
		assert.NoError(t, err)
		assert.NoError(t, os.RemoveAll(user.GetHomeDir()))
	}()
	adminToken, err := getJWTAPITokenFromTestServer(defaultTokenAuthUser, defaultTokenAuthPass)
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(user.GetHomeDir(), os.ModePerm))
	code, token := impersonate(t, adminToken, user.Username)
	require.Equal(t, http.StatusOK, code)

	pwd, err := json.Marshal(map[string]string{"current_password": defaultPassword, "new_password": "newpwd1234"})
	require.NoError(t, err)
	profile, err := json.Marshal(map[string]any{"email": "changed@example.com"})
	require.NoError(t, err)
	for _, tc := range []struct {
		method, path string
		body         []byte
	}{
		{http.MethodPut, userPwdPath, pwd},
		{http.MethodPut, userProfilePath, profile},
		{http.MethodGet, userTOTPConfigsPath, nil},
		{http.MethodPost, userTOTPGeneratePath, nil},
		{http.MethodPost, userTOTPValidatePath, nil},
		{http.MethodPost, userTOTPSavePath, nil},
		{http.MethodGet, user2FARecoveryCodesPath, nil},
		{http.MethodPost, user2FARecoveryCodesPath, nil},
	} {
		code, body := doWithToken(t, tc.method, tc.path, token, bytes.NewBuffer(tc.body))
		assert.Equal(t, http.StatusForbidden, code, "%s %s", tc.method, tc.path)
		assert.Contains(t, string(body), "Not allowed when acting as this user", "%s %s", tc.method, tc.path)
	}
	// Nothing changed: the user can still log in with the old password.
	_, err = getJWTAPIUserTokenFromTestServer(defaultUsername, defaultPassword)
	assert.NoError(t, err)
	// The token still works for files.
	code, _ = doWithToken(t, http.MethodGet, userDirsPath, token, nil)
	assert.Equal(t, http.StatusOK, code)
}

func TestImpersonateUserPermissions(t *testing.T) {
	user, _, err := httpdtest.AddUser(getTestUser(), http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveUser(user, http.StatusOK)
		assert.NoError(t, err)
		assert.NoError(t, os.RemoveAll(user.GetHomeDir()))
	}()
	require.NoError(t, os.MkdirAll(user.GetHomeDir(), os.ModePerm))
	require.NoError(t, os.WriteFile(filepath.Join(user.GetHomeDir(), "a.txt"), []byte("abc"), os.ModePerm))

	// Without view_user_files: refused, even with edit_users.
	a := getTestAdmin()
	a.Username = altAdminUsername
	a.Password = altAdminPassword
	a.Permissions = []string{dataprovider.PermAdminViewUsers, dataprovider.PermAdminChangeUsers}
	admin, _, err := httpdtest.AddAdmin(a, http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveAdmin(admin, http.StatusOK)
		assert.NoError(t, err)
	}()
	altToken, err := getJWTAPITokenFromTestServer(altAdminUsername, altAdminPassword)
	require.NoError(t, err)
	code, _ := impersonate(t, altToken, user.Username)
	assert.Equal(t, http.StatusForbidden, code)

	// view_user_files without edit_users: a read-only token.
	admin.Permissions = []string{dataprovider.PermAdminViewUsers, dataprovider.PermAdminViewUserFiles}
	admin, _, err = httpdtest.UpdateAdmin(admin, http.StatusOK)
	require.NoError(t, err)
	altToken, err = getJWTAPITokenFromTestServer(altAdminUsername, altAdminPassword)
	require.NoError(t, err)
	code, token := impersonate(t, altToken, user.Username)
	require.Equal(t, http.StatusOK, code)
	code, body := doWithToken(t, http.MethodGet, userDirsPath, token, nil)
	assert.Equal(t, http.StatusOK, code, string(body))
	code, body = doWithToken(t, http.MethodGet, userFilesPath+"?path=a.txt", token, nil)
	assert.Equal(t, http.StatusOK, code)
	assert.Equal(t, []byte("abc"), body)
	code, _ = doWithToken(t, http.MethodPost, userDirsPath+"?path=%2Fnew", token, nil)
	assert.Equal(t, http.StatusForbidden, code)
	code, _ = doWithToken(t, http.MethodPost, userUploadFilePath+"?path=b.txt", token, bytes.NewBufferString("x"))
	assert.Equal(t, http.StatusForbidden, code)
	code, _ = doWithToken(t, http.MethodDelete, userFilesPath+"?path=a.txt", token, nil)
	assert.Equal(t, http.StatusForbidden, code)
	share, err := json.Marshal(dataprovider.Share{Name: "s", Scope: dataprovider.ShareScopeRead,
		Paths: []string{"/"}, Password: defaultPassword})
	require.NoError(t, err)
	code, _ = doWithToken(t, http.MethodPost, userSharesPath, token, bytes.NewBuffer(share))
	assert.Equal(t, http.StatusForbidden, code)
	code, _ = doWithToken(t, http.MethodGet, userSharesPath, token, nil)
	assert.Equal(t, http.StatusForbidden, code)
	assert.NoFileExists(t, filepath.Join(user.GetHomeDir(), "b.txt"))
	assert.FileExists(t, filepath.Join(user.GetHomeDir(), "a.txt"))

	// Losing view_user_files invalidates the tokens already issued.
	admin.Permissions = []string{dataprovider.PermAdminViewUsers}
	admin, _, err = httpdtest.UpdateAdmin(admin, http.StatusOK)
	require.NoError(t, err)
	code, _ = doWithToken(t, http.MethodGet, userDirsPath, token, nil)
	assert.Equal(t, http.StatusUnauthorized, code)

	// A role admin only reaches the users of its role.
	role, _, err := httpdtest.AddRole(getTestRole(), http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveRole(role, http.StatusOK)
		assert.NoError(t, err)
	}()
	admin.Permissions = []string{dataprovider.PermAdminViewUsers, dataprovider.PermAdminViewUserFiles,
		dataprovider.PermAdminChangeUsers}
	admin.Role = role.Name
	admin, _, err = httpdtest.UpdateAdmin(admin, http.StatusOK)
	require.NoError(t, err)
	altToken, err = getJWTAPITokenFromTestServer(altAdminUsername, altAdminPassword)
	require.NoError(t, err)
	code, _ = impersonate(t, altToken, user.Username)
	assert.Equal(t, http.StatusNotFound, code, "a user outside the admin's role must not be reachable")

	user.Role = role.Name
	user, _, err = httpdtest.UpdateUser(user, http.StatusOK, "")
	require.NoError(t, err)
	code, token = impersonate(t, altToken, user.Username)
	require.Equal(t, http.StatusOK, code)
	code, _ = doWithToken(t, http.MethodPost, userDirsPath+"?path=%2Fnew", token, nil)
	assert.Equal(t, http.StatusCreated, code)
	// Detach the user from the role so the deferred cleanup can remove the role.
	user.Role = ""
	user, _, err = httpdtest.UpdateUser(user, http.StatusOK, "")
	require.NoError(t, err)
	admin.Role = ""
	admin, _, err = httpdtest.UpdateAdmin(admin, http.StatusOK)
	require.NoError(t, err)
}

func TestImpersonateUserStatusAndSignature(t *testing.T) {
	user, _, err := httpdtest.AddUser(getTestUser(), http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveUser(user, http.StatusOK)
		assert.NoError(t, err)
		assert.NoError(t, os.RemoveAll(user.GetHomeDir()))
	}()
	require.NoError(t, os.MkdirAll(user.GetHomeDir(), os.ModePerm))
	adminToken, err := getJWTAPITokenFromTestServer(defaultTokenAuthUser, defaultTokenAuthPass)
	require.NoError(t, err)

	code, token := impersonate(t, adminToken, user.Username)
	require.Equal(t, http.StatusOK, code)
	code, _ = doWithToken(t, http.MethodGet, userDirsPath, token, nil)
	require.Equal(t, http.StatusOK, code)

	// Editing the user invalidates the token, whatever the token validation mode.
	user.Description = "edited"
	user, _, err = httpdtest.UpdateUser(user, http.StatusOK, "")
	require.NoError(t, err)
	code, _ = doWithToken(t, http.MethodGet, userDirsPath, token, nil)
	assert.Equal(t, http.StatusUnauthorized, code)

	// A disabled user cannot be impersonated.
	user.Status = 0
	user, _, err = httpdtest.UpdateUser(user, http.StatusOK, "")
	require.NoError(t, err)
	code, _ = impersonate(t, adminToken, user.Username)
	assert.Equal(t, http.StatusForbidden, code)
	// Nor an expired one.
	user.Status = 1
	user.ExpirationDate = 1
	user, _, err = httpdtest.UpdateUser(user, http.StatusOK, "")
	require.NoError(t, err)
	code, _ = impersonate(t, adminToken, user.Username)
	assert.Equal(t, http.StatusForbidden, code)

	user.ExpirationDate = 0
	user, _, err = httpdtest.UpdateUser(user, http.StatusOK, "")
	require.NoError(t, err)
	code, token = impersonate(t, adminToken, user.Username)
	require.Equal(t, http.StatusOK, code)
	code, _ = doWithToken(t, http.MethodGet, userDirsPath, token, nil)
	assert.Equal(t, http.StatusOK, code)
	// Impersonation is not a login.
	userGet, _, err := httpdtest.GetUserByUsername(user.Username, http.StatusOK)
	require.NoError(t, err)
	assert.Equal(t, int64(0), userGet.LastLogin)
}
