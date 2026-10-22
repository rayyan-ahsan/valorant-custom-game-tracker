package main

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

// These tests use the real routes and PostgreSQL, with a new schema for each
// scenario. TEST_DATABASE_URL must point at a local, disposable test database.
func flowDatabase(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run the PostgreSQL integration tests (see TESTING.md)")
	}
	u, err := url.Parse(dsn)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		t.Fatal("TEST_DATABASE_URL must be a PostgreSQL URL")
	}
	admin, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Close() })
	schema := fmt.Sprintf("flow_%d", time.Now().UnixNano())
	if _, err := admin.Exec(`CREATE SCHEMA "` + schema + `"`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec(`DROP SCHEMA "` + schema + `" CASCADE`); err != nil {
			t.Error(err)
		}
	})
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(20)
	t.Cleanup(func() { db.Close() })
	dbCheckUsersTable(db)
	return db
}

type flowPlayer struct {
	name   string
	client *http.Client
	base   string
}

func (p flowPlayer) request(path string, payload interface{}) ([]byte, int, error) {
	method := http.MethodGet
	var body io.Reader
	if payload != nil {
		method = http.MethodPost
		data, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, err
		}
		body = bytes.NewReader(data)
	}
	r, err := http.NewRequest(method, p.base+path, body)
	if err != nil {
		return nil, 0, err
	}
	r.Header.Set("Content-Type", "application/json")
	resp, err := p.client.Do(r)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	return data, resp.StatusCode, err
}

func (p flowPlayer) ok(path string, payload interface{}) ([]byte, error) {
	body, status, err := p.request(path, payload)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("%s %s: status %d: %s", p.name, path, status, body)
	}
	return body, nil
}

// A barrier makes every player begin a stage together, instead of accidentally
// testing a sequential flow. Errors are collected on the test goroutine.
func together(t *testing.T, count int, action func(int) error) {
	t.Helper()
	start := make(chan struct{})
	errs := make(chan error, count)
	var wg sync.WaitGroup
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(i int) { defer wg.Done(); <-start; errs <- action(i) }(i)
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Error(err)
		}
	}
	if t.Failed() {
		t.FailNow()
	}
}

func newFlow(t *testing.T) (*sql.DB, []flowPlayer, *trackerServer) {
	t.Helper()
	db := flowDatabase(t)
	app := newTrackerServer(db)
	server := httptest.NewTLSServer(app)
	t.Cleanup(server.Close)
	players := make([]flowPlayer, 10)
	for i := range players {
		jar, _ := cookiejar.New(nil)
		client := server.Client()
		// Give each browser its own cookie jar while sharing only the TLS transport.
		players[i] = flowPlayer{fmt.Sprintf("Player%02d", i), &http.Client{Transport: client.Transport, Jar: jar, Timeout: 8 * time.Second}, server.URL}
	}
	together(t, 10, func(i int) error {
		p := players[i]
		if _, err := p.ok("/signup", map[string]string{"username": p.name, "password": "test-password"}); err != nil {
			return err
		}
		_, err := p.ok("/login-submit", map[string]string{"username": p.name, "password": "test-password"})
		return err
	})
	t.Cleanup(func() {
		stateMu.Lock()
		defer stateMu.Unlock()
		for _, player := range players {
			for _, cookie := range player.client.Jar.Cookies(mustURL(server.URL)) {
				if cookie.Name == "session_id" {
					deleteSession(cookie.Value)
				}
			}
			delete(usernameToSessionID, player.name)
		}
	})
	return db, players, app
}

func mustURL(value string) *url.URL {
	u, err := url.Parse(value)
	if err != nil {
		panic(err)
	}
	return u
}

