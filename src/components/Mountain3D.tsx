import rockAOTexture from '@/assets/textures/rock_ao.jpg';
import rockDiffuseTexture from '@assets/textures/rock_diffuse.jpg';
import rockNormalTexture from '@assets/textures/rock_normal.jpg';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
import useTextureLoader from '../hooks/useTextureLoader';
import { useCovidStore } from '../stores/covidStore';

interface Mountain3DProps {
  animated?: boolean;
}

const generateHeightMap = (
  width: number,
  depth: number,
  apiData: { day: number; deaths: number; cases: number }[]
): number[] => {
  const heightMap: number[] = [];

  const apiDataMap = new Map<number, { deaths: number; cases: number }>();
  apiData.forEach((data) => {
    apiDataMap.set(data.day, { deaths: data.deaths, cases: data.cases });
  });

  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const currentData = apiDataMap.get(Math.round(z));
      // const noise = simplex.noise2D(x / 10, z / 10);

      let height = 0;
      if (currentData) {
        height =
          (currentData.deaths * 0.01 + currentData.cases * 0.005) *
          (1 * 0.5);
      }

      heightMap.push(height);
    }
  }

  return heightMap;
};


export const Mountain3D = ({ animated = false }: Mountain3DProps) => {
  const meshRef = useRef<Mesh>(null);
  const { mountainPoints, currentDateIndex } = useCovidStore();
  const width = 100;
  const depth = 100;
  const heightMap = useMemo(
    () => generateHeightMap(
      width,
      depth,
      mountainPoints.map(point => ({
        day: typeof point.date === 'number' ? point.date : (point.date instanceof Date ? point.date.getTime() : Number(point.date)),
        deaths: point.deaths,
        cases: point.cases
      }))
    ),
    [mountainPoints, width, depth]
  );


  // Generate the mountain geometry based on COVID data
  const geometry = useMemo(() => {
    if (mountainPoints.length === 0) return null;

    const geometry = new BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];

    // Create vertices for the mountain surface
    const segments = Math.min(mountainPoints.length, 100); // Limit segments for performance

    for (let i = 0; i < segments; i++) {
      const point = mountainPoints[Math.floor((i / segments) * mountainPoints.length)];

      // Create a cross-section of the mountain at this time point
      for (let j = 0; j <= 20; j++) {
        const x = point.x;
        const z = (j / 20) * depth - depth / 2;


        // Height based on distance from center (mountain shape)
        const distanceFromCenter = Math.abs(z) / (depth * 20);
        const heightMultiplier = Math.max(0, 1 - distanceFromCenter * distanceFromCenter);

        // Base height from cases (width of mountain)
        const caseHeight = (point.cases / 100000) * 105 * heightMultiplier;

        // Peak height from deaths
        const deathHeight = (point.deaths / 3000) * 200 * heightMultiplier;

        const y = caseHeight + deathHeight * heightMap[i];

        vertices.push(x, y, z);

        // Color based on death rate (red = more deaths, green = fewer deaths)
        const deathRate = point.deaths / Math.max(point.cases, 1);
        const red = Math.min(1, deathRate * 100);
        const green = Math.max(0, 1 - red);
        const blue = 0.2;

        colors.push(red, green, blue);
      }
    }

    // Create indices for triangles
    for (let i = 0; i < segments - 1; i++) {
      for (let j = 0; j < 20; j++) {
        const a = i * 21 + j;
        const b = i * 21 + j + 1;
        const c = (i + 1) * 21 + j;
        const d = (i + 1) * 21 + j + 1;

        // Two triangles per quad
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    return geometry;
  }, [mountainPoints, heightMap]);

  // Animation frame
  useFrame((state) => {
    if (meshRef.current && animated) {
      // Subtle rotation to show the mountain from different angles
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
    }
  });


  const { diffuseMap, normalMap, aoMap } = useTextureLoader(
    rockDiffuseTexture,
    rockNormalTexture,
    rockAOTexture
  );


  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  diffuseMap.repeat.set(10, 10);
  if (!geometry) return null;

  return (
    <mesh geometry={geometry} name="mountain">
      <meshStandardMaterial
        map={diffuseMap}
        bumpMap={normalMap}
        normalMap={normalMap}
        aoMap={aoMap}
      />
    </mesh>
  );
};

