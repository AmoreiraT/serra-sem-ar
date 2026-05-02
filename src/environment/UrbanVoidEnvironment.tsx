import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import deepResearchMarkdown from '../../docs/deep-research-report.md?raw';
import paraAlemMarkdown from '../../docs/para-alem-montanha.md?raw';
import promptMarkdown from '../../docs/prompt-para-alem.md?raw';
import { useMarkdownImageExtractor } from '../hooks/useMarkdownImageExtractor';
import { usePandemicAssetIndexes } from '../hooks/usePandemicAssetIndexes';
import { usePandemicTextures } from '../hooks/usePandemicTextures';
import { useEnvironmentStore } from '../stores/environmentStore';
import { EnvironmentBand, LayeredLayoutItem, MemoryVideoEntry, PandemicAssetMetadata, SpatialLayoutItem } from '../types/environment';
import { generateSpatialLayout } from './generativeLayout';
import { UrbanLayer } from './UrbanLayer';
import {
  ENVIRONMENT_RENDER_ORDER,
  IMAGE_PLANES_MAX,
  LAYER_COUNTS,
  LAYER_OPACITY_RANGE,
  LAYER_SCALE_MULTIPLIER,
  VIDEO_PLANES_MAX,
} from './environmentConstants';

interface UrbanVoidEnvironmentProps {
  readonly mountainRadius: number;
  readonly mountainCenter: readonly [number, number, number];
  readonly seed: number;
}

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hashBandSeed = (seed: number, salt: number) => (seed * 1664525 + 1013904223 + salt) >>> 0;

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const dedupe = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const keepLocalPublicUrlsOnly = (values: ReadonlyArray<string>): ReadonlyArray<string> =>
  values.filter((value) => value.startsWith('/'));

const pickBySeed = (values: ReadonlyArray<string>, count: number, seed: number): ReadonlyArray<string> => {
  if (values.length <= count) return values;
  const rng = createRng(seed);
  const pool = [...values];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, count);
};

const isPublicAssetPath = (value: string | 'não aplicável' | 'não especificado'): value is string =>
  value !== 'não aplicável' && value !== 'não especificado' && value.startsWith('/');

const bandYAdjustments: Record<EnvironmentBand, readonly [number, number]> = {
  FAR: [7.5, 22],
  MID: [1.5, 14],
  GROUND: [-4.8, 3],
};

const mapToLayer = (
  band: EnvironmentBand,
  entries: ReadonlyArray<SpatialLayoutItem>,
  opacityRange: readonly [number, number],
  scaleMultiplier: number,
  centerOffset: readonly [number, number, number]
): ReadonlyArray<LayeredLayoutItem> => {
  const [minOpacity, maxOpacity] = opacityRange;
  const [minY, maxY] = bandYAdjustments[band];

  return entries.map((entry, index) => ({
    id: `${band}_${index}`,
    band,
    position: [entry.position[0], clamp(entry.position[1], minY, maxY), entry.position[2]],
    rotation: entry.rotation,
    scale: entry.scale * scaleMultiplier,
    opacity: clamp(entry.opacity, minOpacity, maxOpacity),
    renderOrder: ENVIRONMENT_RENDER_ORDER[band],
  })).map((item) => ({
    ...item,
    position: [
      item.position[0] + centerOffset[0],
      item.position[1] + centerOffset[1],
      item.position[2] + centerOffset[2],
    ] as const,
  }));
};

const splitTexturesByBand = <T,>(items: ReadonlyArray<T>): Record<EnvironmentBand, ReadonlyArray<T>> => {
  if (!items.length) {
    return { FAR: [], MID: [], GROUND: [] };
  }

  const farCount = Math.max(1, Math.floor(items.length * 0.33));
  const midCount = Math.max(1, Math.floor(items.length * 0.42));
  const far = items.slice(0, farCount);
  const mid = items.slice(farCount, farCount + midCount);
  const ground = items.slice(farCount + midCount);

  return {
    FAR: far.length ? far : items,
    MID: mid.length ? mid : items,
    GROUND: ground.length ? ground : items,
  };
};

const selectAssetImageUrl = (asset: PandemicAssetMetadata): string | null => {
  if (asset.type !== 'image') return null;
  if (asset.ingest.http_status >= 400) return null;
  if (asset.hashes.sha256 === EMPTY_SHA) return null;

  if (isPublicAssetPath(asset.local_paths.texture_2k)) return asset.local_paths.texture_2k;
  if (isPublicAssetPath(asset.local_paths.texture_4k)) return asset.local_paths.texture_4k;
  if (isPublicAssetPath(asset.local_paths.raw)) return asset.local_paths.raw;
  return null;
};

