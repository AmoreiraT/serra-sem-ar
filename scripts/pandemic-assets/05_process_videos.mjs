import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensurePandemicDirs, METADATA_ASSETS_DIR, REPO_ROOT, PROCESSED_VIDEO_MP4_DIR, PROCESSED_VIDEO_WEBM_DIR, PROCESSED_VIDEO_THUMBS_DIR, ERROR_LOG_FILE, toPublicPath } from './lib/paths.mjs';
import { processVideoAsset } from './lib/video_processing.mjs';
import { logEvent } from './lib/logger.mjs';
import { parseAssetMetadata } from './lib/schema.mjs';

const parseArgs = (argv) => {
  let loopSeconds = 6;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--loopSeconds') {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        loopSeconds = parsed;
      }
      i += 1;
    }
  }
  return {
    loopSeconds: Math.max(3, Math.min(10, loopSeconds)),
  };
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
      if (metadata.type !== 'video') continue;

      const rawAbsolute = publicPathToAbsolute(metadata.local_paths.raw);
      const mp4Abs = path.resolve(PROCESSED_VIDEO_MP4_DIR, `${metadata.id}.mp4`);
      const webmAbs = path.resolve(PROCESSED_VIDEO_WEBM_DIR, `${metadata.id}.webm`);
      const thumbAbs = path.resolve(PROCESSED_VIDEO_THUMBS_DIR, `${metadata.id}.jpg`);

      const result = await processVideoAsset({
        rawPath: rawAbsolute,
        outputMp4: mp4Abs,
        outputWebm: webmAbs,
        outputThumb: thumbAbs,
        loopSeconds: args.loopSeconds,
      });

      const updated = parseAssetMetadata({
        ...metadata,
        duration_seconds: result.duration_seconds,
        fps: result.fps,
        resolution: {
          width: result.width,
          height: result.height,
        },
        local_paths: {
          ...metadata.local_paths,
          video_mp4: toPublicPath(mp4Abs),
          video_webm: toPublicPath(webmAbs),
          thumb: toPublicPath(thumbAbs),
        },
        processed: {
          ...metadata.processed,
          loop_duration_seconds: result.duration_seconds,
          loop_status: result.loop_status,
        },
      });

      await writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch (error) {
      await logEvent(ERROR_LOG_FILE, 'video_processing_failed', {
        metadata_file: fileName,
        reason: error instanceof Error ? error.message : 'erro_desconhecido',
      });
    }
  }

  console.log('✅ Processamento de vídeos concluído.');
};

main().catch((error) => {
  console.error('❌ Erro ao processar vídeos:', error);
  process.exitCode = 1;
});
