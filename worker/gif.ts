/**
 * mp4 -> GIF.
 *
 * GitHub renders the GIF inline in an issue comment, which is the whole
 * delivery mechanism, so this has to land under GitHub's ~10MB image budget
 * while staying legible. Two-pass palette (palettegen/paletteuse) because a
 * single-pass GIF of a UI recording bands badly and looks broken.
 */

import { spawn } from 'node:child_process';
import { stat, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface GifOptions {
  fps?: number;
  /** Output width in px; height follows aspect ratio. */
  width?: number;
  /** Hard ceiling. We retry smaller rather than post something GitHub drops. */
  maxBytes?: number;
}

const DEFAULTS = { fps: 8, width: 960, maxBytes: 9.5 * 1024 * 1024 };

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

async function encode(
  input: string,
  output: string,
  fps: number,
  width: number,
): Promise<number> {
  const palette = join(dirname(output), `.palette-${Date.now()}.png`);
  const filters = `fps=${fps},scale=${width}:-1:flags=lanczos`;

  try {
    await run('ffmpeg', ['-y', '-i', input, '-vf', `${filters},palettegen=stats_mode=diff`, palette]);
    await run('ffmpeg', [
      '-y',
      '-i', input,
      '-i', palette,
      '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`,
      output,
    ]);
  } finally {
    await unlink(palette).catch(() => {});
  }

  return (await stat(output)).size;
}

/**
 * Encode, and if it blows the budget, step down until it fits. Returns the
 * final size in bytes.
 */
export async function mp4ToGif(
  input: string,
  output: string,
  options: GifOptions = {},
): Promise<{ bytes: number; fps: number; width: number }> {
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const ladder: Array<{ fps: number; width: number }> = [
    { fps: options.fps ?? DEFAULTS.fps, width: options.width ?? DEFAULTS.width },
    { fps: 6, width: 800 },
    { fps: 5, width: 640 },
    { fps: 4, width: 480 },
  ];

  let last = 0;
  for (const step of ladder) {
    last = await encode(input, output, step.fps, step.width);
    if (last <= maxBytes) return { bytes: last, ...step };
    console.warn(
      `[gif] ${(last / 1e6).toFixed(1)}MB exceeds budget at ${step.width}px/${step.fps}fps, stepping down`,
    );
  }

  // Still too big: the caller posts an mp4 link instead of an inline image.
  return { bytes: last, ...ladder[ladder.length - 1] };
}
