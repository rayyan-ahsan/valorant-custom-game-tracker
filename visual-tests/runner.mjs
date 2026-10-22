import { chromium } from 'playwright';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const baseURL = process.argv[process.argv.indexOf('--url') + 1];
const target = new URL(baseURL);
const staging = process.env.VISUAL_STAGING === '1';
assert.equal(target.protocol, 'https:', 'Use HTTPS so secure session cookies are tested');
assert.equal(target.origin, baseURL, 'Supply an origin without a path or trailing slash');
if (!staging) assert.match(baseURL, /^https:\/\/127\.0\.0\.1:\d+$/);
const resilience = process.env.VISUAL_RESILIENCE === '1';
const accountPrefix = staging ? `V${randomBytes(3).toString('hex')}` : 'Visual';
const accountPassword = staging ? randomBytes(18).toString('hex') : 'visual-test-password';
const headless = process.env.VISUAL_HEADLESS === '1';
const verify = process.env.VISUAL_VERIFY === '1';
const format = process.env.VISUAL_FORMAT || 'bo1';
const channel = process.env.VISUAL_BROWSER || 'msedge';
const token = randomBytes(24).toString('hex');
const output = path.resolve('.visual-runs', `run-${Date.now()}`);
await mkdir(output, { recursive: true });
const players = [];
const log = [];
let stage = 0, busy = false, playing = false, stopped = false, ended = false, error = '', dashboard;
let resolveStop;
let statusTimer;
let matchID;
let refreshing = false;
const stopPromise = new Promise(resolve => { resolveStop = resolve; });
const stageNames = ['Queue and accept', 'Draft teams and vote', 'Maps and sides', 'Ready to play'];
const browser = await chromium.launch({
  headless, ...(channel === 'chromium' ? {} : { channel }),
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--mute-audio'],
});

