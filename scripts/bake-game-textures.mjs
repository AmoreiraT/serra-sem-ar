import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(rootDir, 'src/assets/textures/baked');

const textureJobs = [
  {
    name: 'rock',
    size: 1024,
    quality: 58,
    base: 'src/assets/textures/rock/GroundDirtRocky020_COL_2K.jpg',
    ao: 'src/assets/textures/rock/GroundDirtRocky020_AO_2K.jpg',
    output: 'rock_baked_1024.webp',
  },
  {
    name: 'road',
    size: 512,
    quality: 62,
    base: 'src/assets/textures/road/old_road_01_baseColor_1k.png',
    ao: 'src/assets/textures/road/old_road_01_ambientOcclusion_1k.png',
    output: 'road_baked_512.webp',
  },
  {
    name: 'road-mobile',
    size: 192,
    quality: 50,
    base: 'src/assets/textures/road/old_road_01_baseColor_1k.png',
    ao: 'src/assets/textures/road/old_road_01_ambientOcclusion_1k.png',
    output: 'road_mobile_192.webp',
  },
];

const makeAmbientOcclusionLayer = async (source, size) =>
  sharp(source)
    .resize(size, size, { fit: 'cover' })
    .grayscale()
    .normalise()
    // Mantem sombras de oclusao, mas evita que o bake fique preto demais.
    .linear(0.42, 148)
    .toColorspace('srgb')
    .png()
    .toBuffer();

const bakeTexture = async ({ name, base, ao, output, size, quality }) => {
  const basePath = path.join(rootDir, base);
  const aoPath = path.join(rootDir, ao);
  const outputPath = path.join(outputDir, output);
  const aoLayer = await makeAmbientOcclusionLayer(aoPath, size);

  await sharp(basePath)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: aoLayer, blend: 'multiply' }])
    .modulate({ saturation: 0.84, brightness: 0.94 })
    .sharpen({ sigma: 0.55, m1: 0.55, m2: 0.8 })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  console.log(`${name}: ${metadata.width}x${metadata.height} -> ${path.relative(rootDir, outputPath)}`);
};

await mkdir(outputDir, { recursive: true });
await Promise.all(textureJobs.map(bakeTexture));
