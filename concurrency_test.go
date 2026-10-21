package main

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestConcurrentSessionLifecycle(t *testing.T) {
	app := newTrackerServer(nil)
	ids := make([]string, 10)
	stateMu.Lock()
	for i := range ids {
		ids[i] = fmt.Sprintf("%s-%d", t.Name(), i)
		setSession(ids[i], map[string]interface{}{"username": fmt.Sprintf("Player%d", i)})
	}
	stateMu.Unlock()
	t.Cleanup(func() {
		stateMu.Lock()
		defer stateMu.Unlock()
		for _, id := range ids {
			deleteSession(id)
		}
	})
	// Ten tabs per account overlap reads and logout of the same session.
	together(t, 100, func(i int) error {
		path, method := "/api/user", http.MethodGet
		if i >= 90 {
			path, method = "/api/logout", http.MethodPost
		}
		r := httptest.NewRequest(method, path, nil)
		r.AddCookie(&http.Cookie{Name: "session_id", Value: ids[i%10]})
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		if w.Code != http.StatusOK && w.Code != http.StatusUnauthorized {
			return fmt.Errorf("%s returned %d", path, w.Code)
		}
		return nil
	})
	for _, id := range ids {
		r := httptest.NewRequest(http.MethodGet, "/api/user", nil)
		r.AddCookie(&http.Cookie{Name: "session_id", Value: id})
		w := httptest.NewRecorder()
		app.ServeHTTP(w, r)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("logged out session returned %d", w.Code)
		}
	}
}

type readyStreamWriter struct {
	header http.Header
	ready  chan struct{}
	once   sync.Once
}

func (w *readyStreamWriter) Header() http.Header         { return w.header }
func (w *readyStreamWriter) WriteHeader(int)             {}
func (w *readyStreamWriter) Write(p []byte) (int, error) { return len(p), nil }
func (w *readyStreamWriter) Flush()                      { w.once.Do(func() { close(w.ready) }) }

func TestLiveSubscribersDisconnectDuringBroadcast(t *testing.T) {
	app := newTrackerServer(nil)
	gameID := t.Name()
	var wg sync.WaitGroup
	cancels := make([]context.CancelFunc, 10)
	for i := range cancels {
		ctx, cancel := context.WithCancel(context.Background())
		cancels[i] = cancel
		t.Cleanup(cancel)
		r := httptest.NewRequest(http.MethodGet, "/api/liveteamview?gameId="+gameID, nil).WithContext(ctx)
		id := fmt.Sprintf("%s-%d", t.Name(), i)
		r.AddCookie(&http.Cookie{Name: "session_id", Value: id})
		t.Cleanup(func() { stateMu.Lock(); deleteSession(id); stateMu.Unlock() })
		w := &readyStreamWriter{header: make(http.Header), ready: make(chan struct{})}
		wg.Add(1)
		go func() { defer wg.Done(); app.ServeHTTP(w, r) }()
		select {
		case <-w.ready:
		case <-time.After(3 * time.Second):
			t.Fatal("subscriber never connected")
		}
	}
	together(t, 11, func(i int) error {
		if i < 10 {
			cancels[i]()
			return nil
		}
		for n := 0; n < 100; n++ {
			broadcastEvent(gameID, "event: updateLobby\ndata: []\n\n")
		}
		return nil
	})
	wg.Wait()
	clientsMu.RLock()
	defer clientsMu.RUnlock()
	if len(clients[gameID]) != 0 {
		t.Fatal("disconnected subscribers leaked")
	}
}

func TestSlowSubscriberDoesNotBlockBroadcast(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	gameID := t.Name()
	client := &Client{gameId: gameID, ch: make(chan string, 1), cancel: cancel}
	client.ch <- "pending event"
	clientsMu.Lock()
	clients[gameID] = []*Client{client}
	clientsMu.Unlock()
	t.Cleanup(func() { clientsMu.Lock(); delete(clients, gameID); clientsMu.Unlock() })
	done := make(chan struct{})
	go func() { broadcastEvent(gameID, "next event"); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		<-client.ch
		t.Fatal("slow browser blocked broadcast")
	}
	select {
	case <-ctx.Done():
	default:
		t.Fatal("slow browser was not disconnected to resync")
	}
}

