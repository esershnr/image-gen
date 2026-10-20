#!/usr/bin/env python3
"""gen_image: generate an image with the Antigravity CLI (agy), move it to an output folder, print only its path.

Usage:  python gen_image.py "<prompt>" [--name stem] [--out dir] [--timeout 300] [--verbose]

Why it exists: agy's built-in image-generator subagent does not write to the path you ask for. It
drops the file under ~/.gemini/antigravity-cli/brain/<session>/ with a timestamped name, and the
one-shot -p mode can exit before the subagent finishes. This script covers both: it generates,
finds the new file (waiting with `agy -c -p` if needed) and MOVES it to the output folder.

Design: the prompt is passed to agy as an argument list (no shell); the destination is only the
output folder; files are never overwritten (-2, -3 suffix); agy's long output is not printed
(unless --verbose); no key is read, agy uses its own signed-in session. If a second agy
conversation is open, the `-c` fallback may attach to the wrong one, so new files are scanned first.

Output: one line, the moved file's path and size. On failure: "ERROR: ..." and exit code 1.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

BRAIN = Path(os.environ.get("AGY_BRAIN") or Path.home() / ".gemini" / "antigravity-cli" / "brain")
DEFAULT_OUT = Path(os.environ.get("GEN_OUT") or Path.home() / "generated-images")
EXT = {".png", ".jpg", ".jpeg", ".webp"}
FIRST_WAIT = 20  # seconds to wait for the file after the first call; otherwise `-c` is used to wait


def die(msg):
    print(f"ERROR: {msg}")
    sys.exit(1)


def snapshot():
    """Image files under brain: {path: mtime}. Only the root of each session folder (no recursion)."""
    found = {}
    if BRAIN.is_dir():
        for p in BRAIN.glob("*/*"):
            if p.is_file() and p.suffix.lower() in EXT:
                found[p] = p.stat().st_mtime
    return found


def run_agy(agy, prompt, cwd, timeout):
    try:
        r = subprocess.run(
            [agy, *prompt],
            cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=timeout,
        )
        return (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return "(agy timed out)"


def wait_new(before, seconds):
    """Wait for a new image; treat it as ready when its size is the same across two checks."""
    deadline = time.time() + seconds
    while True:
        new = [p for p in snapshot() if p not in before]
        if new:
            p = max(new, key=lambda x: x.stat().st_mtime)
            s1 = p.stat().st_size
            time.sleep(1.5)
            if p.exists() and p.stat().st_size == s1 and s1 > 0:
                return p
        if time.time() >= deadline:
            return None
        time.sleep(3)


def slug(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:60] or datetime.now().strftime("img-%Y%m%d-%H%M%S")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("prompt", help="image description (English usually works best)")
    ap.add_argument("--name", help="file stem (lowercase, dashes); a timestamp is used if omitted")
    ap.add_argument("--out", help=f"output folder (default: $GEN_OUT or {DEFAULT_OUT})")
    ap.add_argument("--timeout", type=int, default=300, help="upper time limit for agy in seconds (default 300)")
    ap.add_argument("--verbose", action="store_true", help="also print agy's output")
    a = ap.parse_args()

    agy = shutil.which("agy")
    if not agy:
        die("agy not found on PATH")

    out_dir = Path(a.out).expanduser() if a.out else DEFAULT_OUT
    before = snapshot()
    cwd = tempfile.mkdtemp(prefix="gen-image-")
    instruction = (
        "Use your image-generator subagent to generate exactly one image for the prompt below. "
        "Do not write any other files and do not run other commands. Prompt: " + a.prompt
    )
    t0 = time.time()
    out = run_agy(agy, ["-p", instruction, "--print-timeout", f"{a.timeout}s"], cwd, a.timeout + 30)
    src = wait_new(before, FIRST_WAIT)
    if src is None:
        left = max(30, a.timeout - int(time.time() - t0))
        out += "\n" + run_agy(
            agy,
            ["-c", "-p", "Wait for the image-generator subagent to finish. Do nothing else. Reply with one short line.",
             "--print-timeout", f"{left}s"],
            cwd, left + 30,
        )
        src = wait_new(before, 30)
    shutil.rmtree(cwd, ignore_errors=True)
    if a.verbose:
        print(out.strip())
    if src is None:
        if "quota" in out.lower():
            die("agy image quota looks exhausted. Try again after it resets; do not retry in a loop (it wastes quota).")
        tail = " ".join(out.split())[-300:]
        die(f"no image found. End of agy output: {tail}")

    out_dir.mkdir(parents=True, exist_ok=True)
    stem = slug(a.name) if a.name else slug("")
    dest = out_dir / f"{stem}{src.suffix.lower()}"
    n = 2
    while dest.exists():
        dest = out_dir / f"{stem}-{n}{src.suffix.lower()}"
        n += 1
    shutil.move(str(src), str(dest))
    print(f"{dest} ({dest.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    main()
