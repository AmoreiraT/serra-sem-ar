// useTextureLoader.ts
import { useMemo } from 'react';
import * as THREE from 'three';

const useTextureLoader = (
  diffuseTexture: string,
  normalTexture: string,
  aoTexture: string,
  roughnessTexture?: string,
  pathDiffuseTexture?: string,
  pathNormalTexture?: string,
  pathAOTexture?: string,
  pathRoughTexture?: string
) => {
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);

  const diffuseMap = useMemo(
    () => textureLoader.load(diffuseTexture),
    [textureLoader, diffuseTexture]
  );
  const normalMap = useMemo(
    () => textureLoader.load(normalTexture),
    [textureLoader, normalTexture]
  );
  const aoMap = useMemo(
    () => textureLoader.load(aoTexture),
    [textureLoader, aoTexture]
  );
  const roughnessMap = useMemo(
    () => (roughnessTexture ? textureLoader.load(roughnessTexture) : undefined),
    [textureLoader, roughnessTexture]
  );

  const pathDiffuse = useMemo(
    () => (pathDiffuseTexture ? textureLoader.load(pathDiffuseTexture) : undefined),
    [textureLoader, pathDiffuseTexture]
  );
  const pathNormal = useMemo(
    () => (pathNormalTexture ? textureLoader.load(pathNormalTexture) : undefined),
    [textureLoader, pathNormalTexture]
  );
  const pathAO = useMemo(
    () => (pathAOTexture ? textureLoader.load(pathAOTexture) : undefined),
    [textureLoader, pathAOTexture]
  );
  const pathRough = useMemo(
    () => (pathRoughTexture ? textureLoader.load(pathRoughTexture) : undefined),
    [textureLoader, pathRoughTexture]
  );

  return {
    diffuseMap,
    normalMap,
    aoMap,
    roughnessMap,
    pathDiffuse,
    pathNormal,
    pathAO,
    pathRough,
  };
};

export default useTextureLoader;
