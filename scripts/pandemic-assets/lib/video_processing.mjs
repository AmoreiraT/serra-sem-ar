import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }
      reject(new Error(`${command} falhou (${code}): ${stderr || stdout}`));
    });
  });

export const probeVideo = async (videoPath) => {
  const { stdout } = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration:stream=width,height,r_frame_rate,avg_frame_rate,codec_type',
    '-of',
    'json',
    videoPath,
  ]);

  const parsed = JSON.parse(stdout);
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const videoStream = streams.find((stream) => stream.codec_type === 'video');
  const duration = Number(parsed?.format?.duration ?? 0);

  const parseFps = (value) => {
    if (typeof value !== 'string' || !value.includes('/')) return 0;
    const [num, den] = value.split('/').map((v) => Number(v));
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
    return num / den;
  };

  return {
    duration: Number.isFinite(duration) ? duration : 0,
    width: Number(videoStream?.width ?? 0),
    height: Number(videoStream?.height ?? 0),
    fps: parseFps(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate ?? '0/1'),
  };
};

export const processVideoAsset = async ({
  rawPath,
  outputMp4,
  outputWebm,
  outputThumb,
  loopSeconds = 6,
}) => {
  await Promise.all([
    mkdir(path.dirname(outputMp4), { recursive: true }),
    mkdir(path.dirname(outputWebm), { recursive: true }),
    mkdir(path.dirname(outputThumb), { recursive: true }),
  ]);

  const probe = await probeVideo(rawPath);
  const targetDuration = Math.max(3, Math.min(10, loopSeconds));
  const effectiveDuration = probe.duration > 0 ? Math.min(targetDuration, probe.duration) : targetDuration;

  const sharedTrimArgs = ['-y', '-ss', '0', '-t', String(effectiveDuration), '-i', rawPath, '-an'];

  await runCommand('ffmpeg', [
    ...sharedTrimArgs,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputMp4,
  ]);

  await runCommand('ffmpeg', [
    ...sharedTrimArgs,
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '0',
    '-crf',
    '33',
    outputWebm,
  ]);

  await runCommand('ffmpeg', [
    '-y',
    '-ss',
    '0',
    '-i',
    rawPath,
    '-frames:v',
    '1',
    outputThumb,
  ]);

  return {
    duration_seconds: effectiveDuration,
    fps: probe.fps,
    width: probe.width,
    height: probe.height,
    loop_status: probe.duration > effectiveDuration + 0.5 ? 'trimmed' : 'fallback_tiled',
  };
};
