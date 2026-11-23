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
	"github.com/sftpgo/sdk"

	"github.com/drakkan/sftpgo/v2/internal/common"
	"github.com/drakkan/sftpgo/v2/internal/dataprovider"
	"github.com/drakkan/sftpgo/v2/internal/jwt"
	"github.com/drakkan/sftpgo/v2/internal/logger"
	"github.com/drakkan/sftpgo/v2/internal/util"
)

// Read-only access for administrators to the content of a virtual folder.
// The admin needs both manage_folders and view_user_files. The folder is read
// through a connection for a synthetic, read-only user whose root is the
// folder's filesystem (mapped path or remote storage), so nothing outside the
// folder can be reached and nothing can be written.

func getAdminFolderConnection(w http.ResponseWriter, r *http.Request) (*Connection, error) {
	claims, err := jwt.FromContext(r.Context())
	if err != nil || claims.Username == "" {
		sendAPIResponse(w, r, err, "Invalid token claims", http.StatusBadRequest)
		return nil, fmt.Errorf("invalid token claims %w", err)
	}
	name := getURLParam(r, "name")
	folder, err := dataprovider.GetFolderByName(name)
	if err != nil {
		sendAPIResponse(w, r, err, "", getRespStatus(err))
		return nil, err
	}
	user := dataprovider.User{
		BaseUser: sdk.BaseUser{
			Username:    fmt.Sprintf("folder:%s", folder.Name),
			Status:      1,
			HomeDir:     folder.MappedPath,
			Permissions: map[string][]string{"/": {dataprovider.PermListItems, dataprovider.PermDownload}},
		},
		FsConfig: folder.FsConfig,
	}
	connID := xid.New().String()
	protocol := getProtocolFromRequest(r)
	baseConn := common.NewBaseConnection(connID, protocol, util.GetHTTPLocalAddress(r), r.RemoteAddr, user)
	connection := newConnection(baseConn, w, r)
	if err = common.Connections.Add(connection); err != nil {
		sendAPIResponse(w, r, err, "Unable to add connection", http.StatusTooManyRequests)
		return connection, err
	}
	logger.Info(logSender, connection.GetID(), "admin %q is reading the virtual folder %q, path %q",
		claims.Username, folder.Name, r.URL.Query().Get("path"))
	return connection, nil
}

func adminReadFolderDir(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
	connection, err := getAdminFolderConnection(w, r)
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

func adminGetFolderFile(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
	connection, err := getAdminFolderConnection(w, r)
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