function note(message) {
  log.push({ time: new Date().toISOString(), message });
  console.log(message);
}
function snapshot() {
  return { stage, stageName: stageNames[stage], busy, playing, ended, error, format, resilience, staging, target: baseURL, log: log.slice(-30),
    players: players.map(p => ({ name: p.name, status: ended || stage === 3 ? p.status : p.session?.inGame ? `Lobby ${p.session.gameId}` : p.session?.inQueue ? 'Queued' : p.status, url: p.page.url(), errors: p.errors.slice(-3) })) };
}
async function json(p, endpoint, data) {
  const response = data === undefined ? await p.context.request.get(endpoint) : await p.context.request.post(endpoint, { data });
  if (!response.ok()) throw new Error(`${p.name}: ${endpoint} returned ${response.status()}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}
async function poll(action, description, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (stopped) throw new Error('Runner stopped');
    const result = await action();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out: ${description}`);
}
function gameID() {
  if (matchID) return matchID;
  const ids = players.map(p => new URL(p.page.url()).hash.slice(1));
  assert(ids[0]?.length === 5 && ids.every(id => id === ids[0]), 'All ten clients must be in the same match');
  matchID = ids[0];
  return matchID;
}
async function lobby() { return json(players[0], '/api/getplayers', { gameId: gameID() }); }
async function veto() { return json(players[0], `/api/getmapveto?gameId=${gameID()}`); }
function captain(rows, team) {
  const row = rows.find(p => p.Captain === 1 && p.Team === team);
  assert(row, `Team ${team} must have a captain`);
  return players.find(p => p.name === row.Username);
}
async function queueAndAccept() {
  if (players.every(p => /\/game#\w{5}$/.test(p.page.url()))) return;
  note('All ten players click Join Queue.');
  if (resilience) {
    await Promise.all(players.slice(0, 9).map(p => p.page.getByRole('button', { name: 'Join Queue', exact: true }).click()));
    await poll(async () => (await json(players[0], '/api/user')).inQueue === 1, 'queued session before refresh');
    await players[0].page.reload({ waitUntil: 'domcontentloaded' });
    await poll(() => players[0].page.locator('#queueBtn').evaluate(button => button.classList.contains('disabled')), 'queue restored after refresh');
    await players[9].page.getByRole('button', { name: 'Join Queue', exact: true }).click();
    note('PASS: refresh while queued retained the same player and recovered the queue.');
  } else await Promise.all(players.map(async p => {
    await p.page.getByRole('button', { name: 'Join Queue', exact: true }).click();
    p.status = 'Waiting for match';
  }));
  await Promise.all(players.map(p => p.page.locator('#acceptBtn').waitFor({ state: 'visible' })));
  note('All ten players accept the match.');
  await Promise.all(players.map(p => p.page.locator('#acceptBtn').click()));
  await Promise.all(players.map(p => p.page.waitForURL(/\/game#\w{5}$/)));
  const id = gameID();
  const rows = await poll(async () => { const rows = await lobby(); return rows.length === 10 && players.every(p => rows.some(row => row.Username === p.name)) && rows; }, 'ten unique lobby players');
  assert.equal(rows.filter(p => p.Captain === 1).length, 2);
  await Promise.all(players.map(async p => {
    await p.page.locator('.game-page .player').first().waitFor();
    const user = await json(p, '/api/user');
    assert.equal(user.username, p.name); assert.equal(user.gameId, id); assert.equal(user.inGame, 1);
    p.status = 'In lobby';
  }));
  note(`One match (${id}), ten distinct sessions, two captains.`);
}
async function disconnectPlayer(p) {
  await p.context.setOffline(true);
  if (staging) {
    // No test-only endpoint is deployed. Closing the document deterministically
    // disconnects the stream; return to the match after going back online.
    await p.page.goto('about:blank');
  } else {
    const response = await p.context.request.post(`/__test/disconnect?username=${encodeURIComponent(p.name)}`, {
      headers: { 'X-Test-Fault-Token': process.env.VISUAL_FAULT_TOKEN },
    });
    assert.equal(response.status(), 204);
    await assert.rejects(() => p.page.evaluate(() => fetch('/api/user')), 'The observer must really be offline');
  }
}
async function reconnectPlayer(p) {
  await p.context.setOffline(false);
  if (staging) await p.page.goto(`${baseURL}/game#${gameID()}`, { waitUntil: 'domcontentloaded' });
}
async function draftAndVote() {
  let observer;
  if (resilience) {
    const rows = await lobby();
    observer = players.find(p => rows.some(row => row.Username === p.name && row.Captain === 0));
    await observer.page.locator('.player-list .player').first().waitFor();
    await poll(async () => await observer.page.locator('.player-list .player').count() === 8, 'observer sees initial draft');
    await disconnectPlayer(observer);
    note(`${observer.name} loses their connection while other players draft.`);
  }
  for (let pick = 0; pick < 8; pick++) {
    const rows = await lobby();
    const selected = rows.find(p => p.Team === 0);
    if (!selected) break;
    const one = rows.filter(p => p.Team === 1).length;
    const two = rows.filter(p => p.Team === 2).length;
    const team = (one === 1 && two === 1) || (one < 4 && two === 3) || (one === 4 && two === 4) ? 1 : 2;
    const p = captain(rows, team);
    note(`${p.name} drafts ${selected.Username} for team ${team}.`);
    if (resilience && pick === 0) {
      await p.page.route(`${baseURL}/api/updateteam`, route => route.abort('failed'), { times: 1 });
      await p.page.locator(`[data-testid="draft-${selected.Username}"].selectable`).click();
      await p.page.getByRole('alert').filter({ hasText: 'Could not draft' }).waitFor();
      assert((await lobby()).some(row => row.Username === selected.Username && row.Team === 0));
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    await p.page.locator(`[data-testid="draft-${selected.Username}"].selectable`).click();
    await poll(async () => (await lobby()).some(row => row.Username === selected.Username && row.Team === team), 'draft selection');
    // The application's click debounce is 500 ms, including consecutive picks.
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  const rows = await lobby();
  assert.equal(rows.filter(p => p.Team === 1).length, 5);
  assert.equal(rows.filter(p => p.Team === 2).length, 5);
  if (observer) {
    if (!staging) assert.equal(await observer.page.locator('.player-list .player').count(), 8, 'Offline observer must actually miss the draft updates');
    await reconnectPlayer(observer);
    note(`${observer.name} reconnects and must recover the completed draft and open vote.`);
  }
  await poll(async () => (await Promise.all(players.map(p => p.page.locator('.game-page .team').evaluateAll(teams => teams.map(team => team.querySelectorAll('.player').length))))).every(counts => counts.length === 2 && counts.every(n => n === 5)), 'all ten screens showing 5v5 teams');
  if (observer) {
    await observer.page.getByTestId(`vote-${format}`).click();
    await observer.page.getByRole('button', { name: 'Submit Vote', exact: true }).click();
    await observer.page.getByRole('button', { name: 'Submitted', exact: true }).waitFor();
    await observer.page.reload({ waitUntil: 'domcontentloaded' });
    await observer.page.getByRole('button', { name: 'Submitted', exact: true }).waitFor();
    note('PASS: a refreshed voter recovered their submitted vote without counting twice.');
  }
  note(`All ten players vote for ${format.toUpperCase()}.`);
  await Promise.all(players.map(async p => {
    if (await p.page.getByRole('button', { name: 'Submitted', exact: true }).isVisible()) return;
    await p.page.getByTestId(`vote-${format}`).click();
  }));
  await Promise.all(players.map(async p => { const button = p.page.getByRole('button', { name: 'Submit Vote', exact: true }); if (await button.isVisible()) await button.click(); }));
  await Promise.all(players.map(p => p.page.getByTestId(`vote-${format}`).waitFor({ state: 'hidden' })));
  await poll(async () => {
    const response = await players[0].context.request.get(`/api/getmapveto?gameId=${gameID()}`);
    return response.ok() && (await response.json()).format === format;
  }, 'shared match format');
  players.forEach(p => { p.status = `5v5 · ${format.toUpperCase()}`; });
  note('Both teams have five players. Every client completed voting.');
}
async function mapsAndSides() {
  const rows = await lobby();
  for (let i = 0; i < 7; i++) {
    const state = await veto();
    if (state.mapPhase === 'done') break;
    const team = Number(state.mapTeam);
    const p = captain(rows, team);
    const map = state.mapList.find(m => m.Action === 0);
    assert(map, 'There must be an available map');
    note(`${p.name}: ${state.mapPhase} ${map.Name}.`);
    if (resilience && i === 0) {
      await p.page.route(`${baseURL}/api/updatemap`, route => route.abort('failed'), { times: 1 });
      await p.page.getByTestId(`map-${map.Name}`).click();
      await p.page.getByRole('alert').filter({ hasText: 'Could not select this map' }).waitFor();
      assert((await veto()).mapList.some(m => m.Name === map.Name && m.Action === 0));
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    await p.page.getByTestId(`map-${map.Name}`).click();
    await poll(async () => (await veto()).mapList.some(m => m.Name === map.Name && m.Action !== 0), 'map choice');
    if (state.mapPhase === 'pick') {
      const opponent = captain(rows, team === 1 ? 2 : 1);
      note(`${opponent.name} chooses Attack on ${map.Name}.`);
      if (resilience && !opponent.sideRefreshTested) {
        await opponent.page.getByRole('button', { name: 'Attack', exact: true }).waitFor();
        await opponent.page.reload({ waitUntil: 'domcontentloaded' });
        opponent.sideRefreshTested = true;
      }
      if (resilience && !opponent.sideFailureTested) {
        await opponent.page.route(`${baseURL}/api/sendsideselect`, route => route.abort('failed'), { times: 1 });
        await opponent.page.getByRole('button', { name: 'Attack', exact: true }).click();
        await opponent.page.getByRole('alert').filter({ hasText: 'Could not select your side' }).waitFor();
        opponent.sideFailureTested = true;
      }
      await opponent.page.getByRole('button', { name: 'Attack', exact: true }).click();
      await opponent.page.getByRole('button', { name: 'Attack', exact: true }).waitFor({ state: 'hidden' });
    }
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  const state = await veto();
  assert.equal(state.mapPhase, 'done');
  assert.equal(state.mapList.filter(m => m.Action === 1).length, Number(format.slice(-1)));
  if (resilience) {
    await Promise.all(players.map(p => p.page.reload({ waitUntil: 'domcontentloaded' })));
    note('All ten players refresh after map and side selection.');
  }
  await Promise.all(players.map(p => p.page.getByRole('heading', { name: 'Picked Maps', exact: true }).waitFor()));
  await poll(async () => {
    const views = await Promise.all(players.map(p => p.page.locator('.player-list .map-container.picked').evaluateAll(maps => maps.map(map => ({ name: map.querySelector('.map-text').textContent.trim(), sides: [...map.querySelectorAll('.side-indicator')].map(side => side.textContent.trim()).sort().join('') })).sort((a, b) => a.name.localeCompare(b.name)))));
    return views.every(view => view.length === Number(format.slice(-1)) && view.every(map => map.sides === 'AD') && JSON.stringify(view) === JSON.stringify(views[0]));
  }, 'identical maps and attack/defense sides on every screen');
  const pageErrors = players.flatMap(p => p.errors);
  assert.equal(pageErrors.length, 0, `Browser runtime errors: ${pageErrors.join('; ')}`);
  players.forEach(p => { p.status = 'Ready to play'; });
  note('PASS: all ten browser clients completed the match setup.');
}
async function endLobby() {
  const id = gameID();
  if (resilience) await disconnectPlayer(players[9]);
  await players[0].page.getByRole('button', { name: 'Leave Game', exact: true }).click();
  await players[0].page.getByRole('button', { name: "Yes, I'm sure", exact: true }).click();
  if (resilience) {
    await Promise.all(players.slice(0, 9).map(p => p.page.getByText('Game Cancelled', { exact: true }).waitFor()));
    await reconnectPlayer(players[9]);
  }
  await Promise.all(players.map(p => p.page.getByText('Game Cancelled', { exact: true }).waitFor()));
  await Promise.all(players.map(p => p.page.getByRole('button', { name: 'Okay', exact: true }).click()));
  await Promise.all(players.map(async p => {
    await p.page.waitForURL(`${baseURL}/`);
    const user = await json(p, '/api/user');
    assert.equal(user.inGame, 0); assert.equal(user.inQueue, 0); assert.equal(user.gameId, '');
    p.status = 'Lobby ended';
  }));
  note(`PASS: match ${id} ended; all ten sessions were reset.`);
  ended = true;
  assert.equal(players.flatMap(p => p.errors).length, 0, 'No browser runtime errors during lobby cleanup');
}
async function recordFailure(e) {
  error = e.stack || String(e); playing = false; note(`FAILED: ${e.message}`);
  await Promise.allSettled(players.map(p => p.page.screenshot({ path: path.join(output, `${p.name}-failure.png`) })));
  await writeFile(path.join(output, 'report.json'), JSON.stringify(snapshot(), null, 2));
}
async function next() {
  if (busy || stage >= 3 || stopped) return;
  busy = true; error = '';
  try {
    await [queueAndAccept, draftAndVote, mapsAndSides][stage]();
    stage++;
    await Promise.all(players.map(p => p.page.screenshot({ path: path.join(output, `${p.name}-stage-${stage}.png`) })));
    await writeFile(path.join(output, 'report.json'), JSON.stringify(snapshot(), null, 2));
  } catch (e) { await recordFailure(e); if (verify) throw e; }
  finally { busy = false; }
}
async function play() {
  if (playing || busy) return;
  playing = true;
  try {
    while (playing && stage < 3 && !stopped) {
      await next();
      if (error) break;
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  } finally { playing = false; }
}
async function bounds(page, value) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: value });
    return windowId;
  } finally { await cdp.detach(); }
}
async function tile() {
  if (headless) return;
  const screen = await players[0].page.evaluate(() => ({ width: window.screen.availWidth, height: window.screen.availHeight }));
  const windows = await Promise.all(players.map((p, i) => bounds(p.page, {
    left: Math.floor(i % 5 * screen.width / 5), top: Math.floor(Math.floor(i / 5) * screen.height / 2),
    width: Math.floor(screen.width / 5), height: Math.floor(screen.height / 2),
  })));
  assert.equal(new Set(windows).size, 10, 'Every player should have their own visible browser window');
}

const panelHTML = (await readFile(new URL('./dashboard.html', import.meta.url), 'utf8')).replace('__TOKEN__', token);
const panel = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(panelHTML); }
    if (req.headers['x-visual-token'] !== token && url.searchParams.get('token') !== token) { res.writeHead(403); return res.end(); }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && url.pathname === '/api/state') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(snapshot())); }
    const preview = /^\/preview\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && preview) {
      const p = players[Number(preview[1])];
      if (!p) { res.writeHead(404); return res.end(); }
      if (!p.previewAt || Date.now() - p.previewAt > 2000) {
        // Coalesce requests while a screenshot is in flight.
        p.previewPromise ??= p.page.screenshot({ type: 'jpeg', quality: 45 }).then(image => { p.preview = image; p.previewAt = Date.now(); }).finally(() => { p.previewPromise = null; });
        await p.previewPromise;
      }
      res.setHeader('Content-Type', 'image/jpeg'); return res.end(p.preview);
    }
    if (req.method === 'POST' && url.pathname === '/api/command') {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024) throw new Error('Command too large'); }
      const command = JSON.parse(body);
      if (command.action === 'stop') { stopped = true; playing = false; resolveStop(); }
      else if (command.action === 'pause') { playing = false; }
      else if (command.action === 'play') { void play().catch(recordFailure); }
      else if (command.action === 'next') { void next().catch(recordFailure); }
      else if (command.action === 'tile') { await tile(); }
      else if (command.action === 'focus') {
        const p = players[command.player]; assert(p, 'Unknown player');
        if (!headless) await bounds(p.page, { left: 40, top: 40, width: 1200, height: 850 });
        await p.page.bringToFront();
      } else if (command.action === 'cleanup') {
        if (busy || stage !== 3 || ended) throw new Error('Finish setup before ending the lobby, and end it only once');
        busy = true; void endLobby().catch(recordFailure).finally(() => { busy = false; });
      } else throw new Error('Unknown command');
      return res.end('{}');
    }
    res.writeHead(404); res.end();
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: e.message })); }
});

