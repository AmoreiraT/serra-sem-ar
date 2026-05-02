import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensurePandemicDirs, DEFAULT_MARKDOWN_FILES, REPO_ROOT, SEED_URLS_FILE } from './lib/paths.mjs';
import { extractUrlsFromMarkdown } from './lib/md_link_extractor.mjs';

const parseArgs = (argv) => {
  const args = {
    md: [],
    mdAll: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === '--mdAll') {
      args.mdAll = true;
      continue;
    }
    if (current === '--md') {
      const next = argv[i + 1];
      if (next) {
        args.md.push(next);
        i += 1;
      }
    }
  }

  return args;
};

const resolveMarkdownFiles = (args) => {
  if (args.md.length > 0) {
    return args.md.map((filePath) => path.resolve(REPO_ROOT, filePath));
  }
  if (args.mdAll) {
    return DEFAULT_MARKDOWN_FILES;
  }
  return DEFAULT_MARKDOWN_FILES;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const markdownFiles = resolveMarkdownFiles(args);

  await ensurePandemicDirs();

  const allUrls = [];
  for (const markdownPath of markdownFiles) {
    const content = await readFile(markdownPath, 'utf8');
    const urls = extractUrlsFromMarkdown(content);
    allUrls.push(...urls);
  }

  const deduplicated = Array.from(new Set(allUrls));
  const payload = {
    generated_at: new Date().toISOString(),
    markdown_files: markdownFiles.map((absolutePath) => path.relative(REPO_ROOT, absolutePath)),
    seed_urls: deduplicated,
  };

  await writeFile(SEED_URLS_FILE, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`✅ Seed URLs extraídas: ${deduplicated.length}`);
  console.log(`📄 Arquivo: ${path.relative(REPO_ROOT, SEED_URLS_FILE)}`);
};

main().catch((error) => {
  console.error('❌ Falha ao extrair links:', error);
  process.exitCode = 1;
});
