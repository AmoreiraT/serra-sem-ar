import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(rootDir, 'public/assets/optimized/tablet/v1');
const textureOutputDir = path.join(outputDir, 'textures');
const modelOutputDir = path.join(outputDir, 'models');
const manifestPath = path.join(outputDir, 'manifest.json');

const playerInputPath = path.join(rootDir, 'src/assets/glb/player/source/player.glb');
const playerOutputPath = path.join(modelOutputDir, 'player.tablet.glb');
const gltfTransformBin = path.join(rootDir, 'node_modules/.bin', process.platform === 'win32' ? 'gltf-transform.cmd' : 'gltf-transform');

const budgets = {
  playerBytes: 4 * 1024 * 1024,
  criticalPackageBytes: 12 * 1024 * 1024,
};

const textureInputs = [
  {
    id: 'serra-rock-baked',
    input: 'src/assets/textures/baked/rock_baked_1024.webp',
    maxSize: 1024,
    role: 'color',
    runtimeCritical: true,
  },
  {
    id: 'serra-rock-baked-512',
    input: 'src/assets/textures/baked/rock_baked_1024.webp',
    maxSize: 512,
    role: 'color',
    runtimeCritical: true,
  },
  {
    id: 'road-baked',
    input: 'src/assets/textures/baked/road_baked_512.webp',
    maxSize: 1024,
    role: 'color',
    runtimeCritical: true,
  },
  {
    id: 'terrain-albedo',
    input: 'src/assets/textures/terrain/rocky-rugged-terrain_1_albedo.png',
    maxSize: 1536,
    role: 'color',
  },
  {
    id: 'terrain-normal',
    input: 'src/assets/textures/terrain/rocky-rugged-terrain_1_normal-ogl.png',
    maxSize: 1024,
    role: 'normal',
  },
  {
    id: 'terrain-ao',
    input: 'src/assets/textures/terrain/rocky-rugged-terrain_1_ao.png',
    maxSize: 1024,
    role: 'data',
  },
  {
    id: 'terrain-roughness',
    input: 'src/assets/textures/terrain/rocky-rugged-terrain_1_roughness.png',
    maxSize: 1024,
    role: 'data',
  },
  {
    id: 'road-basecolor',
    input: 'src/assets/textures/road/old_road_01_baseColor_1k.png',
    maxSize: 1024,
    role: 'color',
  },
  {
    id: 'road-normal',
    input: 'src/assets/textures/road/old_road_01_normal_gl_1k.png',
    maxSize: 1024,
    role: 'normal',
  },
  {
    id: 'road-ao',
    input: 'src/assets/textures/road/old_road_01_ambientOcclusion_1k.png',
    maxSize: 1024,
    role: 'data',
  },
  {
    id: 'road-roughness',
    input: 'src/assets/textures/road/old_road_01_roughness_1k.png',
    maxSize: 1024,
    role: 'data',
  },
];

const args = new Set(process.argv.slice(2));
const checkBudget = args.has('--check-budget');

const formatBytes = (value) => {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  return `${(value / 1024).toFixed(1)} KB`;
};

const imageDecoder = async (buffer) => {
  const decoded = await sharp(buffer, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: decoded.info.width,
    height: decoded.info.height,
    data: new Uint8Array(decoded.data),
  };
};

const resizedPngBuffer = async (inputPath, maxSize) =>
  sharp(inputPath, { limitInputPixels: false })
    .rotate()
    .resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

const writeWebpFallback = async (inputPath, outputPath, maxSize, role) => {
  const encoder = sharp(inputPath, { limitInputPixels: false })
    .rotate()
    .resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true,
    });

  if (role === 'color') {
    await encoder.webp({ quality: 78, effort: 5 }).toFile(outputPath);
  } else {
    await encoder.webp({ lossless: true, effort: 5 }).toFile(outputPath);
  }
};

const encodeKtx2 = async (pngBuffer, role) =>
  encodeToKTX2(new Uint8Array(pngBuffer), {
    imageDecoder,
    generateMipmap: true,
    isKTX2File: true,
    isUASTC: role === 'normal',
    isNormalMap: role === 'normal',
    isPerceptual: role === 'color',
    isSetKTX2SRGBTransferFunc: role === 'color',
    needSupercompression: true,
    qualityLevel: role === 'color' ? 190 : 160,
    compressionLevel: 2,
    uastcLDRQualityLevel: 2,
    enableRDO: role === 'normal',
    rdoQualityLevel: 4,
  });

