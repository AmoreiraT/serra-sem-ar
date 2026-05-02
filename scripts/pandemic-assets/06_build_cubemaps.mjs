import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensurePandemicDirs, METADATA_ASSETS_DIR, REPO_ROOT, PROCESSED_CUBEMAPS_DIR, ERROR_LOG_FILE, toPublicPath } from './lib/paths.mjs';
import { buildCubemapFromPanorama, isPanoramaRatio } from './lib/cubemap.mjs';
import { logEvent } from './lib/logger.mjs';
import { parseAssetMetadata } from './lib/schema.mjs';

const publicPathToAbsolute = (publicPath) => {
  const cleaned = publicPath.startsWith('/') ? publicPath.slice(1) : publicPath;
  return path.resolve(REPO_ROOT, 'public', cleaned.replace(/^public\//, ''));
};

const main = async () => {
  await ensurePandemicDirs();

  const files = (await readdir(METADATA_ASSETS_DIR)).filter((name) => name.endsWith('.json')).sort();

  for (const fileName of files) {
    const metadataPath = path.resolve(METADATA_ASSETS_DIR, fileName);
    try {
      const metadata = parseAssetMetadata(JSON.parse(await readFile(metadataPath, 'utf8')));
      if (metadata.type !== 'image') continue;

      const width = metadata.resolution.width;
      const height = metadata.resolution.height;

      if (!isPanoramaRatio(width, height)) {
        const updated = parseAssetMetadata({
          ...metadata,
          processed: {
            ...metadata.processed,
            cubemap_status: 'não especificado',
          },
        });
        await writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf8');
        continue;
      }

      const inputPath = metadata.local_paths.texture_4k !== 'não especificado'
        ? publicPathToAbsolute(metadata.local_paths.texture_4k)
        : publicPathToAbsolute(metadata.local_paths.raw);

      const outputDir = path.resolve(PROCESSED_CUBEMAPS_DIR, metadata.id);
      await mkdir(outputDir, { recursive: true });

      const built = await buildCubemapFromPanorama({
        inputPath,
        outputDir,
        size: 1024,
      });

      const cubemapFaces = Array.isArray(built.faces) && built.faces.length
        ? built.faces.map((facePath) => toPublicPath(facePath))
        : 'não especificado';

      const updated = parseAssetMetadata({
        ...metadata,
        local_paths: {
          ...metadata.local_paths,
          cubemap_faces: cubemapFaces,
        },
        processed: {
          ...metadata.processed,
          cubemap_status: built.status,
        },
      });

      await writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch (error) {
      await logEvent(ERROR_LOG_FILE, 'cubemap_failed', {
        metadata_file: fileName,
        reason: error instanceof Error ? error.message : 'erro_desconhecido',
      });
    }
  }

  console.log('✅ Construção de cubemaps concluída.');
};

main().catch((error) => {
  console.error('❌ Erro ao construir cubemaps:', error);
  process.exitCode = 1;
});
