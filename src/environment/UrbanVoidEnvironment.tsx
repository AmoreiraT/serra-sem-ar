import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import deepResearchMarkdown from '../../docs/deep-research-report.md?raw';
import paraAlemMarkdown from '../../docs/para-alem-montanha.md?raw';
import promptMarkdown from '../../docs/prompt-para-alem.md?raw';
import { useMarkdownImageExtractor } from '../hooks/useMarkdownImageExtractor';
import { usePandemicAssetIndexes } from '../hooks/usePandemicAssetIndexes';
import { usePandemicTextures } from '../hooks/usePandemicTextures';
import { useEnvironmentStore } from '../stores/environmentStore';
import { usePerformanceProfileStore } from '../stores/performanceProfileStore';
import { EnvironmentBand, LayeredLayoutItem, MemoryVideoEntry, PandemicAssetMetadata, SpatialLayoutItem } from '../types/environment';
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
  readonly quality?: EnvironmentQuality;
}

const EMPTY_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export type EnvironmentQuality = 'full' | 'balanced' | 'lean';

type EnvironmentQualityConfig = {
  layerCounts: Record<EnvironmentBand, number>;
  imageLimit: number;
  videoLimit: number;
  assetMetadataLimit: number;
  alphaMaskLimit: number;
  anisotropy: number;
};

const environmentQualityMap: Record<EnvironmentQuality, EnvironmentQualityConfig> = {
  full: {
    layerCounts: LAYER_COUNTS,
    imageLimit: IMAGE_PLANES_MAX,
    videoLimit: VIDEO_PLANES_MAX,
    assetMetadataLimit: 96,
    alphaMaskLimit: 8,
    anisotropy: 8,
  },
  balanced: {
    layerCounts: {
      FAR: 5,
      MID: 8,
      GROUND: 6,
    },
    imageLimit: 22,
    videoLimit: 1,
    assetMetadataLimit: 42,
    alphaMaskLimit: 4,
    anisotropy: 4,
  },
  lean: {
    layerCounts: {
      FAR: 3,
      MID: 5,
      GROUND: 3,
    },
    imageLimit: 12,
    videoLimit: 0,
    assetMetadataLimit: 24,
    alphaMaskLimit: 2,
    anisotropy: 2,
  },
};

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

const NON_NARRATIVE_IMAGE_TERMS = [
  'amazon_real_cop30',
  'apoiadores',
  'aplicativo',
  'botao',
  'botaowhats',
  'busca',
  'compartilhar',
  'copyright',
  'curtir',
  'desenvolvimento',
  'disque',
  'divisor',
  'externo',
  'facebook',
  'fechar',
  'governo2',
  'grupo_menu',
  'home_',
  'home-menu',
  'home_menu',
  'i_cruz',
  'i_quepe',
  'i_sangue',
  'icone',
  'icon',
  'instagram',
  'logo',
  'menu',
  'pmpa',
  'procempa',
  'rede_sauderj',
  'redes',
  'rodape',
  'secretaria',
  'seguir',
  'selo',
  'seta',
  'topo',
  'trust',
  'whats',
];

const normalizeForAssetFilter = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');

const isNarrativeImageAsset = (asset: PandemicAssetMetadata): boolean => {
  const { width, height } = asset.resolution;
  if (width < 640 || height < 360) return false;

  const aspectRatio = width / Math.max(height, 1);
  if (aspectRatio < 0.35 || aspectRatio > 3.9) return false;

  const searchableText = normalizeForAssetFilter(
    [
      asset.original_filename,
      asset.caption,
      asset.source_name,
      asset.source_page_url,
      asset.original_media_url,
      asset.local_paths.raw,
    ].join(' ')
  );

  return !NON_NARRATIVE_IMAGE_TERMS.some((term) => searchableText.includes(term));
};

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

const getFocusCandidate = (
  items: ReadonlyArray<LayeredLayoutItem>,
  camera: THREE.Camera,
  forward: THREE.Vector3,
  toItem: THREE.Vector3
): { id: string; dot: number; score: number } | null => {
  let best: { id: string; dot: number; score: number } | null = null;

  for (const item of items) {
    toItem.set(item.position[0] - camera.position.x, item.position[1] - camera.position.y, item.position[2] - camera.position.z);
    const distance = toItem.length();
    if (distance < 18 || distance > 560) continue;

    toItem.normalize();
    const dot = forward.dot(toItem);
    if (dot < 0.962) continue;

    const distanceScore = THREE.MathUtils.clamp(1 - distance / 560, 0, 1) * 0.018;
    const bandScore = item.band === 'GROUND' ? 0.006 : item.band === 'MID' ? 0.003 : 0;
    const score = dot + distanceScore + bandScore;

    if (!best || score > best.score) {
      best = { id: item.id, dot, score };
    }
  }

  return best;
};

