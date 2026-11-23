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

package signedfiles

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
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
	testHost = "files.example.com"
	user1    = "01JD8X3K9QF2M7Y4T6W0ZB5N1R"
	user2    = "01JD8X4A2BC3DE5FG6HJ7KM8NP"
	exp1     = "1798761600"
	exp2     = "1798765200"
	path1    = "/19112026_1700.mp3"
	path2    = "/19112026_1800.mp3"
	sig1     = "QTx7c4snCZ_mM7MIQLnsa_AJ4JvXvdPrsHxf1rraJcY"
	sig2     = "8czUoy7GkGMADyzxBY0NvxumgGGpDQuCivTwM87EmAs"
	sig3     = "XQxRsl7dJzKFdZ7UTNAYwLPIO-8iWFSCc9-2SFqqq_M"
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

func newTestDir(t *testing.T) string {
	t.Helper()
	parent := t.TempDir()
	dir := filepath.Join(parent, "root")
	require.NoError(t, os.Mkdir(dir, 0o700))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "19112026_1700.mp3"), fileContent, 0o600))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "19112026_1800.mp3"), fileContent, 0o600))
	require.NoError(t, os.Mkdir(filepath.Join(dir, "sub"), 0o700))
	// a file outside the root, to check traversal
	require.NoError(t, os.WriteFile(filepath.Join(parent, "secret.mp3"), []byte("secret"), 0o600))
	return dir
}

func newTestHandlerSites(t *testing.T, sites []Site) (*Handler, *logRecorder) {
	t.Helper()
	h, err := NewHandler(sites)
	require.NoError(t, err)
	t.Cleanup(h.close)
	h.now = func() time.Time { return testNow }
	rec := &logRecorder{}
	h.logf = rec.logf
	return h, rec
}

// newTestHandler sets the keys after the validation: the public test key is
// only 28 characters, so it is refused at startup
func newTestHandler(t *testing.T, mode, key, previousKey string) (*Handler, *logRecorder) {
	t.Helper()
	placeholder := Secret(strings.Repeat("p", 32))
	if mode == ModeOff {
		placeholder = ""
	}
	h, rec := newTestHandlerSites(t, []Site{{
		Host:       testHost,
		Root:       newTestDir(t),
		Mode:       mode,
		SigningKey: placeholder,
	}})
	s := h.sites[testHost]
	s.key = []byte(key)
	if previousKey != "" {
		s.previousKey = []byte(previousKey)
	}
	return h, rec
}

func doHost(h http.Handler, host, method, target string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, nil)
	req.Host = host
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	return rr
}

