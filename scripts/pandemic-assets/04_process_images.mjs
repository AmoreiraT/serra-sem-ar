import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensurePandemicDirs, METADATA_ASSETS_DIR, REPO_ROOT, PROCESSED_TEXTURE_2K_DIR, PROCESSED_TEXTURE_4K_DIR, PROCESSED_NORMAL_DIR, PROCESSED_ROUGHNESS_DIR, PROCESSED_ALPHA_DIR, ERROR_LOG_FILE, toPublicPath } from './lib/paths.mjs';
import { processImageAsset } from './lib/image_processing.mjs';
import { logEvent } from './lib/logger.mjs';
import { parseAssetMetadata } from './lib/schema.mjs';

const parseArgs = (argv) => {
  const args = {
    sizes: [2048, 4096],
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--sizes') {
      const token = argv[i + 1] ?? '2048,4096';
      const parsed = token
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (parsed.length === 2) args.sizes = parsed;
      i += 1;
    }
  }

  return args;
};

const publicPathToAbsolute = (publicPath) => {
  const cleaned = publicPath.startsWith('/') ? publicPath.slice(1) : publicPath;
  return path.resolve(REPO_ROOT, 'public', cleaned.replace(/^public\//, ''));
};

const main = async () => {
  await ensurePandemicDirs();
  const args = parseArgs(process.argv.slice(2));

  const files = (await readdir(METADATA_ASSETS_DIR)).filter((name) => name.endsWith('.json')).sort();

  for (const fileName of files) {
    const metadataPath = path.resolve(METADATA_ASSETS_DIR, fileName);
    try {
      const metadata = parseAssetMetadata(JSON.parse(await readFile(metadataPath, 'utf8')));
      if (metadata.type !== 'image') continue;

      const rawAbsolute = publicPathToAbsolute(metadata.local_paths.raw);
      const texture2kAbs = path.resolve(PROCESSED_TEXTURE_2K_DIR, `${metadata.id}.jpg`);
      const texture4kAbs = path.resolve(PROCESSED_TEXTURE_4K_DIR, `${metadata.id}.jpg`);
      const normalAbs = path.resolve(PROCESSED_NORMAL_DIR, `${metadata.id}_normal.png`);
      const roughnessAbs = path.resolve(PROCESSED_ROUGHNESS_DIR, `${metadata.id}_roughness.png`);
      const alphaVignetteAbs = path.resolve(PROCESSED_ALPHA_DIR, `${metadata.id}_alpha_vignette.png`);
      const alphaTearAbs = path.resolve(PROCESSED_ALPHA_DIR, `${metadata.id}_alpha_tear.png`);

      const result = await processImageAsset({
        rawPath: rawAbsolute,
        outputTexture2k: texture2kAbs,
        outputTexture4k: texture4kAbs,
        outputNormal: normalAbs,
        outputRoughness: roughnessAbs,
        outputAlphaVignette: alphaVignetteAbs,
        outputAlphaTear: alphaTearAbs,
        sizes: args.sizes,
      });

      const updated = parseAssetMetadata({
        ...metadata,
        resolution: {
          width: result.raw.width,
          height: result.raw.height,
        },
        local_paths: {
          ...metadata.local_paths,
          texture_2k: toPublicPath(texture2kAbs),
          texture_4k: toPublicPath(texture4kAbs),
          normal: toPublicPath(normalAbs),
          roughness: toPublicPath(roughnessAbs),
          alpha_masks: [toPublicPath(alphaVignetteAbs), toPublicPath(alphaTearAbs)],
        },
      });

      await writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch (error) {
      await logEvent(ERROR_LOG_FILE, 'image_processing_failed', {
        metadata_file: fileName,
        reason: error instanceof Error ? error.message : 'erro_desconhecido',
      });
    }
  }

  console.log('✅ Processamento de imagens concluído.');
};

main().catch((error) => {
  console.error('❌ Erro ao processar imagens:', error);
  process.exitCode = 1;
});
