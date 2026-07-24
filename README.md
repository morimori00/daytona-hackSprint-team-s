# Preview Dog 🐕

**Label an issue or pull request. Get a video back proving what actually happens.**

Add the `Reproducibility` label to a GitHub thread. A sandbox spins up, clones
the exact commit, boots the app, and drives a real browser through what the
report describes — recording the whole time. The video is posted back to the
same thread.

On an **issue**, it reaches a verdict:

```
## ✅ Reproduced

**After clicking Delete on "Walk the dog", "Buy milk" disappeared instead.**

![Recording of the reproduced bug](…/run.gif)

<details><summary>Steps replayed (4)</summary> … </details>

`commit 8f26e8b · 27s · seed-app@main`
```

On a **pull request**, it demonstrates the change instead:

```
## 🎬 Preview

**Clicking any of the three dashboard KPI cards opens a detail modal showing
month-over-month movement against previous values.**

<details><summary>Steps demonstrated (19)</summary> … </details>
```

A preview deliberately has no ✅/❌. The agent's output schema has no
`reproduced` field at all — giving it one would invite it to grade a change it
was only asked to demonstrate.

## Why

Support and QA file bugs that engineers can't reproduce. The description is
missing a step, an environment detail, a precondition. So the first hour of
every bug fix is spent trying to see the bug at all.

The same gap runs the other way: a pull request claims a feature, and the
reviewer still has to check out the branch, install it, and click around before
they can believe it.

Preview Dog does that part for you, and leaves the proof in the thread where the
next person will find it.

## How it works

```
labeled ──▶ webhook ──▶ worker ──▶ sandbox ──▶ recording ──▶ comment
            verify       post      clone,       GIF          edited
            HMAC        "🔄…"     boot, drive  < 10MB       in place
```

The comment is posted once and then edited, so a run produces one notification,
not four. The sandbox is always destroyed in a `finally` — a leaked one burns
quota mid-demo.

A pull request pins its own commit and is cloned from its **head** repo, which
for a fork is the only one that has it. An issue isn't pinned to anything, so it
gets whatever the default branch is right now.

## Running it

```bash
npm install
cp .env.example .env.local     # GITHUB_TOKEN + an LLM key at minimum
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

Rehearse a pull request walkthrough the same way:

```bash
npm run repro:local -- --mode preview --issue-file examples/pull-request.md
```

To run it in a real sandbox instead, build the snapshot once:

```bash
npm run snapshot                # Chromium + Node 20 + browser-use[video]
npm run repro:daytona -- --issue-file examples/issue.md
```

The sandbox clones the repo, so it can only run against a commit that is already
pushed — it tests `HEAD` by default, `--sha` to pick another.

To take webhooks and serve the dashboard:

```bash
npm run dev                    # control plane on :3000
ngrok http 3000                # point the repo webhook at /api/webhook
```

Then label an issue or a PR in the repo whose webhook points here.

## The dashboard

`/` is the landing page, `/dashboard` is the product: every run, the
reproduction rate, median wall clock, and the repositories covered. Each row
links to its recording.

History is append-only JSONL written by the worker. Recording a run is a side
effect and never a precondition — a dashboard that can't be written must not
cost anyone their result. Nothing is seeded with invented data; if you want the
history that already exists in your GitHub threads:

```bash
bun run scripts/backfill-runs.ts owner/repo#1 owner/repo#2
```

The dashboard also has a CopilotKit assistant that answers questions about run
history, and is told to answer only from it.

**WorkOS is optional.** Configured, AuthKit gates the dashboard. Unconfigured,
the page renders and says plainly that it's signed out rather than inventing a
user.

## Supporting another repository

The runner keeps a small table of how to stand each repo up — directory, start
command, port, health path, and whether to reuse the `node_modules` baked into
the snapshot. See `APPS` in `worker/runners/daytona.ts`. A committed
`.reproducibility.yml` is the real answer; this is the same idea with the
manifest on our side, so a target repo needs nothing added to it.

## Layout

| Path | What it is |
|---|---|
| `app/page.tsx` | Landing page |
| `app/dashboard/` | Run history and stats |
| `app/api/webhook/` | Verifies the signature, dedups, returns 200 fast |
| `app/api/copilotkit/` | Assistant runtime, pointed at Fireworks |
| `worker/job.ts` | Orchestrates one run start to finish |
| `worker/comment.ts` | Renders the comment (6 states) |
| `worker/runs.ts` | Run history store |
| `worker/runners/` | `local` runs here, `daytona` runs in a sandbox |
| `sandbox/reproduce.py` | Drives the browser, returns a verdict or a walkthrough |
| `sandbox/Dockerfile` | The snapshot image; everything slow is baked here |
| `sandbox/create_snapshot.py` | Builds that snapshot on Daytona (no local Docker) |
| `seed-app/` | The deliberately buggy demo target |
| `DEMO-SCRIPT.md` | Two-minute walkthrough script |

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
  and `kill()` both produce a valid file, a killed process does not. The same
  applies in the sandbox: a timeout there salvages whatever was written rather
  than throwing away the recording.
- **The artifact branch must be public.** GitHub embeds `raw.githubusercontent.com`
  directly and tags it `data-animated-image` so the GIF animates, but it fetches
  anonymously — on a private repo the image 404s for everyone.
- **The token never enters the sandbox.** Repo code runs in there; artifacts are
  pulled out and published from the control plane.
- **The snapshot is built server-side.** No local Docker daemon and no Daytona
  CLI — `Image.from_dockerfile` walks the `COPY` directives and ships those
  files as the build context.
- **Start the app in a session, not a command.** `executeCommand` blocks until
  the process exits, so a server started that way hangs the run until timeout.
- **Poll health from inside the sandbox.** `127.0.0.1` there is not `127.0.0.1`
  here, so the wait loop is a shell command in the box, not a fetch from the
  control plane. Poll the real entry route, not `/` — a dev server compiles per
  route, and a redirect warms the wrong one.
- **Copy baked `node_modules`, don't symlink them.** Turbopack resolves badly
  through a link pointing outside the project root; the app never answered at
  all until this became a `cp -a`.
- **`VAR=x cmd` doesn't work when `cmd` reads `$VAR`.** The shell expands the
  line before the assignment lands. Use `export` on its own.
- **Don't forward `BROWSER_PATH` into the sandbox.** The image already sets it
  to `/usr/bin/chromium`; this machine's value points at a macOS binary.
- **`CopilotRuntime` with no agents isn't empty.** It quietly gives you a
  BuiltInAgent on an OpenAI model, and `/api/copilotkit` reports healthy either
  way. Declare the agent explicitly.
- **Next middleware matches `/public` too.** Excluding only `_next` left the
  landing page's own hero video redirecting to a login.

## Status

| | |
|---|---|
| Recording pipeline | proven (`spikes/01-recording`) |
| Comment rendering | done, tested |
| Webhook + dedup | done, tested |
| Local runner | done — full reproduction in ~27s |
| Reproduction accuracy | real bug → reproduced; control bug → not reproduced |
| Daytona runner | done — issue verdicts and PR previews, both live |
| Second repository | done — Next.js 16 CRM, 98 dependencies |
| Dashboard + history | done |
| CopilotKit assistant | done — answers from run history via Fireworks |
| WorkOS auth | wired; sign-in flow not yet exercised end to end |
