package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Delay each identity differently. For one mutation, commit at the server but
// discard the response, reproducing the ambiguous failure that leads to retries.
type delayedTransport struct {
	base     http.RoundTripper
	delay    time.Duration
	losePath string
	lost     atomic.Bool
}

func (d *delayedTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	timer := time.NewTimer(d.delay)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-r.Context().Done():
		return nil, r.Context().Err()
	}
	resp, err := d.base.RoundTrip(r)
	if err == nil && r.URL.Path == d.losePath && d.lost.CompareAndSwap(false, true) {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("simulated connection lost after server committed request")
	}
	return resp, err
}

func requireStatus(t *testing.T, p flowPlayer, path string, body interface{}, want int) {
	t.Helper()
	data, status, err := p.request(path, body)
	if err != nil || status != want {
		t.Fatalf("%s: got %d (%s), err %v; want %d", path, status, data, err, want)
	}
}

func flowCaptains(t *testing.T, players []flowPlayer, rows []Lobby) map[int]flowPlayer {
	t.Helper()
	result := map[int]flowPlayer{}
	for _, row := range rows {
		if row.Captain == 1 {
			for _, p := range players {
				if p.name == row.Username {
					result[row.Team] = p
				}
			}
		}
	}
	if len(result) != 2 {
		t.Fatalf("need two captains: %+v", rows)
	}
	return result
}

func snapshotFor(t *testing.T, p flowPlayer, id string) lobbySnapshot {
	t.Helper()
	stream := openFlowStream(t, p, id)
	defer stream.close()
	var state lobbySnapshot
	stream.wait(t, "snapshot", func(data string) bool { return json.Unmarshal([]byte(data), &state) == nil })
	return state
}

