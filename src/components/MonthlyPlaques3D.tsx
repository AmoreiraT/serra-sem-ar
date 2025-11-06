import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '../stores/covidStore';

const useMountainRaycaster = () => {
  const raycasterRef = useRef(new THREE.Raycaster());
  return raycasterRef.current;
};

const PLAQUE_SCALE = 0.42;
const BOARD_WIDTH = 3.4 * PLAQUE_SCALE;
const BOARD_HEIGHT = 1.7 * PLAQUE_SCALE;
const BOARD_DEPTH = 0.08 * PLAQUE_SCALE;
const POLE_HEIGHT = 2.8 * PLAQUE_SCALE;
const POLE_RADIUS = 0.09 * PLAQUE_SCALE;
const POST_SPACING = 1.4 * PLAQUE_SCALE;
const CROSSBAR_THICKNESS = 0.18 * PLAQUE_SCALE;
const CROSSBAR_WIDTH = 2.8 * PLAQUE_SCALE;
const BASE_RADIUS = 0.32 * PLAQUE_SCALE;
const BASE_HEIGHT = 0.12 * PLAQUE_SCALE;
const FORWARD_OFFSET = 3.6;
const LATERAL_OFFSET = 2.4;
const PLAQUE_TEXTURE_SIZE = 512;

const createPlaqueTexture = (
  monthLabel: string,
  dayLabel: string,
  casesLabel: string,
  deathsLabel: string
) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = PLAQUE_TEXTURE_SIZE;
  canvas.height = PLAQUE_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  backgroundGradient.addColorStop(0, '#4a2d18');
  backgroundGradient.addColorStop(1, '#2a170d');
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#b98a52';
  ctx.lineWidth = 12;
  ctx.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);

  ctx.fillStyle = '#f3d8b4';
  ctx.font = '600 52px "Inter", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(monthLabel.toUpperCase(), canvas.width / 2, 72);

  ctx.fillStyle = '#f8f0e5';
  ctx.font = '500 44px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText(`DIA ${dayLabel}`, canvas.width / 2, 150);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#c8f7da';
  ctx.font = '500 36px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText('Casos', 96, 232);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText(casesLabel, 96, 280);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffc3cf';
  ctx.font = '500 36px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText('Mortes', canvas.width - 96, 232);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText(deathsLabel, canvas.width - 96, 280);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f4dcb3';
  ctx.font = '450 32px "Inter", "Helvetica Neue", sans-serif';
  ctx.fillText('Horizonte Mensal', canvas.width / 2, 392);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
};

type PlaqueData = {
  key: string;
  index: number;
  order: number;
  boardPoint: THREE.Vector3;
  rotationY: number;
  monthLabel: string;
  dayLabel: string;
  casesLabel: string;
  deathsLabel: string;
  texture: THREE.CanvasTexture | null;
};

