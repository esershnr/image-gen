#!/usr/bin/env node
// gen_image_web: generates an image in the Gemini web app (your own Google account), downloads it,
// saves it to the output folder and prints only the path, size and file weight.
// The session lives in a dedicated browser profile (PROFILE); you sign in once by hand.
//
//   node gen_image_web.mjs --login                       open the browser with the dedicated profile; sign in to Gemini, close the window
//   node gen_image_web.mjs "<prompt>" [--name stem] [--out dir] [--timeout 120] [--keep] [--show] [--debug]
//     default: headless on Windows/macOS (no window, no focus stolen); --show opens a visible window
//
// Design: never touches your everyday browser profile; cookies stay inside PROFILE and this script
// never reads or prints them. Sign-in is done WITHOUT automation flags (Google may refuse sign-in in
// an automated browser); generation launches the browser with a local-only remote-debugging port and attaches.
// playwright-core is resolved from the skill folder's node_modules (run `npm install` there), or from
// the package.json path in GEN_PW_FROM.
// Linux: headless Chromium is treated as signed out by Google, so a visible browser is used; with no
// DISPLAY a virtual screen (Xvfb) is started for it.
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PLATFORM = process.platform;
const LINUX = PLATFORM === 'linux';

const browserCandidates = () => {
  const pf = process.env.ProgramFiles || 'C:/Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  if (PLATFORM === 'win32') return [
    `${pf86}/Microsoft/Edge/Application/msedge.exe`, `${pf}/Microsoft/Edge/Application/msedge.exe`,
    `${pf}/Google/Chrome/Application/chrome.exe`, `${pf86}/Google/Chrome/Application/chrome.exe`,
    `${local}/Google/Chrome/Application/chrome.exe`,
  ];
  if (PLATFORM === 'darwin') return [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
};
const BROWSER = process.env.GEN_BROWSER || browserCandidates().find((p) => fs.existsSync(p)) || '';
const PROFILE = process.env.GEN_PROFILE || path.join(os.homedir(), '.config', 'gen-image', `${/edge/i.test(BROWSER) ? 'edge' : 'chromium'}-gemini`);
const PORT = Number(process.env.GEN_PORT) || 9333;
const URL = 'https://gemini.google.com/app';
const PW_FROM = process.env.GEN_PW_FROM || '';

const FLAGS = LINUX ? [
  ...(typeof process.getuid === 'function' && process.getuid() === 0 ? ['--no-sandbox'] : []), // containers running as root
  '--disable-dev-shm-usage', '--password-store=basic',
  '--disable-features=EnableBoundSessionCredentials,DeviceBoundSessions', // device-bound sessions drop the sign-in on keyring-less Linux
] : [];
const killTree = (pid) => PLATFORM === 'win32'
  ? spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
  : (() => { try { process.kill(pid, 'SIGKILL'); } catch {} })();

const die = (m) => { console.log(`ERROR: ${m}`); process.exit(1); };
const fail = (m) => { throw new Error(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, v && !v.startsWith('--') ? 2 : 1); return v && !v.startsWith('--') ? v : true; };
const login = flag('--login');
const name = flag('--name');
const outFlag = flag('--out');
const timeout = Number(flag('--timeout')) || 120;
const keep = flag('--keep');
const show = flag('--show');
const debug = flag('--debug');
const prompt = argv.filter((a) => !a.startsWith('--')).join(' ').trim();
const OUT = (typeof outFlag === 'string' && outFlag) || process.env.GEN_OUT || path.join(os.homedir(), 'generated-images');

if (!BROWSER || !fs.existsSync(BROWSER)) die('No Edge/Chrome/Chromium found. Install one or set GEN_BROWSER to its executable.');
fs.mkdirSync(PROFILE, { recursive: true });

const LOGIN_HINT = 'not signed in. Run once: node gen_image_web.mjs --login';

