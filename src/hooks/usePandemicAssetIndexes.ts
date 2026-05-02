import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PandemicAssetMetadata } from '../types/environment';

interface PandemicAssetIndexesState {
  loading: boolean;
  error: Error | null;
  indexA: string[];
  indexB: string[];
  indexAll: string[];
  assetsById: Record<string, PandemicAssetMetadata>;
  loadAssetById: (id: string) => Promise<PandemicAssetMetadata | null>;
}

const fetchJson = async <T>(url: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${url}: ${response.status}`);
  }
  return (await response.json()) as T;
};

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export const usePandemicAssetIndexes = (): PandemicAssetIndexesState => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [indexA, setIndexA] = useState<string[]>([]);
  const [indexB, setIndexB] = useState<string[]>([]);
  const [indexAll, setIndexAll] = useState<string[]>([]);
  const [assetsById, setAssetsById] = useState<Record<string, PandemicAssetMetadata>>({});

  const cacheRef = useRef<Map<string, PandemicAssetMetadata>>(new Map());

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const [a, b, all] = await Promise.all([
          fetchJson<unknown>('/pandemic-assets/metadata/index_A_free_use.json', controller.signal),
          fetchJson<unknown>('/pandemic-assets/metadata/index_B_editorial.json', controller.signal),
          fetchJson<unknown>('/pandemic-assets/metadata/index_all.json', controller.signal),
        ]);

        if (cancelled) return;

        setIndexA(isStringArray(a) ? a : []);
        setIndexB(isStringArray(b) ? b : []);
        setIndexAll(isStringArray(all) ? all : []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error('Falha ao carregar índices de assets.'));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const loadAssetById = useCallback(async (id: string): Promise<PandemicAssetMetadata | null> => {
    if (!id) return null;

    const fromCache = cacheRef.current.get(id);
    if (fromCache) return fromCache;

    try {
      const metadata = await fetchJson<PandemicAssetMetadata>(`/pandemic-assets/metadata/assets/${id}.json`);
      cacheRef.current.set(id, metadata);
      setAssetsById((previous) => {
        if (previous[id]) return previous;
        return {
          ...previous,
          [id]: metadata,
        };
      });
      return metadata;
    } catch {
      return null;
    }
  }, []);

  return useMemo(
    () => ({
      loading,
      error,
      indexA,
      indexB,
      indexAll,
      assetsById,
      loadAssetById,
    }),
    [assetsById, error, indexA, indexAll, indexB, loadAssetById, loading]
  );
};
