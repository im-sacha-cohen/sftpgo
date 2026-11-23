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

package glyfiles

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/drakkan/sftpgo/v2/internal/logger"
)

// public test key from the v1 specification, not for production
const testKey = "gly-test-secret-not-for-prod"

const (
	user1 = "01JD8X3K9QF2M7Y4T6W0ZB5N1R"
	user2 = "01JD8X4A2BC3DE5FG6HJ7KM8NP"
	exp1  = "1798761600"
	exp2  = "1798765200"
	path1 = "/19112026_1700.mp3"
	path2 = "/19112026_1800.mp3"
	sig1  = "QTx7c4snCZ_mM7MIQLnsa_AJ4JvXvdPrsHxf1rraJcY"
	sig2  = "8czUoy7GkGMADyzxBY0NvxumgGGpDQuCivTwM87EmAs"
	sig3  = "XQxRsl7dJzKFdZ7UTNAYwLPIO-8iWFSCc9-2SFqqq_M"
)

// one hour before exp1
var testNow = time.Unix(1798761600-3600, 0)

func TestSignVectors(t *testing.T) {
	vectors := []struct{ exp, u, path, sig string }{
		{exp1, user1, path1, sig1},
		{exp1, user2, path1, sig2},
		{exp2, user1, path2, sig3},
	}
	for _, v := range vectors {
		assert.Equal(t, v.sig, Sign([]byte(testKey), v.exp, v.u, v.path))
		assert.Len(t, v.sig, 43)
	}
}

type logRecorder struct {
	mu    sync.Mutex
	lines []string
}

func (l *logRecorder) logf(level logger.LogLevel, format string, v ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.lines = append(l.lines, fmt.Sprintf("%d %s", level, fmt.Sprintf(format, v...)))
}

func (l *logRecorder) all() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return strings.Join(l.lines, "\n")
}

var fileContent = []byte("ID3-fake-mp3-content-0123456789abcdefghijklmnopqrstuvwxyz")

func newTestHandler(t *testing.T, mode Mode, key, previousKey string) (*Handler, *logRecorder) {
	t.Helper()
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "19112026_1700.mp3"), fileContent, 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "19112026_1800.mp3"), fileContent, 0o600))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "sub"), 0o700))
	// a file outside the root, to check traversal
	require.NoError(t, os.WriteFile(filepath.Join(filepath.Dir(dir), "secret.mp3"), []byte("secret"), 0o600))
	t.Cleanup(func() { _ = os.Remove(filepath.Join(filepath.Dir(dir), "secret.mp3")) })

	c := &Config{Root: dir, Mode: mode, Key: []byte(key), MaxTTL: 86400 * time.Second}
	if previousKey != "" {
		c.PreviousKey = []byte(previousKey)
	}
	h, err := NewHandler(c)
	require.NoError(t, err)
	t.Cleanup(func() { _ = h.root.Close() })
	h.now = func() time.Time { return testNow }
	rec := &logRecorder{}
	h.logf = rec.logf
	return h, rec
}

