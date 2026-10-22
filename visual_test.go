package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
)

// Only the visual launcher opts into this long-running interactive test.
// It reuses production routes and the integration suite's isolated DB schema.
func TestVisualBrowser(t *testing.T) {
	if os.Getenv("VISUAL_TEST") != "1" {
		t.Skip("use scripts/test-visual.ps1 to open the ten-player visual runner")
	}
	assets := os.Getenv("VISUAL_ASSET_DIR")
	if _, err := os.Stat(filepath.Join(assets, "index.html")); assets == "" || err != nil {
		t.Fatal("visual frontend build is missing; run scripts/test-visual.ps1 without -SkipBuild")
	}
	db := flowDatabase(t)
	app := newTrackerServerWithAssets(db, assets)
	// This fault endpoint exists only inside the test fixture. Chromium's offline
	// emulation can leave an existing SSE response alive, so explicitly terminate
	// it while the browser is offline and let native EventSource reconnect.
	secret := make([]byte, 24)
	if _, err := rand.Read(secret); err != nil {
		t.Fatal(err)
	}
	faultToken := hex.EncodeToString(secret)
	var streamsMu sync.Mutex
	streams := make(map[*context.CancelFunc]string)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/__test/disconnect" {
			if r.Method != http.MethodPost || r.Header.Get("X-Test-Fault-Token") != faultToken {
				http.Error(w, "Forbidden", 403)
				return
			}
			streamsMu.Lock()
			for cancel, name := range streams {
				if name == r.URL.Query().Get("username") {
					(*cancel)()
				}
			}
			streamsMu.Unlock()
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.URL.Path == "/api/liveteamview" {
			ctx, cancel := context.WithCancel(r.Context())
			defer cancel()
			name := ""
			if cookie, err := r.Cookie("session_id"); err == nil {
				stateMu.Lock()
				name, _ = getSession(cookie.Value)["username"].(string)
				stateMu.Unlock()
			}
			streamsMu.Lock()
			streams[&cancel] = name
			streamsMu.Unlock()
			defer func() { streamsMu.Lock(); delete(streams, &cancel); streamsMu.Unlock() }()
			r = r.WithContext(ctx)
		}
		app.ServeHTTP(w, r)
	}))
	t.Cleanup(server.Close)
	ctx, cancel := context.WithCancel(context.Background())
	var monitor sync.WaitGroup
	monitor.Add(1)
	go func() { defer monitor.Done(); monitorClients(ctx, db, app.queuePlayers) }()
	t.Cleanup(func() { cancel(); monitor.Wait() })
	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal("Node.js must be on PATH")
	}
	command := exec.CommandContext(ctx, node, "visual-tests/runner.mjs", "--url", server.URL)
	command.Env = append(os.Environ(), "VISUAL_FAULT_TOKEN="+faultToken)
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Run(); err != nil {
		t.Fatalf("visual browser runner: %v", err)
	}
}
