import rockAOTexture from '@/assets/textures/rock_ao.jpg';
import rockDiffuseTexture from '@assets/textures/rock_diffuse.jpg';
import rockNormalTexture from '@assets/textures/rock_normal.jpg';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BufferGeometry, Float32BufferAttribute, Mesh } from 'three';
import useTextureLoader from '../hooks/useTextureLoader';
import { useCovidStore } from '../stores/covidStore';

interface Mountain3DProps {
  animated?: boolean;
}
export const Mountain3D = forwardRef<Mesh, Mountain3DProps>(({ animated = false }: Mountain3DProps, ref) => {
  const meshRef = (ref as React.RefObject<Mesh>) || useRef<Mesh>(null);
  const { mountainPoints, currentDateIndex } = useCovidStore();
  // Parameters
  const timeSegments = useMemo(() => Math.min(mountainPoints.length, 200), [mountainPoints.length]);
  const zSegments = 64; // lateral detail across mountain width
  const maxHalfWidth = 40; // maximum half-width of the mountain in Z
  const maxPeakHeight = 40; // maximum contribution from deaths

  // Generate the mountain geometry based on COVID data
  const geometry = useMemo(() => {
    if (mountainPoints.length === 0) return null;
    const geometry = new BufferGeometry();

    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    // Compute normalization factors
    const maxCases = Math.max(...mountainPoints.map(p => p.cases));
    const maxDeaths = Math.max(...mountainPoints.map(p => p.deaths));

    for (let i = 0; i < timeSegments; i++) {
      const point = mountainPoints[Math.floor((i / (timeSegments - 1)) * (mountainPoints.length - 1))];

      // Cases control width
      const casesNorm = maxCases > 0 ? point.cases / maxCases : 0;
      const halfWidth = Math.max(4, casesNorm * maxHalfWidth);

      for (let j = 0; j <= zSegments; j++) {
        const t = j / zSegments; // 0..1 across width
        const z = THREE.MathUtils.lerp(-maxHalfWidth, maxHalfWidth, t);

        // Cross-section falloff shaped by current halfWidth
        const dist = Math.abs(z);
        const falloff = dist <= halfWidth ? 1 - (dist / halfWidth) ** 2 : 0; // parabolic cap

        // Deaths control peak height
        const deathsNorm = maxDeaths > 0 ? point.deaths / maxDeaths : 0;
        const peak = deathsNorm * maxPeakHeight;

        const y = falloff * peak;

        const x = point.x;
        vertices.push(x, y, z);

        // UV mapping across grid
        const u = i / (timeSegments - 1);
        const v = j / zSegments;
        uvs.push(u, v);
      }
    }

    // Indices for triangle grid
    for (let i = 0; i < timeSegments - 1; i++) {
      for (let j = 0; j < zSegments; j++) {
        const a = i * (zSegments + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (zSegments + 1) + j;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    // duplicate uv for aoMap
    geometry.setAttribute('uv2', new Float32BufferAttribute(uvs.slice(), 2));
    geometry.computeVertexNormals();
    return geometry;
  }, [mountainPoints, timeSegments]);

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
  diffuseMap.repeat.set(8, 3);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(8, 3);
  aoMap.wrapS = aoMap.wrapT = THREE.RepeatWrapping;
  aoMap.repeat.set(8, 3);
  if (!geometry) return null;

  return (
    <mesh ref={meshRef} geometry={geometry} name="mountain" castShadow receiveShadow>
      <meshStandardMaterial
        map={diffuseMap}
        normalMap={normalMap}
        aoMap={aoMap}
        roughness={0.95}
        metalness={0.05}
      />
    </mesh>
  );
});

Mountain3D.displayName = 'Mountain3D';
