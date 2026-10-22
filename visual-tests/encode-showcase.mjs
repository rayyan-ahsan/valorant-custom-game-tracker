import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const recordingDir = path.resolve(process.argv[2]);
const recording = JSON.parse(await readFile(path.join(recordingDir, 'recording.json'), 'utf8'));
const require = createRequire(path.resolve('.visual-runs/video-tools/package.json'));
const ffmpeg = require('ffmpeg-static');
if (recording.frames.length < 2) throw new Error('Recording has too few frames');
const destination = path.resolve('.visual-runs/portfolio');
await mkdir(destination, { recursive: true });
await copyFile(path.join(process.env.WINDIR || 'C:/Windows', 'Fonts/arial.ttf'), path.join(recordingDir, 'font.ttf'));
const frames = recording.frames;
const fps = recording.fps || 30;
const frameDuration = 1 / fps;
const duration = frames.at(-1).at + frameDuration;
await writeFile(path.join(recordingDir, 'frames.txt'), frames.map((frame, i) =>
  `file '${frame.file}'\noption framerate ${fps}\nduration ${i + 1 < frames.length ? frames[i + 1].at - frame.at : frameDuration}\n`
).join('') + `file '${frames.at(-1).file}'\n`);
const filters = ['pad=1280:900:0:0:color=0x10141c'];
for (const [i, chapter] of recording.chapters.entries()) {
  await writeFile(path.join(recordingDir, `title-${i}.txt`), chapter.title);
  await writeFile(path.join(recordingDir, `detail-${i}.txt`), chapter.detail);
  const until = recording.chapters[i + 1]?.at ?? duration;
  const enable = `enable='gte(t,${chapter.at})*lt(t,${until})'`;
  filters.push(`drawtext=fontfile=font.ttf:textfile=title-${i}.txt:fontcolor=0xff5b69:fontsize=28:x=32:y=816:${enable}`);
  filters.push(`drawtext=fontfile=font.ttf:textfile=detail-${i}.txt:fontcolor=white:fontsize=19:x=32:y=857:${enable}`);
}
function encode(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: recordingDir, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Video encoder exited ${result.status}`);
}
const output = path.join(destination, 'valorant-tracker-demo.mp4');
encode(['-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-vf', filters.join(','), '-r', String(fps), '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', output]);
const ready = recording.chapters.find(chapter => chapter.title.includes('Ready to play'));
encode(['-ss', String((ready?.at ?? 0) + 2), '-i', output, '-frames:v', '1', path.join(destination, 'valorant-tracker-poster.png')]);
await writeFile(path.join(destination, 'README.txt'), `Valorant Custom Game Tracker\nPortfolio demonstration (${duration.toFixed(1)} seconds)\n\nRecorded from the real local application with ten isolated browser sessions.\nMap names and locally bundled artwork reflect the project at recording time.\nSilent MP4, 1280 x 900, H.264, ${fps} fps.\n\nRe-record:\npowershell -ExecutionPolicy Bypass -File scripts/record-showcase.ps1\n`);
console.log(`Created ${output} (${duration.toFixed(1)} seconds)`);