const optimizeTexture = async (entry) => {
  const inputPath = path.join(rootDir, entry.input);
  const webpPath = path.join(textureOutputDir, `${entry.id}.webp`);
  const ktx2Path = path.join(textureOutputDir, `${entry.id}.ktx2`);
  const pngBuffer = await resizedPngBuffer(inputPath, entry.maxSize);

  await writeWebpFallback(inputPath, webpPath, entry.maxSize, entry.role);
  const ktx2Buffer = await encodeKtx2(pngBuffer, entry.role);
  await writeFile(ktx2Path, ktx2Buffer);

  const webpMeta = await sharp(webpPath).metadata();
  const webpStats = await stat(webpPath);
  const ktx2Stats = await stat(ktx2Path);

  return {
    id: entry.id,
    role: entry.role,
    runtimeCritical: Boolean(entry.runtimeCritical),
    maxSize: entry.maxSize,
    width: webpMeta.width ?? 0,
    height: webpMeta.height ?? 0,
    webp: `/assets/optimized/tablet/v1/textures/${entry.id}.webp`,
    ktx2: `/assets/optimized/tablet/v1/textures/${entry.id}.ktx2`,
    webpBytes: webpStats.size,
    ktx2Bytes: ktx2Stats.size,
  };
};

const optimizePlayerModel = async () => {
  if (!existsSync(gltfTransformBin)) {
    throw new Error('gltf-transform local binary not found. Run pnpm install before optimizing tablet assets.');
  }

  const result = spawnSync(
    gltfTransformBin,
    [
      'optimize',
      playerInputPath,
      playerOutputPath,
      '--compress',
      'meshopt',
      '--texture-compress',
      'webp',
      '--texture-size',
      '1024',
      '--simplify',
      'false',
      '--join',
      'false',
      '--palette',
      'false',
      '--flatten',
      'false',
    ],
    {
      cwd: rootDir,
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    throw new Error(`gltf-transform optimize failed with status ${result.status ?? 'unknown'}.`);
  }

  const outputStats = await stat(playerOutputPath);
  return {
    input: 'src/assets/glb/player/source/player.glb',
    output: '/assets/optimized/tablet/v1/models/player.tablet.glb',
    bytes: outputStats.size,
  };
};

const directorySize = async (directoryPath) => {
  let total = 0;
  for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(entryPath);
    } else if (entry.isFile()) {
      total += (await stat(entryPath)).size;
    }
  }
  return total;
};

const assertBudgets = async (manifest) => {
  const failures = [];

  if (manifest.model.bytes > budgets.playerBytes) {
    failures.push(`player.tablet.glb is ${formatBytes(manifest.model.bytes)}; budget is ${formatBytes(budgets.playerBytes)}.`);
  }

  const runtimeCriticalBytes =
    manifest.model.bytes +
    manifest.textures
      .filter((texture) => texture.runtimeCritical)
      .reduce((sum, texture) => sum + texture.ktx2Bytes, 0);

  if (runtimeCriticalBytes > budgets.criticalPackageBytes) {
    failures.push(
      `runtime critical tablet package is ${formatBytes(runtimeCriticalBytes)}; budget is ${formatBytes(
        budgets.criticalPackageBytes
      )}.`
    );
  }

  for (const texture of manifest.textures) {
    if (texture.width > texture.maxSize || texture.height > texture.maxSize) {
      failures.push(`${texture.id} is ${texture.width}x${texture.height}; max is ${texture.maxSize}px.`);
    }
  }

  if (failures.length) {
    throw new Error(`Tablet asset budget failed:\n- ${failures.join('\n- ')}`);
  }

  const fullOutputBytes = await directorySize(outputDir);
  console.log(`Budget OK: critical ${formatBytes(runtimeCriticalBytes)}, full optimized folder ${formatBytes(fullOutputBytes)}.`);
};

const main = async () => {
  await mkdir(textureOutputDir, { recursive: true });
  await mkdir(modelOutputDir, { recursive: true });

  console.log('Optimizing tablet textures...');
  const textures = [];
  for (const entry of textureInputs) {
    const optimized = await optimizeTexture(entry);
    console.log(
      `- ${optimized.id}: ${optimized.width}x${optimized.height}, ktx2 ${formatBytes(
        optimized.ktx2Bytes
      )}, webp ${formatBytes(optimized.webpBytes)}`
    );
    textures.push(optimized);
  }

  console.log('Optimizing tablet player model...');
  const model = await optimizePlayerModel();
  console.log(`- player.tablet.glb: ${formatBytes(model.bytes)}`);

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    basePath: '/assets/optimized/tablet/v1',
    model,
    textures,
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (checkBudget) {
    await assertBudgets(manifest);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