func do(h http.Handler, method, target string, headers map[string]string) *httptest.ResponseRecorder {
	return doHost(h, testHost, method, target, headers)
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
	assert.Equal(t, strconv.Itoa(len(fileContent)), rr.Header().Get("Content-Length"))
	assert.Equal(t, "bytes", rr.Header().Get("Accept-Ranges"))

	// Range -> 206
	rr = do(h, http.MethodGet, signedURL(path1, exp1, user1, sig1), map[string]string{"Range": "bytes=3-9"})
	assert.Equal(t, http.StatusPartialContent, rr.Code)
	assert.Equal(t, fileContent[3:10], rr.Body.Bytes())
	assert.Equal(t, fmt.Sprintf("bytes 3-9/%d", len(fileContent)), rr.Header().Get("Content-Range"))
	assert.Equal(t, "private, no-store", rr.Header().Get("Cache-Control"))

	// host case and port do not matter
	rr = doHost(h, "FILES.example.com:443", http.MethodGet, signedURL(path1, exp1, user1, sig1), nil)
	assert.Equal(t, http.StatusOK, rr.Code)

	// a valid signature for a missing file or a directory: 404
	missing := "/20112026_1700.mp3"
	rr = do(h, http.MethodGet, signedURL(missing, exp1, user1, Sign([]byte(testKey), exp1, user1, missing)), nil)
	assert.Equal(t, http.StatusNotFound, rr.Code)
	rr = do(h, http.MethodGet, signedURL("/sub", exp1, user1, Sign([]byte(testKey), exp1, user1, "/sub")), nil)
	assert.Equal(t, http.StatusNotFound, rr.Code)

	all := logs.all()
	assert.Contains(t, all, `served host="files.example.com" method=GET path="/19112026_1700.mp3" u="`+user1+`"`)
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
	tooFar := strconv.FormatInt(testNow.Unix()+86400+1, 10)
	past := strconv.FormatInt(testNow.Unix()-1, 10)
	nowExp := strconv.FormatInt(testNow.Unix(), 10)
	q := "?exp=" + exp1 + "&u=" + user1 + "&sig=" + sig1
	cases := []struct {
		name, target, reason string
	}{
		{"expired", signedURL(path1, past, user1, Sign([]byte(testKey), past, user1, path1)), "expired"},
		{"expires now", signedURL(path1, nowExp, user1, Sign([]byte(testKey), nowExp, user1, path1)), "expired"},
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
		{"malformed query", path1 + q + "&x=%zz", "malformed_query"},
		{"traversal", "/../secret.mp3" + q, "bad_path"},
		{"encoded traversal", "/%2e%2e/secret.mp3" + q, "bad_path"},
		{"encoded traversal mixed", "/sub/%2E%2e%2Fsecret.mp3" + q, "bad_path"},
		{"double slash", "//19112026_1700.mp3" + q, "bad_path"},
		{"backslash", "/sub%5C..%5Csecret.mp3" + q, "bad_path"},
		{"nul byte", "/19112026_1700.mp3%00.txt" + q, "bad_path"},
		{"root", "/" + q, "bad_path"},
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
	assert.Contains(t, all, `refused host="files.example.com" method=GET path="/19112026_1800.mp3" u="`+user1+
		`" reason="bad_signature" status=403`)
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
	assert.Contains(t, all, `observe-would-refuse host="files.example.com" method=GET path="/19112026_1700.mp3" u="" `+
		`reason="missing_exp" status=200`)
	assert.Contains(t, all, `observe-would-refuse host="files.example.com" method=GET path="/19112026_1700.mp3" u="`+
		user2+`" reason="bad_signature" status=206`)
	assert.Contains(t, all, `served host="files.example.com" method=GET path="/19112026_1700.mp3" u="`+user1+
		`" reason="" status=200`)
	assert.Contains(t, all, `refused host="files.example.com" method=GET path="/../secret.mp3" u="" reason="bad_path"`)
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

func TestSites(t *testing.T) {
	keyA := "key-of-site-a-at-least-32-characters"
	keyB := "key-of-site-b-at-least-32-characters"
	dirA := newTestDir(t)
	dirB := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dirB, "b.mp3"), []byte("site-b"), 0o600))

	h, logs := newTestHandlerSites(t, []Site{
		{Host: "a.example.com", Root: dirA, SigningKey: Secret(keyA)},
		{Host: "B.example.com.", Root: dirB, Mode: ModeObserve, SigningKey: Secret(keyB), MaxTTL: 60},
	})
	signA := signedURL(path1, exp1, user1, Sign([]byte(keyA), exp1, user1, path1))
	rr := doHost(h, "a.example.com", http.MethodGet, signA, nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	// a key of site B does not open site A
	rr = doHost(h, "a.example.com", http.MethodGet, signedURL(path1, exp1, user1, Sign([]byte(keyB), exp1, user1, path1)), nil)
	assert.Equal(t, http.StatusForbidden, rr.Code)
	// each site serves its own directory, with its own mode and ttl
	rr = doHost(h, "b.example.com", http.MethodGet, signA, nil)
	assert.Equal(t, http.StatusNotFound, rr.Code)
	rr = doHost(h, "b.example.com", http.MethodGet, "/b.mp3", nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "site-b", rr.Body.String())
	assert.Contains(t, logs.all(), `observe-would-refuse host="b.example.com"`)
	// exp1 is one hour away, more than the 60 seconds of site B
	bPath := "/b.mp3"
	rr = doHost(h, "b.example.com", http.MethodGet, signedURL(bPath, exp1, user1, Sign([]byte(keyB), exp1, user1, bPath)), nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, logs.all(), `reason="exp_too_far" status=200 range="" mode=observe`)
	// unknown host, no fallback
	rr = doHost(h, "c.example.com", http.MethodGet, signA, nil)
	assert.Equal(t, http.StatusNotFound, rr.Code)
	assert.Contains(t, logs.all(), `unknown-host host="c.example.com"`)
	assertNoSecret(t, logs.all())

	// a site without host is the fallback
	h, _ = newTestHandlerSites(t, []Site{
		{Host: "a.example.com", Root: dirA, SigningKey: Secret(keyA)},
		{Root: dirB, Mode: ModeOff},
	})
	rr = doHost(h, "anything.example.org", http.MethodGet, "/b.mp3", nil)
	assert.Equal(t, http.StatusOK, rr.Code)
	rr = doHost(h, "a.example.com", http.MethodGet, "/b.mp3", nil)
	assert.Equal(t, http.StatusForbidden, rr.Code)
}

