import { useMemo } from 'react';
import * as THREE from 'three';
import { BillboardPlane } from './BillboardPlane';
import { EnvironmentBand, LayeredLayoutItem, PandemicTexture } from '../types/environment';

interface UrbanLayerProps {
  readonly band: EnvironmentBand;
  readonly items: ReadonlyArray<LayeredLayoutItem>;
  readonly textures: ReadonlyArray<PandemicTexture>;
  readonly alphaMasks: ReadonlyArray<THREE.Texture>;
  readonly videoByItemId?: Readonly<Record<string, string>>;
}

export const UrbanLayer = ({ band, items, textures, alphaMasks, videoByItemId = {} }: UrbanLayerProps) => {
  const layerItems = useMemo(() => {
    if (!textures.length || !items.length) return [];

    return items.map((item, index) => {
      const texture = textures[index % textures.length];
      const alphaMask = alphaMasks.length ? alphaMasks[index % alphaMasks.length] : null;
      const videoUrl = videoByItemId[item.id];
      return {
        item,
        texture,
        alphaMask,
        videoUrl,
      };
    });
  }, [alphaMasks, items, textures, videoByItemId]);

  if (!layerItems.length) return null;

  return (
    <group name={`urban-layer-${band.toLowerCase()}`} renderOrder={-10}>
      {layerItems.map((entry) => (
        <BillboardPlane
          key={entry.item.id}
          item={entry.item}
          pandemicTexture={entry.texture}
          alphaMask={entry.alphaMask}
          videoUrl={entry.videoUrl}
        />
      ))}
    </group>
  );
};