func TestTenPlayerDelayedRequestsAndRecovery(t *testing.T) {
	_, players, _ := newFlow(t)
	for i := range players {
		players[i].client.Transport = &delayedTransport{base: players[i].client.Transport, delay: time.Duration(i%4) * 40 * time.Millisecond}
	}
	id := prepareFlowLobby(t, players)
	rows := lobbyFor(t, players[0], id)
	captains := flowCaptains(t, players, rows)
	var ordinary flowPlayer
	for _, p := range players {
		if p.name != captains[1].name && p.name != captains[2].name {
			ordinary = p
			break
		}
	}
	pick := func(name string, team int) map[string]interface{} {
		return map[string]interface{}{"gameId": id, "Username": name, "Team": team}
	}
	unpicked := []string{}
	for _, row := range rows {
		if row.Team == 0 {
			unpicked = append(unpicked, row.Username)
		}
	}
	before := string(requireOK(t, players[0], "/api/getplayers", GameId{Id: id}))
	requireStatus(t, ordinary, "/api/updateteam", pick(unpicked[0], 1), 403)
	requireStatus(t, captains[2], "/api/updateteam", pick(unpicked[0], 1), 403)
	requireStatus(t, captains[2], "/api/updateteam", pick(unpicked[0], 2), 409)
	requireStatus(t, captains[1], "/api/updateteam", pick(unpicked[0], 9), 403)
	requireStatus(t, captains[1], "/api/updateteam", pick("missing", 1), 404)
	if after := string(requireOK(t, players[0], "/api/getplayers", GameId{Id: id})); before != after {
		t.Fatal("rejected requests changed lobby")
	}

	// The first team gets one pick: two different choices arriving together must
	// yield exactly one success. A mutex alone would not enforce this turn rule.
	statuses := make([]int, 2)
	together(t, 2, func(i int) error {
		_, status, err := captains[1].request("/api/updateteam", pick(unpicked[i], 1))
		statuses[i] = status
		return err
	})
	if !((statuses[0] == 200 && statuses[1] == 409) || (statuses[0] == 409 && statuses[1] == 200)) {
		t.Fatalf("competing picks: %v", statuses)
	}

	offline := openFlowStream(t, ordinary, id)
	offline.close()
	// All remaining drafting happens while that client has no live stream.
	for {
		rows = lobbyFor(t, players[0], id)
		team := draftTeam(rows)
		if team == 0 {
			break
		}
		name := ""
		for _, row := range rows {
			if row.Team == 0 {
				name = row.Username
				break
			}
		}
		p := captains[team]
		transport := p.client.Transport.(*delayedTransport)
		if !transport.lost.Load() {
			transport.losePath = "/api/updateteam"
			_, _, err := p.request("/api/updateteam", pick(name, team))
			if err == nil {
				t.Fatal("expected simulated lost response")
			}
		}
		// A retry after the turn changed must acknowledge the committed selection.
		requireOK(t, p, "/api/updateteam", pick(name, team))
	}
	state := snapshotFor(t, ordinary, id)
	if !state.Active || !state.Voting || CountPlayersInLobbyStruct(state.Players, 1) != 5 || CountPlayersInLobbyStruct(state.Players, 2) != 5 {
		t.Fatalf("reconnect did not recover draft/voting: %+v", state)
	}
	requireStatus(t, ordinary, "/api/finalseriesvote?gameId="+id, nil, 409)
	together(t, 20, func(i int) error { _, err := players[i%10].ok("/api/sendbovote?gameId="+id, "bo3"); return err })
	state = snapshotFor(t, ordinary, id)
	if state.MyVote != "bo3" || len(state.Votes) != 3 || state.Votes[2] != 10 {
		t.Fatalf("reloaded vote lost or counted twice: %+v", state)
	}
	requireStatus(t, ordinary, "/api/sendbovote?gameId="+id, "bo1", 409)
	requireOK(t, ordinary, "/api/finalseriesvote?gameId="+id, nil)

	for step := 0; step < 8; step++ {
		state = snapshotFor(t, ordinary, id)
		if strings.HasPrefix(state.MapTurn, "done") {
			break
		}
		var phase string
		var team int
		fmt.Sscanf(state.MapTurn, "%s %d", &phase, &team)
		name := ""
		for _, m := range state.Maps {
			if m.Action == 0 {
				name = m.Name
				break
			}
		}
		body := map[string]interface{}{"gameId": id, "mapName": name, "Team": team, "Action": phase, "FinalVote": "bo3"}
		requireStatus(t, ordinary, "/api/updatemap", body, 403)
		requireStatus(t, captains[3-team], "/api/updatemap", body, 403)
		invalid := map[string]interface{}{"gameId": id, "mapName": name, "Team": team, "Action": "invalid", "FinalVote": "bo3"}
		requireStatus(t, captains[team], "/api/updatemap", invalid, 400)
		invalid["Action"] = phase
		invalid["mapName"] = "missing"
		requireStatus(t, captains[team], "/api/updatemap", invalid, 404)

		wrong := map[string]interface{}{"gameId": id, "mapName": name, "Team": team, "Action": phase, "FinalVote": "bo1"}
		requireStatus(t, captains[team], "/api/updatemap", wrong, 409)
		// Requests with stale phase or a correct captain acting out of turn fail.
		wrong["FinalVote"] = "bo3"
		wrong["Team"] = 3 - team
		requireStatus(t, captains[3-team], "/api/updatemap", wrong, 409)
		together(t, 10, func(int) error { _, err := captains[team].ok("/api/updatemap", body); return err })
	}
	state = snapshotFor(t, ordinary, id)
	if state.Format != "bo3" || !strings.HasPrefix(state.MapTurn, "done") || CountMapValuesInMapStruct(state.Maps, 1) != 3 {
		t.Fatalf("veto not recovered: %+v", state)
	}
	for _, m := range state.Maps {
		if m.Action == 1 {
			team := 3 - m.Team
			body := map[string]interface{}{"gameId": id, "mapName": m.Name, "team": team, "side": 1}
			requireStatus(t, ordinary, "/api/sendsideselect", body, 403)
			body["side"] = 9
			requireStatus(t, captains[team], "/api/sendsideselect", body, 400)
			body["side"] = 1

			wrong := map[string]interface{}{"gameId": id, "mapName": m.Name, "team": m.Team, "side": 1}
			requireStatus(t, captains[m.Team], "/api/sendsideselect", wrong, 409)
			together(t, 10, func(int) error { _, err := captains[team].ok("/api/sendsideselect", body); return err })
			body["side"] = 2
			requireStatus(t, captains[team], "/api/sendsideselect", body, 409)
		}
	}
	// All identities recover the same completed state, including chosen sides.
	expected, _ := json.Marshal(snapshotFor(t, ordinary, id).Sides)
	for _, p := range players {
		got := snapshotFor(t, p, id)
		sides, _ := json.Marshal(got.Sides)
		if len(got.Sides) != 3 || string(sides) != string(expected) {
			t.Fatalf("%s recovered different sides", p.name)
		}
	}
	requireOK(t, ordinary, "/api/killlobby", map[string]string{"gameId": id, "username": ordinary.name})
	if snapshotFor(t, ordinary, id).Active {
		t.Fatal("client that missed cancellation still sees an active lobby")
	}
}

func TestRestartClearsMatchButPreservesAccounts(t *testing.T) {
	db, players, _ := newFlow(t)
	id := prepareFlowLobby(t, players)
	requireOK(t, players[0], "/api/getplayers", GameId{Id: id})
	// Model main's restart boundary: new handler, empty process sessions, and the
	// same startup DB reset. This explicitly documents that matches don't persist.
	stateMu.Lock()
	for _, p := range players {
		for _, c := range p.client.Jar.Cookies(mustURL(p.base)) {
			if c.Name == "session_id" {
				deleteSession(c.Value)
			}
		}
		delete(usernameToSessionID, p.name)
	}
	stateMu.Unlock()
	if err := dbResetQueueAndGame(db); err != nil {
		t.Fatal(err)
	}
	restarted := httptest.NewTLSServer(newTrackerServer(db))
	defer restarted.Close()
	for _, p := range players {
		p.base = restarted.URL
		requireStatus(t, p, "/api/user", nil, 401)
		requireOK(t, p, "/login-submit", map[string]string{"username": p.name, "password": "test-password"})
		var user struct {
			InGame  int    `json:"inGame"`
			InQueue int    `json:"inQueue"`
			GameID  string `json:"gameId"`
		}
		if err := json.Unmarshal(requireOK(t, p, "/api/user", nil), &user); err != nil {
			t.Fatal(err)
		}
		if user.InGame != 0 || user.InQueue != 0 || user.GameID != "" {
			t.Fatalf("stale state after restart: %+v", user)
		}
		if snapshotFor(t, p, id).Active {
			t.Fatal("old match survived restart")
		}
		requireOK(t, p, "/queue", Queuers{Username: p.name})
	}
}