func TestNewHandlerValidation(t *testing.T) {
	dir := t.TempDir()
	longKey := Secret(strings.Repeat("k", 32))
	cases := []struct {
		name  string
		sites []Site
		err   string
	}{
		{"no site", nil, "no site"},
		{"no key, default mode enforce", []Site{{Root: dir}}, "signing_key"},
		{"no key, observe", []Site{{Root: dir, Mode: ModeObserve}}, "signing_key"},
		{"key of 28 chars", []Site{{Root: dir, SigningKey: Secret(testKey)}}, "signing_key"},
		{"key of 31 chars", []Site{{Root: dir, SigningKey: longKey[:31]}}, "signing_key"},
		{"short previous key", []Site{{Root: dir, SigningKey: longKey, PreviousSigningKey: "short"}}, "previous_signing_key"},
		{"invalid mode", []Site{{Root: dir, SigningKey: longKey, Mode: "Enforce"}}, "invalid mode"},
		{"negative ttl", []Site{{Root: dir, SigningKey: longKey, MaxTTL: -1}}, "max_ttl"},
		{"ttl too big", []Site{{Root: dir, SigningKey: longKey, MaxTTL: maxMaxTTL + 1}}, "max_ttl"},
		{"no root", []Site{{SigningKey: longKey}}, "root"},
		{"missing root", []Site{{SigningKey: longKey, Root: filepath.Join(dir, "missing")}}, "root"},
		{"duplicate host", []Site{
			{Host: "a.example.com", Root: dir, SigningKey: longKey},
			{Host: "A.example.com", Root: dir, SigningKey: longKey},
		}, "duplicate host"},
	}
	for _, tc := range cases {
		_, err := NewHandler(tc.sites)
		assert.ErrorContains(t, err, tc.err, tc.name)
	}
	// off: no key needed, default ttl
	h, err := NewHandler([]Site{{Root: dir, Mode: ModeOff}})
	require.NoError(t, err)
	h.close()
	h, err = NewHandler([]Site{{Root: dir, SigningKey: longKey}})
	require.NoError(t, err)
	assert.Equal(t, 86400*time.Second, h.fallback.maxTTL)
	assert.Equal(t, ModeEnforce, h.fallback.mode)
	h.close()
}

func TestSecretNeverPrinted(t *testing.T) {
	key := strings.Repeat("s", 40)
	c := Conf{BindPort: 1, Sites: []Site{{Host: "h", SigningKey: Secret(key), PreviousSigningKey: Secret(key + "p")}}}
	for _, format := range []string{"%v", "%+v", "%#v", "%s"} {
		out := fmt.Sprintf(format, c)
		assert.NotContains(t, out, key, format)
		assert.Contains(t, out, "[redacted]", format)
	}
	assert.Empty(t, Secret("").String())
}

func TestLoadSitesFromEnv(t *testing.T) {
	env := map[string]string{
		"SFTPGO_SIGNED_FILES__SITES__0__MODE":                 "observe",
		"SFTPGO_SIGNED_FILES__SITES__0__SIGNING_KEY":          "k0",
		"SFTPGO_SIGNED_FILES__SITES__1__HOST":                 "b.example.com",
		"SFTPGO_SIGNED_FILES__SITES__1__ROOT":                 "/srv/b",
		"SFTPGO_SIGNED_FILES__SITES__1__SIGNING_KEY":          "k1",
		"SFTPGO_SIGNED_FILES__SITES__1__PREVIOUS_SIGNING_KEY": "k1old",
		"SFTPGO_SIGNED_FILES__SITES__1__MAX_TTL":              "3600",
		"SFTPGO_SIGNED_FILES__SITES__2__MAX_TTL":              "abc",
	}
	lookup := func(k string) (string, bool) {
		v, ok := env[k]
		return v, ok
	}
	sites := loadSitesFromEnv([]Site{{Host: "a.example.com", Root: "/srv/a", Mode: ModeEnforce}}, lookup)
	require.Len(t, sites, 3)
	// file values are kept, env values override them
	assert.Equal(t, Site{Host: "a.example.com", Root: "/srv/a", Mode: ModeObserve, SigningKey: "k0"}, sites[0])
	assert.Equal(t, Site{Host: "b.example.com", Root: "/srv/b", SigningKey: "k1", PreviousSigningKey: "k1old",
		MaxTTL: 3600}, sites[1])
	// an invalid ttl is rejected by the validation
	assert.Equal(t, -1, sites[2].MaxTTL)
	assert.Empty(t, loadSitesFromEnv(nil, func(string) (string, bool) { return "", false }))
}

func TestStart(t *testing.T) {
	dir := newTestDir(t)
	key := strings.Repeat("k", 32)

	// disabled
	assert.NoError(t, Conf{}.Start(nil))
	// enabled without key: the service must refuse to start
	port := freePort(t)
	assert.Error(t, Conf{BindPort: port, BindAddress: "127.0.0.1", Sites: []Site{{Root: dir}}}.Start(nil))
	assert.Error(t, Conf{BindPort: port, BindAddress: "127.0.0.1"}.Start(nil))

	// listening, end to end
	c := Conf{BindPort: port, BindAddress: "127.0.0.1", Sites: []Site{{Host: "127.0.0.1", Root: dir, SigningKey: Secret(key)}}}
	require.NoError(t, c.Start(nil))
	// port already in use
	assert.Error(t, c.Start(nil))

	exp := strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10)
	base := "http://127.0.0.1:" + strconv.Itoa(port)
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

func freePort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	port := ln.Addr().(*net.TCPAddr).Port
	require.NoError(t, ln.Close())
	return port
}

func assertNoSecret(t *testing.T, logs string, sigs ...string) {
	t.Helper()
	assert.NotContains(t, logs, "sig=")
	assert.NotContains(t, logs, "key-of-site")
	for _, s := range sigs {
		assert.NotContains(t, logs, s)
		assert.NotContains(t, logs, s[:20])
	}
}
