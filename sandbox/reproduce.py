"""Reproduction runner. This is the process that executes inside the sandbox.

Given an issue's reproduction steps and a running target app, it drives a real
browser, records the whole attempt to video, and returns a verdict.

Everything it emits is English -- the comment this feeds is read by a global
audience.

    python reproduce.py --config job.json

`job.json`:
    {
      "issue_title": "Deleting a task removes the wrong one",
      "issue_body":  "1. Open the app\n2. Click Delete on 'Walk the dog'\n...",
      "base_url":    "http://127.0.0.1:3100",
      "output_dir":  "/tmp/run-123"
    }

Writes `<output_dir>/result.json` and the recording alongside it.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from browser_use import Agent
from browser_use.browser.profile import BrowserProfile
from browser_use.browser.session import BrowserSession

# Recording only works when the `[video]` extra is present. Without it the
# watchdog logs a warning and silently produces nothing, which would leave us
# shipping a comment with no evidence -- so we fail loudly instead.
try:
    import imageio_ffmpeg  # noqa: F401
except ImportError:  # pragma: no cover
    sys.exit("FATAL: video deps missing. Install with: pip install 'browser-use[video]'")

MAX_STEPS = 25


class Verdict(BaseModel):
    """What the agent must return. Structured so the verdict never has to be
    parsed out of prose."""

    reproduced: bool = Field(
        description="True only if the problem described in the issue actually happened."
    )
    summary: str = Field(
        description=(
            "ONE plain-English sentence stating what happened and where. "
            "No preamble, no 'Great news!', no restating the issue title."
        )
    )
    steps: list[str] = Field(
        default_factory=list,
        description="Each step attempted, prefixed with 'OK: ' or 'FAILED: '.",
    )


FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1"
FIREWORKS_DEFAULT_MODEL = "accounts/fireworks/models/glm-5p2"


def build_llm() -> tuple[object, bool]:
    """Pick a provider from whichever key is present. Fireworks wins if set.

    Returns (llm, supports_vision). Vision matters: sending a screenshot to a
    text-only model fails every single step with a 400, and the run dies having
    done nothing.
    """
    if api_key := os.environ.get("FIREWORKS_API_KEY"):
        from browser_use.llm import ChatOpenAI

        # Fireworks speaks the OpenAI wire format, and glm-5p2 handles both
        # tool calls and json_schema responses, which is everything the agent
        # loop needs -- but it is TEXT ONLY. Verified against the live API:
        # any image input returns 400 "This model does not support image
        # inputs". The agent works from the DOM instead.
        llm = ChatOpenAI(
            model=os.environ.get("REPRO_MODEL", FIREWORKS_DEFAULT_MODEL),
            api_key=api_key,
            base_url=os.environ.get("FIREWORKS_BASE_URL", FIREWORKS_BASE_URL),
            # glm-5p2 is a reasoning model: it spends tokens on reasoning_content
            # before it emits anything usable, so a tight cap truncates the real
            # answer mid-word.
            max_completion_tokens=int(os.environ.get("REPRO_MAX_TOKENS", "8192")),
            temperature=0,
        )
        return llm, _env_flag("REPRO_USE_VISION", default=False)
    if os.environ.get("ANTHROPIC_API_KEY"):
        from browser_use.llm import ChatAnthropic

        llm = ChatAnthropic(model=os.environ.get("REPRO_MODEL", "claude-sonnet-4-5-20250929"))
        return llm, _env_flag("REPRO_USE_VISION", default=True)
    if os.environ.get("OPENAI_API_KEY"):
        from browser_use.llm import ChatOpenAI

        llm = ChatOpenAI(model=os.environ.get("REPRO_MODEL", "gpt-4.1"))
        return llm, _env_flag("REPRO_USE_VISION", default=True)
    sys.exit("FATAL: set FIREWORKS_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY)")


def _env_flag(name: str, *, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def find_browser() -> str | None:
    if env := os.environ.get("BROWSER_PATH"):
        return env
    for candidate in (
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        shutil.which("chromium"),
        shutil.which("google-chrome"),
    ):
        if candidate and Path(candidate).exists():
            return candidate
    return None


def build_task(issue_title: str, issue_body: str, base_url: str) -> str:
    return f"""You are reproducing a reported bug on a web app that is already running at {base_url}.

