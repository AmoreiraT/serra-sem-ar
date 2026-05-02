const LINK_PATTERN = /\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi;
const ANGLE_PATTERN = /<\s*(https?:\/\/[^\s>]+)\s*>/gi;
const BARE_PATTERN = /https?:\/\/[^\s)>'"`]+/gi;

const stripTrailingPunctuation = (value) => value.replace(/[.,;:!?]+$/g, '');

export const normalizeUrl = (rawUrl) => {
  try {
    const cleaned = stripTrailingPunctuation(rawUrl.trim());
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

export const extractUrlsFromMarkdown = (markdown) => {
  const urls = [];
  const collect = (pattern) => {
    let match;
    while ((match = pattern.exec(markdown)) !== null) {
      const normalized = normalizeUrl(match[1] ?? match[0]);
      if (normalized) urls.push(normalized);
    }
  };

  collect(LINK_PATTERN);
  collect(ANGLE_PATTERN);

  let bare;
  while ((bare = BARE_PATTERN.exec(markdown)) !== null) {
    const normalized = normalizeUrl(bare[0]);
    if (normalized) urls.push(normalized);
  }

  return Array.from(new Set(urls));
};
