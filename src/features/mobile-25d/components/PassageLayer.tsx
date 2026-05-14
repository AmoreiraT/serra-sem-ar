import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import type { PassageLayerAsset } from '../types/serraPassage';

interface PassageLayerProps {
  readonly layer: PassageLayerAsset;
  readonly progress: number;
  readonly passageOpacity: number;
  readonly reducedMotion: boolean;
  readonly eager: boolean;
}

export const PassageLayer = ({ layer, progress, passageOpacity, reducedMotion, eager }: PassageLayerProps) => {
  const [resolvedSources, setResolvedSources] = useState({ src: layer.src, avifSrc: layer.avifSrc });

  useEffect(() => {
    setResolvedSources({ src: layer.src, avifSrc: layer.avifSrc });
  }, [layer.avifSrc, layer.src]);

  const handleSourceError = (): void => {
    if (!layer.fallbackSrc || !layer.fallbackAvifSrc) {
      return;
    }

    const alreadyUsingFallback =
      resolvedSources.src === layer.fallbackSrc && resolvedSources.avifSrc === layer.fallbackAvifSrc;

    if (alreadyUsingFallback) {
      return;
    }

    setResolvedSources({
      src: layer.fallbackSrc,
      avifSrc: layer.fallbackAvifSrc,
    });
  };

  const movement = reducedMotion ? 0 : progress * layer.depth * 86;
  const lateralDrift = reducedMotion ? 0 : (progress - 0.5) * layer.depth * 1;
  const depthLift = reducedMotion ? 0 : layer.depth * 4;
  const frontalLift = reducedMotion ? -18 : -40;
  const frontalZoom = reducedMotion ? 1 : 0.9;
  const perspectiveScale = reducedMotion ? 1 : 1 + progress * layer.depth * 0.03;
  const tilt = reducedMotion ? 0 : (layer.depth - 0.24) * 0.45;
  const blur = reducedMotion ? 0 : Math.max(0, (0.2 - layer.depth) * 0.25);
  const saturation = 0.78 + layer.depth * 0.04;
  const contrast = 0.9 + layer.depth * 0.03;
  const brightness = 0.92;
  const transform = `perspective(960px) translate3d(calc(-50% + ${layer.translateX + lateralDrift}px), ${layer.translateY - movement - depthLift - frontalLift}px, 0) rotateX(${tilt}deg) scale(${layer.scale * perspectiveScale * frontalZoom})`;
  const style: CSSProperties = {
    opacity: layer.opacity * passageOpacity,
    transform,
    filter: `blur(${blur}px) saturate(${saturation}) contrast(${contrast}) brightness(${brightness})`,
    zIndex: Math.round(layer.depth * 120),
  };

  return (
    <picture>
      <source srcSet={resolvedSources.avifSrc} type="image/avif" />
      <img
        className="serra25d__layer"
        src={resolvedSources.src}
        alt={layer.alt}
        style={style}
        draggable={false}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={eager ? 'high' : 'auto'}
        onError={handleSourceError}
      />
    </picture>
  );
};