const generateCorridorLayout = (
  seed: number,
  count: number,
  mountainRadius: number,
  band: EnvironmentBand
): ReadonlyArray<SpatialLayoutItem> => {
  const rng = createRng(seed);
  const xHalfRange = Math.max(220, mountainRadius * 0.92);
  const zRanges: Record<EnvironmentBand, readonly [number, number]> = {
    FAR: [170, 340],
    MID: [95, 210],
    GROUND: [54, 135],
  };
  const scaleRanges: Record<EnvironmentBand, readonly [number, number]> = {
    FAR: [10, 28],
    MID: [9, 24],
    GROUND: [7, 18],
  };
  const yRanges: Record<EnvironmentBand, readonly [number, number]> = {
    FAR: [10, 24],
    MID: [4, 16],
    GROUND: [-1.2, 5.5],
  };
  const [zMin, zMax] = zRanges[band];
  const [scaleMin, scaleMax] = scaleRanges[band];
  const [yMin, yMax] = yRanges[band];
  const items: SpatialLayoutItem[] = [];

  for (let i = 0; i < count; i += 1) {
    const side = rng() > 0.5 ? -1 : 1;
    const xT = count <= 1 ? 0.5 : (i + rng() * 0.7) / Math.max(count - 0.3, 1);
    const stagger = (rng() - 0.5) * (xHalfRange * 0.34);
    const x = THREE.MathUtils.lerp(-xHalfRange, xHalfRange, xT) + stagger;
    const z = side * THREE.MathUtils.lerp(zMin, zMax, Math.pow(rng(), 0.58));
    const y = THREE.MathUtils.lerp(yMin, yMax, rng());
    const scale = THREE.MathUtils.lerp(scaleMin, scaleMax, rng());
    const opacity = THREE.MathUtils.lerp(0.9, 1, rng());

    items.push({
      position: [x, y, z],
      rotation: [0, (side < 0 ? Math.PI * 0.08 : -Math.PI * 0.08) + (rng() - 0.5) * 0.65, 0],
      scale,
      opacity,
    });
  }

  return items;
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
  if (!isNarrativeImageAsset(asset)) return null;

  if (isPublicAssetPath(asset.local_paths.texture_2k)) return asset.local_paths.texture_2k;
  if (isPublicAssetPath(asset.local_paths.texture_4k)) return asset.local_paths.texture_4k;
  return null;
};

const selectAssetVideoUrl = (asset: PandemicAssetMetadata): string | null => {
  if (asset.type !== 'video') return null;
  if (isPublicAssetPath(asset.local_paths.video_webm)) return asset.local_paths.video_webm;
  if (isPublicAssetPath(asset.local_paths.video_mp4)) return asset.local_paths.video_mp4;
  return null;
};

