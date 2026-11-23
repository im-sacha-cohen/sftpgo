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
	"errors"
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"

	"github.com/go-chi/render"
	"github.com/rs/xid"
	"github.com/sftpgo/sdk"

	"github.com/drakkan/sftpgo/v2/internal/common"
	"github.com/drakkan/sftpgo/v2/internal/dataprovider"
	"github.com/drakkan/sftpgo/v2/internal/jwt"
	"github.com/drakkan/sftpgo/v2/internal/logger"
	"github.com/drakkan/sftpgo/v2/internal/util"
)

// Access for administrators to the content of a virtual folder. The admin needs
// both manage_folders and view_user_files. The folder is reached through a
// connection for a synthetic user whose root is the folder's filesystem (mapped
// path or remote storage), so nothing outside the folder can be reached. Read
// handlers get a read-only user; the write handlers below (upload, mkdir,
// rename/move, delete) get full permissions on the folder. The synthetic user
// does not exist in the data provider, so the folder's used quota is not
// updated on writes: run a folder quota scan afterwards (the Console does).

func getAdminFolderConnection(w http.ResponseWriter, r *http.Request, write ...bool) (*Connection, error) {
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
			Permissions: folderPermissions(len(write) > 0 && write[0]),
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
	logger.Info(logSender, connection.GetID(), "admin %q is accessing the virtual folder %q, method %s, path %q",
		claims.Username, folder.Name, r.Method, r.URL.Query().Get("path"))
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

// getSpacesDefaults returns where the Console suggests to store new spaces: a
// "spaces" directory next to the users base dir (/srv/sftpgo/spaces in the
// Docker image). base_dir is empty when no users base dir is configured.
func getSpacesDefaults(w http.ResponseWriter, r *http.Request) {
	baseDir := ""
	if usersBaseDir := dataprovider.GetUsersBaseDir(); usersBaseDir != "" {
		baseDir = filepath.Join(filepath.Dir(filepath.Clean(usersBaseDir)), "spaces")
	}
	render.JSON(w, r, map[string]string{"base_dir": baseDir})
}

func folderPermissions(write bool) map[string][]string {
	if write {
		return map[string][]string{"/": {dataprovider.PermAny}}
	}
	return map[string][]string{"/": {dataprovider.PermListItems, dataprovider.PermDownload}}
}

// adminConnGetter opens the connection a write handler works on (a folder's
// synthetic user, or a real user on behalf of the admin) and sends the error
// response itself.
type adminConnGetter func(w http.ResponseWriter, r *http.Request) (*Connection, error)

func getAdminFolderWriteConnection(w http.ResponseWriter, r *http.Request) (*Connection, error) {
	return getAdminFolderConnection(w, r, true)
}

// withAdminWriteConnection runs fn with the connection from get and removes the
// connection afterwards.
func withAdminWriteConnection(w http.ResponseWriter, r *http.Request, get adminConnGetter, fn func(*Connection)) {
	connection, err := get(w, r)
	if connection != nil {
		defer common.Connections.Remove(connection.GetID())
	}
	if err != nil {
		return
	}
	_ = connection.User.CheckFsRoot(connection.ID)
	fn(connection)
}

func adminFsCreateDir(get adminConnGetter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
		withAdminWriteConnection(w, r, get, func(connection *Connection) {
			name := connection.User.GetCleanedPath(r.URL.Query().Get("path"))
			if name == "/" {
				sendAPIResponse(w, r, nil, "Please set the path of the directory to create", http.StatusBadRequest)
				return
			}
			if getBoolQueryParam(r, "mkdir_parents") {
				if err := connection.CheckParentDirs(path.Dir(name)); err != nil {
					sendAPIResponse(w, r, err, "Error checking parent directories", getMappedStatusCode(err))
					return
				}
			}
			if err := connection.CreateDir(name); err != nil {
				sendAPIResponse(w, r, err, fmt.Sprintf("Unable to create directory %q", name), getMappedStatusCode(err))
				return
			}
			sendAPIResponse(w, r, nil, fmt.Sprintf("Directory %q created", name), http.StatusCreated)
		})
	}
}

