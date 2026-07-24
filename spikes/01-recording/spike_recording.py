"""T1a spike: does browser-use produce a valid mp4 on a fresh session?

This is the make-or-break for the whole project. It deliberately does NOT run an
LLM agent -- we only need to know whether the recording pipeline yields a real
video file. No LLM key, no Daytona, no spend.

It also answers a design question we had to guess at: does a hard kill destroy
the recording? Run with --kill to find out.

    python spike_recording.py          # graceful stop  (expected: valid mp4)
    python spike_recording.py --kill   # hard kill      (tests evidence loss)
"""

import asyncio
import os
import shutil
import subprocess
import sys
import threading
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

from browser_use.browser.profile import BrowserProfile
from browser_use.browser.session import BrowserSession

HERE = Path(__file__).parent
OUT_DIR = HERE / "recordings"

# browser-use defaults to a bundled Chromium channel it cannot always resolve.
# Point it at a real binary. In the Daytona sandbox this env var holds the
# installed chromium path; locally we fall back to system Chrome.
MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def find_browser() -> str | None:
    if env := os.environ.get("BROWSER_PATH"):
        return env
    for candidate in (MAC_CHROME, shutil.which("chromium"), shutil.which("google-chrome")):
        if candidate and Path(candidate).exists():
            return candidate
    return None

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Spike target</title>
<style>
  body { font-family: ui-sans-serif, system-ui; margin: 0; padding: 48px;
         background: #0f172a; color: #e2e8f0; }
  h1 { font-size: 44px; margin: 0 0 24px; }
  .box { padding: 32px; border: 2px solid #334155; border-radius: 8px; }
  #counter { font-size: 96px; font-weight: 700; color: #38bdf8; }
</style></head>
<body>
  <h1>Recording spike</h1>
  <div class="box">
    <p>Frames should capture this number changing:</p>
    <div id="counter">0</div>
  </div>
  <script>
    let n = 0;
    setInterval(() => { n++; document.getElementById('counter').textContent = n; }, 100);
  </script>
</body></html>
"""


def serve_page() -> tuple[HTTPServer, str]:
    """Serve a page whose content visibly changes, so frames differ."""
    root = HERE / "_page"
    root.mkdir(exist_ok=True)
    (root / "index.html").write_text(PAGE)

    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    handler.log_message = lambda *a, **k: None  # type: ignore[method-assign]
    httpd = HTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_port}/"


def probe(video: Path) -> str:
    """Report real duration/stream info, not just 'the file exists'."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return "(ffprobe not found; size check only)"
    out = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries",
         "format=duration,size:stream=codec_name,width,height,nb_frames",
         "-of", "default=noprint_wrappers=1", str(video)],
        capture_output=True, text=True,
    )
    return out.stdout.strip() or out.stderr.strip()


async def main(hard_kill: bool) -> int:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    httpd, url = serve_page()
    print(f"[spike] serving target at {url}")
    print(f"[spike] teardown mode: {'HARD KILL' if hard_kill else 'graceful stop'}")

    browser_path = find_browser()
    print(f"[spike] browser binary: {browser_path or '(browser-use default)'}")

    profile = BrowserProfile(
        headless=True,
        record_video_dir=OUT_DIR,
        record_video_framerate=10,
        **({"executable_path": browser_path} if browser_path else {}),
    )
    session = BrowserSession(browser_profile=profile)

    try:
        await session.start()
        print("[spike] session started")
        await session.navigate_to(url)
        print("[spike] navigated; capturing frames...")
        await asyncio.sleep(3)
        await session.navigate_to(url + "?second=1")
        await asyncio.sleep(2)
        print("[spike] done interacting")
    finally:
        if hard_kill:
            print("[spike] killing session (no graceful flush)")
            await session.kill()
        else:
            print("[spike] stopping session gracefully")
            await session.stop()
        httpd.shutdown()

    # Give the recorder a beat to finish writing the container.
    await asyncio.sleep(1)

    videos = sorted(OUT_DIR.glob("*.mp4"))
    print(f"\n[spike] videos found: {len(videos)}")
    if not videos:
        print("RESULT: FAIL -- no video file produced")
        return 1

    ok = True
    for v in videos:
        size = v.stat().st_size
        print(f"  {v.name}  {size:,} bytes")
        print(f"  probe: {probe(v)}")
        if size < 1024:
            ok = False

    print(f"\nRESULT: {'PASS -- valid mp4 produced' if ok else 'FAIL -- file present but empty/invalid'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main("--kill" in sys.argv)))
