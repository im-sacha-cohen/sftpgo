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
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/drakkan/sftpgo/v2/internal/signedfiles"
)

func TestGetSignedFilesStatusDisabled(t *testing.T) {
	rr := httptest.NewRecorder()
	getSignedFilesStatus(rr, httptest.NewRequest(http.MethodGet, signedFilesStatusPath, nil))
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "no-store", rr.Header().Get("Cache-Control"))
	var st signedfiles.Status
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &st))
	assert.False(t, st.Enabled)
	assert.NotNil(t, st.Sites)
	assert.NotNil(t, st.RecentEvents)
}
