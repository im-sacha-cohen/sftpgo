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

// Package signedfiles serves directories over HTTP, read only, behind a
// signed URL check (format v1, see the "Signed files" section of the README).
//
// It is a fork-only addition. It runs on its own listener, configured by the
// "signed_files" section of the configuration file, and shares nothing with
// the SFTPGo HTTP server: SFTP, the admin and the WebClient are left untouched
// and the SFTPGo access logs never see a signed URL. One listener serves
// several sites, selected by the Host header, each one with its own directory,
// keys and mode.
package signedfiles

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
	logSender = "signedfiles"

	minKeyLength  = 32
	defaultMaxTTL = 86400
	maxMaxTTL     = 10 * 365 * 86400
	maxEnvSites   = 10

	// signature format version, part of the signed message. Never change
	// the v1 format: a new format is a new version agreed with the signers.
	formatVersion = "v1"

	cacheControl = "private, no-store"
)

// Supported modes
const (
	ModeOff     = "off"
	ModeObserve = "observe"
	ModeEnforce = "enforce"
)

var (
	expRegex = regexp.MustCompile(`^[0-9]{1,19}$`)
	// ULID: 26 chars, upper case Crockford base32, first char 0-7
	userRegex = regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`)
	sigRegex  = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	sigCodec  = base64.RawURLEncoding.Strict()
)

// Secret is a string that is never printed, so a signing key cannot end up in
// the configuration dump SFTPGo logs at startup.
type Secret string

// String implements fmt.Stringer
func (s Secret) String() string {
	if s == "" {
		return ""
	}
	return "[redacted]"
}

// GoString implements fmt.GoStringer
func (s Secret) GoString() string {
	return s.String()
}

// Site defines a directory served behind signed URLs
type Site struct {
	// Host is the host name the site answers to, for example
	// files.example.com. An empty host matches any host without a site
	Host string `json:"host" mapstructure:"host"`
	// Root is the directory served: /<path> in the URL is <root>/<path>
	Root string `json:"root" mapstructure:"root"`
	// Mode is off, observe or enforce. Empty means enforce
	Mode string `json:"mode" mapstructure:"mode"`
	// SigningKey is the current key, at least 32 characters. Prefer the
	// environment variable to the configuration file
	SigningKey Secret `json:"signing_key" mapstructure:"signing_key"`
	// PreviousSigningKey is optional, also accepted while changing keys
	PreviousSigningKey Secret `json:"previous_signing_key" mapstructure:"previous_signing_key"`
	// MaxTTL is the maximum number of seconds between now and exp.
	// 0 means 86400
	MaxTTL int `json:"max_ttl" mapstructure:"max_ttl"`
}

// Conf defines the signed files server configuration
type Conf struct {
	// BindPort is the listening port, 0 disables the feature
	BindPort int `json:"bind_port" mapstructure:"bind_port"`
	// BindAddress is the listening address, empty means all interfaces
	BindAddress string `json:"bind_address" mapstructure:"bind_address"`
	// Sites to serve, at least one if BindPort is set
	Sites []Site `json:"sites" mapstructure:"sites"`
}

// ShouldBind returns true if the server must be started
func (c Conf) ShouldBind() bool {
	return c.BindPort > 0
}

// LoadSitesFromEnv overrides or adds sites from SFTPGO_SIGNED_FILES__SITES__<n>__<FIELD>
// environment variables, viper does not support slices of structs from env
func LoadSitesFromEnv(sites []Site) []Site {
	return loadSitesFromEnv(sites, os.LookupEnv)
}

func loadSitesFromEnv(sites []Site, lookup func(string) (string, bool)) []Site {
	for idx := range maxEnvSites {
		var site Site
		if idx < len(sites) {
			site = sites[idx]
		}
		isSet := false
		get := func(field string) (string, bool) {
			v, ok := lookup(fmt.Sprintf("SFTPGO_SIGNED_FILES__SITES__%d__%s", idx, field))
			if ok {
				isSet = true
			}
			return v, ok
		}
		if v, ok := get("HOST"); ok {
			site.Host = v
		}
		if v, ok := get("ROOT"); ok {
			site.Root = v
		}
		if v, ok := get("MODE"); ok {
			site.Mode = v
		}
		if v, ok := get("SIGNING_KEY"); ok {
			site.SigningKey = Secret(v)
		}
		if v, ok := get("PREVIOUS_SIGNING_KEY"); ok {
			site.PreviousSigningKey = Secret(v)
		}
		if v, ok := get("MAX_TTL"); ok {
			ttl, err := strconv.Atoi(v)
			if err != nil {
				// invalid on purpose, rejected by the validation at startup
				ttl = -1
			}
			site.MaxTTL = ttl
		}
		if !isSet {
			continue
		}
		if idx < len(sites) {
			sites[idx] = site
		} else {
			sites = append(sites, site)
		}
	}
	return sites
}

// Start validates the configuration and, if enabled, starts serving in the
// background. Any configuration or listen error is returned, so the service
// refuses to start. onServeError is called if the server stops later.
func (c Conf) Start(onServeError func(error)) error {
	if !c.ShouldBind() {
		logger.Info(logSender, "", "signed files server not started, disabled in config file")
		return nil
	}
	h, err := NewHandler(c.Sites)
	if err != nil {
		return err
	}
	addr := net.JoinHostPort(c.BindAddress, strconv.Itoa(c.BindPort))
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("signed_files: unable to listen on %q: %w", addr, err)
	}
	srv := &http.Server{
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 16,
	}
	for _, s := range h.sites {
		logger.Info(logSender, "", "site %q: root %q, mode %q, max ttl %v, previous key set: %t",
			s.host, s.rootPath, s.mode, s.maxTTL, len(s.previousKey) > 0)
	}
	logger.Info(logSender, "", "signed files server listening on %q, %d site(s)", addr, len(h.sites))
	go func() {
		err := srv.Serve(ln)
		logger.Error(logSender, "", "signed files server stopped: %v", err)
		if onServeError != nil {
			onServeError(err)
		}
	}()
	return nil
}

// Sign returns the v1 signature for the given values. It is the reference
// implementation the signers must match.
func Sign(key []byte, exp, user, path string) string {
	return sigCodec.EncodeToString(computeMAC(key, exp, user, path))
}

func computeMAC(key []byte, exp, user, path string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(formatVersion + "\n" + exp + "\n" + user + "\n" + path))
	return mac.Sum(nil)
}

type site struct {
	host        string
	rootPath    string
	root        *os.Root
	mode        string
	key         []byte
	previousKey []byte
	maxTTL      time.Duration
}

// Handler serves the configured sites
type Handler struct {
	sites    map[string]*site
	fallback *site
	now      func() time.Time
	logf     func(level logger.LogLevel, format string, v ...any)
}

// NewHandler validates the sites and returns a Handler for them
func NewHandler(sites []Site) (*Handler, error) {
	if len(sites) == 0 {
		return nil, errors.New("signed_files: bind_port is set but no site is configured")
	}
	h := &Handler{
		sites: make(map[string]*site, len(sites)),
		now:   time.Now,
		logf: func(level logger.LogLevel, format string, v ...any) {
			logger.Log(level, logSender, "", format, v...)
		},
	}
	for idx, cfg := range sites {
		s, err := newSite(cfg)
		if err != nil {
			h.close()
			return nil, fmt.Errorf("signed_files: site %d (%q): %w", idx, cfg.Host, err)
		}
		if _, ok := h.sites[s.host]; ok {
			h.close()
			_ = s.root.Close()
			return nil, fmt.Errorf("signed_files: site %d: duplicate host %q", idx, cfg.Host)
		}
		h.sites[s.host] = s
		if s.host == "" {
			h.fallback = s
		}
	}
	return h, nil
}

func (h *Handler) close() {
	for _, s := range h.sites {
		_ = s.root.Close()
	}
}

func newSite(cfg Site) (*site, error) {
	s := &site{
		host:     normalizeHost(cfg.Host),
		rootPath: cfg.Root,
		mode:     cfg.Mode,
		maxTTL:   time.Duration(cfg.MaxTTL) * time.Second,
	}
	if s.mode == "" {
		s.mode = ModeEnforce
	}
	switch s.mode {
	case ModeOff, ModeObserve, ModeEnforce:
	default:
		return nil, fmt.Errorf("invalid mode %q, allowed values: off, observe, enforce", cfg.Mode)
	}
	if cfg.MaxTTL < 0 || cfg.MaxTTL > maxMaxTTL {
		return nil, fmt.Errorf("invalid max_ttl, it must be a positive number of seconds")
	}
	if cfg.MaxTTL == 0 {
		s.maxTTL = defaultMaxTTL * time.Second
	}
	if s.mode != ModeOff {
		if utf8.RuneCountInString(string(cfg.SigningKey)) < minKeyLength {
			return nil, fmt.Errorf("signing_key is missing or shorter than %d characters, refusing to start in %q mode",
				minKeyLength, s.mode)
		}
		s.key = []byte(cfg.SigningKey)
		if cfg.PreviousSigningKey != "" {
			if utf8.RuneCountInString(string(cfg.PreviousSigningKey)) < minKeyLength {
				return nil, fmt.Errorf("previous_signing_key is shorter than %d characters", minKeyLength)
			}
			s.previousKey = []byte(cfg.PreviousSigningKey)
		}
	}
	if cfg.Root == "" {
		return nil, errors.New("root is required")
	}
	root, err := os.OpenRoot(cfg.Root)
	if err != nil {
		return nil, fmt.Errorf("unable to open root %q: %w", cfg.Root, err)
	}
	s.root = root
	return s, nil
}

func normalizeHost(host string) string {
	host = strings.ToLower(strings.TrimSpace(host))
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.TrimSuffix(host, ".")
}

func (h *Handler) siteFor(r *http.Request) *site {
	if s, ok := h.sites[normalizeHost(r.Host)]; ok {
		return s
	}
	return h.fallback
}

// signedRequest holds the parsed signature parameters. The signature itself
// is never kept as a string, so it cannot end up in a log line.
type signedRequest struct {
	exp  string
	user string
	sig  []byte
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s := h.siteFor(r)
	if s == nil {
		h.logRequest(logger.LevelWarn, "unknown-host", r, nil, "", "", http.StatusNotFound)
		writeEmpty(w, http.StatusNotFound)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeEmpty(w, http.StatusMethodNotAllowed)
		return
	}
	// the path is checked in every mode: it protects the disk, not the access
	if reason := checkPath(r.URL.Path); reason != "" {
		h.logRequest(logger.LevelWarn, "refused", r, s, "", reason, http.StatusForbidden)
		writeEmpty(w, http.StatusForbidden)
		return
	}
	user := ""
	if s.mode != ModeOff {
		req, reason := s.verify(r, h.now())
		user = req.user
		if reason != "" {
			if s.mode == ModeEnforce {
				h.logRequest(logger.LevelWarn, "refused", r, s, user, reason, http.StatusForbidden)
				writeEmpty(w, http.StatusForbidden)
				return
			}
			// observe mode: serve anyway, log what would have been refused
			sw := &statusWriter{ResponseWriter: w}
			s.serveFile(sw, r)
			h.logRequest(logger.LevelWarn, "observe-would-refuse", r, s, user, reason, sw.status)
			return
		}
	}
	sw := &statusWriter{ResponseWriter: w}
	s.serveFile(sw, r)
	h.logRequest(logger.LevelInfo, "served", r, s, user, "", sw.status)
}

// verify returns the parsed request and an empty reason if the signature is
// valid, the refusal reason otherwise. The returned user is the claimed one,
// it is only verified if the reason is empty.
func (s *site) verify(r *http.Request, now time.Time) (signedRequest, string) {
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
	unixNow := now.Unix()
	if exp <= unixNow {
		return req, "expired"
	}
	if exp-unixNow > int64(s.maxTTL/time.Second) {
		return req, "exp_too_far"
	}
	if hmac.Equal(req.sig, computeMAC(s.key, req.exp, req.user, r.URL.Path)) {
		return req, ""
	}
	if len(s.previousKey) > 0 && hmac.Equal(req.sig, computeMAC(s.previousKey, req.exp, req.user, r.URL.Path)) {
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

func (s *site) serveFile(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/")
	f, err := s.root.Open(name)
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
func (h *Handler) logRequest(level logger.LogLevel, outcome string, r *http.Request, s *site, user, reason string,
	status int,
) {
	mode := ""
	if s != nil {
		mode = s.mode
	}
	h.logf(level, "%s host=%q method=%s path=%q u=%q reason=%q status=%d range=%q mode=%s remote=%q forwarded_for=%q",
		outcome, truncate(r.Host, 128), r.Method, truncate(r.URL.Path, 512), truncate(user, 64), reason, status,
		truncate(r.Header.Get("Range"), 64), mode, r.RemoteAddr,
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
