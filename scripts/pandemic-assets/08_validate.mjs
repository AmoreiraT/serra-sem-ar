import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ensurePandemicDirs, ALL_REQUIRED_DIRS, METADATA_ASSETS_DIR, INDEX_A_FILE, INDEX_B_FILE, INDEX_ALL_FILE, SEED_URLS_FILE, REPO_ROOT } from './lib/paths.mjs';
import { parseAssetMetadata, parseIndex } from './lib/schema.mjs';
import { normalizeUrl } from './lib/md_link_extractor.mjs';

const exists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const publicPathToAbsolute = (publicPath) => {
  const cleaned = publicPath.startsWith('/') ? publicPath.slice(1) : publicPath;
  return path.resolve(REPO_ROOT, 'public', cleaned.replace(/^public\//, ''));
};

const validatePublicPath = async (errors, filePath, label, assetId) => {
  if (!filePath || filePath === 'não aplicável' || filePath === 'não especificado') return;
  const absolute = publicPathToAbsolute(filePath);
  if (!(await exists(absolute))) {
    errors.push(`[${assetId}] caminho ausente (${label}): ${filePath}`);
  }
};

const main = async () => {
  await ensurePandemicDirs();

  const errors = [];

  for (const dirPath of ALL_REQUIRED_DIRS) {
    if (!(await exists(dirPath))) {
      errors.push(`Diretório obrigatório ausente: ${dirPath}`);
    }
  }

  const seedPayload = JSON.parse(await readFile(SEED_URLS_FILE, 'utf8'));
  const seedSet = new Set((seedPayload.seed_urls ?? []).map((url) => normalizeUrl(url)).filter(Boolean));

  parseIndex(JSON.parse(await readFile(INDEX_A_FILE, 'utf8')));
  parseIndex(JSON.parse(await readFile(INDEX_B_FILE, 'utf8')));
  parseIndex(JSON.parse(await readFile(INDEX_ALL_FILE, 'utf8')));

  const metadataFiles = (await readdir(METADATA_ASSETS_DIR)).filter((name) => name.endsWith('.json')).sort();

  for (const fileName of metadataFiles) {
    const absolute = path.resolve(METADATA_ASSETS_DIR, fileName);
    const metadata = parseAssetMetadata(JSON.parse(await readFile(absolute, 'utf8')));

    const sourceSeed = normalizeUrl(metadata.source_page_url);
    if (!sourceSeed || !seedSet.has(sourceSeed)) {
      errors.push(`[${metadata.id}] source_page_url fora das seeds: ${metadata.source_page_url}`);
    }

    await validatePublicPath(errors, metadata.local_paths.raw, 'raw', metadata.id);
    await validatePublicPath(errors, metadata.local_paths.texture_2k, 'texture_2k', metadata.id);
    await validatePublicPath(errors, metadata.local_paths.texture_4k, 'texture_4k', metadata.id);
    await validatePublicPath(errors, metadata.local_paths.normal, 'normal', metadata.id);
    await validatePublicPath(errors, metadata.local_paths.roughness, 'roughness', metadata.id);
    await validatePublicPath(errors, metadata.local_paths.video_mp4, 'video_mp4', metadata.id);
    await validatePublicPath(errors, metadata.local_paths.video_webm, 'video_webm', metadata.id);
    await validatePublicPath(errors, metadata.local_paths.thumb, 'thumb', metadata.id);

    for (const alphaPath of metadata.local_paths.alpha_masks) {
      await validatePublicPath(errors, alphaPath, 'alpha_mask', metadata.id);
    }

    if (Array.isArray(metadata.local_paths.cubemap_faces)) {
      for (const facePath of metadata.local_paths.cubemap_faces) {
        await validatePublicPath(errors, facePath, 'cubemap_face', metadata.id);
      }
    }
  }

  if (errors.length > 0) {
    console.error('❌ Validação falhou:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('✅ Validação concluída sem erros.');
};

main().catch((error) => {
  console.error('❌ Erro durante validação:', error);
  process.exitCode = 1;
});
