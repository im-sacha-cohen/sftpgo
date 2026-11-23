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

// Package glyfiles serves the gly-logger recordings over HTTP, read only,
// behind a signed URL check (format v1, see the "gly-logger signed URLs"
// section of the README).
//
// It is a fork-only addition: it runs on its own listener, enabled by the
// GLY_FILES_ADDR environment variable, and shares nothing with the SFTPGo
// HTTP server, so SFTP, the admin and the WebClient are left untouched and
// the SFTPGo access logs never see a signed URL.
package glyfiles

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/drakkan/sftpgo/v2/internal/logger"
)

const (
	logSender = "glyfiles"

	envAddr        = "GLY_FILES_ADDR"
	envRoot        = "GLY_FILES_ROOT"
	envMode        = "GLY_FILES_SIGNING_MODE"
	envKey         = "GLY_FILES_SIGNING_KEY"
	envPreviousKey = "GLY_FILES_SIGNING_KEY_PREVIOUS"
	envMaxTTL      = "GLY_FILES_SIGNING_MAX_TTL"

	minKeyLength  = 32
	defaultMaxTTL = 86400

	// signature format version, part of the signed message. Never change
	// the v1 format: a new format is a new version agreed with the API.
	formatVersion = "v1"

	cacheControl = "private, no-store"
)

// Mode is the signature checking mode
type Mode string

// Supported modes
const (
	ModeOff     Mode = "off"
	ModeObserve Mode = "observe"
	ModeEnforce Mode = "enforce"
)

