package main

import "net/http"

// These helpers run while sessionMiddleware holds stateMu. A client's Team
// field describes its request; the authenticated session determines permission.
func requestUsername(r *http.Request) string {
	id, _ := r.Context().Value("session_id").(string)
	name, _ := getSession(id)["username"].(string)
	return name
}

func isCaptain(r *http.Request, players []Lobby, team int) bool {
	if team != 1 && team != 2 {
		return false
	}
	for _, p := range players {
		if p.Username == requestUsername(r) && p.Captain == 1 && p.Team == team {
			return true
		}
	}
	return false
}

func draftTeam(players []Lobby) int {
	one, two := CountPlayersInLobbyStruct(players, 1), CountPlayersInLobbyStruct(players, 2)
	switch {
	case one == 1 && two == 1, one < 4 && two == 3, one == 4 && two == 4:
		return 1
	case one == 2 && two < 3, one == 4 && two == 3, one == 5 && two == 4:
		return 2
	default:
		return 0
	}
}

type lobbySnapshot struct {
	Username string    `json:"username"`
	Active   bool      `json:"active"`
	Players  []Lobby   `json:"players"`
	Turn     int       `json:"turn"`
	Votes    []int     `json:"votes"`
	MyVote   string    `json:"myVote"`
	Voting   bool      `json:"voting"`
	Format   string    `json:"format"`
	Maps     []mapList `json:"maps"`
	MapTurn  string    `json:"mapTurn"`
	Sides    []mapSide `json:"sides"`
}
