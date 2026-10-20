---
name: image-gen
description: Generate images (blog covers, illustrations, icons, social card backgrounds, mockups) from a text prompt with no API key. Requires a Google account with Gemini access (signed in once). Drives the Gemini web app through a dedicated headless browser profile, or the Antigravity CLI (`agy`), then saves the file locally and prints only its path and size. Use when the user asks to generate, draw or make an image, picture, cover, illustration, icon or mockup, even if they never name the skill.
---

# Image Gen

Generates one image per call and saves it locally. No API key: it uses the user's own Google
session, so the quota belongs to their account, not to the agent's tokens. Output is a single
line (path + size), which keeps the agent's context cheap. Open the image only if the user asks
for a quality check.

## Setup (once)

- **Web route (recommended):** Node 18+, Microsoft Edge or Google Chrome, then in the skill folder:
  `npm install` (installs `playwright-core`; no browser download).
  Log in once: `node scripts/gen_image_web.mjs --login`. A normal browser window opens with a
  dedicated profile; the user signs in to Gemini themselves and closes the window. Never ask
  for or type their password.
- **CLI route (fallback):** Python 3.8+ (stdlib only) and the Antigravity CLI `agy` on `PATH`,
  already signed in (run `agy` once in a terminal).

## Which route

1. **Web script first:**
   ```
   node scripts/gen_image_web.mjs "<prompt>" --name <short-name>
   ```
   About 25 s, typically 2752x1536 output, separate quota from the CLI.
   Prints `path (WxH, N KB)`. On `ERROR: not signed in`, ask the user to run `--login`.
   On a quota error, fall back to the CLI route.
2. **CLI route:**
   ```
   python scripts/gen_image.py "<prompt>" --name <short-name>
   ```
   About 1024x1024 or 1376x768. Prints `path (N KB)`. Retry once with `--verbose` on failure,
   then report the cause briefly instead of looping.

Options (both scripts): `--name` file stem, `--out <dir>` output folder.
Web only: `--timeout <sec>` (default 120), `--show` visible window for debugging, `--keep` leave
the browser open, `--debug` save a screenshot on failure. Environment overrides: `GEN_OUT`
(output dir, default `~/generated-images`), `GEN_BROWSER` (browser executable), `GEN_PROFILE`
(profile dir), `GEN_PORT` (debug port, default 9333), `AGY_BRAIN` (CLI route's scratch dir).

Files are never overwritten (`-2`, `-3` suffix is added). The web script runs headless on
Windows and macOS, so no window appears and focus is not stolen. On Linux it needs a display
or `Xvfb` (Google treats headless Chromium as signed out).

## Writing a good prompt

- Write in English: subject, style, composition, background, constraints. Example:
  `flat minimal illustration of a lighthouse at dusk, plain cream background, no text, no watermark`.
- Say `no text`, but do not rely on it: models still produce fake or garbled lettering when the
  scene has signs, boards, paper or boxes. Add real text afterwards in an editor.
- **Aspect ratio is model-dependent, not guaranteed.** Ask with `square 1:1 composition` or
  `wide 16:9 composition` and check the output size. Writing "1920x1080" in the prompt does not
  set the pixel count. For an exact size, crop/resize afterwards.
- Small details (edges, fine hardware, hands) can be inconsistent. Look closely before calling
  a result flawless.
- Quota is limited. Build the prompt carefully, do not trial-and-error, ask before generating
  many images, and never loop the same failing command.

## Privacy, terms and safety

- **The prompt goes to Google.** Never put secrets, tokens, personal data or internal
  network details in it.
- **The browser profile holds a signed-in Google session** (default
  `~/.config/gen-image/<browser>-gemini`). Do not read it, back it up, commit it or share it.
  The scripts never read or print cookies.
- **The web route automates a consumer web UI.** That may be against the service's terms, and
  it can break whenever the page changes. Use it with your own account and at your own risk.
  The CLI route uses an official tool.
- Generated files carry provenance metadata (C2PA/SynthID-style markers). Check the service's
  current terms before commercial use, and mention the AI origin when publishing.
- Output is written only inside the output folder; nothing else on disk is touched.