export const MonthlyPlaques3D = () => {
  const data = useCovidStore((state) => state.data);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const revealedX = useCovidStore((state) => state.revealedX);
  const mountainMesh = useCovidStore((state) => state.mountainMesh);
  const raycaster = useMountainRaycaster();

  const plaques = useMemo(() => {
    if (!data.length || !mountainPoints.length) return [];

    const monthly = new Map<string, { index: number; date: Date; cases: number; deaths: number }>();
    data.forEach((entry, index) => {
      const key = `${entry.date.getFullYear()}-${entry.date.getMonth()}`;
      const existing = monthly.get(key);
      if (!existing || entry.date > existing.date) {
        monthly.set(key, {
          index,
          date: entry.date,
          cases: entry.cases,
          deaths: entry.deaths,
        });
      }
    });

    const ordered = Array.from(monthly.values()).sort((a, b) => a.index - b.index);
    const upAxis = new THREE.Vector3(0, 1, 0);

    return ordered
      .map(({ index, date, cases, deaths }, order) => {
        const point = mountainPoints[index];
        if (!point) return null;

        const prev = mountainPoints[Math.max(index - 1, 0)] ?? point;
        const next = mountainPoints[Math.min(index + 1, mountainPoints.length - 1)] ?? point;

        const tangent = new THREE.Vector3().subVectors(next, prev);
        tangent.y = 0;
        if (tangent.lengthSq() === 0) {
          tangent.set(1, 0, 0);
        } else {
          tangent.normalize();
        }

        const lateral = new THREE.Vector3().crossVectors(upAxis, tangent);
        if (lateral.lengthSq() === 0) {
          lateral.set(0, 0, 1);
        } else {
          lateral.normalize();
        }

        const forward = tangent.clone().multiplyScalar(FORWARD_OFFSET);
        const sideDirection = order % 2 === 0 ? 1 : -1;
        const side = lateral.clone().multiplyScalar(LATERAL_OFFSET * sideDirection);

        const targetPosition = new THREE.Vector3(point.x, point.y + 12, point.z).add(forward).add(side);

        let groundY = Math.max(point.y - 0.4, -2.6);
        if (mountainMesh) {
          raycaster.set(targetPosition.clone().setY(targetPosition.y + 120), new THREE.Vector3(0, -1, 0));
          const hits = raycaster.intersectObject(mountainMesh, true);
          if (hits.length > 0) {
            groundY = hits[0].point.y + 0.02;
          }
        }

        const boardPoint = targetPosition.setY(groundY);
        const rotationY = Math.atan2(-tangent.x, -tangent.z);
        const monthLabel = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        const dayLabel = date.toLocaleDateString('pt-BR', { day: '2-digit' });
        const texture = createPlaqueTexture(
          monthLabel,
          dayLabel,
          cases.toLocaleString('pt-BR'),
          deaths.toLocaleString('pt-BR')
        );

        return {
          key: `${date.getFullYear()}-${date.getMonth()}`,
          index,
          order,
          boardPoint,
          rotationY,
          monthLabel,
          dayLabel,
          casesLabel: cases.toLocaleString('pt-BR'),
          deathsLabel: deaths.toLocaleString('pt-BR'),
          texture,
        };
      })
      .filter(Boolean) as PlaqueData[];
  }, [data, mountainPoints]);

  const activeMonthKey = useMemo(() => {
    const entry = data[currentDateIndex];
    if (!entry) return null;
    return `${entry.date.getFullYear()}-${entry.date.getMonth()}`;
  }, [currentDateIndex, data]);

  useEffect(() => {
    return () => {
      plaques.forEach((plaque) => plaque.texture?.dispose());
    };
  }, [plaques]);

  const visiblePlaques = useMemo(() => {
    if (!plaques.length) return [];
    const limit = revealedX + 12;
    return plaques.filter((plaque) => plaque.boardPoint.x <= limit);
  }, [plaques, revealedX]);

  if (!visiblePlaques.length) return null;

  return (
    <group>
      {visiblePlaques.map((plaque) => {
        const boardPosition = plaque.boardPoint.toArray() as [number, number, number];
        const isActive = plaque.key === activeMonthKey;
        const postColor = isActive ? '#f4d2a4' : '#3d2918';
        const frameColor = isActive ? '#5c3014' : '#2b1a10';
        const panelColor = isActive ? '#8b4513' : '#4a2b16';
        const panelEmissive = isActive ? '#c27a30' : '#1a0f06';

        return (
          <group key={`month-plaque-${plaque.key}`} position={boardPosition} rotation={[0, plaque.rotationY, 0]}>
            <group>
              <mesh position={[-POST_SPACING, POLE_HEIGHT / 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS * 0.85, POLE_HEIGHT, 12]} />
                <meshStandardMaterial color={postColor} roughness={0.78} metalness={0.08} />
              </mesh>
              <mesh position={[POST_SPACING, POLE_HEIGHT / 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS * 0.85, POLE_HEIGHT, 12]} />
                <meshStandardMaterial color={postColor} roughness={0.78} metalness={0.08} />
              </mesh>
              <mesh position={[-POST_SPACING, BASE_HEIGHT / 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, BASE_HEIGHT, 16]} />
                <meshStandardMaterial color="#1d120a" roughness={0.92} metalness={0.04} />
              </mesh>
              <mesh position={[POST_SPACING, BASE_HEIGHT / 2, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[BASE_RADIUS, BASE_RADIUS, BASE_HEIGHT, 16]} />
                <meshStandardMaterial color="#1d120a" roughness={0.92} metalness={0.04} />
              </mesh>
              <mesh position={[0, POLE_HEIGHT - CROSSBAR_THICKNESS / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[CROSSBAR_WIDTH, CROSSBAR_THICKNESS, BOARD_DEPTH]} />
                <meshStandardMaterial color={frameColor} roughness={0.72} metalness={0.06} />
              </mesh>
            </group>

            <group position={[0, POLE_HEIGHT, 0]}>
              <mesh position={[0, BOARD_HEIGHT / 2, -BOARD_DEPTH / 2]} castShadow receiveShadow>
                <boxGeometry args={[BOARD_WIDTH + 0.22 * PLAQUE_SCALE, BOARD_HEIGHT + 0.22 * PLAQUE_SCALE, BOARD_DEPTH]} />
                <meshStandardMaterial color={frameColor} roughness={0.78} metalness={0.06} />
              </mesh>
              <mesh position={[0, BOARD_HEIGHT / 2, -BOARD_DEPTH / 2 + 0.012]} castShadow receiveShadow>
                <boxGeometry args={[BOARD_WIDTH, BOARD_HEIGHT, BOARD_DEPTH / 2]} />
                <meshStandardMaterial
                  color={panelColor}
                  roughness={0.58}
                  metalness={0.14}
                  map={plaque.texture ?? undefined}
                  emissive={panelEmissive}
                  emissiveIntensity={isActive ? 0.35 : 0.12}
                  toneMapped={false}
                />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
};

export default MonthlyPlaques3D;
