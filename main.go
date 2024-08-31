package main

import (
	"context"
	crand "crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sync"
	"time"

	"net/http/pprof"

	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
)

type SignupData struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

var (
	allGames      []gamePlayers
	allGamesMutex sync.Mutex
)

type Game struct {
	MatchInfo struct {
		MatchID            string `json:"matchId"`
		MapID              string `json:"mapId"`
		GameLengthMillis   int    `json:"gameLengthMillis"`
		GameStartMillis    int64  `json:"gameStartMillis"`
		ProvisioningFlowID string `json:"provisioningFlowId"`
		IsCompleted        bool   `json:"isCompleted"`
		CustomGameName     string `json:"customGameName"`
		QueueID            string `json:"queueId"`
		GameMode           string `json:"gameMode"`
		IsRanked           bool   `json:"isRanked"`
		SeasonID           string `json:"seasonId"`
	} `json:"matchInfo"`
	Players []struct {
		Puuid       string `json:"puuid"`
		TeamID      string `json:"teamId"`
		PartyID     string `json:"partyId"`
		CharacterID string `json:"characterId"`
		Stats       struct {
			Score          int `json:"score"`
			RoundsPlayed   int `json:"roundsPlayed"`
			Kills          int `json:"kills"`
			Deaths         int `json:"deaths"`
			Assists        int `json:"assists"`
			PlaytimeMillis int `json:"playtimeMillis"`
		} `json:"stats"`
		CompetitiveTier string `json:"competitiveTier"`
		PlayerCard      string `json:"playerCard"`
		PlayerTitle     string `json:"playerTitle"`
	} `json:"players"`
	RoundResults []struct {
		RoundNum       int    `json:"roundNum"`
		RoundResult    string `json:"roundResult"`
		RoundCeremony  string `json:"roundCeremony"`
		WinningTeam    string `json:"winningTeam"`
		PlantRoundTime int    `json:"plantRoundTime"`
		PlantLocation  struct {
			X int `json:"x"`
			Y int `json:"y"`
		} `json:"plantLocation"`
		PlantSite       string `json:"plantSite"`
		DefuseRoundTime int    `json:"defuseRoundTime"`
		DefuseLocation  struct {
			X int `json:"x"`
			Y int `json:"y"`
		} `json:"defuseLocation"`
		PlayerStats []struct {
			Puuid  string `json:"puuid"`
			Kills  []any  `json:"kills"`
			Damage []struct {
				Receiver  string `json:"receiver"`
				Damage    int    `json:"damage"`
				Legshots  int    `json:"legshots"`
				Bodyshots int    `json:"bodyshots"`
				Headshots int    `json:"headshots"`
			} `json:"damage"`
			Score   int `json:"score"`
			Economy struct {
				LoadoutValue int    `json:"loadoutValue"`
				Weapon       string `json:"weapon"`
				Armor        string `json:"armor"`
				Remaining    int    `json:"remaining"`
				Spent        int    `json:"spent"`
			} `json:"economy"`
			Ability struct {
			} `json:"ability"`
		} `json:"playerStats"`
		RoundResultCode      string `json:"roundResultCode"`
		BombPlanter          string `json:"bombPlanter,omitempty"`
		PlantPlayerLocations []struct {
			Puuid       string  `json:"puuid"`
			ViewRadians float64 `json:"viewRadians"`
			Location    struct {
				X int `json:"x"`
				Y int `json:"y"`
			} `json:"location"`
		} `json:"plantPlayerLocations,omitempty"`
		BombDefuser           string `json:"bombDefuser,omitempty"`
		DefusePlayerLocations []struct {
			Puuid       string  `json:"puuid"`
			ViewRadians float64 `json:"viewRadians"`
			Location    struct {
				X int `json:"x"`
				Y int `json:"y"`
			} `json:"location"`
		} `json:"defusePlayerLocations,omitempty"`
	} `json:"roundResults"`
	Teams []struct {
		TeamID       string `json:"teamId"`
		Won          bool   `json:"won"`
		RoundsPlayed int    `json:"roundsPlayed"`
		RoundsWon    int    `json:"roundsWon"`
		NumPoints    int    `json:"numPoints"`
	} `json:"teams"`
}

type Queuers struct {
	Username string `json:"Username"`
	InQueue  string `json:"InQueue"`
}

type Usernamers struct {
	Username string `json:"Username"`
}

type GameId struct {
	Id string `json:"gameId"`
}

type UserGame struct {
	Id       string `json:"gameId"`
	Username string `json:"Username"`
}

type randoResponse struct {
	PeopleInQueue string `json:"PeopleInQueue"`
}

type EventMessage struct {
	EventType string `json:"eventType"`
	Data      string `json:"data"`
}

type Message struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

type boVotes struct {
	GameId string
	Votes  []int
}

type Player struct {
	UsernameID int
	Username   string
	Captain    int
	Team       int
}

type Lobby struct {
	Username string
	Captain  int
	Team     int
}

type Client struct {
	gameId string
	ch     chan string
}

type queuePlayers struct {
	username string
	accepted int
}

type gameQueue struct {
	GameId  string
	Players []queuePlayers
}

type gamePlayers struct {
	GameId  string
	Players []Lobby
}

type mapList struct {
	Name   string
	Team   int
	Action int
}

type gameMap struct {
	GameId  string
	mapList []mapList
	Format  string
}

var clients = make(map[string][]*Client)

var inQueueCounter = 0

var game Game

func sessionMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session_id")
		var sessionID string
		if err != nil || cookie == nil {
			sessionID = generateSessionID()
			http.SetCookie(w, &http.Cookie{
				Name:     "session_id",
				Value:    sessionID,
				Expires:  time.Now().Add(sessionTTL),
				Path:     "/",
				SameSite: http.SameSiteStrictMode,
				Secure:   true,
				HttpOnly: true,
			})
		} else {
			sessionID = cookie.Value
		}

		// Ensure session exists
		if getSession(sessionID) == nil {
			setSession(sessionID, make(map[string]interface{}))
		}

		// Pass session data to handlers
		r = r.WithContext(context.WithValue(r.Context(), "session_id", sessionID))
		next.ServeHTTP(w, r)
	}
}

func readFile() []byte {
	data, err := os.ReadFile("./GameFiles/exampleGame.json")
	if err != nil {
		fmt.Print(err)
		return nil
	}
	return data
}

func dbRead(db *sql.DB) {
	var (
		ID       int
		Username string
	)
	rows, err := db.Query(`SELECT "ID", "Username" FROM "Users" WHERE "ID" = $1`, 1)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		err := rows.Scan(&ID, &Username)
		if err != nil {
			log.Fatal(err)
		}
		log.Println(ID, Username)
	}
	err = rows.Err()
	if err != nil {
		log.Fatal(err)
	}
}

func dbCheckUsersTable(db *sql.DB) {

	createTableQuery := `
    CREATE TABLE IF NOT EXISTS "Users" (
        "ID" SERIAL PRIMARY KEY,
        "Username" TEXT NOT NULL UNIQUE,
        "HashedPassword" TEXT NOT NULL,
        "Salt" BYTEA NOT NULL,
        "InQueue" boolean NOT NULL DEFAULT false,
        "InGame" boolean NOT NULL DEFAULT false,
        "GameId" TEXT,
        CHECK(("InGame" = false AND "GameId" IS NULL) OR ("InGame" = true AND "GameId" IS NOT NULL)),
        CHECK(("InGame" = false AND "InQueue" = false) OR ("InGame" = true AND "InQueue" = false) OR ("InGame" = false AND "InQueue" = true))
    );`

	_, err := db.Exec(createTableQuery)
	if err != nil {
		log.Fatalf("Failed to create Users table: %v", err)
	}
	fmt.Println("Users table is present or created successfully.")
}

func dbSetInQueue(db *sql.DB, reactUsername string) error {
	query := `UPDATE "Users" 
              SET "InQueue" = true 
              WHERE UPPER("Username") = UPPER($1)`
	_, err := db.Exec(query, reactUsername)
	if err != nil {
		return fmt.Errorf("failed to update InQueue: %w", err)
	}

	return nil
}

