"""Build the reproduction sandbox snapshot on Daytona.

The image is built server-side from sandbox/Dockerfile, so this needs neither a
local Docker daemon nor the Daytona CLI -- just DAYTONA_API_KEY in .env.local.

    sandbox/.venv/bin/python sandbox/create_snapshot.py

Re-running with an unchanged name is a no-op unless --replace is passed.
"""

import argparse
import sys
from pathlib import Path

from daytona import (
    CreateSnapshotParams,
    Daytona,
    DaytonaConflictError,
    DaytonaError,
    Image,
    Resources,
)
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
DOCKERFILE = REPO_ROOT / "sandbox" / "Dockerfile"
SNAPSHOT_NAME = "repro-sandbox"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default=SNAPSHOT_NAME)
    parser.add_argument(
        "--replace",
        action="store_true",
        help="delete an existing snapshot of the same name first",
    )
    args = parser.parse_args()

    # The key lives in .env.local; the SDK reads DAYTONA_API_KEY from the env.
    load_dotenv(REPO_ROOT / ".env.local")

    daytona = Daytona()

    if args.replace:
        try:
            daytona.snapshot.delete(daytona.snapshot.get(args.name))
            print(f"deleted existing snapshot {args.name!r}")
        except DaytonaError:
            pass  # nothing to replace

    # from_dockerfile walks the COPY directives and ships those files as the
    # build context, which is how requirements.txt and reproduce.py get in.
    image = Image.from_dockerfile(DOCKERFILE)

    params = CreateSnapshotParams(
        name=args.name,
        image=image,
        # Matches the sizing the runner asks for when it creates a sandbox.
        resources=Resources(cpu=2, memory=4, disk=5),
    )

    print(f"building snapshot {args.name!r} from {DOCKERFILE.relative_to(REPO_ROOT)}...")
    try:
        snapshot = daytona.snapshot.create(
            params,
            on_logs=lambda chunk: print(chunk, end=""),
            timeout=0,  # image builds are slow; let it run
        )
    except DaytonaConflictError:
        print(
            f"\nsnapshot {args.name!r} already exists -- pass --replace to rebuild it",
            file=sys.stderr,
        )
        return 1

    print(f"\nsnapshot ready: {snapshot.name} (state={snapshot.state})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
