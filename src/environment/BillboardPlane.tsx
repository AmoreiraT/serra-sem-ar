import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { EnvironmentBand, LayeredLayoutItem, PandemicTexture } from '../types/environment';
import { BRIGHTNESS_BY_BAND, CONTRAST_BY_BAND, DESATURATION_BY_BAND } from './environmentConstants';
import { applyBackgroundMaterialConstraints, applyDesaturationShader } from './visualHierarchy';

interface BillboardPlaneProps {
  readonly item: LayeredLayoutItem;
  readonly pandemicTexture: PandemicTexture;
  readonly alphaMask: THREE.Texture | null;
  readonly videoUrl?: string;
  readonly isFocused?: boolean;
  readonly mountainCenter: readonly [number, number, number];
  readonly mountainSideClearance: number;
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
  video.preload = 'metadata';
  return video;
};

const disposeVideoTexture = (texture: THREE.VideoTexture | null) => {
  if (!texture) return;
  const source = texture.source.data;
  if (source instanceof HTMLVideoElement) {
    source.pause();
    source.removeAttribute('src');
    source.load();
  }
  texture.dispose();
};

export const BillboardPlane = ({
  item,
  pandemicTexture,
  alphaMask,
  videoUrl,
  isFocused = false,
  mountainCenter,
  mountainSideClearance,
}: BillboardPlaneProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const focusProgressRef = useRef(0);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);

  const baseScale = useMemo(() => item.scale, [item.scale]);
  const basePosition = useMemo(
    () => new THREE.Vector3(item.position[0], item.position[1], item.position[2]),
    [item.position]
  );
  const scratchVectors = useMemo(
    () => ({
      driftingPosition: new THREE.Vector3(),
      focusedPosition: new THREE.Vector3(),
      parallaxRight: new THREE.Vector3(),
      toBase: new THREE.Vector3(),
    }),
    []
  );
  const mountainCenterVector = useMemo(
    () => new THREE.Vector3(mountainCenter[0], mountainCenter[1], mountainCenter[2]),
    [mountainCenter]
  );

  useEffect(() => {
    if (!videoUrl) {
      setVideoTexture((previous) => {
        disposeVideoTexture(previous);
        return null;
      });
      return;
    }

    let cancelled = false;
    let activated = false;
    const video = createVideoElement(videoUrl);
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = false;

    const activateTexture = () => {
      if (cancelled || activated || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      activated = true;
      setVideoTexture((previous) => {
        disposeVideoTexture(previous);
        return texture;
      });
    };

    const handleLoadedData = () => {
      activateTexture();
    };

    video.addEventListener('loadeddata', handleLoadedData);

    const boot = async () => {
      try {
        await video.play();
      } catch {
        // Safari/webviews often block autoplay; keep the image texture fallback active.
      }

      if (cancelled) {
        video.removeEventListener('loadeddata', handleLoadedData);
        disposeVideoTexture(texture);
        return;
      }

      activateTexture();
    };

    void boot();

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', handleLoadedData);
      if (!activated) {
        disposeVideoTexture(texture);
      }
      setVideoTexture((previous) => {
        disposeVideoTexture(previous);
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

  useFrame(({ camera, clock }, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = clock.getElapsedTime();
    focusProgressRef.current = THREE.MathUtils.damp(focusProgressRef.current, isFocused ? 1 : 0, 3.2, delta);
    const focusProgress = focusProgressRef.current;
    const driftX = Math.sin(elapsed * 0.07 + item.rotation[1]) * 0.85;
    const driftY = Math.cos(elapsed * 0.05 + item.rotation[1]) * 0.42;
    const driftZ = Math.sin(elapsed * 0.06 + item.rotation[1] * 0.5) * 0.55;

    const { driftingPosition, focusedPosition, parallaxRight, toBase } = scratchVectors;
    driftingPosition.set(basePosition.x + driftX, basePosition.y + driftY, basePosition.z + driftZ);
    focusedPosition.copy(driftingPosition);

    if (focusProgress > 0.001) {
      const baseSide = Math.sign(basePosition.z - mountainCenterVector.z) || 1;
      const boundaryZ = mountainCenterVector.z + baseSide * mountainSideClearance;
      toBase.copy(driftingPosition).sub(camera.position);
      const distanceToBase = toBase.length();

      if (distanceToBase > 1) {
        const safeBoundaryT =
          Math.abs(toBase.z) > 0.001
            ? THREE.MathUtils.clamp((boundaryZ - camera.position.z) / toBase.z + 2 / Math.abs(toBase.z), 0, 1)
            : 0;
        const desiredDistance = THREE.MathUtils.clamp(9 + baseScale * 0.08, 10, 18);
        const desiredDistanceT = THREE.MathUtils.clamp(desiredDistance / distanceToBase, 0, 1);
        const approachT = THREE.MathUtils.clamp(Math.max(safeBoundaryT, desiredDistanceT), 0, 0.96);
        const cameraDirection = toBase.normalize();
        const parallaxLift = Math.sin(elapsed * 0.45 + item.scale) * 1.2;
        const parallaxSide = Math.sin(elapsed * 0.38 + item.rotation[1] * 3) * 1.8;

        parallaxRight.crossVectors(cameraDirection, camera.up).normalize();
        focusedPosition.copy(camera.position).addScaledVector(cameraDirection, distanceToBase * approachT);
        focusedPosition.addScaledVector(parallaxRight, parallaxSide);
        focusedPosition.y += parallaxLift;

        if (baseSide > 0 && focusedPosition.z < boundaryZ) focusedPosition.z = boundaryZ;
        if (baseSide < 0 && focusedPosition.z > boundaryZ) focusedPosition.z = boundaryZ;
      }
    }

    mesh.position.copy(driftingPosition).lerp(focusedPosition, focusProgress);
    mesh.lookAt(camera.position);

    const distance = mesh.position.distanceTo(camera.position);
    const distanceScale = THREE.MathUtils.clamp(distance / 220, 0.84, 1.9);
    const focusScale = THREE.MathUtils.lerp(1, 1.36, focusProgress);
    const finalScale = baseScale * distanceScale * focusScale;
    mesh.scale.set(finalScale, finalScale * 0.62, 1);
  });

  const mapTexture = videoTexture ?? pandemicTexture.texture;
  const opacity = videoTexture ? item.opacity * 0.9 : item.opacity;

  return (
    <mesh ref={meshRef} position={item.position} rotation={item.rotation} renderOrder={isFocused ? item.renderOrder + 30 : item.renderOrder}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        ref={materialRef}
        map={mapTexture}
        emissiveMap={mapTexture}
        alphaMap={alphaMask ?? undefined}
        transparent
        opacity={opacity}
        depthWrite={false}
        depthTest
        side={THREE.DoubleSide}
        roughness={1}
        metalness={0}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  );
};