func dbInsertUsername(db *sql.DB, u string) {

	query := `INSERT INTO "Users" ("Username", "InQueue") 
              VALUES ($1, $2) 
              RETURNING "ID"`

	var lastId int
	err := db.QueryRow(query, u, 1).Scan(&lastId)
	if err != nil {
		log.Fatalf("Failed to insert username: %v", err)
	}

	log.Printf("ID = %d, affected = %d\n", lastId, 1)
}

func dbGetPlayers(db *sql.DB, id string) ([]Lobby, error) {
	var l []Lobby

	query := fmt.Sprintf(`SELECT g.UsernameId, u."Username", g.Captain, g.Team 
                          FROM "%s" g 
                          JOIN "Users" u ON g.UsernameId = u."ID"`, id)

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	res, err := dbCreateCaptains(db, id, rows)
	if err != nil {
		return nil, err
	}

	for _, player := range res {
		var x Lobby
		x.Username = player.Username
		x.Captain = player.Captain
		x.Team = player.Team
		l = append(l, x)
	}

	return l, nil
}

func dbSetTeam(db *sql.DB, id string, username string, team int) {

	userID, err := dbGetUseridFromUsername(db, username)
	if err != nil {
		log.Fatal(err)
	}

	if userID == 0 {
		fmt.Println("User not found.")
		return
	}

	fmt.Printf("User ID: %d\n", userID)

	query := fmt.Sprintf(`UPDATE "%s" SET Team = $1 WHERE UsernameID = $2`, id)

	_, err = db.Exec(query, team, userID)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Team updated successfully.")
}

func dbSetCaptainsForTestPurposes(db *sql.DB, id string, username string, username2 string) {

	userId, err := dbGetUseridFromUsername(db, username)
	if err != nil {
		log.Fatal(err)
	}
	user2Id, err := dbGetUseridFromUsername(db, username2)
	if err != nil {
		log.Fatal(err)
	}

	if userId == 0 {
		fmt.Println("User not found:", username)
		return
	}
	if user2Id == 0 {
		fmt.Println("User not found:", username2)
		return
	}

	query := fmt.Sprintf(`UPDATE "%s" SET Captain = $1, Team = $2 WHERE UsernameID = $3`, id)

	_, err = db.Exec(query, 1, 1, userId)
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(query, 1, 2, user2Id)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Captains set successfully for both users.")
}

func dbCreateCaptains(db *sql.DB, id string, rows *sql.Rows) ([]Player, error) {
	var players []Player
	captainCount := 0

	for rows.Next() {
		var p Player
		err := rows.Scan(&p.UsernameID, &p.Username, &p.Captain, &p.Team)
		if err != nil {
			return nil, err
		}
		if p.Captain == 1 {
			captainCount++
		}
		players = append(players, p)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	fmt.Println("\nThese are the players: ", players)
	fmt.Println("\nNumber of players: ", len(players))

	if len(players) < 2 {
		fmt.Println("\nLess than 2 players.")
		return nil, nil
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if captainCount < 2 {

		for i := range players {
			players[i].Captain = 0
		}

		r := rand.New(rand.NewSource(time.Now().UnixNano()))
		selected := 0
		for selected < 2 {
			index := r.Intn(len(players))
			if players[index].Captain == 0 {
				players[index].Captain = 1
				players[index].Team = selected + 1

				query := `UPDATE "` + id + `" SET Captain = $1, Team = $2 WHERE UsernameID = $3`
				_, err := tx.Exec(query, players[index].Captain, players[index].Team, players[index].UsernameID)
				if err != nil {
					return nil, err
				}

				selected++
			}
		}

		if err := tx.Commit(); err != nil {
			return nil, err
		}
	}

	fmt.Println("\nThese are the updated players: ", players)
	return players, nil
}

func dbGetUseridFromUsername(db *sql.DB, username string) (int, error) {
	var userID int
	query := `SELECT "ID" FROM "Users" WHERE UPPER("Username") = UPPER($1)`

	err := db.QueryRow(query, username).Scan(&userID)
	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("No user found with the specified username.")
			return 0, nil
		}
		return 0, fmt.Errorf("failed to get user ID: %w", err)
	}

	return userID, nil
}

func dbAddAllPlayersToGame(db *sql.DB, gameId string) {

	query := fmt.Sprintf(`
        INSERT INTO "%s" (UsernameID, Captain, Team)
        SELECT "ID", 0 AS Captain, 0 AS Team
        FROM "Users"
        WHERE "InGame" = true AND "GameId" = $1;
    `, gameId)

	_, err := db.Exec(query, gameId)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Players added to game successfully.")
}

func dbAddPlayerToGame(db *sql.DB, tableName string, username string) {
	fmt.Print("\ndbAddPlayerToGame beginning: ", time.Now())

	userID, err := dbGetUseridFromUsername(db, username)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Print("\ndbAddPlayerToGame after userID get: ", time.Now())

	if userID == 0 {
		fmt.Println("User not found.")
		return
	}
	fmt.Printf("User ID: %d\n", userID)

	fmt.Print("\ndbAddPlayerToGame before stmt prep: ", time.Now())

	query := fmt.Sprintf(`
        INSERT INTO "%s" (UsernameID, Captain, Team)
        VALUES ($1, $2, $3)
    `, tableName)

	stmt, err := db.Prepare(query)
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	fmt.Print("\ndbAddPlayerToGame after stmt prep: ", time.Now())

	res, err := stmt.Exec(userID, 0, 0)
	if err != nil {
		log.Println("\n", err)
		return
	}

	fmt.Print("\ndbAddPlayerToGame after stmt exec: ", time.Now())

	rowCnt, err := res.RowsAffected()
	if err != nil {
		log.Println("\n", err)
		return
	}

	fmt.Printf("\nRows affected = %d", rowCnt)
	fmt.Print("\ndbAddPlayerToGame ending: ", time.Now())
}

func dbCreateGame(db *sql.DB, tableName string) {

	query := fmt.Sprintf(`
        CREATE TABLE IF NOT EXISTS "%s" (
            UsernameID INTEGER NOT NULL UNIQUE,
            Captain INTEGER NOT NULL,
            Team INTEGER NOT NULL,
            PRIMARY KEY (UsernameID),
            FOREIGN KEY (UsernameID) REFERENCES "Users" ("ID")
        );
    `, tableName)

	stmt, err := db.Prepare(query)
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	res, err := stmt.Exec()
	if err != nil {
		log.Fatal(err)
	}

	log.Println(res)
}

func dbCheckGame(db *sql.DB, gameId string) bool {

	query := `
        SELECT COUNT(*)
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1;
    `

	var count int
	err := db.QueryRow(query, gameId).Scan(&count)
	if err != nil {
		log.Fatal(err)
	}

	return count > 0
}

func dbCheckPlayerInGameForSessionData(db *sql.DB, username string) (int, string) {

	query := `
        SELECT "InGame", "GameId"
        FROM "Users"
        WHERE UPPER("Username") = UPPER($1) AND "InGame" = true
    `

	var (
		InGame int
		GameId string
	)

	row := db.QueryRow(query, username)

	err := row.Scan(&InGame, &GameId)
	if err != nil {
		if err == sql.ErrNoRows {
			return 0, ""
		}
		log.Println("Error querying player session data:", err)
		return 0, ""
	}

	return InGame, GameId
}

