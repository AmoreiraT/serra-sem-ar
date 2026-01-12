import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '../stores/covidStore';

const PLAQUE_SCALE = 0.52;
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
const FORWARD_OFFSET = 4.2;
const LATERAL_OFFSET = 2.8;
const PLAQUE_TEXTURE_WIDTH = 768;
const PLAQUE_TEXTURE_HEIGHT = 384;

const createPlaqueTexture = (
  monthLabel: string,
  dayLabel: string,
  casesLabel: string,
  deathsLabel: string
) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = PLAQUE_TEXTURE_WIDTH;
  canvas.height = PLAQUE_TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, '#5f3a1f');
  backgroundGradient.addColorStop(1, '#2a160c');
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  const frameInset = Math.round(width * 0.06);
  ctx.strokeStyle = '#d9ad73';
  ctx.lineWidth = Math.max(8, Math.round(width * 0.018));
  ctx.strokeRect(frameInset, frameInset, width - frameInset * 2, height - frameInset * 2);

  const drawText = (
    text: string,
    x: number,
    y: number,
    {
      size,
      weight = 500,
      color,
      align = 'center',
      baseline = 'top',
      stroke = false,
    }: {
      size: number;
      weight?: number;
      color: string;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      stroke?: boolean;
    }
  ) => {
    ctx.save();
    ctx.font = `${weight} ${size}px "Serra Sans", "Helvetica Neue", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.max(4, size * 0.15);
    ctx.shadowOffsetY = Math.max(1, size * 0.05);
    if (stroke) {
      ctx.lineWidth = Math.max(2, size * 0.08);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const headerSize = Math.round(height * 0.12);
  const daySize = Math.round(height * 0.085);
  const labelSize = Math.round(height * 0.075);
  const valueSize = Math.round(height * 0.13);
  const footerSize = Math.round(height * 0.065);
  const leftX = Math.round(width * 0.12);
  const rightX = width - leftX;

  drawText(monthLabel.toUpperCase(), width / 2, height * 0.08, {
    size: headerSize,
    weight: 600,
    color: '#f6ddb7',
    stroke: true,
  });
  drawText(`DIA ${dayLabel}`, width / 2, height * 0.26, {
    size: daySize,
    weight: 500,
    color: '#fff4e4',
    stroke: true,
  });

  drawText('Casos', leftX, height * 0.5, {
    size: labelSize,
    weight: 500,
    color: '#c8f7da',
    align: 'left',
  });
  drawText(casesLabel, leftX, height * 0.62, {
    size: valueSize,
    weight: 600,
    color: '#ffffff',
    align: 'left',
    stroke: true,
  });

  drawText('Mortes', rightX, height * 0.5, {
    size: labelSize,
    weight: 500,
    color: '#ffc3cf',
    align: 'right',
  });
  drawText(deathsLabel, rightX, height * 0.62, {
    size: valueSize,
    weight: 600,
    color: '#ffffff',
    align: 'right',
    stroke: true,
  });

  drawText('Horizonte Mensal', width / 2, height * 0.84, {
    size: footerSize,
    weight: 500,
    color: '#f4dcb3',
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
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
  const terrainSampler = useCovidStore((state) => state.terrainSampler);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let active = true;
    if (typeof document === 'undefined' || !document.fonts) {
      setFontsReady(true);
      return () => {
        active = false;
      };
    }
    Promise.all([
      document.fonts.load('600 32px "Serra Sans"'),
      document.fonts.load('500 20px "Serra Sans"'),
    ])
      .catch(() => null)
      .finally(() => {
        if (active) setFontsReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const plaques = useMemo(() => {
    if (!data.length || !mountainPoints.length || !fontsReady) return [];

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
        const sampledGround = terrainSampler?.sampleHeight(targetPosition.x, targetPosition.z);
        const baseY =
          sampledGround !== undefined && sampledGround !== null
            ? sampledGround + 0.01
            : Math.max(point.y - 0.4, -2.6);
        const boardPoint = targetPosition.setY(baseY);
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
  }, [data, mountainPoints, terrainSampler, fontsReady]);

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
        const postColor = isActive ? '#f4d8b4' : '#4a2b16';
        const frameColor = isActive ? '#6b3a1b' : '#2b1a10';
        const panelColor = '#ffffff';
        const panelEmissive = isActive ? '#f1a95b' : '#2a160c';
        const panelEmissiveIntensity = isActive ? 0.55 : 0.2;

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
                  emissiveIntensity={panelEmissiveIntensity}
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
