import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OptimizedTextureAsset } from '../assets/tabletOptimizedAssets';
import { getSharedKtx2Loader } from '../services/ktx2Loader';
import { startPerformanceTrace } from '../services/performanceMonitoring';
import { usePerformanceProfileStore } from '../stores/performanceProfileStore';
import type { PerformanceProfile } from '../types/performanceProfile';

type TextureInput =
  | string
  | (OptimizedTextureAsset & {
      readonly original?: string;
    })
  | undefined;

type TextureMapKey =
  | 'diffuseMap'
  | 'normalMap'
  | 'aoMap'
  | 'roughnessMap'
  | 'pathDiffuse'
  | 'pathNormal'
  | 'pathAO'
  | 'pathRough'
  | 'pathHeight'
  | 'pathMetallic';

type TextureLoaderResult = Partial<Record<TextureMapKey, THREE.Texture>>;

const isOptimizedTextureAsset = (
  source: TextureInput
): source is OptimizedTextureAsset & { readonly original?: string } =>
  typeof source === 'object' && source !== null && typeof source.fallback === 'string' && typeof source.ktx2 === 'string';

const getTextureCacheKey = (source: TextureInput): string => {
  if (!source) return '';
  if (typeof source === 'string') return source;
  return `${source.label}:${source.original ?? ''}:${source.fallback}:${source.ktx2}:${source.role}`;
};

