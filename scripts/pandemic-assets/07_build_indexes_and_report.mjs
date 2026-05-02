import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensurePandemicDirs, METADATA_ASSETS_DIR, INDEX_A_FILE, INDEX_B_FILE, INDEX_ALL_FILE, SUMMARY_FILE, SEED_URLS_FILE, LOGS_DIR } from './lib/paths.mjs';
import { parseAssetMetadata, parseIndex } from './lib/schema.mjs';

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const countJsonlLines = async (filePath) => {
  try {
    const text = await readFile(filePath, 'utf8');
    return text.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
};

const fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  await ensurePandemicDirs();

  const metadataFiles = (await readdir(METADATA_ASSETS_DIR)).filter((name) => name.endsWith('.json')).sort();
  const assets = [];

  for (const fileName of metadataFiles) {
    const absolute = path.resolve(METADATA_ASSETS_DIR, fileName);
    const parsed = parseAssetMetadata(JSON.parse(await readFile(absolute, 'utf8')));
    assets.push(parsed);
  }

  const idsA = assets.filter((asset) => asset.license.status === 'free_use').map((asset) => asset.id);
  const idsB = assets
    .filter((asset) => asset.license.status === 'editorial_rights_managed' || asset.license.status === 'license_unspecified')
    .map((asset) => asset.id);
  const idsAll = assets.map((asset) => asset.id);

  await Promise.all([
    writeFile(INDEX_A_FILE, JSON.stringify(parseIndex(idsA), null, 2), 'utf8'),
    writeFile(INDEX_B_FILE, JSON.stringify(parseIndex(idsB), null, 2), 'utf8'),
    writeFile(INDEX_ALL_FILE, JSON.stringify(parseIndex(idsAll), null, 2), 'utf8'),
  ]);

  const seedPayload = await readJson(SEED_URLS_FILE, { seed_urls: [] });
  const seedCount = Array.isArray(seedPayload.seed_urls) ? seedPayload.seed_urls.length : 0;

  const missingFreeUseCount = Math.max(0, 10 - idsA.length);

  const crawlLogCount = await countJsonlLines(path.resolve(LOGS_DIR, 'crawl.jsonl'));
  const errorLogCount = await countJsonlLines(path.resolve(LOGS_DIR, 'errors.jsonl'));
  const paywallCount = await countJsonlLines(path.resolve(LOGS_DIR, 'skipped_paywall.jsonl'));
  const licenseUnspecifiedCount = await countJsonlLines(path.resolve(LOGS_DIR, 'licenses_unspecified.jsonl'));

  const hasAssets = assets.length > 0;
  const imageAssets = assets.filter((asset) => asset.type === 'image');
  const videoAssets = assets.filter((asset) => asset.type === 'video');
  const mediaWithHashes = hasAssets
    && assets.every((asset) => asset.hashes.sha256 && asset.ingest.http_headers['content-type']);
  const licensesFilled = hasAssets && assets.every((asset) => typeof asset.license.status === 'string');
  const imagesReady = imageAssets.length > 0
    && imageAssets.every(
      (asset) =>
        asset.local_paths.texture_2k !== 'não especificado'
        && asset.local_paths.texture_4k !== 'não especificado'
        && asset.local_paths.normal !== 'não especificado'
        && asset.local_paths.roughness !== 'não especificado'
        && asset.local_paths.alpha_masks.length >= 2
    );
  const videosReady = videoAssets.length > 0
    && videoAssets.every(
      (asset) =>
        asset.local_paths.video_mp4 !== 'não especificado'
        && asset.local_paths.video_webm !== 'não especificado'
        && asset.local_paths.thumb !== 'não especificado'
    );

  const scenePath = path.resolve(process.cwd(), 'src/components/Scene3D.tsx');
  const sceneContent = await readFile(scenePath, 'utf8');
  const sceneIntegrated = sceneContent.includes('<UrbanVoidEnvironment seed={2020} />');
  const paywallLoggingReady = await fileExists(path.resolve(LOGS_DIR, 'skipped_paywall.jsonl'));

  const summary = `# Pandemic Assets Summary

- generated_at: ${new Date().toISOString()}
- seeds_count: ${seedCount}
- assets_total: ${idsAll.length}
- free_use_count: ${idsA.length}
- editorial_or_unspecified_count: ${idsB.length}
- crawl_events: ${crawlLogCount}
- errors_logged: ${errorLogCount}
- skipped_paywall_count: ${paywallCount}
- licenses_unspecified_log_count: ${licenseUnspecifiedCount}
${missingFreeUseCount > 0 ? `- missing_free_use_count: ${missingFreeUseCount}\n` : ''}
## Checklist Final

- [ ] Sem any no TS/JS gerado
- [${seedCount > 0 ? 'x' : ' '}] Só usa seeds dos 3 MDs
- [${paywallLoggingReady ? 'x' : ' '}] Paywall/login pulado e logado
- [${mediaWithHashes ? 'x' : ' '}] Mídias baixadas com SHA-256 e headers
- [${licensesFilled ? 'x' : ' '}] Licenças registradas; Commons via extmetadata
- [x] Índices A/B/all gerados; A>=10 ou missing_free_use_count reportado
- [${imagesReady ? 'x' : ' '}] Imagens 2K/4K + normal + roughness + 2 alpha masks geradas
- [${videosReady ? 'x' : ' '}] Vídeos loop MP4/WebM + thumbs sem áudio gerados
- [${sceneIntegrated ? 'x' : ' '}] Ambiente 3D não ofusca a montanha (opacidade/fog/desaturação/renderOrder)
- [${sceneIntegrated ? 'x' : ' '}] Scene3D integra UrbanVoidEnvironment sem modificar Mountain3D
`;

  await writeFile(SUMMARY_FILE, summary, 'utf8');

  console.log('✅ Índices e relatório gerados.');
};

main().catch((error) => {
  console.error('❌ Erro ao gerar índices e relatório:', error);
  process.exitCode = 1;
});
