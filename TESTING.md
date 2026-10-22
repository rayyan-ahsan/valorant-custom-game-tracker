# Running the tests

## Watch ten real browser clients

From the repository root on Windows:

```powershell
.\scripts\test-visual.ps1
```

This builds a separate copy of the frontend, starts an isolated local test server
and database schema, creates Visual01 through Visual10, and logs each one into a
separate browser session. Your regular website can stay running on its own port.
The test server and control panel choose available ports automatically.

The launcher supports Windows PowerShell 5.1 and PowerShell 7. It needs Node.js
20+, Go, PostgreSQL, and Microsoft Edge. It installs
the small browser-test dependency package on its first run. If needed, supply
`-PostgresBin 'C:\Program Files\PostgreSQL\16\bin'` or choose `-Browser chrome`.
Each browser uses temporary test storage, separate from your personal profile.

The control panel opens automatically and provides:

- **Ten live previews** with player names; **Focus player** enlarges that window.
- **Next stage** to advance one safe stage: queue/accept, draft/vote, then maps/sides.
- **Play automatically** to complete setup and leave all clients in the ready lobby.
- **Pause / manual control** to stop automation after the current stage, so you can
  operate the real app windows. App countdowns keep running; pause does not freeze
  acceptance, voting, or side-selection timers.
- **Tile player windows** to arrange the ten windows. The preview grid remains
  useful on smaller displays where ten full windows cannot fit comfortably.
- **End finished lobby** to exercise cancellation and session cleanup.
- **Stop and close** to close the browsers and stop the test database cleanly.

You can also launch with automatic or manual control, or select another format:

```powershell
.\scripts\test-visual.ps1 -Mode auto -Format bo3
.\scripts\test-visual.ps1 -Mode manual
```

Manual mode starts all ten clients logged in and ready to queue. Use the player
windows yourself. Automation only pauses between complete stages; switching back
after arbitrary manual game changes may require restarting the test room.

Use `-SkipBuild` on later runs when frontend sources have not changed. Screenshots
at each stage, failure screenshots, and a JSON report are stored under the ignored
`.visual-runs/run-*` directories. Builds also go under `.visual-runs`, leaving the
tracked `FrontEnd/build` files untouched.

For an automated browser verification that exits after checking cleanup:

```powershell
.\scripts\test-visual.ps1 -Headless -Verify -Mode auto -Format bo3
```

Verification clicks the control panel's Next, Play, End lobby, and Stop buttons.
It checks ten unique sessions, matching match IDs, 5v5 teams on all ten screens,
map and side agreement, runtime errors, and cleared sessions after cancellation.
The visible runner is tested with distinct native browser window IDs as well.

The browser suite uses [Playwright browser contexts](https://playwright.dev/docs/browser-contexts)
for independent sessions. To use its bundled Chromium instead of Edge/Chrome,
run `npx playwright install chromium` from `visual-tests`, then launch with
`-Browser chromium`.

## Backend and concurrency checks

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

The frontend tests check visitor navigation, waiting for all ten votes, one-time
result finalization under StrictMode, retrying failed votes, and keeping side selection open for retry after a failed
request. Existing
Create React App/testing-library dependency warnings are separate from test
failures. This test does not replace the backend ten-player integration suite.


## Delays, refreshes, disconnections and server rules

From the project folder, run the backend integration tests (including the race
detector and the new recovery/rules tests):

```powershell
.\scripts\test-flow.ps1 -Repeat 3
```

The additional scenarios cover:

- Ten identities with different request delays, repeated acceptances/votes/map
  choices, and two different draft choices racing for the same turn.
- A mutation committed by the server whose response is lost, followed by a retry.
- All ten live connections opening before lobby initialization. Every client must
  receive the initial roster and first captain turn, then the next draft update
  without refreshing.
- Rejection of non-captains, a captain claiming the other team, out-of-turn picks,
  changed votes, incorrect match formats, invalid sides and conflicting retries.
- Reconnection snapshots after missed drafting, voting, map/side selection and
  cancellation. Everyone must recover the same teams, maps and sides.
- Ten queue heartbeat connections dropping and reconnecting within the 15-second
  grace period, followed by inactivity cleanup beyond that period.
- The restart boundary used by main: a fresh handler/session state plus the
  startup database reset. Accounts survive and can log in/requeue; active matches
  do not survive. This models the restart boundary; it does not launch a container
  or restart the deployed process.

Run the actual ten-browser flow with network interruptions:

```powershell
.\scripts\test-visual.ps1 -Resilience -Verify
```

Add `-Headless` to run without visible windows, or `-Format bo2` / `-Format bo3`.
Omit `-SkipBuild` after frontend changes. Request dispatch gets deterministic
per-player delays of 0/50/200/500 ms plus small variation. This is request-delay
simulation, not a full bandwidth/packet-loss or geographic network emulator.
The test refreshes a queued player, takes one player offline while the other
players draft, reconnects them, refreshes a submitted voter and side-selecting
captains, refreshes all ten finished screens, and disconnects a player during
cancellation. It also deliberately fails a draft, map and side submission before
retrying, to ensure the interface stays usable after a request failure. Assertions
check recovered UI state and agreement across clients. The local fixture forcibly
closes the player's live stream while offline, then checks automatic EventSource
reconnection; the test-only fault endpoint is never included in the application.
GitHub's browser matrix now runs these scenarios for BO1, BO2 and BO3.

### Running against a deployed test server

Deploy the updated backend and frontend to a **dedicated staging instance** with
an empty queue, one instance, HTTPS and a separate test database. Then run:

```powershell
.\scripts\test-visual.ps1 -StagingUrl 'https://your-staging-domain.example' -Resilience -Verify -Headless
```

This runs the same browsers through the actual deployed site, certificates,
secure cookies, proxy/streaming connections and database. In staging, the offline
player closes their document and reopens the match when online; the local fixture
separately tests automatic streaming reconnection. It uses the deployed
frontend, so it neither builds locally nor starts a local database. Public TLS
certificates are verified; only the isolated local test server's self-signed
certificate is bypassed. Ten uniquely named synthetic accounts are created on
staging and remain there afterward; the successful test cancels its lobby and
resets those players' queue/game flags. A failed run can leave a test lobby or
queued accounts that need staging cleanup. Use staging without real players,
because this application has one shared matchmaking queue.

No hosted URL is configured in the repository, so local success does not verify
your host, domain, proxy, database configuration or an actual container restart.
Run the staging command after deployment, and keep server request/error logs
available while trying a real session from separate home/mobile connections.