Do exactly what the report says, in order. Do not fix anything. Do not explore
beyond the steps. Your job is only to find out whether the reported problem
actually happens.

CRITICAL -- observe before you conclude:
After the action that is supposed to trigger the bug, you MUST re-read the page
and state what is actually on it now. Never infer the outcome from the fact that
you clicked something. Record the visible state before the action and after it,
and base your verdict on the difference you actually observed. If you did not
observe it, you did not reproduce it.

BUG REPORT
Title: {issue_title}

{issue_body}

When you are finished, report:
- reproduced: true only if you OBSERVED the reported problem happen
- summary: ONE sentence, plain English, saying what happened and at which step
- steps: what you attempted, each prefixed with "OK: " or "FAILED: ", and for the
  verification step state the before/after you actually saw

Write in English."""


async def run(config: dict) -> dict:
    output_dir = Path(config["output_dir"])
    output_dir.mkdir(parents=True, exist_ok=True)
    video_dir = output_dir / "video"
    video_dir.mkdir(exist_ok=True)

    browser_path = find_browser()
    print(f"[reproduce] browser: {browser_path or '(default)'}", flush=True)
    print(f"[reproduce] target:  {config['base_url']}", flush=True)

    profile = BrowserProfile(
        headless=True,
        record_video_dir=video_dir,
        record_video_framerate=int(os.environ.get("REPRO_FPS", "10")),
        **({"executable_path": browser_path} if browser_path else {}),
    )
    session = BrowserSession(browser_profile=profile)

    verdict: Verdict | None = None
    error: str | None = None

    try:
        await session.start()
        llm, use_vision = build_llm()
        print(f"[reproduce] vision: {'on' if use_vision else 'off (text-only model)'}", flush=True)
        # browser-use's judge critiques the trajectory from screenshots. With a
        # text-only model there are no screenshots, so it structurally always
        # returns FAIL -- an extra LLM round-trip per run that produces noise
        # rather than signal. Opt in with REPRO_USE_JUDGE=1 when debugging.
        use_judge = _env_flag("REPRO_USE_JUDGE", default=False)

        agent = Agent(
            task=build_task(config["issue_title"], config["issue_body"], config["base_url"]),
            llm=llm,
            browser_session=session,
            output_model_schema=Verdict,
            use_vision=use_vision,
            use_judge=use_judge,
        )
        history = await agent.run(max_steps=MAX_STEPS)
        raw = history.structured_output
        if isinstance(raw, Verdict):
            verdict = raw
        elif raw is not None:
            verdict = Verdict.model_validate(raw)
        else:
            error = "Agent finished without returning a verdict."
    except Exception as exc:  # noqa: BLE001 -- any failure still needs a comment
        error = f"{type(exc).__name__}: {exc}"
        print(f"[reproduce] ERROR {error}", flush=True)
    finally:
        # Both stop() and kill() flush the video (the watchdog listens on
        # BrowserStopEvent). Never SIGKILL this process on timeout or the
        # recording -- the entire point of the run -- is lost.
        try:
            await session.stop()
        except Exception:  # noqa: BLE001
            await session.kill()

    await asyncio.sleep(1)  # let the container finish writing

    videos = sorted(video_dir.glob("*.mp4"))
    result = {
        "state": "completed" if verdict else "error",
        "reproduced": verdict.reproduced if verdict else None,
        "summary": verdict.summary if verdict else (error or "The reproduction run failed."),
        "steps": verdict.steps if verdict else [],
        "video": str(videos[0]) if videos else None,
        "error": error,
    }
    (output_dir / "result.json").write_text(json.dumps(result, indent=2))
    print(f"[reproduce] result: {json.dumps(result, indent=2)}", flush=True)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to the job JSON.")
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text())
    result = asyncio.run(run(config))
    return 0 if result["state"] == "completed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