export const UrbanVoidEnvironment = ({
  mountainRadius,
  mountainCenter,
  seed,
  quality = 'full',
}: UrbanVoidEnvironmentProps) => {
  const setSeed = useEnvironmentStore((state) => state.setSeed);
  const setTextureAnisotropy = useEnvironmentStore((state) => state.setTextureAnisotropy);
  const profileAnisotropyCap = usePerformanceProfileStore((state) => state.profile.render.textureMaxAnisotropy);
  const qualityConfig = environmentQualityMap[quality];
  const effectiveAnisotropy = Math.max(1, Math.min(qualityConfig.anisotropy, profileAnisotropyCap));

  const { indexA, indexB, indexAll, assetsById, loadAssetById } = usePandemicAssetIndexes();

  const [alphaMasks, setAlphaMasks] = useState<ReadonlyArray<THREE.Texture>>([]);
  const [memoryVideoEntries, setMemoryVideoEntries] = useState<ReadonlyArray<MemoryVideoEntry>>([]);

  useEffect(() => {
    setSeed(seed);
    setTextureAnisotropy(effectiveAnisotropy);
  }, [effectiveAnisotropy, seed, setSeed, setTextureAnisotropy]);

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
  const selectedAssetIds = useMemo(
    () => pickBySeed(allIds, qualityConfig.assetMetadataLimit, hashBandSeed(seed, 72)),
    [allIds, qualityConfig.assetMetadataLimit, seed]
  );

  useEffect(() => {
    if (!selectedAssetIds.length) return;
    void Promise.all(selectedAssetIds.map((id) => loadAssetById(id)));
  }, [loadAssetById, selectedAssetIds]);

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
    return pickBySeed(source, qualityConfig.videoLimit, hashBandSeed(seed, 220));
  }, [memoryVideoUrls, qualityConfig.videoLimit, seed, videoUrlsFromAssets]);

  const selectedImageUrls = useMemo(() => {
    const localAssetUrls = keepLocalPublicUrlsOnly(imageUrlsFromAssets);
    if (!localAssetUrls.length) return [];
    return pickBySeed(localAssetUrls, qualityConfig.imageLimit, hashBandSeed(seed, 120));
  }, [imageUrlsFromAssets, qualityConfig.imageLimit, seed]);

  const debugMarkdownImageCount = markdownImageUrls.length;

  const { textures, isLoading } = usePandemicTextures(selectedImageUrls);

  const selectedAlphaMaskUrls = useMemo(
    () => pickBySeed(alphaMaskUrlsFromAssets, qualityConfig.alphaMaskLimit, hashBandSeed(seed, 420)),
    [alphaMaskUrlsFromAssets, qualityConfig.alphaMaskLimit, seed]
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
    () => [mountainCenter[0], 0, mountainCenter[2]],
    [mountainCenter]
  );

  const farLayout = useMemo(
    () =>
      mapToLayer(
        'FAR',
        generateCorridorLayout(
          hashBandSeed(seed, 17),
          qualityConfig.layerCounts.FAR,
          mountainRadius,
          'FAR'
        ),
        LAYER_OPACITY_RANGE.FAR,
        LAYER_SCALE_MULTIPLIER.FAR,
        beyondOffset
      ),
    [beyondOffset, mountainRadius, qualityConfig.layerCounts.FAR, seed]
  );

  const midLayout = useMemo(
    () =>
      mapToLayer(
        'MID',
        generateCorridorLayout(
          hashBandSeed(seed, 47),
          qualityConfig.layerCounts.MID,
          mountainRadius,
          'MID'
        ),
        LAYER_OPACITY_RANGE.MID,
        LAYER_SCALE_MULTIPLIER.MID,
        beyondOffset
      ),
    [beyondOffset, mountainRadius, qualityConfig.layerCounts.MID, seed]
  );

  const groundLayout = useMemo(
    () =>
      mapToLayer(
        'GROUND',
        generateCorridorLayout(
          hashBandSeed(seed, 83),
          qualityConfig.layerCounts.GROUND,
          mountainRadius,
          'GROUND'
        ),
        LAYER_OPACITY_RANGE.GROUND,
        LAYER_SCALE_MULTIPLIER.GROUND,
        beyondOffset
      ),
    [beyondOffset, mountainRadius, qualityConfig.layerCounts.GROUND, seed]
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
  const allLayoutItems = useMemo(
    () => [...groundLayout, ...midLayout, ...farLayout],
    [farLayout, groundLayout, midLayout]
  );
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const focusedItemIdRef = useRef<string | null>(null);
  const lastFocusSampleRef = useRef(0);
  const focusForwardRef = useRef(new THREE.Vector3());
  const focusToItemRef = useRef(new THREE.Vector3());
  const mountainSideClearance = useMemo(
    () => THREE.MathUtils.clamp(mountainRadius * 0.045, 16, 26),
    [mountainRadius]
  );

  useFrame(({ camera, clock }) => {
    const elapsed = clock.getElapsedTime();
    if (elapsed - lastFocusSampleRef.current < 0.12) return;
    lastFocusSampleRef.current = elapsed;

    camera.getWorldDirection(focusForwardRef.current);
    const candidate = getFocusCandidate(allLayoutItems, camera, focusForwardRef.current, focusToItemRef.current);
    const currentId = focusedItemIdRef.current;
    const currentCandidate = currentId
      ? getFocusCandidate(
          allLayoutItems.filter((item) => item.id === currentId),
          camera,
          focusForwardRef.current,
          focusToItemRef.current
        )
      : null;
    const nextId = currentCandidate && currentCandidate.dot > 0.972
      ? currentId
      : candidate && candidate.dot > 0.984
        ? candidate.id
        : null;

    if (nextId === focusedItemIdRef.current) return;
    focusedItemIdRef.current = nextId;
    setFocusedItemId(nextId);
  });

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
        focusedItemId={focusedItemId}
        mountainCenter={mountainCenter}
        mountainSideClearance={mountainSideClearance}
      />
      <UrbanLayer
        band="MID"
        items={midLayout}
        textures={textureBands.MID}
        alphaMasks={[]}
        videoByItemId={videoByItemId}
        focusedItemId={focusedItemId}
        mountainCenter={mountainCenter}
        mountainSideClearance={mountainSideClearance}
      />
      <UrbanLayer
        band="GROUND"
        items={groundLayout}
        textures={textureBands.GROUND}
        alphaMasks={alphaMasks}
        focusedItemId={focusedItemId}
        mountainCenter={mountainCenter}
        mountainSideClearance={mountainSideClearance}
      />
    </group>
  );
};
