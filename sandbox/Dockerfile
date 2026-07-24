# Snapshot image for the reproduction sandbox.
#
# Everything slow is baked in here so a run spends its seconds reproducing the
# bug, not installing tooling. Cold start is the difference between a demo that
# lands and one where the judges watch a progress bar.
#
# Build it as a Daytona snapshot:
#   daytona snapshot create repro-sandbox -f sandbox/Dockerfile --cpu 2 --memory 4 --disk 5
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # browser-use cannot resolve its default Chromium channel, so point it at
    # the binary explicitly. reproduce.py reads this.
    BROWSER_PATH=/usr/bin/chromium

# chromium pulls its own shared-library dependencies, which is most of why this
# layer is worth baking rather than installing per run. nodejs/npm are here to
# start the target app.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        nodejs \
        npm \
        git \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pinned deliberately. The [video] extra is load-bearing: without it the
# recording watchdog logs a warning and silently produces no file at all.
COPY requirements.txt /opt/repro/requirements.txt
RUN pip install --no-cache-dir -r /opt/repro/requirements.txt

# The runner itself. Baked in so a run doesn't have to upload it.
COPY reproduce.py /opt/repro/reproduce.py

WORKDIR /workspace

# Fail the build rather than a demo: prove the browser and the video deps are
# actually present in the image.
RUN chromium --version \
    && python -c "import browser_use, imageio_ffmpeg; print('browser-use + video deps OK')"

CMD ["sleep", "infinity"]
