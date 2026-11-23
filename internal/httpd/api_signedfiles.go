// Copyright (C) 2026 Sacha COHEN
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
	"net/http"

	"github.com/go-chi/render"

	"github.com/drakkan/sftpgo/v2/internal/signedfiles"
)

// fork: read-only status of the signed files server, for the Console
const signedFilesStatusPath = "/api/v2/signedfiles/status"

func getSignedFilesStatus(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxRequestSize)
	w.Header().Set("Cache-Control", "no-store")
	render.JSON(w, r, signedfiles.GetStatus())
}
