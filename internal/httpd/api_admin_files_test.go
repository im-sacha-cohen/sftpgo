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
	"encoding/json"
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

func TestAdminReadUserFiles(t *testing.T) {
	user, _, err := httpdtest.AddUser(getTestUser(), http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveUser(user, http.StatusOK)
		assert.NoError(t, err)
		assert.NoError(t, os.RemoveAll(user.GetHomeDir()))
	}()
	content := []byte("0123456789abcdef")
	require.NoError(t, os.MkdirAll(filepath.Join(user.GetHomeDir(), "music"), os.ModePerm))
	require.NoError(t, os.WriteFile(filepath.Join(user.GetHomeDir(), "music", "song a.mp3"), content, os.ModePerm))

	dirsURL := func(username, p string) string {
		return userPath + "/" + url.PathEscape(username) + "/fs/dirs?path=" + url.QueryEscape(p)
	}
	filesURL := func(username, p string) string {
		return userPath + "/" + url.PathEscape(username) + "/fs/files?path=" + url.QueryEscape(p)
	}
	do := func(token, target string, header map[string]string) (int, []byte, http.Header) {
		req, err := http.NewRequest(http.MethodGet, target, nil)
		require.NoError(t, err)
		setBearerForReq(req, token)
		for k, v := range header {
			req.Header.Set(k, v)
		}
		rr := executeRequest(req)
		return rr.Code, rr.Body.Bytes(), rr.Header()
	}

	// Super admin: list, download, ranges, errors.
	token, err := getJWTAPITokenFromTestServer(defaultTokenAuthUser, defaultTokenAuthPass)
	require.NoError(t, err)

	code, body, _ := do(token, dirsURL(user.Username, "/"), nil)
	require.Equal(t, http.StatusOK, code, string(body))
	var entries []map[string]any
	require.NoError(t, json.Unmarshal(body, &entries))
	if assert.Len(t, entries, 1) {
		assert.Equal(t, "music", entries[0]["name"])
	}
	code, body, _ = do(token, dirsURL(user.Username, "/music"), nil)
	require.Equal(t, http.StatusOK, code, string(body))
	entries = nil
	require.NoError(t, json.Unmarshal(body, &entries))
	assert.Len(t, entries, 1)

	code, body, _ = do(token, filesURL(user.Username, "/music/song a.mp3"), nil)
	assert.Equal(t, http.StatusOK, code)
	assert.Equal(t, content, body)

	code, body, header := do(token, filesURL(user.Username, "/music/song a.mp3"), map[string]string{"Range": "bytes=4-7"})
	assert.Equal(t, http.StatusPartialContent, code)
	assert.Equal(t, []byte("4567"), body)
	assert.Equal(t, "bytes 4-7/16", header.Get("Content-Range"))

	code, _, _ = do(token, filesURL(user.Username, "/music"), nil)
	assert.Equal(t, http.StatusBadRequest, code)
	code, _, _ = do(token, filesURL(user.Username, "/"), nil)
	assert.Equal(t, http.StatusBadRequest, code)
	code, _, _ = do(token, filesURL(user.Username, "/missing.mp3"), nil)
	assert.Equal(t, http.StatusNotFound, code)
	code, _, _ = do(token, dirsURL(user.Username, "/missing"), nil)
	assert.Equal(t, http.StatusNotFound, code)
	code, _, _ = do(token, dirsURL("missing-user", "/"), nil)
	assert.Equal(t, http.StatusNotFound, code)
	// Paths cannot escape the user's home.
	code, _, _ = do(token, filesURL(user.Username, "../../../../etc/passwd"), nil)
	assert.NotEqual(t, http.StatusOK, code)

	// An admin without view_user_files is refused even with view_users.
	a := getTestAdmin()
	a.Username = altAdminUsername
	a.Password = altAdminPassword
	a.Permissions = []string{dataprovider.PermAdminViewUsers}
	admin, _, err := httpdtest.AddAdmin(a, http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveAdmin(admin, http.StatusOK)
		assert.NoError(t, err)
	}()
	altToken, err := getJWTAPITokenFromTestServer(altAdminUsername, altAdminPassword)
	require.NoError(t, err)
	code, _, _ = do(altToken, dirsURL(user.Username, "/"), nil)
	assert.Equal(t, http.StatusForbidden, code)
	code, _, _ = do(altToken, filesURL(user.Username, "/music/song a.mp3"), nil)
	assert.Equal(t, http.StatusForbidden, code)

	// A role admin with the permission only reaches the users of its role.
	role, _, err := httpdtest.AddRole(getTestRole(), http.StatusCreated)
	require.NoError(t, err)
	defer func() {
		_, err := httpdtest.RemoveRole(role, http.StatusOK)
		assert.NoError(t, err)
	}()
	admin.Permissions = []string{dataprovider.PermAdminViewUsers, dataprovider.PermAdminViewUserFiles}
	admin.Role = role.Name
	admin, _, err = httpdtest.UpdateAdmin(admin, http.StatusOK)
	require.NoError(t, err)
	altToken, err = getJWTAPITokenFromTestServer(altAdminUsername, altAdminPassword)
	require.NoError(t, err)
	code, _, _ = do(altToken, dirsURL(user.Username, "/"), nil)
	assert.Equal(t, http.StatusNotFound, code, "a user outside the admin's role must not be reachable")

	user.Role = role.Name
	user, _, err = httpdtest.UpdateUser(user, http.StatusOK, "")
	require.NoError(t, err)
	code, body, _ = do(altToken, filesURL(user.Username, "/music/song a.mp3"), nil)
	assert.Equal(t, http.StatusOK, code)
	assert.Equal(t, content, body)

	// Release the role before it is removed.
	user.Role = ""
	user, _, err = httpdtest.UpdateUser(user, http.StatusOK, "")
	assert.NoError(t, err)
	admin.Role = ""
	_, _, err = httpdtest.UpdateAdmin(admin, http.StatusOK)
	assert.NoError(t, err)
}

func TestTokenBasicChallenge(t *testing.T) {
	for _, tokenPath := range []string{"/api/v2/token", "/api/v2/user/token"} {
		req, err := http.NewRequest(http.MethodGet, tokenPath, nil)
		require.NoError(t, err)
		req.SetBasicAuth("missing-account", "wrong")
		rr := executeRequest(req)
		assert.Equal(t, http.StatusUnauthorized, rr.Code)
		assert.NotEmpty(t, rr.Header().Get("WWW-Authenticate"), tokenPath)

		// Script requests from the Console must not trigger the browser's login dialog.
		req, err = http.NewRequest(http.MethodGet, tokenPath, nil)
		require.NoError(t, err)
		req.SetBasicAuth("missing-account", "wrong")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
		rr = executeRequest(req)
		assert.Equal(t, http.StatusUnauthorized, rr.Code)
		assert.Empty(t, rr.Header().Get("WWW-Authenticate"), tokenPath)
	}
}
