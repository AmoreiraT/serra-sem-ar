import * as cheerio from 'cheerio';

const MEDIA_EXT_RE = /\.(jpg|jpeg|png|webp|mp4|webm|mov|m4v)(\?|$)/i;

const PAYWALL_KEYWORDS = ['subscribe', 'assine', 'login', 'paywall', 'metered', 'sign in'];

const resolveCandidate = (value, baseUrl) => {
  if (!value) return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
};

const pickLargestSrcset = (srcset, baseUrl) => {
  if (!srcset) return null;
  const candidates = srcset
    .split(',')
    .map((entry) => entry.trim())
    .map((entry) => {
      const [rawUrl, sizeToken] = entry.split(/\s+/);
      const resolved = resolveCandidate(rawUrl, baseUrl);
      const width = sizeToken?.toLowerCase().endsWith('w') ? Number(sizeToken.slice(0, -1)) : 0;
      return {
        url: resolved,
        width: Number.isFinite(width) ? width : 0,
      };
    })
    .filter((entry) => entry.url);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.width - a.width);
  return candidates[0].url;
};

const addMedia = (set, candidate, kind) => {
  if (!candidate) return;
  const lowered = candidate.toLowerCase();
  if (!MEDIA_EXT_RE.test(lowered) && !lowered.includes('/upload/') && kind !== 'unknown') return;
  set.add(candidate);
};

export const detectPaywallSignals = (html, statusCode) => {
  if ([401, 402, 403].includes(statusCode)) {
    return {
      blocked: true,
      reason: `http_${statusCode}`,
    };
  }

  const lower = html.toLowerCase();
  const keywordHit = PAYWALL_KEYWORDS.find((keyword) => lower.includes(keyword));
  if (keywordHit) {
    return {
      blocked: true,
      reason: `keyword_${keywordHit}`,
    };
  }

  const hasOverlay = lower.includes('cookie') && (lower.includes('overlay') || lower.includes('consent'));
  if (hasOverlay && lower.length < 22000) {
    return {
      blocked: true,
      reason: 'cookie_overlay_suspected',
    };
  }

  return {
    blocked: false,
    reason: 'ok',
  };
};

export const extractMediaFromHtml = (html, baseUrl) => {
  const $ = cheerio.load(html);
  const media = new Set();

  const ogImage = $('meta[property="og:image"]').attr('content');
  const ogVideo = $('meta[property="og:video"]').attr('content') ?? $('meta[property="og:video:url"]').attr('content');
  const twitterImage = $('meta[name="twitter:image"]').attr('content');

  addMedia(media, resolveCandidate(ogImage, baseUrl), 'image');
  addMedia(media, resolveCandidate(ogVideo, baseUrl), 'video');
  addMedia(media, resolveCandidate(twitterImage, baseUrl), 'image');

  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).contents().text();
    if (!text) return;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    const collectFromObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      const contentUrl = typeof obj.contentUrl === 'string' ? obj.contentUrl : null;
      const thumbnailUrl = typeof obj.thumbnailUrl === 'string' ? obj.thumbnailUrl : null;
      if (contentUrl) addMedia(media, resolveCandidate(contentUrl, baseUrl), 'unknown');
      if (thumbnailUrl) addMedia(media, resolveCandidate(thumbnailUrl, baseUrl), 'unknown');
    };

    if (Array.isArray(parsed)) parsed.forEach(collectFromObject);
    else collectFromObject(parsed);
  });

  $('img').each((_, element) => {
    const src = $(element).attr('src') ?? $(element).attr('data-src');
    const srcset = $(element).attr('srcset');
    const selectedFromSrcset = pickLargestSrcset(srcset, baseUrl);
    addMedia(media, resolveCandidate(selectedFromSrcset ?? src, baseUrl), 'image');
  });

  $('video source, source[type^="video/"]').each((_, element) => {
    const src = $(element).attr('src');
    addMedia(media, resolveCandidate(src, baseUrl), 'video');
  });

  const datePublished =
    $('meta[property="article:published_time"]').attr('content') ??
    $('meta[name="date"]').attr('content') ??
    'não especificado';

  const authorCredit =
    $('meta[name="author"]').attr('content') ??
    $('meta[property="article:author"]').attr('content') ??
    'não especificado';

  const caption = $('meta[property="og:description"]').attr('content') ?? 'não especificado';

  return {
    mediaUrls: Array.from(media),
    inferredMeta: {
      date_published: datePublished,
      author_credit: authorCredit,
      caption,
    },
  };
};