var (
	expRegex = regexp.MustCompile(`^[0-9]{1,19}$`)
	// ULID: 26 chars, upper case Crockford base32, first char 0-7
	userRegex = regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`)
	sigRegex  = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	sigCodec  = base64.RawURLEncoding.Strict()
)

// Config defines the signed file server configuration
type Config struct {
	Addr        string
	Root        string
	Mode        Mode
	Key         []byte
	PreviousKey []byte
	MaxTTL      time.Duration
}

// LoadConfig reads the configuration using getenv. A nil config and no error
// means the feature is disabled (GLY_FILES_ADDR is not set).
func LoadConfig(getenv func(string) string) (*Config, error) {
	c := &Config{
		Addr: getenv(envAddr),
		Root: getenv(envRoot),
		Mode: ModeEnforce,
	}
	if c.Addr == "" {
		return nil, nil
	}
	if c.Root == "" {
		return nil, fmt.Errorf("glyfiles: %s is set but %s is empty", envAddr, envRoot)
	}
	if m := getenv(envMode); m != "" {
		c.Mode = Mode(m)
	}
	switch c.Mode {
	case ModeOff, ModeObserve, ModeEnforce:
	default:
		return nil, fmt.Errorf("glyfiles: invalid %s %q, allowed values: off, observe, enforce", envMode, c.Mode)
	}
	c.MaxTTL = defaultMaxTTL * time.Second
	if v := getenv(envMaxTTL); v != "" {
		ttl, err := strconv.ParseInt(v, 10, 64)
		if err != nil || ttl <= 0 || ttl > 10*365*86400 {
			return nil, fmt.Errorf("glyfiles: invalid %s %q, it must be a positive number of seconds", envMaxTTL, v)
		}
		c.MaxTTL = time.Duration(ttl) * time.Second
	}
	if c.Mode == ModeOff {
		return c, nil
	}
	key := getenv(envKey)
	if utf8.RuneCountInString(key) < minKeyLength {
		return nil, fmt.Errorf("glyfiles: %s is missing or shorter than %d characters, refusing to start in %q mode",
			envKey, minKeyLength, c.Mode)
	}
	c.Key = []byte(key)
	if prev := getenv(envPreviousKey); prev != "" {
		if utf8.RuneCountInString(prev) < minKeyLength {
			return nil, fmt.Errorf("glyfiles: %s is shorter than %d characters", envPreviousKey, minKeyLength)
		}
		c.PreviousKey = []byte(prev)
	}
	return c, nil
}

// Start reads the configuration from the environment and, if enabled, starts
// serving in the background. Any configuration or listen error is returned,
// so the service refuses to start. onServeError is called if the server stops
// unexpectedly later.
func Start(onServeError func(error)) error {
	c, err := LoadConfig(os.Getenv)
	if err != nil {
		return err
	}
	if c == nil {
		logger.Info(logSender, "", "signed file server disabled, %s not set", envAddr)
		return nil
	}
	h, err := NewHandler(c)
	if err != nil {
		return err
	}
	ln, err := net.Listen("tcp", c.Addr)
	if err != nil {
		return fmt.Errorf("glyfiles: unable to listen on %q: %w", c.Addr, err)
	}
	srv := &http.Server{
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 16,
	}
	logger.Info(logSender, "", "signed file server listening on %q, root %q, mode %q, max ttl %v, previous key set: %t",
		c.Addr, c.Root, c.Mode, c.MaxTTL, len(c.PreviousKey) > 0)
	go func() {
		err := srv.Serve(ln)
		logger.Error(logSender, "", "signed file server stopped: %v", err)
		if onServeError != nil {
			onServeError(err)
		}
	}()
	return nil
}

// Sign returns the v1 signature for the given values. It is the reference
// implementation the gly-logger API must match.
func Sign(key []byte, exp, user, path string) string {
	return sigCodec.EncodeToString(computeMAC(key, exp, user, path))
}

func computeMAC(key []byte, exp, user, path string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(formatVersion + "\n" + exp + "\n" + user + "\n" + path))
	return mac.Sum(nil)
}

// Handler serves the files below Root after checking the signature
type Handler struct {
	mode        Mode
	key         []byte
	previousKey []byte
	maxTTL      time.Duration
	root        *os.Root
	now         func() time.Time
	logf        func(level logger.LogLevel, format string, v ...any)
}

// NewHandler returns a Handler for the given configuration
func NewHandler(c *Config) (*Handler, error) {
	root, err := os.OpenRoot(c.Root)
	if err != nil {
		return nil, fmt.Errorf("glyfiles: unable to open %s %q: %w", envRoot, c.Root, err)
	}
	return &Handler{
		mode:        c.Mode,
		key:         c.Key,
		previousKey: c.PreviousKey,
		maxTTL:      c.MaxTTL,
		root:        root,
		now:         time.Now,
		logf: func(level logger.LogLevel, format string, v ...any) {
			logger.Log(level, logSender, "", format, v...)
		},
	}, nil
}

// signedRequest holds the parsed signature parameters. The signature itself
// is never kept as a string, so it cannot end up in a log line.
type signedRequest struct {
	exp  string
	user string
	sig  []byte
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeEmpty(w, http.StatusMethodNotAllowed)
		return
	}
	// the path is checked in every mode: it protects the disk, not the access
	if reason := checkPath(r.URL.Path); reason != "" {
		h.logRequest(logger.LevelWarn, "refused", r, "", reason, http.StatusForbidden)
		writeEmpty(w, http.StatusForbidden)
		return
	}
	user := ""
	if h.mode != ModeOff {
		req, reason := h.verify(r)
		user = req.user
		if reason != "" {
			if h.mode == ModeEnforce {
				h.logRequest(logger.LevelWarn, "refused", r, user, reason, http.StatusForbidden)
				writeEmpty(w, http.StatusForbidden)
				return
			}
			// observe mode: serve anyway, log what would have been refused
			sw := &statusWriter{ResponseWriter: w}
			h.serveFile(sw, r)
			h.logRequest(logger.LevelWarn, "observe-would-refuse", r, user, reason, sw.status)
			return
		}
	}
	sw := &statusWriter{ResponseWriter: w}
	h.serveFile(sw, r)
	h.logRequest(logger.LevelInfo, "served", r, user, "", sw.status)
}

// verify returns the parsed request and an empty reason if the signature is
// valid, the refusal reason otherwise. The returned user is the claimed one,
// it is only verified if the reason is empty.
func (h *Handler) verify(r *http.Request) (signedRequest, string) {
	var req signedRequest
	query, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		return req, "malformed_query"
	}
	values := make(map[string]string, 3)
	for _, name := range []string{"exp", "u", "sig"} {
		v := query[name]
		switch len(v) {
		case 0:
			return req, "missing_" + name
		case 1:
			values[name] = v[0]
		default:
			return req, "duplicate_" + name
		}
	}
	req.user = values["u"]
	if !userRegex.MatchString(req.user) {
		return req, "malformed_u"
	}
	req.exp = values["exp"]
	if !expRegex.MatchString(req.exp) {
		return req, "malformed_exp"
	}
	exp, err := strconv.ParseInt(req.exp, 10, 64)
	if err != nil {
		return req, "malformed_exp"
	}
	if !sigRegex.MatchString(values["sig"]) {
		return req, "malformed_sig"
	}
	req.sig, err = sigCodec.DecodeString(values["sig"])
	if err != nil || len(req.sig) != sha256.Size {
		return req, "malformed_sig"
	}
	now := h.now().Unix()
	if exp <= now {
		return req, "expired"
	}
	if exp-now > int64(h.maxTTL/time.Second) {
		return req, "exp_too_far"
	}
	if hmac.Equal(req.sig, computeMAC(h.key, req.exp, req.user, r.URL.Path)) {
		return req, ""
	}
	if len(h.previousKey) > 0 && hmac.Equal(req.sig, computeMAC(h.previousKey, req.exp, req.user, r.URL.Path)) {
		return req, ""
	}
	return req, "bad_signature"
}

func checkPath(p string) string {
	if !strings.HasPrefix(p, "/") || p == "/" {
		return "bad_path"
	}
	if strings.Contains(p, "//") || strings.ContainsAny(p, "\\\x00") {
		return "bad_path"
	}
	for _, segment := range strings.Split(p, "/") {
		if segment == ".." || segment == "." {
			return "bad_path"
		}
	}
	return ""
}

func (h *Handler) serveFile(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/")
	f, err := h.root.Open(name)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			writeEmpty(w, http.StatusNotFound)
		} else {
			writeEmpty(w, http.StatusForbidden)
		}
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		writeEmpty(w, http.StatusNotFound)
		return
	}
	// no shared cache (proxy, CDN) must keep a copy: every request,
	// including each Range request, must go through the check
	w.Header().Set("Cache-Control", cacheControl)
	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func writeEmpty(w http.ResponseWriter, status int) {
	w.Header().Set("Cache-Control", cacheControl)
	w.Header().Set("Content-Length", "0")
	w.WriteHeader(status)
}

// logRequest never logs the query string: the signature must not be logged.
func (h *Handler) logRequest(level logger.LogLevel, outcome string, r *http.Request, user, reason string, status int) {
	h.logf(level, "%s method=%s path=%q u=%q reason=%q status=%d range=%q mode=%s remote=%q forwarded_for=%q",
		outcome, r.Method, truncate(r.URL.Path, 512), truncate(user, 64), reason, status,
		truncate(r.Header.Get("Range"), 64), h.mode, r.RemoteAddr,
		truncate(r.Header.Get("X-Forwarded-For"), 128))
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n] + "..."
	}
	return s
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}
