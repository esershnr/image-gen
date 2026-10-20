# image-gen

A Claude Code skill that generates images from a text prompt, **with no API key**. It uses your own
Google account, so you need a **Google account with Gemini access** (signed in once). Quota and image
limits come from that account, not from your Claude tokens.

It returns a single line (file path and size), so the agent's context stays cheap.

## Requirements

- A Google account with access to Gemini image generation (required).
- **Web route (recommended):** Node.js 18+, and Microsoft Edge, Google Chrome or Chromium.
- **CLI route (fallback):** Python 3.8+ (standard library only) and the
  Antigravity CLI `agy` on your `PATH`, already signed in.

## Install

Copy the `image-gen` folder into your skills directory:

```bash
# all projects
cp -r image-gen ~/.claude/skills/image-gen
# or one project
cp -r image-gen <your-project>/.claude/skills/image-gen
```

Then install the one dependency (`playwright-core`, no browser download) and sign in once:

```bash
cd ~/.claude/skills/image-gen
npm install
node scripts/gen_image_web.mjs --login
```

`--login` opens a normal browser window with a dedicated profile. Sign in to Gemini yourself, wait
for the chat screen, then close the window. The skill never asks for or types your password.

## Use

Ask Claude in plain language, for example:

- "Generate a flat illustration of a lighthouse at dusk for my blog cover."
- "Make an icon of a paper plane, plain white background, no text."

Claude loads the skill, runs the script and gives you the saved file's path. You can also run it directly:

```bash
node scripts/gen_image_web.mjs "flat minimal illustration of a lighthouse at dusk, plain cream background, no text" --name lighthouse
python scripts/gen_image.py "..." --name lighthouse        # CLI route
```

Images are saved to `~/generated-images` by default and are never overwritten (`-2`, `-3` is added).

| Option | Applies to | Meaning |
| --- | --- | --- |
| `--name <stem>` | both | file name without extension |
| `--out <dir>` | both | output folder (or env `GEN_OUT`) |
| `--timeout <sec>` | web (default 120), CLI (default 300) | upper time limit |
| `--show` | web | visible browser window, for debugging |
| `--keep` | web | leave the browser open |
| `--debug` | web | save a screenshot of the page on failure |
| `--verbose` | CLI | also print `agy` output |

Environment overrides: `GEN_OUT`, `GEN_BROWSER` (browser executable), `GEN_PROFILE` (profile folder),
`GEN_PORT` (debug port, default 9333), `AGY_BRAIN` (CLI scratch folder).

## Prompt tips

- Write in English: subject, style, composition, background, constraints.
- Add `no text`, but do not rely on it; models still produce garbled lettering when the scene has signs or paper.
- Aspect ratio is model-dependent. Ask for `square 1:1` or `wide 16:9 composition` and check the size.
- The web route typically returns about 2752x1536; the CLI route about 1024x1024 or 1376x768.

## Troubleshooting

| Message | Fix |
| --- | --- |
| `ERROR: not signed in` | Run `node scripts/gen_image_web.mjs --login` again. |
| `ERROR: Gemini showed a quota/error message` | Quota is used up. Wait for it to reset, or use the CLI route. |
| `ERROR: chat box not found` | The Gemini page layout changed. Try `--show --debug` and open an issue. |
| `ERROR: browser debug port did not open` | Close any other window using the same profile. |
| `ERROR: playwright-core not found` | Run `npm install` in the skill folder. |
| `ERROR: no DISPLAY and Xvfb could not start` | Linux only: install `xvfb` or run in a desktop session. |

On Windows and macOS the web route runs headless (no window, no focus stolen). On Linux it uses a
visible browser, with a virtual screen (Xvfb) if there is no display, because Google treats headless
Chromium as signed out.

## Privacy, terms and safety

- **Your prompt is sent to Google.** Do not put secrets, tokens or personal data in it.
- The dedicated browser profile (`~/.config/gen-image/...`) holds a signed-in Google session. Do not
  commit, share or back it up. The scripts never read or print cookies.
- **The web route automates a consumer web interface.** That may be against the service's terms and
  can break whenever the page changes. Use it with your own account, at your own risk. The CLI route
  uses an official tool.
- Generated images carry provenance metadata (C2PA/SynthID-style markers). Check the service's current
  terms before commercial use, and disclose AI origin when publishing.

## License

MIT, see [LICENSE](LICENSE).
