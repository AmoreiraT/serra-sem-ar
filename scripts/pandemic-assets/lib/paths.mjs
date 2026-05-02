import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '../../..');

export const DEFAULT_MARKDOWN_FILES = [
  path.resolve(REPO_ROOT, 'docs/deep-research-report.md'),
  path.resolve(REPO_ROOT, 'docs/para-alem-montanha.md'),
  path.resolve(REPO_ROOT, 'docs/prompt-para-alem.md'),
];

export const PANDEMIC_ROOT = path.resolve(REPO_ROOT, 'public/pandemic-assets');
export const WORK_DIR = path.resolve(PANDEMIC_ROOT, '_work');
export const RAW_IMAGES_DIR = path.resolve(PANDEMIC_ROOT, 'raw/images');
export const RAW_VIDEOS_DIR = path.resolve(PANDEMIC_ROOT, 'raw/videos');
export const PROCESSED_TEXTURE_2K_DIR = path.resolve(PANDEMIC_ROOT, 'processed/textures/2k');
export const PROCESSED_TEXTURE_4K_DIR = path.resolve(PANDEMIC_ROOT, 'processed/textures/4k');
export const PROCESSED_NORMAL_DIR = path.resolve(PANDEMIC_ROOT, 'processed/maps/normal');
export const PROCESSED_ROUGHNESS_DIR = path.resolve(PANDEMIC_ROOT, 'processed/maps/roughness');
export const PROCESSED_ALPHA_DIR = path.resolve(PANDEMIC_ROOT, 'processed/masks/alpha');
export const PROCESSED_VIDEO_MP4_DIR = path.resolve(PANDEMIC_ROOT, 'processed/videos/mp4');
export const PROCESSED_VIDEO_WEBM_DIR = path.resolve(PANDEMIC_ROOT, 'processed/videos/webm');
export const PROCESSED_VIDEO_THUMBS_DIR = path.resolve(PANDEMIC_ROOT, 'processed/videos/thumbs');
export const PROCESSED_CUBEMAPS_DIR = path.resolve(PANDEMIC_ROOT, 'processed/cubemaps');
export const METADATA_DIR = path.resolve(PANDEMIC_ROOT, 'metadata');
export const METADATA_ASSETS_DIR = path.resolve(METADATA_DIR, 'assets');
export const LOGS_DIR = path.resolve(PANDEMIC_ROOT, 'logs');
export const REPORTS_DIR = path.resolve(PANDEMIC_ROOT, 'reports');

export const SEED_URLS_FILE = path.resolve(WORK_DIR, 'seed_urls.json');
export const HASH_INDEX_FILE = path.resolve(WORK_DIR, 'hash_index.json');
export const URL_INDEX_FILE = path.resolve(WORK_DIR, 'url_index.json');

export const INDEX_A_FILE = path.resolve(METADATA_DIR, 'index_A_free_use.json');
export const INDEX_B_FILE = path.resolve(METADATA_DIR, 'index_B_editorial.json');
export const INDEX_ALL_FILE = path.resolve(METADATA_DIR, 'index_all.json');

export const SUMMARY_FILE = path.resolve(REPORTS_DIR, 'summary.md');

export const CRAWL_LOG_FILE = path.resolve(LOGS_DIR, 'crawl.jsonl');
export const ERROR_LOG_FILE = path.resolve(LOGS_DIR, 'errors.jsonl');
export const PAYWALL_LOG_FILE = path.resolve(LOGS_DIR, 'skipped_paywall.jsonl');
export const LICENSES_UNSPECIFIED_LOG_FILE = path.resolve(LOGS_DIR, 'licenses_unspecified.jsonl');
export const STREAMING_NON_DOWNLOADABLE_LOG_FILE = path.resolve(LOGS_DIR, 'streaming_non_downloadable.jsonl');
export const NO_DISCOVERABLE_MEDIA_LOG_FILE = path.resolve(LOGS_DIR, 'no_discoverable_media.jsonl');

export const ALL_REQUIRED_DIRS = [
  WORK_DIR,
  RAW_IMAGES_DIR,
  RAW_VIDEOS_DIR,
  PROCESSED_TEXTURE_2K_DIR,
  PROCESSED_TEXTURE_4K_DIR,
  PROCESSED_NORMAL_DIR,
  PROCESSED_ROUGHNESS_DIR,
  PROCESSED_ALPHA_DIR,
  PROCESSED_VIDEO_MP4_DIR,
  PROCESSED_VIDEO_WEBM_DIR,
  PROCESSED_VIDEO_THUMBS_DIR,
  PROCESSED_CUBEMAPS_DIR,
  METADATA_ASSETS_DIR,
  LOGS_DIR,
  REPORTS_DIR,
];

export const toPublicPath = (absolutePath) => {
  const relativeToPublic = path.relative(path.resolve(REPO_ROOT, 'public'), absolutePath);
  return `/${relativeToPublic.split(path.sep).join('/')}`;
};

export const ensurePandemicDirs = async () => {
  await Promise.all(ALL_REQUIRED_DIRS.map((dirPath) => mkdir(dirPath, { recursive: true })));
};