func do(h http.Handler, method, target string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func signedURL(path, exp, u, sig string) string {
	return fmt.Sprintf("%s?exp=%s&u=%s&sig=%s", path, exp, u, sig)
}

func TestAccepted(t *testing.T) {
	h, logs := newTestHandler(t, ModeEnforce, testKey, "")

	rr := do(h, http.MethodGet, signedURL(path1, exp1, user1, sig1), nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, fileContent, rr.Body.Bytes())
	assert.Equal(t, "private, no-store", rr.Header().Get("Cache-Control"))
	assert.Equal(t, "audio/mpeg", rr.Header().Get("Content-Type"))

	// the other user signature for the same file
	rr = do(h, http.MethodGet, signedURL(path1, exp1, user2, sig2), nil)
	assert.Equal(t, http.StatusOK, rr.Code)

	// other query parameters are ignored, the order does not matter
	rr = do(h, http.MethodGet, path1+"?foo=bar&sig="+sig1+"&u="+user1+"&exp="+exp1+"&t=12", nil)
	assert.Equal(t, http.StatusOK, rr.Code)

	// HEAD
	rr = do(h, http.MethodHead, signedURL(path1, exp1, user1, sig1), nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Empty(t, rr.Body.Bytes())
	assert.Equal(t, fmt.Sprint(len(fileContent)), rr.Header().Get("Content-Length"))
	assert.Equal(t, "bytes", rr.Header().Get("Accept-Ranges"))

	// Range -> 206
	rr = do(h, http.MethodGet, signedURL(path1, exp1, user1, sig1), map[string]string{"Range": "bytes=3-9"})
	assert.Equal(t, http.StatusPartialContent, rr.Code)
	assert.Equal(t, fileContent[3:10], rr.Body.Bytes())
	assert.Equal(t, fmt.Sprintf("bytes 3-9/%d", len(fileContent)), rr.Header().Get("Content-Range"))
	assert.Equal(t, "private, no-store", rr.Header().Get("Cache-Control"))

	// a valid signature for a missing file or a directory: 404
	missing := "/20112026_1700.mp3"
	rr = do(h, http.MethodGet, signedURL(missing, exp1, user1, Sign([]byte(testKey), exp1, user1, missing)), nil)
	assert.Equal(t, http.StatusNotFound, rr.Code)
	rr = do(h, http.MethodGet, signedURL("/sub", exp1, user1, Sign([]byte(testKey), exp1, user1, "/sub")), nil)
	assert.Equal(t, http.StatusNotFound, rr.Code)

	all := logs.all()
	assert.Contains(t, all, `served method=GET path="/19112026_1700.mp3" u="`+user1+`"`)
	assert.Contains(t, all, `u="`+user2+`"`)
	assert.Contains(t, all, `status=206 range="bytes=3-9"`)
	assertNoSecret(t, all, sig1, sig2)
}

func TestPreviousKey(t *testing.T) {
	newKey := "a-brand-new-key-of-at-least-32-characters"
	h, _ := newTestHandler(t, ModeEnforce, newKey, testKey)
	// signed with the previous key
	rr := do(h, http.MethodGet, signedURL(path1, exp1, user1, sig1), nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	// signed with the current key
	rr = do(h, http.MethodGet, signedURL(path1, exp1, user1, Sign([]byte(newKey), exp1, user1, path1)), nil)
	assert.Equal(t, http.StatusOK, rr.Code)

	// once the previous key is removed, its signatures are refused
	h, _ = newTestHandler(t, ModeEnforce, newKey, "")
	rr = do(h, http.MethodGet, signedURL(path1, exp1, user1, sig1), nil)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestRefused(t *testing.T) {
	tooFar := fmt.Sprint(testNow.Unix() + 86400 + 1)
	past := fmt.Sprint(testNow.Unix() - 1)
	cases := []struct {
		name, target, reason string
	}{
		{"expired", signedURL(path1, past, user1, Sign([]byte(testKey), past, user1, path1)), "expired"},
		{"expires now", signedURL(path1, fmt.Sprint(testNow.Unix()), user1,
			Sign([]byte(testKey), fmt.Sprint(testNow.Unix()), user1, path1)), "expired"},
		{"exp too far", signedURL(path1, tooFar, user1, Sign([]byte(testKey), tooFar, user1, path1)), "exp_too_far"},
		{"path changed", signedURL(path2, exp1, user1, sig1), "bad_signature"},
		{"exp changed", signedURL(path1, "1798761601", user1, sig1), "bad_signature"},
		{"u changed", signedURL(path1, exp1, "01JD8X3K9QF2M7Y4T6W0ZB5N1S", sig1), "bad_signature"},
		{"u of another user", signedURL(path1, exp1, user2, sig1), "bad_signature"},
		{"signature of another file", signedURL(path1, exp2, user1, sig3), "bad_signature"},
		{"signature with another key", signedURL(path1, exp1, user1,
			Sign([]byte("another-key-of-at-least-32-characters"), exp1, user1, path1)), "bad_signature"},
		{"missing exp", path1 + "?u=" + user1 + "&sig=" + sig1, "missing_exp"},
		{"missing u", path1 + "?exp=" + exp1 + "&sig=" + sig1, "missing_u"},
		{"missing sig", path1 + "?exp=" + exp1 + "&u=" + user1, "missing_sig"},
		{"no query", path1, "missing_exp"},
		{"empty sig", path1 + "?exp=" + exp1 + "&u=" + user1 + "&sig=", "malformed_sig"},
		{"duplicate exp", signedURL(path1, exp1, user1, sig1) + "&exp=" + exp1, "duplicate_exp"},
		{"duplicate u", signedURL(path1, exp1, user1, sig1) + "&u=" + user1, "duplicate_u"},
		{"duplicate sig", signedURL(path1, exp1, user1, sig1) + "&sig=" + sig1, "duplicate_sig"},
		{"u lower case", signedURL(path1, exp1, strings.ToLower(user1), sig1), "malformed_u"},
		{"u too short", signedURL(path1, exp1, user1[:25], sig1), "malformed_u"},
		{"u too long", signedURL(path1, exp1, user1+"A", sig1), "malformed_u"},
		{"u first char above 7", signedURL(path1, exp1, "8"+user1[1:], sig1), "malformed_u"},
		{"u with excluded letter", signedURL(path1, exp1, user1[:25]+"U", sig1), "malformed_u"},
		{"exp with sign", signedURL(path1, "+"+exp1, user1, sig1), "malformed_exp"},
		{"exp with space", signedURL(path1, "%20"+exp1, user1, sig1), "malformed_exp"},
		{"exp not a number", signedURL(path1, "abc", user1, sig1), "malformed_exp"},
		{"exp overflow", signedURL(path1, "99999999999999999999", user1, sig1), "malformed_exp"},
		{"sig too short", signedURL(path1, exp1, user1, sig1[:42]), "malformed_sig"},
		{"sig too long", signedURL(path1, exp1, user1, sig1+"A"), "malformed_sig"},
		{"sig with padding", signedURL(path1, exp1, user1, sig1+"%3D"), "malformed_sig"},
		{"sig standard base64", signedURL(path1, exp1, user1, strings.ReplaceAll(sig3, "-", "%2B")), "malformed_sig"},
		{"malformed query", path1 + "?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1 + "&x=%zz", "malformed_query"},
		{"traversal", "/../secret.mp3?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1, "bad_path"},
		{"encoded traversal", "/%2e%2e/secret.mp3?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1, "bad_path"},
		{"encoded traversal mixed", "/sub/%2E%2e%2Fsecret.mp3?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1, "bad_path"},
		{"double slash", "//19112026_1700.mp3?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1, "bad_path"},
		{"backslash", "/sub%5C..%5Csecret.mp3?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1, "bad_path"},
		{"nul byte", "/19112026_1700.mp3%00.txt?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1, "bad_path"},
		{"root", "/?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1, "bad_path"},
	}
	h, logs := newTestHandler(t, ModeEnforce, testKey, "")
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, method := range []string{http.MethodGet, http.MethodHead} {
				rr := do(h, method, tc.target, map[string]string{"Range": "bytes=0-9"})
				assert.Equal(t, http.StatusForbidden, rr.Code, method)
				assert.Empty(t, rr.Body.Bytes())
				assert.Equal(t, "private, no-store", rr.Header().Get("Cache-Control"))
				assert.Empty(t, rr.Header().Get("Content-Range"))
			}
			assert.Contains(t, logs.all(), `reason="`+tc.reason+`"`)
		})
	}
	all := logs.all()
	assert.NotContains(t, all, "served")
	assert.Contains(t, all, `refused method=GET path="/19112026_1800.mp3" u="`+user1+`" reason="bad_signature" status=403`)
	assertNoSecret(t, all, sig1, sig3)
}

func TestMethodNotAllowed(t *testing.T) {
	h, _ := newTestHandler(t, ModeEnforce, testKey, "")
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete, "PROPFIND", http.MethodOptions} {
		rr := do(h, method, signedURL(path1, exp1, user1, sig1), nil)
		assert.Equal(t, http.StatusMethodNotAllowed, rr.Code, method)
		assert.Equal(t, "GET, HEAD", rr.Header().Get("Allow"))
	}
}

func TestObserveMode(t *testing.T) {
	h, logs := newTestHandler(t, ModeObserve, testKey, "")
	// unsigned: served anyway, logged
	rr := do(h, http.MethodGet, path1, nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, fileContent, rr.Body.Bytes())
	// bad signature, with Range: served, logged
	rr = do(h, http.MethodGet, signedURL(path1, exp1, user2, sig1), map[string]string{"Range": "bytes=0-3"})
	assert.Equal(t, http.StatusPartialContent, rr.Code)
	// valid signature
	rr = do(h, http.MethodGet, signedURL(path1, exp1, user1, sig1), nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	// the path check still applies
	rr = do(h, http.MethodGet, "/%2e%2e/secret.mp3", nil)
	assert.Equal(t, http.StatusForbidden, rr.Code)

	all := logs.all()
	assert.Contains(t, all, `observe-would-refuse method=GET path="/19112026_1700.mp3" u="" reason="missing_exp" status=200`)
	assert.Contains(t, all, `observe-would-refuse method=GET path="/19112026_1700.mp3" u="`+user2+`" reason="bad_signature" status=206`)
	assert.Contains(t, all, `served method=GET path="/19112026_1700.mp3" u="`+user1+`" reason="" status=200`)
	assert.Contains(t, all, `refused method=GET path="/../secret.mp3" u="" reason="bad_path"`)
	assertNoSecret(t, all, sig1)
}

func TestOffMode(t *testing.T) {
	h, logs := newTestHandler(t, ModeOff, "", "")
	rr := do(h, http.MethodGet, path1, nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	rr = do(h, http.MethodGet, signedURL(path1, "1", "x", "y"), nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	rr = do(h, http.MethodGet, "/../secret.mp3", nil)
	assert.Equal(t, http.StatusForbidden, rr.Code)
	assert.NotContains(t, logs.all(), "would-refuse")
}

func TestLoadConfig(t *testing.T) {
	dir := t.TempDir()
	longKey := strings.Repeat("k", 32)
	env := func(m map[string]string) func(string) string {
		return func(k string) string { return m[k] }
	}

	// disabled: nothing set, nothing required
	c, err := LoadConfig(env(nil))
	assert.NoError(t, err)
	assert.Nil(t, c)

	// enabled without key: refuse to start, default mode is enforce
	_, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir}))
	assert.ErrorContains(t, err, envKey)
	_, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envMode: "observe"}))
	assert.ErrorContains(t, err, envKey)
	// key too short (the public test key is 28 characters)
	_, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envKey: testKey}))
	assert.ErrorContains(t, err, envKey)
	_, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envKey: longKey[:31]}))
	assert.ErrorContains(t, err, envKey)
	// previous key too short
	_, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envKey: longKey, envPreviousKey: "short"}))
	assert.ErrorContains(t, err, envPreviousKey)
	// invalid mode and ttl
	_, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envKey: longKey, envMode: "Enforce"}))
	assert.ErrorContains(t, err, envMode)
	for _, ttl := range []string{"0", "-1", "abc", "1.5"} {
		_, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envKey: longKey, envMaxTTL: ttl}))
		assert.ErrorContains(t, err, envMaxTTL)
	}
	// root required
	_, err = LoadConfig(env(map[string]string{envAddr: ":0", envKey: longKey}))
	assert.ErrorContains(t, err, envRoot)

	// off: no key needed
	c, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envMode: "off"}))
	require.NoError(t, err)
	assert.Equal(t, ModeOff, c.Mode)

	// valid
	c, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envKey: longKey,
		envPreviousKey: longKey + "-old", envMaxTTL: "3600"}))
	require.NoError(t, err)
	assert.Equal(t, ModeEnforce, c.Mode)
	assert.Equal(t, time.Hour, c.MaxTTL)
	assert.Equal(t, []byte(longKey), c.Key)
	assert.Equal(t, []byte(longKey+"-old"), c.PreviousKey)
	c, err = LoadConfig(env(map[string]string{envAddr: ":0", envRoot: dir, envKey: longKey}))
	require.NoError(t, err)
	assert.Equal(t, 86400*time.Second, c.MaxTTL)
	assert.Nil(t, c.PreviousKey)
}