func requireOK(t *testing.T, p flowPlayer, path string, payload interface{}) []byte {
	t.Helper()
	body, err := p.ok(path, payload)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func lobbyFor(t *testing.T, p flowPlayer, id string) []Lobby {
	t.Helper()
	var lobby []Lobby
	if err := json.Unmarshal(requireOK(t, p, "/api/getplayers", GameId{Id: id}), &lobby); err != nil {
		t.Fatal(err)
	}
	return lobby
}

func matchFound(p flowPlayer) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	r, _ := http.NewRequestWithContext(ctx, http.MethodGet, p.base+"/api/inqueue", nil)
	resp, err := p.client.Do(r)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		if id, ok := strings.CutPrefix(scanner.Text(), "data: MATCH FOUND:"); ok {
			return id, nil
		}
	}
	return "", fmt.Errorf("%s never received a match: %v", p.name, scanner.Err())
}

func prepareFlowLobby(t *testing.T, players []flowPlayer) string {
	t.Helper()
	together(t, 10, func(i int) error {
		_, err := players[i].ok("/queue", Queuers{Username: players[i].name})
		return err
	})
	queueStreams := make([]*flowStream, 10)
	for i := range players {
		queueStreams[i] = openFlowStreamPath(t, players[i], "/queuenumbers")
		queueStreams[i].wait(t, "", func(data string) bool { return data == "10 people in queue" })
	}
	ids := make([]string, 10)
	together(t, 10, func(i int) error { var err error; ids[i], err = matchFound(players[i]); return err })
	id := ids[0]
	for _, got := range ids {
		if got != id || len(got) != 5 {
			t.Fatalf("players received different matches: %v", ids)
		}
	}
	acceptStreams := make([]*flowStream, 10)
	for i := range players {
		acceptStreams[i] = openFlowStreamPath(t, players[i], "/api/matchaccepters")
	}
	together(t, 20, func(i int) error {
		if i >= 10 {
			i %= 10
			_, err := players[i].ok("/queue", Queuers{Username: players[i].name})
			return err
		}
		_, err := players[i].ok("/api/matchaccepted", Usernamers{Username: players[i].name})
		return err
	})
	for _, stream := range acceptStreams {
		stream.wait(t, "", func(data string) bool { return data == strings.Repeat("✅", 10) })
	}
	together(t, 10, func(i int) error {
		body, err := players[i].ok("/api/redirecttogame", UserGame{Id: id, Username: players[i].name})
		if err == nil && strings.TrimSpace(string(body)) != `"REDIRECT GameId:`+id+`"` {
			return fmt.Errorf("unexpected redirect: %s", body)
		}
		return err
	})
	for _, stream := range queueStreams {
		stream.wait(t, "", func(data string) bool { return data == "0 people in queue" })
	}
	// The earliest reader must initialize the lobby even if no browser's
	// /playersinlobby request has arrived yet.
	initial := lobbyFor(t, players[0], id)
	if len(initial) != 10 {
		t.Fatalf("initial read has %d players", len(initial))
	}

	together(t, 10, func(i int) error {
		_, err := players[i].ok("/api/playersinlobby", UserGame{Id: id, Username: players[i].name})
		return err
	})
	return id
}

