import * as cheerio from 'cheerio';

const FREE_USE_PATTERNS = [
  /creative\s+commons/i,
  /cc\s*by/i,
  /cc\s*by-sa/i,
  /cc0/i,
  /public\s+domain/i,
  /public\s+domain\s+mark/i,
  /pdm/i,
];

const EDITORIAL_PATTERNS = [
  /all\s+rights\s+reserved/i,
  /rights-managed/i,
  /editorial/i,
  /licen[cs]e/i,
  /copyright/i,
  /©/,
];

const cleanText = (value) => value.replace(/\s+/g, ' ').trim();

const guessStatusFromText = (text) => {
  if (!text) return 'license_unspecified';
  if (FREE_USE_PATTERNS.some((pattern) => pattern.test(text))) return 'free_use';
  if (EDITORIAL_PATTERNS.some((pattern) => pattern.test(text))) return 'editorial_rights_managed';
  return 'license_unspecified';
};

export const isCommonsUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'commons.wikimedia.org' || parsed.hostname.endsWith('.wikimedia.org');
  } catch {
    return false;
  }
};

const decodeMaybe = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractCommonsFileTitle = (sourcePageUrl, mediaUrl) => {
  const candidates = [sourcePageUrl, mediaUrl].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      if (!parsed.hostname.includes('wikimedia')) continue;

      if (parsed.pathname.startsWith('/wiki/File:')) {
        return decodeMaybe(parsed.pathname.replace('/wiki/', ''));
      }
      if (parsed.pathname.startsWith('/wiki/Special:FilePath/')) {
        const fileName = parsed.pathname.replace('/wiki/Special:FilePath/', '');
        return `File:${decodeMaybe(fileName)}`;
      }
      if (parsed.pathname.includes('/wikipedia/commons/')) {
        const possible = parsed.pathname.split('/').pop();
        if (possible) return `File:${decodeMaybe(possible)}`;
      }
    } catch {
      // noop
    }
  }
  return null;
};

const parseCommonsExtMetadata = (extmetadata) => {
  const getValue = (key) => {
    const item = extmetadata?.[key];
    if (!item || typeof item.value !== 'string') return 'não especificado';
    return cleanText(item.value.replace(/<[^>]*>/g, ''));
  };

  const licenseName = getValue('LicenseShortName');
  const licenseUrl = getValue('LicenseUrl');
  const licenseText = getValue('UsageTerms');
  const author = getValue('Artist');
  const credit = getValue('Credit');
  const dateCaptured = getValue('DateTimeOriginal');

  const combined = [licenseName, licenseUrl, licenseText].join(' ');
  const status = guessStatusFromText(combined);

  return {
    status,
    name: licenseName,
    url: licenseUrl,
    text_snippet: licenseText,
    verified: true,
    author_credit: cleanText(`${author} ${credit}`) || 'não especificado',
    date_captured: dateCaptured,
  };
};

export const fetchCommonsLicense = async ({ sourcePageUrl, mediaUrl, netClient }) => {
  const fileTitle = extractCommonsFileTitle(sourcePageUrl, mediaUrl);
  if (!fileTitle) return null;

  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url|extmetadata');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('titles', fileTitle);

  const response = await netClient.getText(endpoint.toString());
  if (!response.ok) return null;

  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    return null;
  }

  const pages = parsed?.query?.pages;
  if (!pages || typeof pages !== 'object') return null;

  const firstPage = Object.values(pages)[0];
  if (!firstPage || typeof firstPage !== 'object') return null;

  const imageinfo = Array.isArray(firstPage.imageinfo) ? firstPage.imageinfo[0] : null;
  if (!imageinfo) return null;

  const parsedMeta = parseCommonsExtMetadata(imageinfo.extmetadata);
  return {
    license: {
      status: parsedMeta.status,
      name: parsedMeta.name,
      url: parsedMeta.url,
      text_snippet: parsedMeta.text_snippet,
      verified: parsedMeta.verified,
    },
    author_credit: parsedMeta.author_credit,
    date_captured: parsedMeta.date_captured,
    final_media_url: typeof imageinfo.url === 'string' ? imageinfo.url : null,
  };
};

export const extractLicenseFromHtml = (html) => {
  const $ = cheerio.load(html);
  const bodyText = cleanText($('body').text());

  let licenseUrl = 'não especificado';
  $('a[href]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    const lower = href.toLowerCase();
    if (lower.includes('license') || lower.includes('creativecommons.org')) {
      licenseUrl = href;
    }
  });

  const snippetCandidates = [
    $('meta[name="copyright"]').attr('content'),
    $('meta[property="og:site_name"]').attr('content'),
    bodyText.slice(0, 1800),
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);

  const textSnippet = cleanText(snippetCandidates.join(' ')).slice(0, 400) || 'não especificado';
  const status = guessStatusFromText(`${textSnippet} ${licenseUrl}`);

  return {
    license: {
      status,
      name: status === 'free_use' ? 'Creative Commons / Public Domain' : 'não especificado',
      url: licenseUrl,
      text_snippet: textSnippet,
      verified: false,
    },
  };
};

export const classifyLicense = (license) => {
  const name = typeof license?.name === 'string' ? license.name : '';
  const snippet = typeof license?.text_snippet === 'string' ? license.text_snippet : '';
  const url = typeof license?.url === 'string' ? license.url : '';
  const derived = guessStatusFromText(`${name} ${snippet} ${url}`);
  return derived;
};