func dbCheckPlayerInGame(db *sql.DB, tableName string, username string) bool {
	// Fetch the user ID based on the username
	userID, err := dbGetUseridFromUsername(db, username)
	if err != nil {
		log.Fatalf("Failed to get userID: %v", err)
	}

	// Construct the SQL query string
	query := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM "%s"
		WHERE UsernameID = $1
	`, tableName)

	fmt.Printf("Executing query: %s with userID: %d\n", query, userID)

	// Execute the query
	rows, err := db.Query(query, userID)
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()

	// Extract the count from the result set
	var count int
	if rows.Next() {
		if err := rows.Scan(&count); err != nil {
			log.Fatalf("Failed to scan result: %v", err)
		}
	}

	// Check for any errors encountered during iteration
	if err := rows.Err(); err != nil {
		log.Fatalf("Row iteration failed: %v", err)
	}

	// Return true if exactly one record was found
	return count == 1
}

func dbQueueCount(db *sql.DB) int {

	query := `SELECT COUNT(*) FROM "Users" WHERE "InQueue" = true`

	var count int
	err := db.QueryRow(query).Scan(&count)
	if err != nil {
		log.Fatal(err)
	}

	return count
}

func dbUserSignup(db *sql.DB, username string, hashedPassword string, salt []byte) error {

	stmt, err := db.Prepare(`INSERT INTO "Users" ("Username", "HashedPassword", "Salt") VALUES ($1, $2, $3)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(username, hashedPassword, salt)
	if err != nil {
		return err
	}

	return nil
}

func dbSetQueueOff(db *sql.DB, username string) error {

	stmt, err := db.Prepare(`UPDATE "Users" SET "InQueue" = false WHERE UPPER("Username") = UPPER($1)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(username)
	if err != nil {
		return err
	}

	return nil
}

func dbInGame(db *sql.DB, username string, gameId string) error {

	stmt, err := db.Prepare(`UPDATE "Users" 
                             SET "InQueue" = false, "InGame" = true, "GameId" = $1 
                             WHERE UPPER("Username") = UPPER($2)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(gameId, username)
	if err != nil {
		return err
	}

	return nil
}

func dbCountHowManyReady(db *sql.DB, gameId string) int {

	query := `SELECT COUNT(*) FROM "Users" WHERE "InGame" = true AND "GameId" = $1`

	var count int
	err := db.QueryRow(query, gameId).Scan(&count)
	if err != nil {
		fmt.Println("error with CountHowManyReady")
	}

	return count
}

func dbResetQueueAndGame(db *sql.DB) error {

	stmt, err := db.Prepare(`UPDATE "Users" 
                             SET "InGame" = false, "GameId" = NULL, "InQueue" = false`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec()
	if err != nil {
		return err
	}

	return nil
}

func dbRemoveGame(db *sql.DB, id string) error {

	updateQuery := fmt.Sprintf(`UPDATE "Users" 
                                SET "InGame" = false, "GameId" = NULL 
                                WHERE "ID" IN (SELECT UsernameID FROM "%s");`, id)
	stmt, err := db.Prepare(updateQuery)
	if err != nil {
		return fmt.Errorf("failed to prepare UPDATE statement: %w", err)
	}
	defer stmt.Close()

	_, err = stmt.Exec()
	if err != nil {
		return fmt.Errorf("failed to execute UPDATE statement: %w", err)
	}

	dropQuery := fmt.Sprintf(`DROP TABLE IF EXISTS "%s";`, id)
	stmt2, err := db.Prepare(dropQuery)
	if err != nil {
		return fmt.Errorf("failed to prepare DROP TABLE statement: %w", err)
	}
	defer stmt2.Close()

	_, err = stmt2.Exec()
	if err != nil {
		return fmt.Errorf("failed to execute DROP TABLE statement: %w", err)
	}

	return nil
}

func dbTest(db *sql.DB) {
	dbTestQueueOn(db)
	dbCreateGame(db, "test1")
}

func dbTestQueueOn(db *sql.DB) error {

	stmt, err := db.Prepare("UPDATE \"Users\" SET \"InQueue\" = true")
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec()
	if err != nil {
		return err
	}

	return nil
}

func dbGetUserCredentials(db *sql.DB, username string) (string, []byte, error) {
	var storedHash string
	var salt []byte

	query := `SELECT "HashedPassword", "Salt" FROM "Users" WHERE "Username" = $1`

	err := db.QueryRow(query, username).Scan(&storedHash, &salt)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil, nil
		}
		return "", nil, fmt.Errorf("failed to get user credentials: %w", err)
	}

	return storedHash, salt, nil
}

func countAccepted(slice []queuePlayers) int {
	count := 0
	for _, player := range slice {
		if player.accepted == 1 {
			count++
		}
	}
	return count
}

func setSessionDataOfInGameOff(username string) {
	sessionID := usernameToSessionID[username]
	sessionData := getSession(sessionID)
	sessionData["inGame"] = 0
	sessionData["gameId"] = ""
}

func checkForQueueSlicePlayers(allQueues []gameQueue, playersSlice []queuePlayers) int {
	for i, gq := range allQueues {
		if gq.Players[0].username == playersSlice[0].username {
			return i
		}
	}
	return -1
}

func checkForGameSliceId(allGames []gamePlayers, id string) int {
	log.Printf("Checking for game with ID: %s", id)
	log.Printf("Number of games in allGames: %d", len(allGames))

	for i, gq := range allGames {
		log.Printf("Checking game %d with ID: %s", i, gq.GameId)
		if gq.GameId == id {
			log.Printf("Found matching game at index %d", i)
			return i
		}
	}

	log.Printf("Game with ID %s not found", id)
	return -1
}

func checkForQueueSliceId(allQueues []gameQueue, id string) int {

	for i, gq := range allQueues {
		if gq.GameId == id {
			return i
		}
	}

	return -1
}

func checkForBoVotesId(allVotes []boVotes, id string) int {

	for i, gq := range allVotes {
		if gq.GameId == id {
			fmt.Println("\nfound bovote allvotes index:", i)
			return i
		}
	}

	return -1
}

func checkForSidesId(allSides []gameSide, id string) int {

	for i, gs := range allSides {
		if gs.GameId == id {
			fmt.Println("\nfound bovote allvotes index:", i)
			return i
		}
	}

	return -1
}

func checkForMapsId(allMaps []gameMap, id string) int {

	for i, gq := range allMaps {
		if gq.GameId == id {
			fmt.Println("\nfounod maplist allmaps index:", i)
			return i
		}
	}

	return -1
}

func Index(s []string, v string) int {
	for i, vs := range s {
		if vs == v {
			return i
		}
	}

	return -1
}

func areSlicesEqual(slice1, slice2 []queuePlayers) bool {
	if len(slice1) != len(slice2) {
		return false
	}
	for i := range slice1 {
		if slice1[i] != slice2[i] {
			return false
		}
	}
	return true
}

func CountPlayersInLobbyStruct(lobby []Lobby, team int) int {
	count := 0
	for _, player := range lobby {
		if player.Team == team {
			count++
		}
	}
	return count
}

func CountMapValuesInMapStruct(mapList []mapList, action int) int {
	count := 0
	for _, m := range mapList {
		if m.Action == action {
			count++
		}
	}
	return count
}

func randomString(length int) string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	chars := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	result := make([]byte, length)
	for i := 0; i < length; i++ {
		result[i] = chars[r.Intn(len(chars))]
	}
	return string(result)
}

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "/") // Adjust this to your React app's URL
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	}
}

func handleLogin(db *sql.DB, w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	type LoginData struct {
		Username   string `json:"username"`
		Password   string `json:"password"`
		RememberMe bool   `json:"rememberMe"`
	}

	var data LoginData
	err := json.NewDecoder(r.Body).Decode(&data)
	if err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	if len(data.Username) < 3 || len(data.Password) < 5 {
		http.Error(w, "Invalid username or password", http.StatusBadRequest)
		return
	}

	storedHash, salt, err := dbGetUserCredentials(db, data.Username)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		} else {
			http.Error(w, "Server error", http.StatusInternalServerError)
		}
		return
	}

	hashedPassword := hashPassword(data.Password, salt)

	if hashedPassword != storedHash {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	sessionID := r.Context().Value("session_id").(string)
	sessionData := getSession(sessionID)
	sessionData["username"] = data.Username
	usernameToSessionID[data.Username] = sessionID
	inGame, gameId := dbCheckPlayerInGameForSessionData(db, data.Username)
	sessionData["inGame"] = inGame
	sessionData["gameId"] = gameId
	setSession(sessionID, sessionData)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Login successful"})

}