func TestTenPlayerFlow(t *testing.T) {
	for _, format := range []string{"bo1", "bo2", "bo3"} {
		t.Run(format, func(t *testing.T) {
			db, players, _ := newFlow(t)
			id := prepareFlowLobby(t, players)
			lobbies := make([][]Lobby, 10)
			together(t, 10, func(i int) error {
				body, err := players[i].ok("/api/getplayers", GameId{Id: id})
				if err != nil {
					return err
				}
				return json.Unmarshal(body, &lobbies[i])
			})
			lobby := lobbies[0]
			if len(lobby) != 10 {
				t.Fatalf("got %d lobby players", len(lobby))
			}
			captains := make(map[int]flowPlayer)
			unpicked := []string{}
			seen := map[string]bool{}
			for _, p := range lobby {
				if seen[p.Username] {
					t.Fatalf("duplicate lobby player: %s", p.Username)
				}
				seen[p.Username] = true
				if p.Captain == 1 {
					if _, exists := captains[p.Team]; exists {
						t.Fatal("duplicate team captain")
					}
					for _, browser := range players {
						if browser.name == p.Username {
							captains[p.Team] = browser
						}
					}
				} else {
					unpicked = append(unpicked, p.Username)
				}
			}
			if len(captains) != 2 || len(unpicked) != 8 {
				t.Fatalf("incorrect captains: %+v", lobby)
			}
			for _, got := range lobbies {
				a, _ := json.Marshal(got)
				b, _ := json.Marshal(lobby)
				if !bytes.Equal(a, b) {
					t.Fatal("players saw inconsistent captains")
				}
			}
			streams := make([]*flowStream, 10)
			for i := range players {
				streams[i] = openFlowStream(t, players[i], id)
			}
			for i, team := range []int{1, 2, 2, 1, 1, 2, 1, 2} {
				// Overlap one captain's pick (and retry) with all ten lobby readers.
				together(t, 12, func(j int) error {
					if j < 2 {
						_, err := captains[team].ok("/api/updateteam", map[string]interface{}{"gameId": id, "Username": unpicked[i], "Team": team})
						return err
					}
					_, err := players[j-2].ok("/api/getplayers", GameId{Id: id})
					return err
				})
			}
			lobby = lobbyFor(t, players[0], id)
			if CountPlayersInLobbyStruct(lobby, 1) != 5 || CountPlayersInLobbyStruct(lobby, 2) != 5 {
				t.Fatalf("teams aren't 5v5: %+v", lobby)
			}
			for _, stream := range streams {
				stream.wait(t, "bestofseriesVote", func(data string) bool { return data == `"vote time"` })
			}
			voteIndex := map[string]int{"bo1": 0, "bo2": 1, "bo3": 2}[format]
			formats := []string{"bo1", "bo2", "bo3"}
			playerVote := func(i int) string {
				if i < 7 {
					return format
				}
				if i < 9 {
					return formats[(voteIndex+1)%3]
				}
				return formats[(voteIndex+2)%3]
			}
			// Every player clicks twice concurrently. Each identity counts once.
			together(t, 20, func(i int) error {
				i %= 10
				_, err := players[i].ok("/api/sendbovote?gameId="+id, playerVote(i))
				return err
			})
			for _, stream := range streams {
				stream.wait(t, "bestofseriesVote", func(data string) bool {
					var votes []int
					return json.Unmarshal([]byte(data), &votes) == nil && len(votes) == 3 && votes[voteIndex] == 7 && votes[(voteIndex+1)%3] == 2 && votes[(voteIndex+2)%3] == 1
				})
			}
			together(t, 10, func(i int) error {
				body, err := players[i].ok("/api/finalseriesvote?gameId="+id, nil)
				if err == nil && string(bytes.TrimSpace(body)) != `"`+format+`"` {
					return fmt.Errorf("wrong winning format: %s", body)
				}
				return err
			})
			var veto struct {
				MapList []mapList `json:"mapList"`
				Format  string    `json:"format"`
				Phase   string    `json:"mapPhase"`
				Team    string    `json:"mapTeam"`
			}
			for step := 0; step < 8; step++ {
				if err := json.Unmarshal(requireOK(t, players[0], "/api/getmapveto?gameId="+id, nil), &veto); err != nil {
					t.Fatal(err)
				}
				if veto.Phase == "done" {
					break
				}
				team := 1
				if veto.Team == "2" {
					team = 2
				}
				name := ""
				for _, m := range veto.MapList {
					if m.Action == 0 {
						name = m.Name
						break
					}
				}
				if name == "" {
					t.Fatal("no available map before veto completed")
				}
				together(t, 10, func(int) error {
					_, err := captains[team].ok("/api/updatemap", map[string]interface{}{"gameId": id, "mapName": name, "Team": team, "Action": veto.Phase, "FinalVote": format})
					return err
				})
			}
			if veto.Phase != "done" || veto.Format != format {
				t.Fatalf("veto didn't finish: %+v", veto)
			}
			wantMaps := map[string]int{"bo1": 1, "bo2": 2, "bo3": 3}[format]
			if CountMapValuesInMapStruct(veto.MapList, 1) != wantMaps {
				t.Fatalf("wrong picked map count: %+v", veto.MapList)
			}
			for _, m := range veto.MapList {
				if m.Action == 1 {
					together(t, 10, func(int) error {
						team := 3 - m.Team
						if m.Team == 3 {
							team = 1
						}
						_, err := captains[team].ok("/api/sendsideselect", map[string]interface{}{"gameId": id, "mapName": m.Name, "team": team, "side": 1})
						return err
					})
				}
			}
			for _, stream := range streams {
				stream.wait(t, "mapsides", func(data string) bool {
					var sides []mapSide
					return json.Unmarshal([]byte(data), &sides) == nil && len(sides) == wantMaps
				})
			}
			requireOK(t, players[0], "/api/killlobby", map[string]string{"gameId": id, "username": players[0].name})
			for _, stream := range streams {
				stream.wait(t, "kill", func(string) bool { return true })
			}
			together(t, 10, func(i int) error {
				body, err := players[i].ok("/api/user", nil)
				if err != nil {
					return err
				}
				var user struct {
					InGame  int    `json:"inGame"`
					InQueue int    `json:"inQueue"`
					GameID  string `json:"gameId"`
				}
				if err := json.Unmarshal(body, &user); err != nil {
					return err
				}
				if user.InGame != 0 || user.InQueue != 0 || user.GameID != "" {
					return fmt.Errorf("stale session after cleanup: %s", body)
				}
				_, err = players[i].ok("/queue", Queuers{Username: players[i].name})
				return err
			})
			var count int
			if err := db.QueryRow(`SELECT COUNT(*) FROM "Users" WHERE "InQueue" AND NOT "InGame" AND "GameId" IS NULL`).Scan(&count); err != nil {
				t.Fatal(err)
			}
			if count != 10 {
				t.Fatalf("only %d players could requeue", count)
			}
		})
	}
}