const configureTexture = (texture: THREE.Texture, source: TextureInput) => {
  if (isOptimizedTextureAsset(source) && source.role === 'color') {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  if (!(texture instanceof THREE.CompressedTexture)) {
    texture.needsUpdate = true;
  }
};

const getDeviceMemoryGb = (): number => {
  if (typeof navigator === 'undefined') return 8;
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
};

const getViewportPixelBudget = (): number => {
  if (typeof window === 'undefined') return 1024 * 768;
  const dpr = window.devicePixelRatio || 1;
  return window.innerWidth * window.innerHeight * dpr * dpr;
};

const shouldUseOptimizedTexture = (
  profile: PerformanceProfile,
  renderer: THREE.WebGLRenderer
): boolean => {
  const memory = getDeviceMemoryGb();
  const maxTextureSize = renderer.capabilities.maxTextureSize || 0;
  const viewportPixels = getViewportPixelBudget();

  return (
    profile.deviceClass === 'tablet' ||
    profile.render.mountainQuality === 'mobile' ||
    memory <= 4 ||
    (maxTextureSize > 0 && maxTextureSize <= 4096) ||
    viewportPixels >= 3_500_000
  );
};

const selectOptimizedTextureAsset = (
  source: OptimizedTextureAsset & { readonly original?: string },
  renderer: THREE.WebGLRenderer
): OptimizedTextureAsset & { readonly original?: string } => {
  if (!source.variants?.length) return source;

  const memory = getDeviceMemoryGb();
  const maxTextureSize = renderer.capabilities.maxTextureSize || 0;
  const viewportPixels = getViewportPixelBudget();
  const needsLowTier = memory <= 4 || (maxTextureSize > 0 && maxTextureSize <= 4096) || viewportPixels >= 4_500_000;
  const selectedVariant =
    (needsLowTier
      ? source.variants.find((variant) => variant.tier === 'low')
      : source.variants.find((variant) => variant.tier === 'standard')) ?? source.variants[0];

  return {
    ...source,
    fallback: selectedVariant.fallback,
    ktx2: selectedVariant.ktx2,
    label: `${source.label}-${selectedVariant.tier}`,
  };
};

const disposeTextures = (textures: Iterable<THREE.Texture | undefined>) => {
  for (const texture of textures) {
    texture?.dispose();
  }
};

const textureEntriesFrom = (
  diffuseTexture?: TextureInput,
  normalTexture?: TextureInput,
  aoTexture?: TextureInput,
  roughnessTexture?: TextureInput,
  pathDiffuseTexture?: TextureInput,
  pathNormalTexture?: TextureInput,
  pathAOTexture?: TextureInput,
  pathRoughTexture?: TextureInput,
  pathHeightTexture?: TextureInput,
  pathMetallicTexture?: TextureInput
): ReadonlyArray<readonly [TextureMapKey, TextureInput]> => [
  ['diffuseMap', diffuseTexture],
  ['normalMap', normalTexture],
  ['aoMap', aoTexture],
  ['roughnessMap', roughnessTexture],
  ['pathDiffuse', pathDiffuseTexture],
  ['pathNormal', pathNormalTexture],
  ['pathAO', pathAOTexture],
  ['pathRough', pathRoughTexture],
  ['pathHeight', pathHeightTexture],
  ['pathMetallic', pathMetallicTexture],
];

const useTextureLoader = (
  diffuseTexture?: TextureInput,
  normalTexture?: TextureInput,
  aoTexture?: TextureInput,
  roughnessTexture?: TextureInput,
  pathDiffuseTexture?: TextureInput,
  pathNormalTexture?: TextureInput,
  pathAOTexture?: TextureInput,
  pathRoughTexture?: TextureInput,
  pathHeightTexture?: TextureInput,
  pathMetallicTexture?: TextureInput
): TextureLoaderResult => {
  const { gl } = useThree();
  const profile = usePerformanceProfileStore((state) => state.profile);
  const [maps, setMaps] = useState<TextureLoaderResult>({});
  const activeTexturesRef = useRef<THREE.Texture[]>([]);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const sources = useMemo(
    () =>
      textureEntriesFrom(
        diffuseTexture,
        normalTexture,
        aoTexture,
        roughnessTexture,
        pathDiffuseTexture,
        pathNormalTexture,
        pathAOTexture,
        pathRoughTexture,
        pathHeightTexture,
        pathMetallicTexture
      ),
    [
      diffuseTexture,
      normalTexture,
      aoTexture,
      roughnessTexture,
      pathDiffuseTexture,
      pathNormalTexture,
      pathAOTexture,
      pathRoughTexture,
      pathHeightTexture,
      pathMetallicTexture,
    ]
  );
  const sourceKey = useMemo(() => sources.map(([, source]) => getTextureCacheKey(source)).join('|'), [sources]);
  const preferCompressedTextures = profile.deviceClass === 'tablet' && profile.render.preferCompressedTextures;
  const capabilityKey = `${gl.capabilities.maxTextureSize}:${getDeviceMemoryGb()}:${
    typeof window === 'undefined' ? 'ssr' : `${window.innerWidth}x${window.innerHeight}:${window.devicePixelRatio || 1}`
  }`;

  useEffect(() => {
    let cancelled = false;
    const nextTextures: THREE.Texture[] = [];
    const useOptimizedTexture = shouldUseOptimizedTexture(profile, gl);
    const traceHandle = startPerformanceTrace('texture_batch_load', {
      device_class: profile.deviceClass,
      asset_variant: profile.render.assetVariant,
      render_mode: profile.render.experience,
      profile_version: profile.version,
    });
    const criticalTraceHandle =
      profile.deviceClass === 'tablet' && sources.some(([, source]) => isOptimizedTextureAsset(source))
        ? startPerformanceTrace('tablet_critical_assets_loaded', {
            device_class: profile.deviceClass,
            asset_variant: profile.render.assetVariant,
            render_mode: profile.render.experience,
            profile_version: profile.version,
          })
        : null;
    let compressedTextureCount = 0;
    let fallbackTextureCount = 0;

    const loadFallback = async (source: TextureInput): Promise<THREE.Texture | undefined> => {
      if (!source) return undefined;
      const fallbackUrl = isOptimizedTextureAsset(source) ? source.original ?? source.fallback : source;
      const texture = await textureLoader.loadAsync(fallbackUrl);
      fallbackTextureCount += 1;
      configureTexture(texture, source);
      return texture;
    };

    const loadOptimizedFallback = async (source: OptimizedTextureAsset & { readonly original?: string }) => {
      try {
        const texture = await textureLoader.loadAsync(source.fallback);
        fallbackTextureCount += 1;
        configureTexture(texture, source);
        return texture;
      } catch {
        return loadFallback(source);
      }
    };

    const loadOne = async (source: TextureInput): Promise<THREE.Texture | undefined> => {
      if (!source) return undefined;
      if (!isOptimizedTextureAsset(source)) return loadFallback(source);

      const selectedSource = selectOptimizedTextureAsset(source, gl);
      if (!useOptimizedTexture) return loadFallback(selectedSource);
      if (!preferCompressedTextures) return loadOptimizedFallback(selectedSource);

      try {
        const texture = await getSharedKtx2Loader(gl).loadAsync(selectedSource.ktx2);
        compressedTextureCount += 1;
        configureTexture(texture, selectedSource);
        return texture;
      } catch {
        return loadOptimizedFallback(selectedSource);
      }
    };

    const loadAll = async () => {
      disposeTextures(activeTexturesRef.current);
      activeTexturesRef.current = [];

      const loadedEntries = await Promise.all(
        sources.map(async ([key, source]) => {
          const texture = await loadOne(source);
          if (texture) nextTextures.push(texture);
          return [key, texture] as const;
        })
      );

      if (cancelled) {
        disposeTextures(nextTextures);
        return;
      }

      const nextMaps: TextureLoaderResult = {};
      for (const [key, texture] of loadedEntries) {
        if (texture) nextMaps[key] = texture;
      }
      activeTexturesRef.current = nextTextures;
      traceHandle.putMetric('texture_count', nextTextures.length);
      traceHandle.putMetric('compressed_texture_count', compressedTextureCount);
      traceHandle.putMetric('fallback_texture_count', fallbackTextureCount);
      traceHandle.stop();
      criticalTraceHandle?.putMetric('texture_count', nextTextures.length);
      criticalTraceHandle?.putMetric('compressed_texture_count', compressedTextureCount);
      criticalTraceHandle?.putMetric('fallback_texture_count', fallbackTextureCount);
      criticalTraceHandle?.stop();
      setMaps(nextMaps);
    };

    void loadAll().catch(() => {
      traceHandle.putMetric('texture_count', nextTextures.length);
      traceHandle.putMetric('compressed_texture_count', compressedTextureCount);
      traceHandle.putMetric('fallback_texture_count', fallbackTextureCount);
      traceHandle.stop({ status: 'error' });
      criticalTraceHandle?.putMetric('texture_count', nextTextures.length);
      criticalTraceHandle?.putMetric('compressed_texture_count', compressedTextureCount);
      criticalTraceHandle?.putMetric('fallback_texture_count', fallbackTextureCount);
      criticalTraceHandle?.stop({ status: 'error' });
      if (!cancelled) setMaps({});
    });

    return () => {
      cancelled = true;
      traceHandle.stop({ status: 'cancelled' });
      criticalTraceHandle?.stop({ status: 'cancelled' });
      disposeTextures(nextTextures);
      disposeTextures(activeTexturesRef.current);
      activeTexturesRef.current = [];
    };
  }, [
    gl,
    capabilityKey,
    preferCompressedTextures,
    profile.deviceClass,
    profile.render.assetVariant,
    profile.render.experience,
    profile.render.mountainQuality,
    profile.version,
    sourceKey,
    sources,
    textureLoader,
  ]);

  return maps;
};

export default useTextureLoader;
