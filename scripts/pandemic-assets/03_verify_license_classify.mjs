import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensurePandemicDirs, METADATA_ASSETS_DIR, LICENSES_UNSPECIFIED_LOG_FILE, CRAWL_LOG_FILE, ERROR_LOG_FILE } from './lib/paths.mjs';
import { createNetClient } from './lib/net.mjs';
import { classifyLicense, extractLicenseFromHtml, fetchCommonsLicense, isCommonsUrl } from './lib/license_extractor.mjs';
import { logEvent } from './lib/logger.mjs';
import { parseAssetMetadata } from './lib/schema.mjs';

const readMetadataFiles = async () => {
  const files = await readdir(METADATA_ASSETS_DIR);
  return files.filter((name) => name.endsWith('.json')).sort();
};

const main = async () => {
  await ensurePandemicDirs();

  const files = await readMetadataFiles();
  const netClient = createNetClient({
    minDelayPerHostMs: 500,
    globalConcurrency: 6,
    perHostConcurrency: 2,
    retries: 3,
    timeoutMs: 20_000,
  });

  for (const fileName of files) {
    const metadataPath = path.resolve(METADATA_ASSETS_DIR, fileName);
    try {
      const original = parseAssetMetadata(JSON.parse(await readFile(metadataPath, 'utf8')));
      const metadata = { ...original };

      let updatedLicense = metadata.license;

      if (isCommonsUrl(metadata.source_page_url) || isCommonsUrl(metadata.original_media_url)) {
        const commonsInfo = await fetchCommonsLicense({
          sourcePageUrl: metadata.source_page_url,
          mediaUrl: metadata.original_media_url,
          netClient,
        });

        if (commonsInfo) {
          updatedLicense = {
            ...updatedLicense,
            ...commonsInfo.license,
            status: classifyLicense(commonsInfo.license),
          };
          metadata.author_credit = commonsInfo.author_credit || metadata.author_credit;
          metadata.date_captured = commonsInfo.date_captured || metadata.date_captured;
          if (commonsInfo.final_media_url) {
            metadata.ingest.final_url = commonsInfo.final_media_url;
          }
        }
      } else {
        try {
          const page = await netClient.getText(metadata.source_page_url);
          if (page.ok && (page.headers['content-type'] ?? '').toLowerCase().includes('text/html')) {
            const extracted = extractLicenseFromHtml(page.text);
            updatedLicense = {
              ...updatedLicense,
              ...extracted.license,
              status: classifyLicense(extracted.license),
            };
          }
        } catch {
          // keep existing fallback values
        }
      }

      updatedLicense.status = classifyLicense(updatedLicense);

      if (updatedLicense.status === 'editorial_rights_managed') {
        await logEvent(CRAWL_LOG_FILE, 'license_classified_editorial', {
          asset_id: metadata.id,
          source_page_url: metadata.source_page_url,
        });
      }

      if (updatedLicense.status === 'license_unspecified') {
        await logEvent(LICENSES_UNSPECIFIED_LOG_FILE, 'license_unspecified', {
          asset_id: metadata.id,
          source_page_url: metadata.source_page_url,
          original_media_url: metadata.original_media_url,
        });
        await logEvent(CRAWL_LOG_FILE, 'license_unspecified', {
          asset_id: metadata.id,
          source_page_url: metadata.source_page_url,
        });
      } else {
        await logEvent(CRAWL_LOG_FILE, 'license_verified', {
          asset_id: metadata.id,
          source_page_url: metadata.source_page_url,
          license_status: updatedLicense.status,
        });
      }

      const updated = parseAssetMetadata({
        ...metadata,
        license: {
          status: updatedLicense.status,
          name: updatedLicense.name || 'não especificado',
          url: updatedLicense.url || 'não especificado',
          text_snippet: updatedLicense.text_snippet || 'não especificado',
          verified: Boolean(updatedLicense.verified),
        },
      });

      await writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch (error) {
      await logEvent(ERROR_LOG_FILE, 'license_verification_failed', {
        metadata_file: fileName,
        reason: error instanceof Error ? error.message : 'erro_desconhecido',
      });
    }
  }

  console.log(`✅ Verificação de licença concluída para ${files.length} assets.`);
};

main().catch((error) => {
  console.error('❌ Erro na verificação de licença:', error);
  process.exitCode = 1;
});