type flowEvent struct{ name, data string }
type flowStream struct {
	events chan flowEvent
	close  func()
}

func openFlowStream(t *testing.T, p flowPlayer, id string) *flowStream {
	t.Helper()
	return openFlowStreamPath(t, p, "/api/liveteamview?gameId="+id)
}

func openFlowStreamPath(t *testing.T, p flowPlayer, path string) *flowStream {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	r, _ := http.NewRequestWithContext(ctx, http.MethodGet, p.base+path, nil)
	resp, err := p.client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		resp.Body.Close()
		t.Fatalf("SSE status %d", resp.StatusCode)
	}
	done := make(chan struct{})
	s := &flowStream{events: make(chan flowEvent, 256), close: cancel}
	go func() {
		defer close(done)
		defer close(s.events)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		event := flowEvent{}
		for scanner.Scan() {
			line := scanner.Text()
			if name, ok := strings.CutPrefix(line, "event: "); ok {
				event.name = name
			}
			if data, ok := strings.CutPrefix(line, "data: "); ok {
				event.data = data
			}
			if line == "" {
				select {
				case s.events <- event:
				case <-ctx.Done():
					return
				}
				event = flowEvent{}
			}
		}
	}()
	t.Cleanup(func() { cancel(); resp.Body.Close(); <-done })
	return s
}

func (s *flowStream) wait(t *testing.T, name string, accept func(string) bool) {
	t.Helper()
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()
	for {
		select {
		case event, ok := <-s.events:
			if !ok {
				t.Fatalf("live stream closed before %s", name)
			}
			if event.name == name && accept(event.data) {
				return
			}
		case <-timer.C:
			t.Fatalf("timed out waiting for live event %s", name)
		}
	}
}
