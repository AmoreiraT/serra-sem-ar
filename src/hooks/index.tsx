// Mountain.tsx
import rockAOTexture from '@assets/textures/rock_ao.jpg';
import rockDiffuseTexture from '@assets/textures/rock_diffuse.jpg';
import rockNormalTexture from '@assets/textures/rock_normal.jpg';
// Removed invalid import of PlaneBufferGeometryProps
import React, { useMemo } from 'react';
import SimplexNoise from 'simplex-noise';
import * as THREE from 'three';
import useTextureLoader from './useTextureLoader';

const generateHeightMap = (
  width: number,
  depth: number,
  apiData: { day: number; deaths: number; cases: number }[]
): number[] => {
  const simplex = new SimplexNoise();
  const heightMap: number[] = [];

  const apiDataMap = new Map<number, { deaths: number; cases: number }>();
  apiData.forEach((data) => {
    apiDataMap.set(data.day, { deaths: data.deaths, cases: data.cases });
  });

  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const currentData = apiDataMap.get(Math.round(z));
      const noise = simplex.noise2D(x / 10, z / 10);

      let height = 0;
      if (currentData) {
        height =
          (currentData.deaths * 0.01 + currentData.cases * 0.005) *
          (1 + noise * 0.5);
      }

      heightMap.push(height);
    }
  }

  return heightMap;
};

const Mountain: React.FC<{
  apiData: { day: number; deaths: number; cases: number }[];
}> = ({ apiData }) => {
  const width = 50;
  const depth = 50;
  const heightMap = useMemo(
    () => generateHeightMap(width, depth, apiData),
    [apiData]
  );

  const geometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(width, depth, width - 1, depth - 1);
    geom.rotateX(-Math.PI / 2);

    for (let i = 0; i < geom.attributes.position.count; i++) {
      (geom.attributes.position as THREE.BufferAttribute).setY(
        i,
        heightMap[i]
      );
    }
    geom.computeVertexNormals();

    return geom;
  }, [heightMap]);

  const { diffuseMap, normalMap, aoMap } = useTextureLoader(
    rockDiffuseTexture,
    rockNormalTexture,
    rockAOTexture
  );

  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  diffuseMap.repeat.set(10, 10);

  return (
    <mesh geometry={geometry} name="mountain">
      <meshStandardMaterial
        map={diffuseMap}
        normalMap={normalMap}
        aoMap={aoMap}
      />
    </mesh>
  );
};

export default Mountain;
