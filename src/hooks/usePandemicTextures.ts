import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useEnvironmentStore } from '../stores/environmentStore';
import { usePerformanceProfileStore } from '../stores/performanceProfileStore';
import { PandemicTexture, PandemicTextureState } from '../types/environment';

const uniqueUrls = (urls: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    ordered.push(url);
  }
  return ordered;
};

export const usePandemicTextures = (urls: ReadonlyArray<string>): PandemicTextureState => {
  const environmentAnisotropy = useEnvironmentStore((state) => state.textureAnisotropy);
  const profileAnisotropyCap = usePerformanceProfileStore((state) => state.profile.render.textureMaxAnisotropy);
  const anisotropy = Math.max(1, Math.min(environmentAnisotropy, profileAnisotropyCap));
  const [textures, setTextures] = useState<ReadonlyArray<PandemicTexture>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const activeTexturesRef = useRef<THREE.Texture[]>([]);
  const dedupedUrls = useMemo(() => uniqueUrls(urls), [urls]);
  const urlsKey = useMemo(() => dedupedUrls.join('|'), [dedupedUrls]);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();

    const disposeActiveTextures = () => {
      for (const texture of activeTexturesRef.current) {
        texture.dispose();
      }
      activeTexturesRef.current = [];
    };

    const loadTextures = async () => {
      disposeActiveTextures();

      if (!dedupedUrls.length) {
        setTextures([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      const promises = dedupedUrls.map(async (url): Promise<PandemicTexture | null> => {
        try {
          const texture = await loader.loadAsync(url);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = anisotropy;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = true;
          texture.needsUpdate = true;
          return {
            url,
            texture,
          };
        } catch {
          return null;
        }
      });

      const loaded = await Promise.all(promises);
      if (cancelled) {
        loaded.forEach((entry) => entry?.texture.dispose());
        return;
      }

      const valid = loaded.filter((entry): entry is PandemicTexture => entry !== null);
      activeTexturesRef.current = valid.map((entry) => entry.texture);
      setTextures(valid);

      if (!valid.length) {
        setError(new Error('Nenhuma textura pôde ser carregada a partir das URLs extraídas.'));
      }

      setIsLoading(false);
    };

    void loadTextures();

    return () => {
      cancelled = true;
      disposeActiveTextures();
    };
  }, [anisotropy, dedupedUrls, urlsKey]);

  return {
    textures,
    isLoading,
    error,
  };
};