var (
	sessionStore        = make(map[string]map[string]interface{})
	usernameToSessionID = make(map[string]string)
	sessionTTL          = 30 * time.Minute
)

func generateSessionID() string {
	const length = 32
	chars := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	result := make([]byte, length)
	for i := range result {
		result[i] = chars[rand.Intn(len(chars))]
	}
	return string(result)
}

func getSession(sessionID string) map[string]interface{} {
	data, exists := sessionStore[sessionID]
	if !exists {
		return nil
	}
	return data
}

func setSession(sessionID string, data map[string]interface{}) {
	sessionStore[sessionID] = data
}

func deleteSession(sessionID string) {
	delete(sessionStore, sessionID)
}

func broadcastUpdateLobby(gameId string, lobby []Lobby) {

	data, err := json.Marshal(lobby)
	if err != nil {
		log.Println("Error marshalling players:", err)
		return
	}

	/*
		eventMessage := EventMessage{
			EventType: "message",
			Data:      data,
		}

		eventData, err := json.Marshal(eventMessage.Data)
		if err != nil {
			log.Println("\nError marshalling event message: ", err)
			return
		}
	*/

	for _, client := range clients[gameId] {
		client.ch <- fmt.Sprintf("event: updateLobby\ndata: %s\n\n", data)
	}
}

func broadcastUpdateTeam(gameId string, lobby []Lobby, allVotes *[]boVotes) {

	var team1 = CountPlayersInLobbyStruct(lobby, 1)
	var team2 = CountPlayersInLobbyStruct(lobby, 2)
	var currentTeam string

	if team1 == 1 && team2 == 1 {
		currentTeam = "1"
	} else if team1 == 2 && team2 < 3 {
		currentTeam = "2"
	} else if team1 < 4 && team2 == 3 {
		currentTeam = "1"
	} else if team1 == 4 && team2 == 3 {
		currentTeam = "2"
	} else if team1 == 4 && team2 == 4 {
		currentTeam = "1"
	} else if team1 == 5 && team2 == 4 {
		currentTeam = "2"
	} else {
		currentTeam = "0"
	}

	eventMessage := EventMessage{
		EventType: "currentTeam",
		Data:      currentTeam,
	}

	eventData, err := json.Marshal(eventMessage.Data)
	if err != nil {
		log.Println("\nError marshalling event message: ", err)
		return
	}

	for _, client := range clients[gameId] {
		client.ch <- fmt.Sprintf("event: currentTeam\ndata: %s\n\n", eventData)
	}

	if currentTeam == "0" {
		broadcastUpdateBestOfXVote(gameId, allVotes)
	}
}

func broadcastUpdateMaps(gameId string, mapList []mapList, finalVote string) {
	data, err := json.Marshal(mapList)
	if err != nil {
		log.Println("Error marshalling maps:", err)
		return
	}

	for _, client := range clients[gameId] {
		client.ch <- fmt.Sprintf("event: mapList\ndata: %s\n\n", data)
	}

	broadcastUpdateTeamMaps(gameId, mapList, finalVote)
}

func BroadcastUpdateGameCancelled(gameId string, username string) {

	finalString := username + " killed the lobby."

	data, err := json.Marshal(finalString)
	if err != nil {
		log.Println("Lobby killing failed")
	}

	for _, client := range clients[gameId] {
		client.ch <- fmt.Sprintf("event: kill\ndata: %s\n\n", data)
	}

}

func checkMapPhaseAndTeam(gameId string, pickCount int, banCount int, finalVote string) string {
	var currentTeam string

	fmt.Println("this is the finalvote: ", finalVote)

	switch finalVote {
	case "bo1":
		{
			if pickCount == 1 {
				currentTeam = "done 0"
			} else if banCount == 5 {
				currentTeam = "pick 2"
			} else if pickCount == 0 {
				if banCount%2 == 0 {
					currentTeam = "ban 1"
				} else {
					currentTeam = "ban 2"
				}
			} else {
				currentTeam = "done 0"
			}
		}
	case "bo2":
		{
			if pickCount == 0 {
				if banCount == 0 {
					currentTeam = "ban 1"
				} else if banCount == 1 {
					currentTeam = "ban 2"
				} else if banCount == 2 {
					currentTeam = "pick 1"
				}
			} else if pickCount == 1 {
				currentTeam = "pick 2"
			} else {
				currentTeam = "done 0"
			}
		}
	case "bo3":
		{
			if pickCount == 0 {
				if banCount == 0 {
					currentTeam = "ban 1"
				} else if banCount == 1 {
					currentTeam = "ban 2"
				} else if banCount == 2 {
					currentTeam = "pick 1"
				}
			} else if pickCount == 1 {
				if banCount == 2 {
					currentTeam = "pick 2"
				}
			} else if pickCount == 2 {
				if banCount == 2 {
					currentTeam = "ban 1"
				} else if banCount == 3 {
					currentTeam = "pick 2"
				}
			} else {
				currentTeam = "done 0"
			}
		}
	}

	fmt.Println("this is currentteam from phasefinder: ", currentTeam)
	return currentTeam
}

func broadcastUpdateTeamMaps(gameId string, mapList []mapList, finalVote string) {
	var banCount = CountMapValuesInMapStruct(mapList, 2)
	var pickCount = CountMapValuesInMapStruct(mapList, 1)
	fmt.Println("this is the maplist in updateteammaps: ", mapList)
	fmt.Println("this is how many maps are banned: ", banCount)
	fmt.Println("this is how many maps are picked: ", pickCount)

	currentTeam := checkMapPhaseAndTeam(gameId, pickCount, banCount, finalVote)

	eventMessage := EventMessage{
		EventType: "currentTeam",
		Data:      currentTeam,
	}

	eventData, err := json.Marshal(eventMessage.Data)
	if err != nil {
		log.Println("\nError marshalling event message: ", err)
		return
	}

	for _, client := range clients[gameId] {
		client.ch <- fmt.Sprintf("event: currentTeam\ndata: %s\n\n", eventData)
	}

}

func broadcastUpdateTeamSide(mapSide []mapSide, gameId string) {

	eventData, err := json.Marshal(mapSide)
	if err != nil {
		log.Println("\nError marshalling message: ", err)
		return
	}

	for _, client := range clients[gameId] {
		client.ch <- fmt.Sprintf("event: mapsides\ndata: %s\n\n", eventData)
	}
}

func broadcastUpdateBestOfXVote(gameId string, allVotes *[]boVotes) {
	index := checkForBoVotesId(*allVotes, gameId)
	fmt.Println("broadcastUpdateBestOf index:", index)

	if index == -1 {
		fmt.Println("allvotes before append:", *allVotes)
		var votes []int = []int{0, 0, 0}
		*allVotes = append(*allVotes,
			boVotes{GameId: gameId, Votes: votes},
		)
		fmt.Println("allvotes after append:", *allVotes)
		data, err := json.Marshal("vote time")
		if err != nil {
			log.Println("Error sending bestof vote:", err)
			return
		}
		for _, client := range clients[gameId] {
			client.ch <- fmt.Sprintf("event: bestofseriesVote\ndata: %s\n\n", data)
		}

		go func() {
			time.Sleep(30 * time.Second)
			finalIndex := checkForBoVotesId(*allVotes, gameId)
			if finalIndex != -1 {
				*allVotes = append((*allVotes)[:finalIndex], (*allVotes)[finalIndex+1:]...)
				fmt.Println("allVotes should have been removed:", allVotes)
			} else {
				fmt.Println("gameId not found for allVotes removal")
			}

		}()
	} else {
		data, err := json.Marshal((*allVotes)[index].Votes)
		if err != nil {
			log.Println("Error sending best of vote:", err)
			return
		}
		for _, client := range clients[gameId] {
			fmt.Println("bestofseriesVote: ", data)
			client.ch <- fmt.Sprintf("event: bestofseriesVote\ndata: %s\n\n", data)
		}
	}
}

