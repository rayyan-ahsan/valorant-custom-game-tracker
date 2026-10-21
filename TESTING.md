# Running the tests

From the repository root on Windows:

```powershell
.\scripts\test-flow.ps1
```

The runner starts an isolated local PostgreSQL cluster in the ignored
`.test-postgres` directory, runs all Go tests with the race detector, and stops
the test database even if a test fails. It does not start or reset your normal
application database. PostgreSQL and Go must be installed. Race detection also
needs a working GCC/MinGW compiler on PATH.

If PostgreSQL is installed outside the usual location:

```powershell
.\scripts\test-flow.ps1 -PostgresBin 'C:\Program Files\PostgreSQL\16\bin'
```

Repeat the concurrent scenarios to exercise different request orderings:

```powershell
.\scripts\test-flow.ps1 -Repeat 10
```

`-WithoutRace` runs the same integration scenarios without the race detector if
you do not have a C compiler installed. A passing run without `-race` does not
check for memory races.

## What is covered

- Ten independent HTTPS clients sign up and log in simultaneously, each with its
  own cookie jar.
- All ten join the queue, receive the same match, accept, and enter one lobby.
- Simultaneous lobby requests see the same two captains and ten unique players.
- Captain picks and retries overlap all ten players reading the lobby; teams end
  at five players each.
- Ten live event streams receive voting and side-selection transitions.
- Ten players cast mixed votes with concurrent duplicate submissions; each
  account counts once and all clients get the same result.
- Best-of-1, best-of-2, and best-of-3 complete their map veto and side selection,
  including concurrent retries of map and side submissions.
- Lobby cancellation clears sessions and database state, and all ten can requeue.
- Ninety queue retries from nine users still produce only nine entries; a match
  requires a tenth user and redirect requires all ten acceptances.
- Ten real WebSocket heartbeat connections exchange pings/pongs; inactivity
  cleanup clears the actual queue, sessions, and database flags.
- Concurrent session reads/logout and live-subscriber disconnections/broadcasts
  are checked, including a stalled subscriber.

These are HTTP/WebSocket integration tests against the production handlers and
real PostgreSQL, plus focused concurrency tests. They do not drive ten browser
windows or launch a match inside Valorant. No external game-result ingestion
flow is implemented by these endpoints.

## Existing test database or Linux/macOS

Use a dedicated disposable PostgreSQL database. Each integration scenario creates
and removes a separate schema; the database user needs permission to create it.

```powershell
$env:TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/tracker_test?sslmode=disable'
go test -race . -count=10 -timeout=180s
```

Without `TEST_DATABASE_URL`, database integration tests explicitly report `SKIP`.
The session and live-subscriber concurrency tests still run. Use `go test -v
./...` to see which tests ran. The CI workflow supplies PostgreSQL so the full
flow is exercised on every push and pull request.

## Frontend

From `FrontEnd`:

```powershell
npm test -- --watchAll=false --runInBand
```

The current frontend test checks navigation for a logged-out visitor. Existing
Create React App/testing-library dependency warnings are separate from test
failures. This test does not replace the backend ten-player integration suite.
