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
	"context"
	"fmt"
	"net/http"

	"github.com/go-chi/render"
	"github.com/rs/xid"

	"github.com/drakkan/sftpgo/v2/internal/common"
	"github.com/drakkan/sftpgo/v2/internal/dataprovider"
	"github.com/drakkan/sftpgo/v2/internal/jwt"
	"github.com/drakkan/sftpgo/v2/internal/logger"
	"github.com/drakkan/sftpgo/v2/internal/util"
)

// Read-only access for administrators to the files of a user. The admin needs
// the view_user_files permission and, when bound to a role, can only reach the
// users of that role. Files are read through a regular connection for the user,
// so the user's own permissions, virtual folders and storage backends apply.

// getAdminUserConnection opens a connection as the user named in the URL on
// behalf of the admin in the token. It sends the error response itself.
// adminUserConnection is the connection an administrator opens on a user's
// files. It is listed apart from the user's own sessions ("admin:<admin>@<user>",
// a name a real user cannot have) so it neither counts towards nor is blocked by
// the user's max sessions.
type adminUserConnection struct {
	*Connection
	label string
}

func (c *adminUserConnection) GetUsername() string { return c.label }

func (c *adminUserConnection) GetMaxSessions() int { return 0 }

func getAdminUserConnection(w http.ResponseWriter, r *http.Request) (*Connection, error) {
	claims, err := jwt.FromContext(r.Context())
	if err != nil || claims.Username == "" {
		sendAPIResponse(w, r, err, "Invalid token claims", http.StatusBadRequest)
		return nil, fmt.Errorf("invalid token claims %w", err)
	}
	username := getURLParam(r, "username")
	user, err := dataprovider.GetUserWithGroupSettings(username, claims.Role)
	if err != nil {
		sendAPIResponse(w, r, err, "", getRespStatus(err))
		return nil, err
	}
	// What the administrator reads or writes must not use up the user's data
	// transfer quota: drop the transfer limits for this connection only. The
	// user's permissions, file filters and disk quota still apply.
	user.UploadDataTransfer = 0
	user.DownloadDataTransfer = 0
	user.TotalDataTransfer = 0
	connID := xid.New().String()
	protocol := getProtocolFromRequest(r)
	baseConn := common.NewBaseConnection(connID, protocol, util.GetHTTPLocalAddress(r), r.RemoteAddr, user)
	connection := newConnection(baseConn, w, r)
	tracked := &adminUserConnection{Connection: connection, label: fmt.Sprintf("admin:%s@%s", claims.Username, user.Username)}
	if err = common.Connections.Add(tracked); err != nil {
		sendAPIResponse(w, r, err, "Unable to add connection", http.StatusTooManyRequests)
		return connection, err
	}
	logger.Info(logSender, connection.GetID(), "admin %q is accessing the files of user %q, method %s, path %q",
		claims.Username, user.Username, r.Method, r.URL.Query().Get("path"))
	return connection, nil
}

func adminReadUserFolder(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
	connection, err := getAdminUserConnection(w, r)
	if err != nil {
		if connection != nil {
			common.Connections.Remove(connection.GetID())
		}
		return
	}
	defer common.Connections.Remove(connection.GetID())

	name := connection.User.GetCleanedPath(r.URL.Query().Get("path"))
	lister, err := connection.ReadDir(name)
	if err != nil {
		sendAPIResponse(w, r, err, "Unable to get directory lister", getMappedStatusCode(err))
		return
	}
	renderAPIDirContents(w, lister, false)
}

func adminGetUserFile(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
	connection, err := getAdminUserConnection(w, r)
	if err != nil {
		if connection != nil {
			common.Connections.Remove(connection.GetID())
		}
		return
	}
	defer common.Connections.Remove(connection.GetID())

	name := connection.User.GetCleanedPath(r.URL.Query().Get("path"))
	if name == "/" {
		sendAPIResponse(w, r, nil, "Please set the path to a valid file", http.StatusBadRequest)
		return
	}
	info, err := connection.Stat(name, 0)
	if err != nil {
		sendAPIResponse(w, r, err, "Unable to stat the requested file", getMappedStatusCode(err))
		return
	}
	if info.IsDir() {
		sendAPIResponse(w, r, nil, fmt.Sprintf("Please set the path to a valid file, %q is a directory", name), http.StatusBadRequest)
		return
	}
	if status, err := downloadFile(w, r, connection, name, info, false, nil); err != nil {
		resp := apiResponse{
			Error:   err.Error(),
			Message: http.StatusText(status),
		}
		ctx := r.Context()
		if status != 0 {
			ctx = context.WithValue(ctx, render.StatusCtxKey, status)
		}
		render.JSON(w, r.WithContext(ctx), resp)
	}
}