func broadcastUpdate(gameId string, lobby []Lobby, allVotes *[]boVotes) {
	broadcastUpdateLobby(gameId, lobby)
	broadcastUpdateTeam(gameId, lobby, allVotes)
}

func removeClient(clientList []*Client, client *Client) []*Client {
	for i, c := range clientList {
		if c == client {
			return append(clientList[:i], clientList[i+1:]...)
		}
	}
	return clientList
}

func findIndexByUsername(slice []queuePlayers, username string) int {
	for i, player := range slice {
		if player.username == username {
			return i
		}
	}
	return -1
}

func hashPassword(password string, salt []byte) string {
	// Combine password and salt
	combined := append([]byte(password), salt...)

	// Hash the combined bytes
	hashed := sha256.Sum256(combined)

	// Encode the salt and hash for storage
	return base64.StdEncoding.EncodeToString(append(salt, hashed[:]...))
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Be sure to add proper checks in production
	},
}

type PlayerActive struct {
	conn     *websocket.Conn
	username string
	lastPing time.Time
	mu       sync.Mutex
}

type mapSide struct {
	MapName      string
	AttackerTeam int
}

type gameSide struct {
	GameId string
	Sides  []mapSide
}

var (
	players3 = make(map[string]*PlayerActive)
	mu       sync.Mutex
)

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	username := r.URL.Query().Get("username")
	client := &PlayerActive{conn: conn, username: username, lastPing: time.Now()}

	fmt.Println(username, "has joined the queue.")

	mu.Lock()
	players3[username] = client
	mu.Unlock()

	go handleMessages(client)
}

func handleMessages(client *PlayerActive) {
	defer func() {
		client.conn.Close()
	}()

	for {
		_, message, err := client.conn.ReadMessage()
		if err != nil {
			log.Printf("Error reading message: %v", err)
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		if msg.Type == "ping" {
			client.mu.Lock()
			client.lastPing = time.Now()
			client.mu.Unlock()

			response := Message{Type: "pong", Payload: ""}
			if err := client.conn.WriteJSON(response); err != nil {
				log.Printf("Error sending pong: %v", err)
			}
		}
	}
}

func monitorClients(db *sql.DB, queuePlayersSlice []queuePlayers) {
	pingInterval := 10 * time.Second      // Interval for sending pings
	inactivityTimeout := 15 * time.Second // Timeout for client inactivity
	pingTicker := time.NewTicker(pingInterval)
	defer pingTicker.Stop()

	for {
		select {
		case <-pingTicker.C:
			// Send pings to all connected clients
			mu.Lock()
			for username, client := range players3 {
				err := client.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(time.Second))
				if err != nil {
					log.Printf("Error while sending ping to client %s: %v", username, err)
					// Close and remove client on error
					client.conn.Close()
					delete(players3, username)
					dbSetQueueOff(db, username)
					index := findIndexByUsername(queuePlayersSlice, username)
					if index != -1 {
						queuePlayersSlice = append(queuePlayersSlice[:index], queuePlayersSlice[index+1:]...)
					}
					fmt.Println(queuePlayersSlice)
				}
			}
			mu.Unlock()

		case <-time.After(inactivityTimeout):
			// Check for inactive clients
			now := time.Now()
			mu.Lock()
			for username, client := range players3 {
				client.mu.Lock()
				if now.Sub(client.lastPing) > inactivityTimeout {
					log.Printf("Client %s inactive. Removing from queue.", username)
					client.conn.Close()
					delete(players3, username)
					dbSetQueueOff(db, username)
					index := findIndexByUsername(queuePlayersSlice, username)
					if index != -1 {
						queuePlayersSlice = append(queuePlayersSlice[:index], queuePlayersSlice[index+1:]...)
					}
				}
				client.mu.Unlock()
			}
			mu.Unlock()
		}
	}
}

