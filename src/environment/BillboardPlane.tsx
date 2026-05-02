import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EnvironmentBand, LayeredLayoutItem, PandemicTexture } from '../types/environment';
import { applyBackgroundMaterialConstraints, applyDesaturationShader } from './visualHierarchy';
import { BRIGHTNESS_BY_BAND, CONTRAST_BY_BAND, DESATURATION_BY_BAND } from './environmentConstants';

interface BillboardPlaneProps {
  readonly item: LayeredLayoutItem;
  readonly pandemicTexture: PandemicTexture;
  readonly alphaMask: THREE.Texture | null;
  readonly videoUrl?: string;
}

const getBandSettings = (band: EnvironmentBand) => ({
  desaturation: DESATURATION_BY_BAND[band],
  contrast: CONTRAST_BY_BAND[band],
  brightness: BRIGHTNESS_BY_BAND[band],
});

const createVideoElement = (url: string): HTMLVideoElement => {
  const video = document.createElement('video');
  video.src = url;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  return video;
};

export const BillboardPlane = ({ item, pandemicTexture, alphaMask, videoUrl }: BillboardPlaneProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);

  const baseScale = useMemo(() => item.scale, [item.scale]);
  const basePosition = useMemo(
    () => new THREE.Vector3(item.position[0], item.position[1], item.position[2]),
    [item.position]
  );

  useEffect(() => {
    if (!videoUrl) {
      setVideoTexture((previous) => {
        if (previous) {
          const source = previous.source.data;
          if (source instanceof HTMLVideoElement) {
            source.pause();
            source.removeAttribute('src');
            source.load();
          }
          previous.dispose();
        }
        return null;
      });
      return;
    }

    let cancelled = false;
    const video = createVideoElement(videoUrl);
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;

    const boot = async () => {
      try {
        await video.play();
      } catch {
        // autoplay can fail; user interaction will start playback
      }

      if (cancelled) {
        texture.dispose();
        video.pause();
        video.removeAttribute('src');
        video.load();
        return;
      }

      setVideoTexture((previous) => {
        if (previous) {
          const source = previous.source.data;
          if (source instanceof HTMLVideoElement) {
            source.pause();
            source.removeAttribute('src');
            source.load();
          }
          previous.dispose();
        }
        return texture;
      });
    };

    void boot();

    return () => {
      cancelled = true;
      video.pause();
      video.removeAttribute('src');
      video.load();
      setVideoTexture((previous) => {
        previous?.dispose();
        return null;
      });
    };
  }, [videoUrl]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;

    applyBackgroundMaterialConstraints(material);

    const bandSettings = getBandSettings(item.band);
    applyDesaturationShader(material, bandSettings.desaturation, bandSettings.contrast, bandSettings.brightness);
  }, [item.band]);

  useFrame(({ camera, clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = clock.getElapsedTime();
    const driftX = Math.sin(elapsed * 0.07 + item.rotation[1]) * 0.85;
    const driftY = Math.cos(elapsed * 0.05 + item.rotation[1]) * 0.42;
    const driftZ = Math.sin(elapsed * 0.06 + item.rotation[1] * 0.5) * 0.55;

    mesh.position.set(basePosition.x + driftX, basePosition.y + driftY, basePosition.z + driftZ);
    mesh.lookAt(camera.position);

    const distance = mesh.position.distanceTo(camera.position);
    const distanceScale = THREE.MathUtils.clamp(distance / 220, 0.84, 1.9);
    const finalScale = baseScale * distanceScale;
    mesh.scale.set(finalScale, finalScale * 0.62, 1);
  });

  const mapTexture = videoTexture ?? pandemicTexture.texture;
  const opacity = videoTexture ? item.opacity * 0.8 : item.opacity;

  return (
    <mesh ref={meshRef} position={item.position} rotation={item.rotation} renderOrder={item.renderOrder}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        ref={materialRef}
        map={mapTexture}
        alphaMap={alphaMask ?? undefined}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest
        roughness={1}
        metalness={0}
        fog
      />
    </mesh>
  );
};
