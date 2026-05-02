import { access, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extname } from 'node:path';
import { ensurePandemicDirs, DEFAULT_MARKDOWN_FILES, REPO_ROOT, SEED_URLS_FILE, HASH_INDEX_FILE, URL_INDEX_FILE, METADATA_ASSETS_DIR, RAW_IMAGES_DIR, RAW_VIDEOS_DIR, CRAWL_LOG_FILE, ERROR_LOG_FILE, PAYWALL_LOG_FILE, STREAMING_NON_DOWNLOADABLE_LOG_FILE, NO_DISCOVERABLE_MEDIA_LOG_FILE, toPublicPath } from './lib/paths.mjs';
import { createNetClient } from './lib/net.mjs';
import { extractMediaFromHtml, detectPaywallSignals } from './lib/html_media_extractor.mjs';
import { extractUrlsFromMarkdown, normalizeUrl } from './lib/md_link_extractor.mjs';
import { sha256Buffer } from './lib/hash.mjs';
import { logEvent } from './lib/logger.mjs';
import { parseAssetMetadata } from './lib/schema.mjs';

const ACCEPT_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ACCEPT_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const STREAMING_EXT = new Set(['.m3u8', '.mpd']);

const parseArgs = (argv) => {
  const args = {
    md: [],
    mdAll: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--md') {
      const next = argv[i + 1];
      if (next) {
        args.md.push(next);
        i += 1;
      }
      continue;
    }
    if (current === '--mdAll') {
      args.mdAll = true;
    }
  }

  return args;
};

const sanitizeFilename = (value) =>
  value
    .replace(/\?.*$/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180);

const readJsonFile = async (filePath, fallback) => {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
};

const fileExists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const ensureUniqueDestinationPath = async (initialPath) => {
  if (!(await fileExists(initialPath))) return initialPath;

  const directory = path.dirname(initialPath);
  const extension = path.extname(initialPath);
  const base = path.basename(initialPath, extension);

  for (let i = 1; i <= 9999; i += 1) {
    const candidate = path.resolve(directory, `${base}_${i}${extension}`);
    if (!(await fileExists(candidate))) return candidate;
  }

  return path.resolve(directory, `${base}_${Date.now()}${extension}`);
};

const getExistingAssetCounter = async () => {
  try {
    const files = await readdir(METADATA_ASSETS_DIR);
    const maxId = files
      .map((fileName) => fileName.match(/^asset_(\d+)\.json$/))
      .filter(Boolean)
      .map((match) => Number(match[1]))
      .reduce((max, current) => Math.max(max, current), 0);
    return maxId;
  } catch {
    return 0;
  }
};

const nextAssetIdFactory = (startAt) => {
  let counter = startAt;
  return () => {
    counter += 1;
    return `asset_${String(counter).padStart(6, '0')}`;
  };
};

const isAcceptedMediaByContentType = (contentType) => {
  if (!contentType) return false;
  return contentType.startsWith('image/') || contentType.startsWith('video/');
};

const getMediaKindFromContentTypeOrExtension = (contentType, mediaUrl) => {
  const extension = extname(new URL(mediaUrl).pathname).toLowerCase();
  if (STREAMING_EXT.has(extension)) return 'streaming';

  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (ACCEPT_IMAGE_EXT.has(extension)) return 'image';
  if (ACCEPT_VIDEO_EXT.has(extension)) return 'video';

  return 'unknown';
};

const isLikelyDirectMediaSeed = (url) => {
  try {
    const extension = extname(new URL(url).pathname).toLowerCase();
    return ACCEPT_IMAGE_EXT.has(extension) || ACCEPT_VIDEO_EXT.has(extension) || STREAMING_EXT.has(extension);
  } catch {
    return false;
  }
};