func main() {

	ADDR := os.Getenv("ADDR")
	PORT := os.Getenv("PORT")
	connStr := os.Getenv("SQLPATH")

	if connStr == "" {
		connStr = "user=postgres password=postgres dbname=postgres sslmode=disable"
	}

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}

	if err != nil {
		log.Fatal(err)
	}

	defer db.Close()

	dbCheckUsersTable(db)
	dbResetQueueAndGame(db)

	/*
		err2 := dbRemoveGame(db, "test1")
		if err2 != nil {
			log.Printf("Failed to remove game: %v", err)
		}
		dbTest(db)



		//dbSetQueueOff(db, "imaple2")
		//dbSetQueueOff(db, "")
		//dbSetQueueOff(db, "Rjhanh")
		dbSetQueueOff(db, "Ria")
		dbSetQueueOff(db, "iMaple")
		dbSetQueueOff(db, "allie2")
		dbSetQueueOff(db, "Allie")
		dbSetQueueOff(db, "rayyan2")
		dbSetQueueOff(db, "rayyan")
	*/

	queuePlayersSlice := make([]queuePlayers, 0, 10)
	//queuePlayers = append(queuePlayers, "MistaDong", "iMaple", "Allie", "Ria", "Chi", "TenZ", "Vincent", "Jordan", "Evan")
	/*
		queuePlayersSlice = append(queuePlayersSlice,
			queuePlayers{username: "MistaDong", accepted: 1},
			queuePlayers{username: "iMaple", accepted: 1},
			//queuePlayers{username: "Allie", accepted: 1},
			queuePlayers{username: "Ria", accepted: 1},
			queuePlayers{username: "Chi", accepted: 1},
			queuePlayers{username: "TenZ", accepted: 1},
			queuePlayers{username: "Vincent", accepted: 1},
			queuePlayers{username: "Jordan", accepted: 1},
			queuePlayers{username: "Evan", accepted: 1},
		)
	*/

	allQueues := make([]gameQueue, 0, 10)
	allGames := make([]gamePlayers, 0, 10)
	allVotes := make([]boVotes, 0, 10)
	allMaps := make([]gameMap, 0, 10)
	allSides := make([]gameSide, 0, 10)
	baseMaps := make([]mapList, 0, 7)
	baseMaps = append(baseMaps,
		mapList{Name: "Abyss", Team: 0, Action: 0},
		mapList{Name: "Ascent", Team: 0, Action: 0},
		mapList{Name: "Bind", Team: 0, Action: 0},
		mapList{Name: "Haven", Team: 0, Action: 0},
		mapList{Name: "Icebox", Team: 0, Action: 0},
		mapList{Name: "Lotus", Team: 0, Action: 0},
		mapList{Name: "Sunset", Team: 0, Action: 0},
	)
	//queuePlayersAccepted := make([]int, 0, 10)
	//queuePlayersAccepted = append(queuePlayersAccepted, 1, 1, 1, 1, 1, 1, 1, 1, 1)

	//var lobbyPlayers []Lobby
	var queueCount int

	/*
		jsonData := readFile()

		err := json.Unmarshal(jsonData, &game)
		if err != nil {
			fmt.Println("Error:", err)
			return
		}

		fmt.Print(game)
	*/
	// http.FileServer(http.Dir("./FrontEnd/valorant-custom-game-tracker/build"))
	mux := http.NewServeMux()
	fmt.Print("Hi we are listening :D")
	mux.Handle("/", http.FileServer(http.Dir("./FrontEnd/build")))
	mux.Handle("/login/", http.StripPrefix("/login/", http.FileServer(http.Dir("./FrontEnd/build"))))
	mux.Handle("/game", http.StripPrefix("/game", http.FileServer(http.Dir("./FrontEnd/build"))))
	mux.HandleFunc("/heartbeat", handleWebSocket)
	go monitorClients(db, queuePlayersSlice)
	//DEBUG PPROF
	mux.Handle("/debug/pprof/", http.HandlerFunc(pprof.Index))
	mux.Handle("/debug/pprof/cmdline", http.HandlerFunc(pprof.Cmdline))
	mux.Handle("/debug/pprof/profile", http.HandlerFunc(pprof.Profile))
	mux.Handle("/debug/pprof/symbol", http.HandlerFunc(pprof.Symbol))
	mux.Handle("/debug/pprof/trace", http.HandlerFunc(pprof.Trace))

	/*
		mux.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
			http.ServeFile(w, r, "./FrontEnd/valorant-custom-game-tracker/build/login.html")
		})
		/*
			http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				switch {
				case r.URL.Path == "/":
					http.ServeFile(w, r, "./FrontEnd/valorant-custom-game-tracker/build")
				case r.URL.Path == "/login":
					http.ServeFile(w, r, "./FrontEnd/valorant-custom-game-tracker/build")
				}
			})
	*/
	mux.HandleFunc("/queue", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		var q Queuers
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&q)
		if err != nil {
			panic(err)
		}

		index := findIndexByUsername(queuePlayersSlice, q.Username)

		if index != -1 {
			queuePlayersSlice = append(queuePlayersSlice[:index], queuePlayersSlice[index+1:]...)
		}
		queuePlayersSlice = append(queuePlayersSlice,
			queuePlayers{username: q.Username, accepted: 0},
		)
		//queuePlayersAccepted = append(queuePlayersAccepted, 0)
		fmt.Println(q.Username)
		err = dbSetInQueue(db, q.Username)
		if err != nil {
			fmt.Println("\n/queue error: ", err)
			http.Error(w, "User is InGame", http.StatusUnprocessableEntity)
		} else {
			json.NewEncoder(w).Encode("received :3")
		}
	}))

	mux.HandleFunc("/api/killlobby", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		type killLobby struct {
			GameId   string `json:"gameId"`
			Username string `json:"username"`
		}
		var k killLobby

		err := json.NewDecoder(r.Body).Decode(&k)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		fmt.Println("\n this is gameid in killlobby: ", k.GameId)
		fmt.Println("\n this is username: ", k.Username)

		index := checkForBoVotesId(allVotes, k.GameId)
		index2 := checkForGameSliceId(allGames, k.GameId)
		index3 := checkForMapsId(allMaps, k.GameId)
		index4 := checkForQueueSliceId(allQueues, k.GameId)
		index5 := checkForSidesId(allSides, k.GameId)
		fmt.Println("indexes", index, index2, index3, index4, index5)

		if index != -1 {
			allVotes = append(allVotes[:index], allVotes[index+1:]...)
		}
		if index2 != -1 {
			allGames = append(allGames[:index2], allGames[index2+1:]...)
		}
		if index3 != -1 {
			allMaps = append(allMaps[:index3], allMaps[index3+1:]...)
		}
		if index4 != -1 {
			allQueues = append(allQueues[:index4], allQueues[index4+1:]...)
		}
		if index5 != -1 {
			allSides = append(allSides[:index5], allSides[index5+1:]...)
		}

		err = dbRemoveGame(db, k.GameId)
		if err != nil {
			return
		}
		BroadcastUpdateGameCancelled(k.GameId, k.Username)

	}))

	mux.HandleFunc("/signup", enableCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var data SignupData
		err := json.NewDecoder(r.Body).Decode(&data)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if len(data.Username) < 3 || len(data.Password) < 5 {
			http.Error(w, "Invalid username or password", http.StatusBadRequest)
			return
		}
		salt := make([]byte, 16)
		_, err = crand.Read(salt)
		if err != nil {
			http.Error(w, "Error generating salt", http.StatusInternalServerError)
			return
		}

		hashedPassword := hashPassword(data.Password, salt)

		err = dbUserSignup(db, data.Username, hashedPassword, salt)
		if err != nil {
			http.Error(w, "Error saving user to database", http.StatusInternalServerError)
			return
		}

		// TODO: Save user to database
		// For this example, we'll just log the data
		log.Printf("New user signed up: %s", data.Username)

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"message": "User created successfully"})
	}))

	mux.HandleFunc("/login", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleLogin(db, w, r)
	}))

	mux.HandleFunc("/api/updatemap", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		type UpdateMap struct {
			GameId    string `json:"gameId"`
			Map       string `json:"mapName"`
			Team      int    `json:"Team"`
			Action    string `json:"Action"`
			FinalVote string `json:"FinalVote"`
		}

		var x UpdateMap
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&x)
		if err != nil {
			panic(err)
		}

		var action int

		if x.Action == "pick" {
			action = 1
		} else if x.Action == "ban" {
			action = 2
		}

		index := checkForMapsId(allMaps, x.GameId)

		for i := range allMaps[index].mapList {
			if allMaps[index].mapList[i].Name == x.Map {
				allMaps[index].mapList[i].Team = x.Team
				allMaps[index].mapList[i].Action = action
				fmt.Println("allMaps maplist before broadcast update: ", allMaps[index].mapList)
			}
		}

		if x.FinalVote == "bo3" {
			pickedCount := CountMapValuesInMapStruct(allMaps[index].mapList, 1)
			bannedCount := CountMapValuesInMapStruct(allMaps[index].mapList, 2)
			if (pickedCount + bannedCount) == 6 {
				for i := range allMaps[index].mapList {
					if allMaps[index].mapList[i].Action == 0 {
						allMaps[index].mapList[i].Action = 2
						allMaps[index].mapList[i].Team = 3
					}
				}
			}
		}

		broadcastUpdateMaps(x.GameId, allMaps[index].mapList, x.FinalVote)
		fmt.Println("allMaps maplist after broadcast update", allMaps[index].mapList)
		json.NewEncoder(w).Encode("maps :D")

	}))

	mux.HandleFunc("/api/updateteam", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		type UpdateTeam struct {
			GameId   string `json:"gameId"`
			Username string `json:"Username"`
			Team     int    `json:"Team"`
		}
		var x UpdateTeam
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&x)
		if err != nil {
			panic(err)
		}

		var index = checkForGameSliceId(allGames, x.GameId)

		for i := range allGames[index].Players {
			if allGames[index].Players[i].Username == x.Username {
				if allGames[index].Players[i].Team == x.Team {
					break
				} else {
					allGames[index].Players[i].Team = x.Team
					dbSetTeam(db, x.GameId, x.Username, x.Team)
					broadcastUpdate(x.GameId, allGames[index].Players, &allVotes)
					fmt.Println("\n/api/updateteam SENT: ", allGames[index].Players)
					json.NewEncoder(w).Encode("hewwo uwu")
				}
			}
		}

		/*

			for i := range lobbyPlayers {
				if lobbyPlayers[i].Username == x.Username {
					if lobbyPlayers[i].Team == x.Team {
						break
					} else {
						lobbyPlayers[i].Team = x.Team
						dbSetTeam(db, x.GameId, x.Username, x.Team)
						broadcastUpdate(x.GameId, lobbyPlayers)
						json.NewEncoder(w).Encode("hewwo uwu")
					}
				}
			}

		*/
	}))

	mux.HandleFunc("/api/sendsideselect", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {

		type IncomingData struct {
			GameId  string `json:"gameId"`
			Team    int    `json:"team"`
			Side    int    `json:"side"`
			MapName string `json:"mapName"`
		}
		var x IncomingData
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&x)
		if err != nil {
			http.Error(w, "bad data for side select", http.StatusBadRequest)
		}

		var attackerTeam int
		//side 1 is attack
		//side 2 is defense

		fmt.Println("side sent is ", x.Side)
		fmt.Println("team sent is ", x.Team)

		if x.Side == 1 {
			attackerTeam = x.Team
		} else if x.Side == 2 {
			if x.Team == 1 {
				attackerTeam = 2
			} else {
				attackerTeam = 1
			}
		}

		fmt.Println("attackerTeam is", attackerTeam)

		index := checkForSidesId(allSides, x.GameId)
		if index == -1 {
			newMapSide := make([]mapSide, 0, 3)
			newMapSide = append(newMapSide, mapSide{MapName: x.MapName, AttackerTeam: attackerTeam})
			allSides = append(allSides,
				gameSide{GameId: x.GameId, Sides: newMapSide},
			)
			index = checkForSidesId(allSides, x.GameId)
		} else {
			allSides[index].Sides = append(allSides[index].Sides,
				mapSide{MapName: x.MapName, AttackerTeam: attackerTeam},
			)
		}

		broadcastUpdateTeamSide(allSides[index].Sides, x.GameId)
		json.NewEncoder(w).Encode("all good fam")

	}))

	mux.HandleFunc("/api/getmapveto", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		gameId := r.URL.Query().Get("gameId")

		type MapResponse struct {
			MapList     []mapList `json:"mapList"`
			Format      string    `json:"format"`
			Phase       string    `json:"mapPhase"`
			CurrentTeam string    `json:"mapTeam"`
		}

		index := checkForMapsId(allMaps, gameId)

		if index == -1 {
			http.Error(w, "no maps yet bud", http.StatusExpectationFailed)
			return
		}

		var phase string
		mapList := allMaps[index].mapList
		format := allMaps[index].Format
		banCount := CountMapValuesInMapStruct(mapList, 2)
		pickCount := CountMapValuesInMapStruct(mapList, 1)
		currentTeam := checkMapPhaseAndTeam(gameId, pickCount, banCount, format)
		if currentTeam[0] == 'p' {
			phase = "pick"
		} else if currentTeam[0] == 'b' {
			phase = "ban"
		} else if currentTeam[0] == 'd' {
			phase = "done"
		}

		teamX := currentTeam[(len(currentTeam) - 1)]
		var finalTeam string
		fmt.Println("teamX is:", teamX)

		if teamX == '1' {
			finalTeam = "1"
		} else if teamX == '2' {
			finalTeam = "2"
		} else if teamX == '3' {
			finalTeam = "3"
		} else if teamX == '0' {
			finalTeam = "4"
		}

		fmt.Println("finalteam is:", finalTeam)

		response := MapResponse{
			MapList:     allMaps[index].mapList,
			Format:      format,
			Phase:       phase,
			CurrentTeam: finalTeam,
		}

		i2 := checkForSidesId(allSides, gameId)

		if i2 != -1 {
			broadcastUpdateTeamSide(allSides[i2].Sides, gameId)
		}

		w.Header().Set("Content-Type", "application/json")
		err := json.NewEncoder(w).Encode(response)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

	}))

	mux.HandleFunc("/api/getplayers", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("1. Received request to /api/getplayers")
		log.Printf("Content-Type: %s", r.Header.Get("Content-Type"))

		// Read the entire body
		body, err := ioutil.ReadAll(r.Body)
		if err != nil {
			log.Printf("2. Error reading request body: %v", err)
			http.Error(w, "Error reading request", http.StatusBadRequest)
			return
		}
		log.Printf("3. Request body: %s", string(body))

		// Parse the body
		var g GameId
		err = json.Unmarshal(body, &g)
		if err != nil {
			log.Printf("4. Error parsing request body: %v", err)
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		log.Printf("5. Parsed GameId: %+v", g)

		// Rest of your handler code...

		log.Printf("6. GameId is %s", g.Id)
		allGamesMutex.Lock()
		log.Print("6a. Acquired mutex lock")
		defer allGamesMutex.Unlock()

		log.Printf("6b. About to call checkForGameSliceId")
		index := checkForGameSliceId(allGames, g.Id)
		log.Printf("7. Index from checkForGameSliceId: %d", index)

		if index == -1 {
			log.Printf("8. Game not found, fetching from DB")
			lobby, err := dbGetPlayers(db, g.Id)
			if err != nil {
				log.Printf("8a. Error fetching players from DB: %v", err)
			}
			log.Printf("10. Players fetched from DB: %+v", lobby)
			allGames = append(allGames, gamePlayers{GameId: g.Id, Players: lobby})
			var index2 = checkForQueueSliceId(allQueues, g.Id)
			if index2 != -1 {
				allQueues = append(allQueues[:index2], allQueues[:index2+1]...)
			}
			fmt.Println("\n this is allGames: ", allGames)
			fmt.Println("\n this is allQueues: ", allQueues)
			index = len(allGames) - 1
		}

		finalLobby := allGames[index].Players
		log.Printf("11. Sending lobby for gameId %s: %v", g.Id, finalLobby)

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(finalLobby); err != nil {
			log.Printf("12. Error encoding response: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		log.Printf("13. Response sent successfully")
	}))

	mux.HandleFunc("/api/sendbovote", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		var vote string
		gameId := r.URL.Query().Get("gameId")

		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&vote)
		fmt.Println("\nvote is:", vote)
		fmt.Println("\ngameId is:", gameId)
		if err != nil {
			http.Error(w, "u goofed up bud", http.StatusConflict)
		}

		index := checkForBoVotesId(allVotes, gameId)
		fmt.Println("\nindex for bovote is:", index)
		fmt.Println("\nallvotes for bovote is:", allVotes)

		if index == -1 {
			http.Error(w, "u goofed up even worse bud", http.StatusForbidden)
			return
		}

		switch vote {
		case "bo1":
			allVotes[index].Votes[0]++
		case "bo2":
			allVotes[index].Votes[1]++
		case "bo3":
			allVotes[index].Votes[2]++
		default:
			http.Error(w, "not valid vote", http.StatusExpectationFailed)
			log.Printf("Unexpected gameId: %s", gameId)
			return
		}

		broadcastUpdateBestOfXVote(gameId, &allVotes)
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "Vote submitted successfully")

	}))

	mux.HandleFunc("/api/finalseriesvote", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		gameId := r.URL.Query().Get("gameId")

		index := checkForBoVotesId(allVotes, gameId)

		if index == -1 {
			http.Error(w, "idk how this happened ngl u are ass", http.StatusExpectationFailed)
			return
		}

		bo1 := allVotes[index].Votes[0]
		bo2 := allVotes[index].Votes[1]
		bo3 := allVotes[index].Votes[2]

		var finalVote string

		if bo1 >= bo2 && bo1 >= bo3 {
			finalVote = "bo1"
		} else if bo2 > bo1 && bo2 >= bo3 {
			finalVote = "bo2"
		} else {
			finalVote = "bo3"
		}

		fmt.Println("this is the finalvote", finalVote)
		index2 := checkForMapsId(allMaps, gameId)

		if index2 == -1 {
			allMaps = append(allMaps,
				gameMap{GameId: gameId, mapList: baseMaps, Format: finalVote},
			)
		}

		json.NewEncoder(w).Encode(finalVote)

	}))

	mux.HandleFunc("/api/matchaccepted", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		var u Usernamers
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&u)
		if err != nil {
			panic(err)
		}
		var index int = findIndexByUsername(queuePlayersSlice, u.Username)
		fmt.Println("\n\nhewwo : ", index)
		queuePlayersSlice[index].accepted = 1
		fmt.Println("RECEIVED MY DAWG")
		json.NewEncoder(w).Encode("received :33")
	}))

	mux.HandleFunc("/api/playersinlobby", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("received :333")
		var u UserGame
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&u)
		if err != nil {
			panic(err)
		}
		//id := u.Id
		fmt.Println("received :333:" + u.Username)

		if dbCheckPlayerInGame(db, u.Id, u.Username) {
			json.NewEncoder(w).Encode("received :333")
		} else {
			dbAddAllPlayersToGame(db, u.Id)
			/*
				dbAddPlayerToGame(db, u.Id, "MistaDong")
				dbAddPlayerToGame(db, u.Id, "TenZ")
				dbAddPlayerToGame(db, u.Id, "Ria")
				dbAddPlayerToGame(db, u.Id, "Vincent")
				dbAddPlayerToGame(db, u.Id, "Jordan")
				dbAddPlayerToGame(db, u.Id, "iMaple")
				dbAddPlayerToGame(db, u.Id, "Chi")
				dbAddPlayerToGame(db, u.Id, "Evan")
				dbSetCaptainsForTestPurposes(db, u.Id, "rayyan2", "allie2")
			*/
			json.NewEncoder(w).Encode("received :3333")
		}

		//dbAddPlayerToGame(db, id, u.Username)
		//broadcastUpdate()
		//json.NewEncoder(w).Encode("received :333")
		//dbAddPlayerToGame(db, id, "Allie")
		/*
			dbAddPlayerToGame(db, id, "MistaDong")
			dbAddPlayerToGame(db, id, "Vincent")
			dbAddPlayerToGame(db, id, "Jordan")
			dbAddPlayerToGame(db, id, "Ria")
			dbAddPlayerToGame(db, id, "Evan")
			dbAddPlayerToGame(db, id, "Chi")
		*/

	}))

	mux.HandleFunc("/api/matchaccepters", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Type")

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		for i := 0; i < 10; {
			var s string = ""
			Count := countAccepted(queuePlayersSlice)
			if Count == 10 {
				break
			}
			for y := 0; y < Count; y++ {
				s = s + "✅"
			}
			for z := 0; z < 10-Count; z++ {
				s = s + "🔲"
			}
			fmt.Fprintf(w, "data: %s\n\n", fmt.Sprint(s))
			time.Sleep(500 * time.Millisecond)
			w.(http.Flusher).Flush()
		}

		//gameId := randomString(5)
		//dbCreateGame(db, gameId)

		fmt.Fprintf(w, "data: %s\n\n", fmt.Sprint("✅✅✅✅✅✅✅✅✅✅"))
		w.(http.Flusher).Flush()

		//fmt.Fprintf(w, "data: %s\n\n", fmt.Sprint("REDIRECT"))
		//w.(http.Flusher).Flush()

		ctx := r.Context
		<-ctx().Done()

	}))
	mux.HandleFunc("/api/redirecttogame", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		sessionID := r.Context().Value("session_id").(string)
		sessionData := getSession(sessionID)
		var ug UserGame
		decoder := json.NewDecoder(r.Body)
		err := decoder.Decode(&ug)
		if err != nil {
			log.Fatal(err)
		}

		fmt.Println("\n gameid is:", ug.Id)
		fmt.Println("\nthe length of it is", len(ug.Id))

		if len(ug.Id) != 5 {
			http.Error(w, "incorrect gameId given", http.StatusBadRequest)
			return
		}

		if !(dbCheckGame(db, ug.Id)) {
			dbCreateGame(db, ug.Id)
		}

		dbInGame(db, ug.Username, ug.Id)
		timeout := time.After(30 * time.Second)
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-timeout:
				json.NewEncoder(w).Encode("REDIRECT REQUEST TIMED OUT")
				return
			case <-ticker.C:
				if dbCountHowManyReady(db, ug.Id) == 10 {
					sessionData["inGame"] = 1
					sessionData["gameId"] = ug.Id
					i := findIndexByUsername(queuePlayersSlice, ug.Username)
					if i != -1 {
						queuePlayersSlice = append(queuePlayersSlice[:i], queuePlayersSlice[i+1:]...)
					}
					fmt.Println("\nthis is the queueplayersslice after redirecting:", queuePlayersSlice)
					json.NewEncoder(w).Encode("REDIRECT GameId:" + ug.Id)
					return
				} else {
					json.NewEncoder(w).Encode("ALL PLAYERS NOT READY YET")
				}
			}
		}
	}))

	mux.HandleFunc("/api/liveteamview", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		gameId := r.URL.Query().Get("gameId")
		if gameId == "" {
			http.Error(w, "gameId required", http.StatusBadRequest)
			return
		}

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
			return
		}

		client := &Client{
			gameId: gameId,
			ch:     make(chan string),
		}

		clients[gameId] = append(clients[gameId], client)

		// Set headers for SSE
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		// Listen to the client's channel and send events
		for {
			select {
			case msg := <-client.ch:
				fmt.Fprint(w, msg)
				flusher.Flush()
			case <-r.Context().Done():
				// Client disconnected
				clients[gameId] = removeClient(clients[gameId], client)
				return
			}
		}

	}))

	mux.HandleFunc("/queuenumbers", func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers to allow all origins. You may want to restrict this to specific origins in a production environment.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Type")

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		for i := 0; i < 10; {
			queueCount = dbQueueCount(db)
			fmt.Fprintf(w, "data: %s\n\n", fmt.Sprintf("%d people in queue", queueCount))
			time.Sleep(500 * time.Millisecond)
			w.(http.Flusher).Flush()
		}

		ctx := r.Context
		<-ctx().Done()

		/*
			// Simulate sending events (you can replace this with real data)
			for i := 0; i < 10; i++ {
				fmt.Fprintf(w, "data: %s\n\n", fmt.Sprintf("Event %d", i))
				time.Sleep(2 * time.Second)
				w.(http.Flusher).Flush()
			}
			// Simulate closing the connection
			ctx := r.Context
			<-ctx().Done()
		*/

	})
	mux.HandleFunc("/api/logout", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		sessionID := r.Context().Value("session_id").(string)

		// Clear the session data
		deleteSession(sessionID)

		// Clear the session cookie
		http.SetCookie(w, &http.Cookie{
			Name:     "session_id",
			Value:    "",
			Path:     "/",
			Expires:  time.Now().Add(-1 * time.Hour), // Set expiry in the past
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
			Secure:   true, // Set to true if using HTTPS
		})

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
	}))
	mux.HandleFunc("/api/user", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		sessionID := r.Context().Value("session_id").(string)
		sessionData := getSession(sessionID)

		if username, ok := sessionData["username"].(string); ok {
			// Fetch inGame status and gameId from the session data
			inGame, inGameOk := sessionData["inGame"].(int)
			gameId, gameIdOk := sessionData["gameId"].(string)

			var inGameStatus int
			var gameIdResponse string

			if inGameOk && inGame == 1 {
				// User is in a game
				inGameStatus = 1
				if gameIdOk {
					gameIdResponse = gameId
				}
			} else {
				// User is not in a game
				inGameStatus = 0
				gameIdResponse = ""
			}

			// Respond with username, inGame status, and gameId
			response := map[string]interface{}{
				"username": username,
				"inGame":   inGameStatus,
				"gameId":   gameIdResponse,
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(response)
		} else {
			http.Error(w, "Not logged in", http.StatusUnauthorized)
		}
	}))

	mux.HandleFunc("/api/inqueue", sessionMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers to allow all origins. You may want to restrict this to specific origins in a production environment.
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Type")

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		var gId string = ""

		// Simulate sending events (you can replace this with real data)
		for i := 0; i < 10; {
			if len(queuePlayersSlice) == 10 {
				if (len(allQueues) == 0) || checkForQueueSlicePlayers(allQueues, queuePlayersSlice) == -1 {

					var indexAllQueues = checkForQueueSlicePlayers(allQueues, queuePlayersSlice)

					if indexAllQueues == -1 {

						gId = randomString(5)

						allQueues = append(allQueues,
							gameQueue{GameId: gId, Players: queuePlayersSlice},
						)

					} else {
						gId = allQueues[indexAllQueues].GameId
					}

				}

				fmt.Fprintf(w, "data: %s\n\n", fmt.Sprint("MATCH FOUND:"+gId))
				w.(http.Flusher).Flush()

				i = 11
				break
			}
			fmt.Fprintf(w, "data: %s\n\n", fmt.Sprintf("Event %d", i))
			time.Sleep(500 * time.Millisecond)
			w.(http.Flusher).Flush()
		}
		// Simulate closing the connection
		ctx := r.Context
		<-ctx().Done()
	}))

	if PORT == "" {
		PORT = "3000"
	}

	log.Printf("Starting server on %s:%s", ADDR, PORT)

	fmt.Println(ADDR + ":" + PORT)
	http.ListenAndServe(ADDR+":"+PORT, mux)
}