const selectAssetVideoUrl = (asset: PandemicAssetMetadata): string | null => {
  if (asset.type !== 'video') return null;
  if (isPublicAssetPath(asset.local_paths.video_webm)) return asset.local_paths.video_webm;
  if (isPublicAssetPath(asset.local_paths.video_mp4)) return asset.local_paths.video_mp4;
  return null;
};

export const UrbanVoidEnvironment = ({ mountainRadius, mountainCenter, seed }: UrbanVoidEnvironmentProps) => {
  const setSeed = useEnvironmentStore((state) => state.setSeed);
  const setTextureAnisotropy = useEnvironmentStore((state) => state.setTextureAnisotropy);

  const { indexA, indexB, indexAll, assetsById, loadAssetById } = usePandemicAssetIndexes();

  const [alphaMasks, setAlphaMasks] = useState<ReadonlyArray<THREE.Texture>>([]);
  const [memoryVideoEntries, setMemoryVideoEntries] = useState<ReadonlyArray<MemoryVideoEntry>>([]);

  useEffect(() => {
    setSeed(seed);
    const anisotropy = typeof window !== 'undefined' && window.innerWidth < 900 ? 4 : 8;
    setTextureAnisotropy(anisotropy);
  }, [seed, setSeed, setTextureAnisotropy]);

  useEffect(() => {
    let cancelled = false;
    const loadMemoryVideos = async () => {
      try {
        const response = await fetch('/pandemic-assets/metadata/memory_video_manifest.json');
        if (!response.ok) return;
        const parsed = (await response.json()) as { entries?: MemoryVideoEntry[] };
        if (cancelled || !Array.isArray(parsed.entries)) return;
        setMemoryVideoEntries(parsed.entries);
      } catch {
        if (!cancelled) setMemoryVideoEntries([]);
      }
    };

    void loadMemoryVideos();

    return () => {
      cancelled = true;
    };
  }, []);

  const markdownSource = useMemo(
    () => [paraAlemMarkdown, deepResearchMarkdown, promptMarkdown].join('\n\n'),
    []
  );

  // Keep extractor active for observability/debug, but avoid remote HTTP sources in runtime to prevent CORS.
  const markdownImageUrls = useMarkdownImageExtractor(markdownSource);

  const allIds = useMemo(() => dedupe([...indexAll, ...indexA, ...indexB]), [indexA, indexAll, indexB]);

  useEffect(() => {
    if (!allIds.length) return;
    void Promise.all(allIds.map((id) => loadAssetById(id)));
  }, [allIds, loadAssetById]);

  const loadedAssets = useMemo(() => Object.values(assetsById), [assetsById]);

  const imageUrlsFromAssets = useMemo(
    () =>
      dedupe(
        loadedAssets
          .map(selectAssetImageUrl)
          .filter((value): value is string => Boolean(value))
      ),
    [loadedAssets]
  );

  const alphaMaskUrlsFromAssets = useMemo(
    () =>
      dedupe(
        loadedAssets.flatMap((asset) =>
          asset.type === 'image'
            ? asset.local_paths.alpha_masks.filter((maskPath): maskPath is string => maskPath.startsWith('/'))
            : []
        )
      ),
    [loadedAssets]
  );

  const videoUrlsFromAssets = useMemo(
    () =>
      dedupe(
        loadedAssets
          .map(selectAssetVideoUrl)
          .filter((value): value is string => Boolean(value))
      ),
    [loadedAssets]
  );

  const memoryVideoUrls = useMemo(
    () =>
      dedupe(
        memoryVideoEntries
          .map((entry) => entry.video_webm || entry.video_mp4)
          .filter((value): value is string => Boolean(value && value.startsWith('/')))
      ),
    [memoryVideoEntries]
  );

  const selectedVideoUrls = useMemo(() => {
    const source = videoUrlsFromAssets.length ? videoUrlsFromAssets : memoryVideoUrls;
    return pickBySeed(source, VIDEO_PLANES_MAX, hashBandSeed(seed, 220));
  }, [memoryVideoUrls, seed, videoUrlsFromAssets]);

  const selectedImageUrls = useMemo(() => {
    const localAssetUrls = keepLocalPublicUrlsOnly(imageUrlsFromAssets);
    if (!localAssetUrls.length) return [];
    return pickBySeed(localAssetUrls, IMAGE_PLANES_MAX, hashBandSeed(seed, 120));
  }, [imageUrlsFromAssets, seed]);

  const debugMarkdownImageCount = markdownImageUrls.length;

  const { textures, isLoading } = usePandemicTextures(selectedImageUrls);

  const selectedAlphaMaskUrls = useMemo(
    () => pickBySeed(alphaMaskUrlsFromAssets, 8, hashBandSeed(seed, 420)),
    [alphaMaskUrlsFromAssets, seed]
  );

  useEffect(() => {
    let cancelled = false;

    if (!selectedAlphaMaskUrls.length) {
      setAlphaMasks((previous) => {
        previous.forEach((texture) => texture.dispose());
        return [];
      });
      return () => {
        cancelled = true;
      };
    }

    const loader = new THREE.TextureLoader();

    const loadMasks = async () => {
      const loaded = await Promise.all(
        selectedAlphaMaskUrls.map(async (maskUrl) => {
          try {
            const texture = await loader.loadAsync(maskUrl);
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
            return texture;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) {
        loaded.forEach((texture) => texture?.dispose());
        return;
      }

      setAlphaMasks((previous) => {
        previous.forEach((texture) => texture.dispose());
        return loaded.filter((texture): texture is THREE.Texture => texture !== null);
      });
    };

    void loadMasks();

    return () => {
      cancelled = true;
    };
  }, [selectedAlphaMaskUrls]);

  const beyondOffset = useMemo<readonly [number, number, number]>(
    () => [mountainCenter[0] + mountainRadius * 1.45, 0, mountainCenter[2]],
    [mountainCenter, mountainRadius]
  );

  const farLayout = useMemo(
    () =>
      mapToLayer(
        'FAR',
        generateSpatialLayout(hashBandSeed(seed, 17), LAYER_COUNTS.FAR, mountainRadius * 1.15, mountainRadius * 4.8),
        LAYER_OPACITY_RANGE.FAR,
        LAYER_SCALE_MULTIPLIER.FAR,
        beyondOffset
      ),
    [beyondOffset, mountainRadius, seed]
  );

  const midLayout = useMemo(
    () =>
      mapToLayer(
        'MID',
        generateSpatialLayout(hashBandSeed(seed, 47), LAYER_COUNTS.MID, mountainRadius * 0.95, mountainRadius * 3.4),
        LAYER_OPACITY_RANGE.MID,
        LAYER_SCALE_MULTIPLIER.MID,
        beyondOffset
      ),
    [beyondOffset, mountainRadius, seed]
  );

  const groundLayout = useMemo(
    () =>
      mapToLayer(
        'GROUND',
        generateSpatialLayout(hashBandSeed(seed, 83), LAYER_COUNTS.GROUND, mountainRadius * 0.9, mountainRadius * 2.8),
        LAYER_OPACITY_RANGE.GROUND,
        LAYER_SCALE_MULTIPLIER.GROUND,
        beyondOffset
      ),
    [beyondOffset, mountainRadius, seed]
  );

  const videoByItemId = useMemo(() => {
    if (!selectedVideoUrls.length) return {};

    const eligibleItems = [...farLayout, ...midLayout];
    if (!eligibleItems.length) return {};

    const assignments: Record<string, string> = {};
    for (let i = 0; i < selectedVideoUrls.length; i += 1) {
      const slot = Math.floor(((i + 1) * eligibleItems.length) / (selectedVideoUrls.length + 1));
      const targetItem = eligibleItems[Math.min(slot, eligibleItems.length - 1)];
      assignments[targetItem.id] = selectedVideoUrls[i];
    }

    return assignments;
  }, [farLayout, midLayout, selectedVideoUrls]);

  const textureBands = useMemo(() => splitTexturesByBand(textures), [textures]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (debugMarkdownImageCount <= 0) return;
    // eslint-disable-next-line no-console
    console.debug('[UrbanVoidEnvironment] markdown image urls ignored at runtime to avoid CORS:', debugMarkdownImageCount);
  }, [debugMarkdownImageCount]);

  if (isLoading || !textures.length) return null;

  return (
    <group renderOrder={-10}>
      <UrbanLayer
        band="FAR"
        items={farLayout}
        textures={textureBands.FAR}
        alphaMasks={[]}
        videoByItemId={videoByItemId}
      />
      <UrbanLayer
        band="MID"
        items={midLayout}
        textures={textureBands.MID}
        alphaMasks={[]}
        videoByItemId={videoByItemId}
      />
      <UrbanLayer
        band="GROUND"
        items={groundLayout}
        textures={textureBands.GROUND}
        alphaMasks={alphaMasks}
      />
    </group>
  );
};
