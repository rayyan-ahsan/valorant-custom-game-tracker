package main

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestLiveStreamsBeforeLobbyInitialization(t *testing.T) {
	_, players, _ := newFlow(t)
	together(t, 10, func(i int) error {
		_, err := players[i].ok("/queue", Queuers{Username: players[i].name})
		return err
	})
	ids := make([]string, 10)
	together(t, 10, func(i int) error {
		var err error
		ids[i], err = matchFound(players[i])
		return err
	})
	id := ids[0]
	together(t, 10, func(i int) error {
		if ids[i] != id {
			return fmt.Errorf("players received different matches")
		}
		_, err := players[i].ok("/api/matchaccepted", Usernamers{Username: players[i].name})
		return err
	})
	together(t, 10, func(i int) error {
		_, err := players[i].ok("/api/redirecttogame", UserGame{Id: id, Username: players[i].name})
		return err
	})

	// Force the ordering the browser runner previously missed: every live
	// connection is open before any client asks to initialize the lobby.
	streams := make([]*flowStream, 10)
	for i, p := range players {
		streams[i] = openFlowStream(t, p, id)
		var state lobbySnapshot
		streams[i].wait(t, "snapshot", func(data string) bool {
			return json.Unmarshal([]byte(data), &state) == nil
		})
		if !state.Active || len(state.Players) != 0 || state.Turn != 0 {
			t.Fatalf("unexpected snapshot before initialization: %+v", state)
		}
	}
	rows := lobbyFor(t, players[0], id)
	if len(rows) != 10 || draftTeam(rows) != 1 {
		t.Fatalf("incorrect initialized lobby: %+v", rows)
	}
	want, _ := json.Marshal(rows)
	for _, stream := range streams {
		stream.wait(t, "updateLobby", func(data string) bool { return data == string(want) })
		stream.wait(t, "currentTeam", func(data string) bool { return data == `"1"` })
	}

	// Also prove the notified first captain can actually draft and all ten
	// original connections receive the next turn without refreshing.
	captains := flowCaptains(t, players, rows)
	var target string
	for _, row := range rows {
		if row.Team == 0 {
			target = row.Username
			break
		}
	}
	requireOK(t, captains[1], "/api/updateteam", map[string]interface{}{
		"gameId": id, "Username": target, "Team": 1,
	})
	for _, stream := range streams {
		stream.wait(t, "updateLobby", func(data string) bool {
			var updated []Lobby
			if json.Unmarshal([]byte(data), &updated) != nil || len(updated) != 10 {
				return false
			}
			for _, row := range updated {
				if row.Username == target {
					return row.Team == 1
				}
			}
			return false
		})
		stream.wait(t, "currentTeam", func(data string) bool { return data == `"2"` })
	}
}