try {
  note('Creating ten isolated browser sessions.');
  for (let i = 0; i < 10; i++) {
    const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: !staging, viewport: headless ? { width: 1200, height: 800 } : null });
    if (resilience) {
      let requestNumber = 0;
      // Delay request dispatch, including streaming reconnects. Do not buffer
      // SSE responses: this exercises the real streaming protocol.
      await context.route(`${baseURL}/**`, async route => {
        const delay = [0, 50, 200, 500][i % 4] + (++requestNumber % 3) * 15;
        await new Promise(resolve => setTimeout(resolve, delay));
        await route.continue().catch(() => {});
      });
    }
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const p = { name: `${accountPrefix}${String(i + 1).padStart(2, '0')}`, context, page, status: 'Signing in', errors: [] };
    page.on('pageerror', e => { p.errors.push(e.message); });
    page.on('domcontentloaded', () => { void page.evaluate(name => { document.title = `${name} · Valorant Tracker`; }, p.name).catch(() => {}); });
    players.push(p);
  }
  await Promise.all(players.map(async p => {
    // Account creation is fixture setup. All subsequent game actions use the UI.
    await json(p, '/signup', { username: p.name, password: accountPassword });
    await p.page.goto('/login', { waitUntil: 'domcontentloaded' });
    await p.page.getByLabel('Username', { exact: true }).fill(p.name);
    await p.page.getByLabel('Password', { exact: true }).fill(accountPassword);
    await p.page.getByRole('button', { name: 'Login', exact: true }).click();
    await p.page.getByRole('button', { name: 'Join Queue', exact: true }).waitFor();
    assert.equal((await json(p, '/api/user')).username, p.name);
    p.status = 'Ready to queue';
  }));
  assert.equal(new Set((await Promise.all(players.map(p => p.context.cookies()))).flat().filter(c => c.name === 'session_id').map(c => c.value)).size, 10);
  await tile();
  statusTimer = setInterval(async () => {
    if (refreshing || stopped) return;
    refreshing = true;
    try {
      await Promise.all(players.map(async p => {
        try {
          const response = await p.context.request.get('/api/user', { timeout: 3000 });
          p.session = response.ok() ? await response.json() : null;
        } catch { /* A closed player window remains inspectable in the panel. */ }
      }));
    } finally { refreshing = false; }
  }, 2000);
  await new Promise(resolve => panel.listen(0, '127.0.0.1', resolve));
  const panelURL = `http://127.0.0.1:${panel.address().port}`;
  note(`CONTROL PANEL: ${panelURL}`);
  note(`Screenshots and report: ${output}`);
  const controlContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  dashboard = await controlContext.newPage();
  dashboard.on('close', () => { stopped = true; playing = false; resolveStop(); });
  await dashboard.goto(panelURL);
  await dashboard.screenshot({ path: path.join(output, 'dashboard.png') });
  if (verify) {
    // Exercise the control panel itself as well as the ten player pages.
    await dashboard.getByRole('button', { name: 'Tile player windows', exact: true }).click();
    await dashboard.getByRole('button', { name: 'Focus player', exact: true }).first().click();
    await dashboard.bringToFront();
    await dashboard.getByRole('button', { name: 'Next stage →', exact: true }).click();
    await poll(() => error ? Promise.reject(new Error(error)) : stage === 1 && !busy, 'Next stage control', 45000);
    await dashboard.getByRole('button', { name: 'Pause / manual control', exact: true }).click();
    assert.equal(playing, false);
    await dashboard.getByRole('button', { name: '▶ Play automatically', exact: true }).click();
    await poll(() => error ? Promise.reject(new Error(error)) : stage === 3 && !busy, 'Play control and complete browser flow', 90000);
    assert.equal(stage, 3);
    await dashboard.screenshot({ path: path.join(output, 'dashboard-complete.png') });
    await dashboard.getByRole('button', { name: 'End finished lobby', exact: true }).click();
    await poll(() => error ? Promise.reject(new Error(error)) : ended, 'End lobby control');
    await dashboard.getByRole('button', { name: 'Stop and close', exact: true }).click();
  } else if (process.env.VISUAL_MODE === 'auto') { void play().catch(recordFailure); }
  else note(process.env.VISUAL_MODE === 'manual' ? 'Manual control: interact with any player window. App timers continue normally.' : 'Press Next stage or Play in the control panel.');
  process.on('SIGINT', () => { stopped = true; playing = false; resolveStop(); });
  process.on('SIGTERM', () => { stopped = true; playing = false; resolveStop(); });
  await stopPromise;
} catch (e) {
  await recordFailure(e);
  process.exitCode = 1;
} finally {
  stopped = true; playing = false;
  clearInterval(statusTimer);
  await writeFile(path.join(output, 'report.json'), JSON.stringify(snapshot(), null, 2));
  await browser.close();
  panel.closeAllConnections();
  await new Promise(resolve => panel.close(resolve));
}