if (login) {
  // No automation flags: a plain browser with the dedicated profile. The user signs in and closes the window.
  const c = spawn(BROWSER, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', ...FLAGS, URL], { detached: true, stdio: 'ignore' });
  c.unref();
  console.log('Browser opened with the dedicated profile. Sign in to Gemini, wait for the chat screen, then close the window.');
  process.exit(0);
}
if (!prompt) die('no prompt. Usage: node gen_image_web.mjs "<prompt>" [--name stem] [--out dir]');

let chromium;
const resolvers = [import.meta.url, ...(PW_FROM ? [PW_FROM] : [])];
for (const from of resolvers) {
  try { chromium = createRequire(from)('playwright-core').chromium; break; } catch {}
}
if (!chromium) die('playwright-core not found. Run "npm install" in the skill folder (or set GEN_PW_FROM to a package.json that can resolve it).');

const cdpUp = async () => { try { return (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok; } catch { return false; } };

const headless = !show && !LINUX;
let xvfb = null;
const env = { ...process.env };
if (LINUX && !env.DISPLAY) {
  const num = 97;
  xvfb = spawn('Xvfb', [`:${num}`, '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  xvfb.on('error', () => {});
  for (let i = 0; i < 20 && !fs.existsSync(`/tmp/.X11-unix/X${num}`); i++) await sleep(250);
  if (!fs.existsSync(`/tmp/.X11-unix/X${num}`)) die('no DISPLAY and Xvfb could not start. Install Xvfb or run inside a desktop session.');
  env.DISPLAY = `:${num}`;
}
const stopXvfb = () => { if (xvfb && xvfb.pid) try { process.kill(xvfb.pid, 'SIGTERM'); } catch {} };

let child = null;
if (!(await cdpUp())) {
  child = spawn(BROWSER, [
    `--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1',
    '--no-first-run', '--no-default-browser-check', '--window-size=1920,1080', '--mute-audio', '--lang=en-US', ...FLAGS,
    ...(headless ? ['--headless=new', '--disable-gpu'] : []), 'about:blank',
  ], { stdio: 'ignore', env });
  // stay out of the way while you work: low priority (best effort; child processes mostly inherit it)
  try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
  for (let i = 0; i < 40 && !(await cdpUp()); i++) await sleep(500);
  if (!(await cdpUp())) { if (child.pid) killTree(child.pid); stopXvfb(); die('browser debug port did not open (another window using the same profile may be open; close it).'); }
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const started = Date.now();
let result = null;
let page = null;
try {
  const context = browser.contexts()[0] || await browser.newContext();
  page = await context.newPage();
  if (headless) {
    // headless browsers announce themselves as 'HeadlessChrome'; present as the ordinary browser
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    const ua = String(ver['User-Agent'] || '').replace('HeadlessChrome', 'Chrome');
    if (ua) { const c = await context.newCDPSession(page); await c.send('Network.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'en-US,en' }); }
  }
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const box = page.locator('[role="textbox"]').first();
  try { await box.waitFor({ timeout: 25000 }); }
  catch { fail(page.url().includes('accounts.google.com') || /sign in|oturum açın/i.test(await page.locator('body').innerText().catch(() => ''))
    ? LOGIN_HINT : 'chat box not found (the page layout may have changed).'); }
  // Gemini shows a chat box even when signed out, but will not generate images; do not wait for nothing.
  if (await page.getByRole('link', { name: /^(sign in|oturum aç)$/i }).or(page.getByRole('button', { name: /^(sign in|oturum aç)$/i })).first().isVisible().catch(() => false))
    fail(LOGIN_HINT);

  const p = /^generate an image/i.test(prompt) ? prompt : `Generate an image: ${prompt}`;
  await box.click();
  await page.keyboard.insertText(p);
  await page.keyboard.press('Enter');

  const dlBtn = page.getByRole('button', { name: /download full.?size|tam boyutlu resmi indir/i }).first();
  const errRx = /quota|kota|too many requests|try again|tekrar dene/i;
  let ready = false;
  while (Date.now() - started < timeout * 1000) {
    if (await dlBtn.isVisible().catch(() => false)) { ready = true; break; }
    const body = await page.locator('body').innerText().catch(() => '');
    if (errRx.test(body.slice(-1500))) fail('Gemini showed a quota/error message. Try again later.');
    await sleep(2000);
  }
  if (!ready) fail(`no image after ${timeout} s.`);

  const tmp = path.join(os.tmpdir(), `gen-web-${Date.now()}.jpg`);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), dlBtn.click()]);
  await dl.saveAs(tmp);

  fs.mkdirSync(OUT, { recursive: true });
  const stem = (name && String(name) !== 'true' ? String(name) : `web-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'web-img';
  let dest = path.join(OUT, `${stem}.jpg`);
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(OUT, `${stem}-${n}.jpg`);
  fs.copyFileSync(tmp, dest); fs.unlinkSync(tmp);

  // dimensions from the JPEG header
  const d = fs.readFileSync(dest); let w = 0, h = 0;
  for (let i = 2; i < d.length;) {
    if (d[i] !== 0xFF) { i++; continue; }
    const m = d[i + 1];
    if (m >= 0xC0 && m <= 0xC2) { h = d.readUInt16BE(i + 5); w = d.readUInt16BE(i + 7); break; }
    i += 2 + d.readUInt16BE(i + 2);
  }
  result = `${PLATFORM === 'win32' ? dest.replace(/\//g, '\\') : dest} (${w}x${h}, ${Math.round(d.length / 1024)} KB)`;
  await page.close().catch(() => {});
} catch (e) {
  console.log(`ERROR: ${e.message}`); process.exitCode = 1;
  // --debug: screenshot of the failing page (it may show your account name; the file stays local).
  if (debug && page) {
    const shot = path.join(OUT, 'gen-image-error.png');
    try { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: shot }); console.log(`Screenshot: ${shot} (${page.url()})`); } catch {}
  }
} finally {
  if (!keep) {
    try { const s = await browser.newBrowserCDPSession(); await s.send('Browser.close'); } catch {}
    // a clean exit flushes cookies to disk (Google refreshes the session); wait up to 8 s, then force
    if (child && child.pid) {
      for (let i = 0; i < 32 && child.exitCode === null && child.signalCode === null; i++) await sleep(250);
      if (child.exitCode === null && child.signalCode === null) killTree(child.pid);
    }
  } else { await browser.close().catch(() => {}); }
  stopXvfb();
}
if (result) console.log(result);