func adminFsDeleteDir(get adminConnGetter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
		withAdminWriteConnection(w, r, get, func(connection *Connection) {
			name := connection.User.GetCleanedPath(r.URL.Query().Get("path"))
			if name == "/" {
				sendAPIResponse(w, r, nil, "The root directory cannot be deleted", http.StatusBadRequest)
				return
			}
			if err := connection.RemoveAll(name); err != nil {
				sendAPIResponse(w, r, err, fmt.Sprintf("Unable to delete directory %q", name), getMappedStatusCode(err))
				return
			}
			sendAPIResponse(w, r, nil, fmt.Sprintf("Directory %q deleted", name), http.StatusOK)
		})
	}
}

func adminFsDeleteFile(get adminConnGetter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
		withAdminWriteConnection(w, r, get, func(connection *Connection) {
			name := connection.User.GetCleanedPath(r.URL.Query().Get("path"))
			fs, p, err := connection.GetFsAndResolvedPath(name)
			if err != nil {
				sendAPIResponse(w, r, err, fmt.Sprintf("Unable to delete file %q", name), getMappedStatusCode(err))
				return
			}
			var fi os.FileInfo
			if fi, err = fs.Lstat(p); err != nil {
				err = connection.GetFsError(fs, err)
				sendAPIResponse(w, r, err, fmt.Sprintf("Unable to delete file %q", name), getMappedStatusCode(err))
				return
			}
			if fi.IsDir() && fi.Mode()&os.ModeSymlink == 0 {
				sendAPIResponse(w, r, nil, fmt.Sprintf("Unable delete %q, it is not a file/symlink", name), http.StatusBadRequest)
				return
			}
			if err = connection.RemoveFile(fs, p, name, fi); err != nil {
				sendAPIResponse(w, r, err, fmt.Sprintf("Unable to delete file %q", name), getMappedStatusCode(err))
				return
			}
			sendAPIResponse(w, r, nil, fmt.Sprintf("File %q deleted", name), http.StatusOK)
		})
	}
}

func adminFsMove(get adminConnGetter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
		withAdminWriteConnection(w, r, get, func(connection *Connection) {
			oldName := connection.User.GetCleanedPath(r.URL.Query().Get("path"))
			newName := connection.User.GetCleanedPath(r.URL.Query().Get("target"))
			if oldName == "/" || newName == "/" {
				sendAPIResponse(w, r, nil, "The root directory cannot be moved", http.StatusBadRequest)
				return
			}
			if err := connection.Rename(oldName, newName); err != nil {
				sendAPIResponse(w, r, err, fmt.Sprintf("Unable to rename %q => %q", oldName, newName), getMappedStatusCode(err))
				return
			}
			sendAPIResponse(w, r, nil, fmt.Sprintf("%q renamed to %q", oldName, newName), http.StatusOK)
		})
	}
}

func adminFsUpload(get adminConnGetter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if maxUploadFileSize > 0 {
			r.Body = http.MaxBytesReader(w, r.Body, maxUploadFileSize)
		}
		if !r.URL.Query().Has("path") {
			sendAPIResponse(w, r, errors.New("please set a file path"), "", http.StatusBadRequest)
			return
		}
		withAdminWriteConnection(w, r, get, func(connection *Connection) {
			filePath := connection.User.GetCleanedPath(r.URL.Query().Get("path"))
			if getBoolQueryParam(r, "mkdir_parents") {
				if err := connection.CheckParentDirs(path.Dir(filePath)); err != nil {
					sendAPIResponse(w, r, err, "Error checking parent directories", getMappedStatusCode(err))
					return
				}
			}
			_ = doUploadFile(w, r, connection, filePath)
		})
	}
}
