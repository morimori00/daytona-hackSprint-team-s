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
        git \
        curl \
        xz-utils \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node from upstream, not apt: bookworm ships 18, and Next.js 16 refuses to
# start on anything below 20.9. Targets are linux/amd64.
ENV NODE_VERSION=20.18.1
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
    && rm /tmp/node.tar.xz \
    && node --version && npm --version

# The target app's dependencies, installed at build time so a run doesn't spend
# minutes on `npm ci`. The runner symlinks this into the cloned repo, which is
# only sound while the lockfile here matches the one in that repo -- refresh both
# together.
COPY crm-package.json /opt/app-deps/package.json
COPY crm-package-lock.json /opt/app-deps/package-lock.json
RUN cd /opt/app-deps && npm ci --no-audit --no-fund --loglevel=error

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
    && node --version && test -d /opt/app-deps/node_modules && python -c "import browser_use, imageio_ffmpeg; print('browser-use + video deps OK')"

CMD ["sleep", "infinity"]