const parseContentDispositionFilename = (contentDisposition) => {
  if (!contentDisposition) return null;
  const filenameStar = contentDisposition.match(/filename\*=(?:UTF-8''|)([^;]+)/i);
  if (filenameStar?.[1]) {
    return sanitizeFilename(filenameStar[1].replace(/"/g, '').trim());
  }
  const filename = contentDisposition.match(/filename=([^;]+)/i);
  if (filename?.[1]) {
    return sanitizeFilename(filename[1].replace(/"/g, '').trim());
  }
  return null;
};

const ensureExtension = (fileName, kind, contentType) => {
  const currentExt = extname(fileName).toLowerCase();
  if (kind === 'image' && ACCEPT_IMAGE_EXT.has(currentExt)) return fileName;
  if (kind === 'video' && ACCEPT_VIDEO_EXT.has(currentExt)) return fileName;

  if (contentType.includes('jpeg')) return `${fileName}.jpg`;
  if (contentType.includes('png')) return `${fileName}.png`;
  if (contentType.includes('webp')) return `${fileName}.webp`;
  if (contentType.includes('mp4')) return `${fileName}.mp4`;
  if (contentType.includes('webm')) return `${fileName}.webm`;
  if (contentType.includes('quicktime')) return `${fileName}.mov`;

  return `${fileName}${kind === 'image' ? '.jpg' : '.mp4'}`;
};

const loadSeedsFromMarkdownFiles = async (markdownFiles) => {
  const seedUrls = [];
  for (const markdownPath of markdownFiles) {
    const content = await readFile(markdownPath, 'utf8');
    const urls = extractUrlsFromMarkdown(content);
    seedUrls.push(...urls);
  }
  return Array.from(new Set(seedUrls));
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  await ensurePandemicDirs();

  let seedPayload = await readJsonFile(SEED_URLS_FILE, null);
  if (!seedPayload || !Array.isArray(seedPayload.seed_urls) || args.md.length > 0 || args.mdAll) {
    const markdownFiles = args.md.length > 0
      ? args.md.map((filePath) => path.resolve(REPO_ROOT, filePath))
      : DEFAULT_MARKDOWN_FILES;
    const seedUrls = await loadSeedsFromMarkdownFiles(markdownFiles);
    seedPayload = {
      generated_at: new Date().toISOString(),
      markdown_files: markdownFiles.map((filePath) => path.relative(REPO_ROOT, filePath)),
      seed_urls: seedUrls,
    };
    await writeFile(SEED_URLS_FILE, JSON.stringify(seedPayload, null, 2), 'utf8');
  }

  const seedUrls = Array.isArray(seedPayload.seed_urls) ? seedPayload.seed_urls : [];
  const hashIndex = await readJsonFile(HASH_INDEX_FILE, {});
  const urlIndex = await readJsonFile(URL_INDEX_FILE, {});

  const nextAssetId = nextAssetIdFactory(await getExistingAssetCounter());

  const netClient = createNetClient({
    minDelayPerHostMs: 500,
    globalConcurrency: 6,
    perHostConcurrency: 2,
    retries: 3,
    timeoutMs: 20_000,
  });

  const saveIndexes = async () => {
    await Promise.all([
      writeFile(HASH_INDEX_FILE, JSON.stringify(hashIndex, null, 2), 'utf8'),
      writeFile(URL_INDEX_FILE, JSON.stringify(urlIndex, null, 2), 'utf8'),
    ]);
  };

  const downloadMedia = async ({ mediaUrl, sourcePageUrl, inferredMeta }) => {
    const canonicalMediaUrl = normalizeUrl(mediaUrl);
    if (!canonicalMediaUrl) return null;

    if (urlIndex[canonicalMediaUrl]) {
      await logEvent(CRAWL_LOG_FILE, 'download_skipped_url_dedup', {
        source_page_url: sourcePageUrl,
        media_url: canonicalMediaUrl,
        existing_asset_id: urlIndex[canonicalMediaUrl],
      });
      return urlIndex[canonicalMediaUrl];
    }

    if (STREAMING_EXT.has(extname(new URL(canonicalMediaUrl).pathname).toLowerCase())) {
      await logEvent(STREAMING_NON_DOWNLOADABLE_LOG_FILE, 'streaming_non_downloadable', {
        source_page_url: sourcePageUrl,
        media_url: canonicalMediaUrl,
      });
      return null;
    }

    await logEvent(CRAWL_LOG_FILE, 'download_started', {
      source_page_url: sourcePageUrl,
      media_url: canonicalMediaUrl,
    });

    const response = await netClient.getBuffer(canonicalMediaUrl);
    const headers = response.headers;
    const contentType = (headers['content-type'] ?? '').toLowerCase();
    const mediaKind = getMediaKindFromContentTypeOrExtension(contentType, response.url);

    if (mediaKind === 'streaming') {
      await logEvent(STREAMING_NON_DOWNLOADABLE_LOG_FILE, 'streaming_non_downloadable', {
        source_page_url: sourcePageUrl,
        media_url: canonicalMediaUrl,
      });
      return null;
    }

    if (!['image', 'video'].includes(mediaKind)) {
      await logEvent(ERROR_LOG_FILE, 'download_failed', {
        source_page_url: sourcePageUrl,
        media_url: canonicalMediaUrl,
        reason: `unsupported_media_type:${contentType || 'unknown'}`,
      });
      return null;
    }

    const sha = sha256Buffer(response.buffer);
    if (hashIndex[sha]) {
      const existingAssetId = hashIndex[sha];
      urlIndex[canonicalMediaUrl] = existingAssetId;
      urlIndex[normalizeUrl(response.url) ?? response.url] = existingAssetId;
      await saveIndexes();
      await logEvent(CRAWL_LOG_FILE, 'download_skipped_hash_dedup', {
        source_page_url: sourcePageUrl,
        media_url: canonicalMediaUrl,
        existing_asset_id: existingAssetId,
      });
      return existingAssetId;
    }

    const parsedFinalUrl = new URL(response.url);
    const filenameFromHeader = parseContentDispositionFilename(headers['content-disposition'] ?? '');
    const fallbackName = sanitizeFilename(path.basename(parsedFinalUrl.pathname) || `${mediaKind}_${Date.now()}`);
    const safeNameBase = filenameFromHeader || fallbackName || `${mediaKind}_${Date.now()}`;
    const originalFilename = ensureExtension(safeNameBase, mediaKind, contentType);

    const assetId = nextAssetId();
    const destinationDir = mediaKind === 'image' ? RAW_IMAGES_DIR : RAW_VIDEOS_DIR;
    const destinationPath = await ensureUniqueDestinationPath(path.resolve(destinationDir, originalFilename));
    await writeFile(destinationPath, response.buffer);
    const metadata = parseAssetMetadata({
      id: assetId,
      type: mediaKind,
      source_name: new URL(sourcePageUrl).hostname,
      source_page_url: sourcePageUrl,
      original_media_url: canonicalMediaUrl,
      original_filename: originalFilename,
      local_paths: {
        raw: toPublicPath(destinationPath),
        texture_2k: 'não especificado',
        texture_4k: 'não especificado',
        normal: 'não especificado',
        roughness: 'não especificado',
        alpha_masks: [],
        video_mp4: 'não especificado',
        video_webm: 'não especificado',
        thumb: 'não especificado',
        cubemap_faces: 'não especificado',
      },
      resolution: {
        width: 0,
        height: 0,
      },
      duration_seconds: 'não aplicável',
      fps: 'não aplicável',
      author_credit: inferredMeta?.author_credit ?? 'não especificado',
      date_published: inferredMeta?.date_published ?? 'não especificado',
      date_captured: 'não especificado',
      caption: inferredMeta?.caption ?? 'não especificado',
      city_region: 'não especificado',
      license: {
        status: 'license_unspecified',
        name: 'não especificado',
        url: 'não especificado',
        text_snippet: 'não especificado',
        verified: false,
      },
      hashes: {
        sha256: sha,
      },
      ingest: {
        downloaded_at: new Date().toISOString(),
        http_status: response.status,
        content_type: contentType || 'não especificado',
        final_url: response.url,
        http_headers: {
          'content-type': headers['content-type'] ?? 'não especificado',
          'content-length': headers['content-length'] ?? String(response.buffer.length),
          'last-modified': headers['last-modified'] ?? 'não especificado',
        },
        content_length: headers['content-length'] ?? String(response.buffer.length),
        last_modified: headers['last-modified'] ?? 'não especificado',
      },
      processed: {
        loop_duration_seconds: 'não aplicável',
        loop_status: 'não aplicável',
        cubemap_status: 'não especificado',
      },
    });

    const metadataPath = path.resolve(METADATA_ASSETS_DIR, `${assetId}.json`);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    hashIndex[sha] = assetId;
    urlIndex[canonicalMediaUrl] = assetId;
    urlIndex[normalizeUrl(response.url) ?? response.url] = assetId;

    await saveIndexes();

    await logEvent(CRAWL_LOG_FILE, 'download_completed', {
      asset_id: assetId,
      source_page_url: sourcePageUrl,
      media_url: canonicalMediaUrl,
      final_url: response.url,
      content_type: contentType,
    });

    return assetId;
  };

  for (const seedUrl of seedUrls) {
    const normalizedSeed = normalizeUrl(seedUrl);
    if (!normalizedSeed) continue;

    try {
      if (isLikelyDirectMediaSeed(normalizedSeed)) {
        await downloadMedia({ mediaUrl: normalizedSeed, sourcePageUrl: normalizedSeed, inferredMeta: null });
        continue;
      }

      let headResult = null;
      try {
        headResult = await netClient.head(normalizedSeed);
      } catch {
        headResult = null;
      }

      if (headResult && [401, 402, 403].includes(headResult.status)) {
        await logEvent(PAYWALL_LOG_FILE, 'page_skipped_paywall', {
          url: normalizedSeed,
          reason: `http_${headResult.status}`,
        });
        continue;
      }

      const headContentType = (headResult?.headers['content-type'] ?? '').toLowerCase();
      if (isAcceptedMediaByContentType(headContentType)) {
        await downloadMedia({ mediaUrl: normalizedSeed, sourcePageUrl: normalizedSeed, inferredMeta: null });
        continue;
      }

      const pageResponse = await netClient.getText(normalizedSeed);
      const contentType = (pageResponse.headers['content-type'] ?? '').toLowerCase();

      if ([401, 402, 403].includes(pageResponse.status)) {
        await logEvent(PAYWALL_LOG_FILE, 'page_skipped_paywall', {
          url: normalizedSeed,
          reason: `http_${pageResponse.status}`,
        });
        continue;
      }

      if (isAcceptedMediaByContentType(contentType)) {
        await downloadMedia({ mediaUrl: normalizedSeed, sourcePageUrl: normalizedSeed, inferredMeta: null });
        continue;
      }

      if (!contentType.includes('text/html')) {
        await logEvent(ERROR_LOG_FILE, 'download_failed', {
          source_page_url: normalizedSeed,
          media_url: normalizedSeed,
          reason: `unsupported_seed_content_type:${contentType || 'unknown'}`,
        });
        continue;
      }

      const paywallCheck = detectPaywallSignals(pageResponse.text, pageResponse.status);
      if (paywallCheck.blocked) {
        await logEvent(PAYWALL_LOG_FILE, 'page_skipped_paywall', {
          url: normalizedSeed,
          reason: paywallCheck.reason,
        });
        continue;
      }

      const extraction = extractMediaFromHtml(pageResponse.text, pageResponse.url);
      const mediaUrls = extraction.mediaUrls;

      if (!mediaUrls.length) {
        await logEvent(NO_DISCOVERABLE_MEDIA_LOG_FILE, 'no_discoverable_media', {
          source_page_url: normalizedSeed,
        });
        continue;
      }

      for (const mediaUrl of mediaUrls) {
        await logEvent(CRAWL_LOG_FILE, 'media_discovered', {
          source_page_url: normalizedSeed,
          media_url: mediaUrl,
        });

        try {
          await downloadMedia({
            mediaUrl,
            sourcePageUrl: normalizedSeed,
            inferredMeta: extraction.inferredMeta,
          });
        } catch (error) {
          await logEvent(ERROR_LOG_FILE, 'download_failed', {
            source_page_url: normalizedSeed,
            media_url: mediaUrl,
            reason: error instanceof Error ? error.message : 'erro_desconhecido',
          });
        }
      }
    } catch (error) {
      await logEvent(ERROR_LOG_FILE, 'seed_failed', {
        source_page_url: normalizedSeed,
        reason: error instanceof Error ? error.message : 'erro_desconhecido',
      });
    }
  }

  console.log(`✅ Crawl finalizado. Seeds processadas: ${seedUrls.length}`);
};

main().catch((error) => {
  console.error('❌ Erro no crawl:', error);
  process.exitCode = 1;
});
