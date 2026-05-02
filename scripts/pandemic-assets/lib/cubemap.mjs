import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

const runCommand = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} falhou (${code}): ${stderr}`));
    });
  });

export const isPanoramaRatio = (width, height) => width > 0 && height > 0 && width / height >= 2;

export const buildCubemapFromPanorama = async ({ inputPath, outputDir, size = 1024 }) => {
  await mkdir(outputDir, { recursive: true });

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pandemic-cubemap-'));
  const sheetPath = path.join(tmpDir, 'cube_sheet.jpg');

  try {
    await runCommand('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vf',
      `v360=input=equirect:output=c3x2:w=${size * 3}:h=${size * 2}`,
      '-frames:v',
      '1',
      sheetPath,
    ]);

    const image = sharp(sheetPath);
    const metadata = await image.metadata();
    const totalWidth = metadata.width ?? 0;
    const totalHeight = metadata.height ?? 0;

    if (totalWidth < 6 || totalHeight < 4) {
      return {
        status: 'não especificado',
        faces: [],
      };
    }

    const faceWidth = Math.floor(totalWidth / 3);
    const faceHeight = Math.floor(totalHeight / 2);

    const slots = [
      { name: 'px', x: 0, y: 0 },
      { name: 'nx', x: faceWidth, y: 0 },
      { name: 'py', x: faceWidth * 2, y: 0 },
      { name: 'ny', x: 0, y: faceHeight },
      { name: 'pz', x: faceWidth, y: faceHeight },
      { name: 'nz', x: faceWidth * 2, y: faceHeight },
    ];

    const faces = [];
    for (const slot of slots) {
      if (!FACE_NAMES.includes(slot.name)) continue;
      const facePath = path.join(outputDir, `${slot.name}.jpg`);
      await sharp(sheetPath)
        .extract({ left: slot.x, top: slot.y, width: faceWidth, height: faceHeight })
        .resize(size, size, { fit: 'cover' })
        .jpeg({ quality: 84, mozjpeg: true })
        .toFile(facePath);
      faces.push(facePath);
    }

    return {
      status: faces.length === 6 ? 'generated' : 'não especificado',
      faces,
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};
