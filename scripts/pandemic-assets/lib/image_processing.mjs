import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

const pixelAt = (buffer, x, y, width, height) => {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  return buffer[cy * width + cx];
};

const createNormalMapBuffer = (grayBuffer, width, height, strength = 2.2) => {
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tl = pixelAt(grayBuffer, x - 1, y - 1, width, height);
      const t = pixelAt(grayBuffer, x, y - 1, width, height);
      const tr = pixelAt(grayBuffer, x + 1, y - 1, width, height);
      const l = pixelAt(grayBuffer, x - 1, y, width, height);
      const r = pixelAt(grayBuffer, x + 1, y, width, height);
      const bl = pixelAt(grayBuffer, x - 1, y + 1, width, height);
      const b = pixelAt(grayBuffer, x, y + 1, width, height);
      const br = pixelAt(grayBuffer, x + 1, y + 1, width, height);

      const gx = ((tr + 2 * r + br) - (tl + 2 * l + bl)) / 255;
      const gy = ((bl + 2 * b + br) - (tl + 2 * t + tr)) / 255;

      let nx = -gx * strength;
      let ny = -gy * strength;
      let nz = 1;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * width + x) * 4;
      out[idx] = clampByte((nx * 0.5 + 0.5) * 255);
      out[idx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      out[idx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }

  return out;
};

const createRoughnessBuffer = (grayBuffer, width, height) => {
  const out = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = pixelAt(grayBuffer, x, y, width, height);
      const left = pixelAt(grayBuffer, x - 1, y, width, height);
      const right = pixelAt(grayBuffer, x + 1, y, width, height);
      const top = pixelAt(grayBuffer, x, y - 1, width, height);
      const bottom = pixelAt(grayBuffer, x, y + 1, width, height);
      const localVariance = Math.abs(center - left) + Math.abs(center - right) + Math.abs(center - top) + Math.abs(center - bottom);

      const base = 200 - center * 0.45;
      const roughness = clampByte(base + localVariance * 0.15);
      const idx = (y * width + x) * 4;
      out[idx] = roughness;
      out[idx + 1] = roughness;
      out[idx + 2] = roughness;
      out[idx + 3] = 255;
    }
  }

  return out;
};

const createVignetteAlphaBuffer = (width, height) => {
  const out = Buffer.alloc(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(1, Math.min(width, height) * 0.52);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / radius;
      const alpha = clampByte((1 - Math.min(1, d ** 1.8)) * 255);
      const idx = (y * width + x) * 4;
      out[idx] = 255;
      out[idx + 1] = 255;
      out[idx + 2] = 255;
      out[idx + 3] = alpha;
    }
  }

  return out;
};

const pseudoNoise = (x, y) => {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

const createOrganicTearAlphaBuffer = (width, height) => {
  const out = Buffer.alloc(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const baseNoise = pseudoNoise(nx * 24, ny * 24);
      const secondary = pseudoNoise(nx * 63 + 11, ny * 63 + 7);
      const edge = Math.min(
        Math.min(x, width - x - 1) / Math.max(1, width * 0.18),
        Math.min(y, height - y - 1) / Math.max(1, height * 0.18)
      );
      const radial = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / Math.max(width, height);
      const alphaMix = 0.72 + baseNoise * 0.28 - secondary * 0.14 + edge * 0.2 - radial * 0.22;
      const alpha = clampByte(Math.max(0, Math.min(1, alphaMix)) * 255);

      const idx = (y * width + x) * 4;
      out[idx] = 255;
      out[idx + 1] = 255;
      out[idx + 2] = 255;
      out[idx + 3] = alpha;
    }
  }

  return out;
};

export const processImageAsset = async ({
  rawPath,
  outputTexture2k,
  outputTexture4k,
  outputNormal,
  outputRoughness,
  outputAlphaVignette,
  outputAlphaTear,
  sizes = [2048, 4096],
}) => {
  await Promise.all([
    mkdir(path.dirname(outputTexture2k), { recursive: true }),
    mkdir(path.dirname(outputTexture4k), { recursive: true }),
    mkdir(path.dirname(outputNormal), { recursive: true }),
    mkdir(path.dirname(outputRoughness), { recursive: true }),
    mkdir(path.dirname(outputAlphaVignette), { recursive: true }),
    mkdir(path.dirname(outputAlphaTear), { recursive: true }),
  ]);

  const source = sharp(rawPath, { failOn: 'none' });
  const metadata = await source.metadata();
  const rawWidth = metadata.width ?? 0;
  const rawHeight = metadata.height ?? 0;

  const [size2k, size4k] = sizes;

  await sharp(rawPath)
    .resize({ width: size2k, height: size2k, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86, mozjpeg: true })
    .toFile(outputTexture2k);

  await sharp(rawPath)
    .resize({ width: size4k, height: size4k, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outputTexture4k);

  const baseForMaps = await sharp(rawPath)
    .resize({ width: size2k, height: size2k, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mapWidth = baseForMaps.info.width;
  const mapHeight = baseForMaps.info.height;
  const grayBuffer = baseForMaps.data;

  const normalBuffer = createNormalMapBuffer(grayBuffer, mapWidth, mapHeight);
  const roughnessBuffer = createRoughnessBuffer(grayBuffer, mapWidth, mapHeight);
  const vignetteBuffer = createVignetteAlphaBuffer(mapWidth, mapHeight);
  const tearBuffer = createOrganicTearAlphaBuffer(mapWidth, mapHeight);

  await sharp(normalBuffer, { raw: { width: mapWidth, height: mapHeight, channels: 4 } })
    .png()
    .toFile(outputNormal);

  await sharp(roughnessBuffer, { raw: { width: mapWidth, height: mapHeight, channels: 4 } })
    .png()
    .toFile(outputRoughness);

  await sharp(vignetteBuffer, { raw: { width: mapWidth, height: mapHeight, channels: 4 } })
    .png()
    .toFile(outputAlphaVignette);

  await sharp(tearBuffer, { raw: { width: mapWidth, height: mapHeight, channels: 4 } })
    .png()
    .toFile(outputAlphaTear);

  return {
    raw: {
      width: rawWidth,
      height: rawHeight,
    },
    processed: {
      width: mapWidth,
      height: mapHeight,
    },
  };
};