func TestQueueRequiresTenUniquePlayers(t *testing.T) {
	db, players, app := newFlow(t)
	// Retried joins from nine identities must not create a ten-player match.
	together(t, 90, func(i int) error {
		i %= 9
		_, err := players[i].ok("/queue", Queuers{Username: players[i].name})
		return err
	})
	stateMu.Lock()
	count := len(*app.queuePlayers)
	stateMu.Unlock()
	if count != 9 {
		t.Fatalf("nine users produced %d queue entries", count)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	r, _ := http.NewRequestWithContext(ctx, http.MethodGet, players[0].base+"/api/inqueue", nil)
	resp, err := players[0].client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	scanner := bufio.NewScanner(resp.Body)
	if !scanner.Scan() || scanner.Text() != "data: InQueue 0" {
		t.Fatalf("nine players unexpectedly formed a match: %s", scanner.Text())
	}
	cancel()
	resp.Body.Close()
	_, status, err := players[9].request("/api/matchaccepted", Usernamers{Username: players[9].name})
	if err != nil || status != http.StatusConflict {
		t.Fatalf("unqueued acceptance: status=%d error=%v", status, err)
	}
	requireOK(t, players[9], "/queue", Queuers{Username: players[9].name})
	ids := make([]string, 10)
	together(t, 10, func(i int) error { var err error; ids[i], err = matchFound(players[i]); return err })
	for _, id := range ids {
		if id != ids[0] {
			t.Fatalf("split matches: %v", ids)
		}
	}
	together(t, 9, func(i int) error {
		_, err := players[i].ok("/api/matchaccepted", Usernamers{Username: players[i].name})
		return err
	})
	_, status, err = players[0].request("/api/redirecttogame", UserGame{Id: ids[0], Username: players[0].name})
	if err != nil || status != http.StatusConflict {
		t.Fatalf("redirect before tenth acceptance: status=%d error=%v", status, err)
	}
	var inGame int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "Users" WHERE "InGame"`).Scan(&inGame); err != nil {
		t.Fatal(err)
	}
	if inGame != 0 {
		t.Fatalf("%d players entered the game before all accepted", inGame)
	}
}

func TestTenPlayerHeartbeatCleanup(t *testing.T) {
	db, players, app := newFlow(t)
	conns := make([]*websocket.Conn, 10)
	t.Cleanup(func() {
		mu.Lock()
		defer mu.Unlock()
		for i, p := range players {
			if conns[i] != nil {
				conns[i].Close()
			}
			if active := players3[p.name]; active != nil {
				active.conn.Close()
				delete(players3, p.name)
			}
		}
	})
	together(t, 10, func(i int) error {
		p := players[i]
		if _, err := p.ok("/queue", Queuers{Username: p.name}); err != nil {
			return err
		}
		dialer := websocket.Dialer{TLSClientConfig: p.client.Transport.(*http.Transport).TLSClientConfig, HandshakeTimeout: 3 * time.Second}
		conn, _, err := dialer.Dial(strings.Replace(p.base, "https:", "wss:", 1)+"/heartbeat?username="+p.name, nil)
		if err != nil {
			return err
		}
		conns[i] = conn
		conn.SetReadDeadline(time.Now().Add(3 * time.Second))
		if err := conn.WriteJSON(Message{Type: "ping"}); err != nil {
			return err
		}
		var pong Message
		if err := conn.ReadJSON(&pong); err != nil {
			return err
		}
		if pong.Type != "pong" {
			return fmt.Errorf("unexpected heartbeat: %+v", pong)
		}
		return nil
	})
	// Advance the sweep's clock, without sleeping for the inactivity timeout.
	sweepClients(db, app.queuePlayers, time.Now().Add(16*time.Second))
	stateMu.Lock()
	remaining := len(*app.queuePlayers)
	stateMu.Unlock()
	if remaining != 0 {
		t.Fatalf("inactivity cleanup left %d players in the actual queue", remaining)
	}
	mu.Lock()
	active := len(players3)
	mu.Unlock()
	if active != 0 {
		t.Fatalf("inactivity cleanup left %d heartbeat connections", active)
	}
	var queued int
	if err := db.QueryRow(`SELECT COUNT(*) FROM "Users" WHERE "InQueue"`).Scan(&queued); err != nil {
		t.Fatal(err)
	}
	if queued != 0 {
		t.Fatalf("inactivity cleanup left %d database queue flags", queued)
	}
	for _, p := range players {
		body := requireOK(t, p, "/api/user", nil)
		if !strings.Contains(string(body), `"inQueue":0`) {
			t.Fatalf("stale session after inactivity: %s", body)
		}
	}
}
