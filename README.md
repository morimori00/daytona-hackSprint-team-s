# Reproducibility is all you need

Label a GitHub issue `Reproducibility`. A sandbox spins up, replays the reported
steps in a real browser, records the attempt, and posts the video back as a
comment with a verdict.

```
## ✅ Reproduced

**Deleting "Walk the dog" removed "Buy milk" instead.**

![Recording of the reproduced bug](…/run.gif)

<details><summary>Steps replayed (3)</summary> … </details>

`commit a86aa7d · 2m18s · seed-app@main`
```

## Why

Support and QA file bugs that engineers can't reproduce. The description is
missing a step, an environment detail, a precondition. So the first hour of
every bug fix is spent trying to see the bug at all. This does that part for
you, and leaves the proof in the issue where the next person will find it.

## How it works

```
issue labeled ──▶ webhook ──▶ worker ──▶ sandbox ──▶ recording ──▶ comment
                  verify        post      replay      GIF          edited
                  HMAC        "🔄…"      steps      < 10MB       in place
```

The comment is posted once and then edited, so a run produces one notification,
not four.

## Running it

```bash
npm install
cp .env.example .env.local     # fill in GITHUB_TOKEN + an LLM key
```

Rehearse a full reproduction locally, no GitHub or Daytona required:

```bash
npm run repro:local -- --issue-file examples/issue.md
```

That boots the seed app, runs the agent against it, records the attempt, and
prints the exact comment that would be posted. Takes about 27 seconds.

Then run the control case, which describes a bug that does not exist:

```bash
npm run repro:local -- --issue-file examples/issue-false-positive.md
```

It must report **Not reproduced**. If it ever reports the opposite, the agent is
echoing the issue text instead of reading the page, and no verdict can be
trusted. Run both before demoing.

To take webhooks:

```bash
npm run dev                    # control plane on :3000
ngrok http 3000                # point the repo webhook at /api/webhook
```

## Layout

| Path | What it is |
|---|---|
| `app/api/webhook/` | Verifies the signature, dedups, returns 200 fast |
| `worker/job.ts` | Orchestrates one run start to finish |
| `worker/comment.ts` | Renders the comment (4 states) |
| `worker/runners/` | `local` runs here, `daytona` runs in a sandbox |
| `sandbox/reproduce.py` | Drives the browser and returns the verdict |
| `seed-app/` | The deliberately buggy demo target |
| `spikes/01-recording/` | Proof the recording pipeline produces valid mp4 |

## Notes from building it

- **`browser-use[video]` is not optional.** Without the extra, recording logs a
  warning and silently produces nothing.
- **glm-5p2 is text-only.** Vision must be off or every step dies on
  `400 This model does not support image inputs`. It also reasons before
  answering, so `max_completion_tokens` needs headroom (8192) or replies
  truncate mid-word.
- **Turn the built-in judge off with a text-only model.** It critiques
  screenshots; with vision off it can never pass, so it only burns a round-trip.
  `REPRO_USE_JUDGE=1` brings it back for debugging.
- **Never SIGKILL a run.** The recorder flushes on browser shutdown; `stop()`
  and `kill()` both produce a valid file, a killed process does not.
- **The artifact branch must be public.** GitHub embeds `raw.githubusercontent.com`
  directly and tags it `data-animated-image` so the GIF animates, but it fetches
  anonymously — on a private repo the image 404s for everyone.
- **The token never enters the sandbox.** Repo code runs in there; artifacts are
  pulled out and published from the control plane.

## Status

| | |
|---|---|
| Recording pipeline | proven (`spikes/01-recording`) |
| Comment rendering | done, tested |
| GIF encoding | done, fits budget |
| Webhook + dedup | done, tested |
| Local runner | done — full reproduction in ~27s |
| Reproduction accuracy | real bug → reproduced; control bug → not reproduced |
| GitHub publish + comment | verified live on issue #1 |
| Daytona runner | not wired yet |
