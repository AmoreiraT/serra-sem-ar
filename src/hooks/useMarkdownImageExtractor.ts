import { useMemo } from 'react';

const IMAGE_EXTENSION_REGEX = /\.(jpg|jpeg|png|webp)(?:\?.*)?$/i;
const RAW_URL_REGEX = /https?:\/\/[^\s)>'"`]+/gi;

const normalizeCandidateUrl = (rawValue: string): string | null => {
  const cleaned = rawValue.replace(/[.,;:!?]+$/g, '').trim();
  if (!cleaned) return null;

  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!IMAGE_EXTENSION_REGEX.test(parsed.href)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

export const useMarkdownImageExtractor = (markdown: string): ReadonlyArray<string> =>
  useMemo(() => {
    if (!markdown.trim()) return [];

    const matches = markdown.match(RAW_URL_REGEX) ?? [];
    const deduped = new Set<string>();

    for (const match of matches) {
      const normalized = normalizeCandidateUrl(match);
      if (!normalized) continue;
      deduped.add(normalized);
    }

    return Array.from(deduped);
  }, [markdown]);