func TestStart(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "19112026_1700.mp3"), fileContent, 0o600))

	// enabled without key: the service must refuse to start
	t.Setenv(envAddr, "127.0.0.1:0")
	t.Setenv(envRoot, dir)
	t.Setenv(envKey, "")
	assert.Error(t, Start(nil))

	// missing root directory
	t.Setenv(envKey, strings.Repeat("k", 32))
	t.Setenv(envRoot, filepath.Join(dir, "missing"))
	assert.ErrorContains(t, Start(nil), envRoot)

	// disabled
	t.Setenv(envAddr, "")
	assert.NoError(t, Start(nil))

	// listening, end to end
	key := strings.Repeat("k", 32)
	t.Setenv(envRoot, dir)
	t.Setenv(envKey, key)
	ln, err := netListenFree()
	require.NoError(t, err)
	t.Setenv(envAddr, ln)
	require.NoError(t, Start(nil))
	// port already in use
	assert.Error(t, Start(nil))

	exp := fmt.Sprint(time.Now().Add(time.Hour).Unix())
	base := "http://" + ln
	resp, err := http.Get(base + signedURL(path1, exp, user1, Sign([]byte(key), exp, user1, path1)))
	require.NoError(t, err)
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	_ = resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, fileContent, body)

	resp, err = http.Get(base + path1)
	require.NoError(t, err)
	_ = resp.Body.Close()
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
}

func netListenFree() (string, error) {
	srv := httptest.NewServer(http.NotFoundHandler())
	addr := srv.Listener.Addr().String()
	srv.Close()
	return addr, nil
}

func assertNoSecret(t *testing.T, logs string, sigs ...string) {
	t.Helper()
	assert.NotContains(t, logs, "sig=")
	for _, s := range sigs {
		assert.NotContains(t, logs, s)
		assert.NotContains(t, logs, s[:20])
	}
}
