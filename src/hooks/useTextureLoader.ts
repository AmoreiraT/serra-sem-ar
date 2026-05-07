// useTextureLoader.ts
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

const useTextureLoader = (
  diffuseTexture?: string,
  normalTexture?: string,
  aoTexture?: string,
  roughnessTexture?: string,
  pathDiffuseTexture?: string,
  pathNormalTexture?: string,
  pathAOTexture?: string,
  pathRoughTexture?: string,
  pathHeightTexture?: string,
  pathMetallicTexture?: string
) => {
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);

  const diffuseMap = useMemo(
    () => (diffuseTexture ? textureLoader.load(diffuseTexture) : undefined),
    [textureLoader, diffuseTexture]
  );
  const normalMap = useMemo(
    () => (normalTexture ? textureLoader.load(normalTexture) : undefined),
    [textureLoader, normalTexture]
  );
  const aoMap = useMemo(
    () => (aoTexture ? textureLoader.load(aoTexture) : undefined),
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
  const pathHeight = useMemo(
    () => (pathHeightTexture ? textureLoader.load(pathHeightTexture) : undefined),
    [textureLoader, pathHeightTexture]
  );
  const pathMetallic = useMemo(
    () => (pathMetallicTexture ? textureLoader.load(pathMetallicTexture) : undefined),
    [textureLoader, pathMetallicTexture]
  );

  useEffect(() => {
    const textures = [
      diffuseMap,
      normalMap,
      aoMap,
      roughnessMap,
      pathDiffuse,
      pathNormal,
      pathAO,
      pathRough,
      pathHeight,
      pathMetallic,
    ];
    return () => {
      textures.forEach((texture) => texture?.dispose());
    };
  }, [aoMap, diffuseMap, normalMap, pathAO, pathDiffuse, pathHeight, pathMetallic, pathNormal, pathRough, roughnessMap]);

  return {
    diffuseMap,
    normalMap,
    aoMap,
    roughnessMap,
    pathDiffuse,
    pathNormal,
    pathAO,
    pathRough,
    pathHeight,
    pathMetallic,
  };
};

export default useTextureLoader;
