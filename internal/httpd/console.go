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
	"bytes"
	"fmt"
	"html"
	"io"
	"net/http"
	"path"

	"github.com/go-chi/chi/v5"
)

// The Console is a single page application built from the ui/ folder into
// <static>/console. It talks only to the REST API, so the server just has to
// hand out index.html for every path below <web base>/console and let the
// client-side router take over.

const (
	consoleDirName        = "console"
	consoleIndexFile      = "index.html"
	consoleConfigMarker   = "<!--sftpgo-config-->"
	webConsolePathDefault = "/console"
)

func (s *httpdServer) setupConsoleRoutes(router chi.Router) {
	consolePath := path.Join(webBasePath, webConsolePathDefault)
	handler := s.handleConsoleIndex(consolePath)
	router.Get(consolePath, handler)
	router.Get(consolePath+"/*", handler)
}

func (s *httpdServer) handleConsoleIndex(consolePath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
		fs := getStaticFileSystem(s.staticFilesPath)
		f, err := fs.Open(path.Join("/", consoleDirName, consoleIndexFile))
		if err != nil {
			http.Error(w, "The Console UI is not built. Run \"npm run build\" in the ui folder.", http.StatusNotFound)
			return
		}
		defer f.Close()
		content, err := io.ReadAll(io.LimitReader(f, 2*1024*1024))
		if err != nil {
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}
		assetsBase := path.Join(webStaticFilesPath, consoleDirName) + "/"
		config := fmt.Sprintf(`<base href="%s">
    <meta name="sftpgo-console-base" content="%s">
    <meta name="sftpgo-api-base" content="%s">
    <meta name="sftpgo-static-base" content="%s">
    <meta name="sftpgo-webadmin" content="%t">
    <meta name="sftpgo-webclient" content="%t">`,
			html.EscapeString(assetsBase), html.EscapeString(consolePath), html.EscapeString("/api/v2"),
			html.EscapeString(webStaticFilesPath), s.enableWebAdmin, s.enableWebClient)
		content = bytes.Replace(content, []byte(consoleConfigMarker), []byte(config), 1)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		_, _ = w.Write(content)
	}
}
