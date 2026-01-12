import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { covidEvents } from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';

const CARD_SCALE = 0.6;
const BOARD_WIDTH = 6.2 * CARD_SCALE;
const BOARD_HEIGHT = 2.2 * CARD_SCALE;
const POLE_HEIGHT = 5.2 * CARD_SCALE;
const BOARD_BORDER_OFFSET_X = 0.55 * CARD_SCALE;
const BOARD_BORDER_OFFSET_Y = 0.3 * CARD_SCALE;
const BOARD_VERTICAL_OFFSET = 2.0 * CARD_SCALE;
const BOARD_MIN_HEIGHT = 3.0 * CARD_SCALE;
const BOARD_FORWARD_OFFSET_PRIMARY = 9.2;
const BOARD_FORWARD_OFFSET_DEFAULT = 7.2;
const BOARD_LATERAL_OFFSET = 4.4;
const TOPPER_LENGTH = 1.15 * CARD_SCALE;
const TOPPER_RADIUS = 0.55 * CARD_SCALE;
const POLE_RADIUS_TOP = 0.09 * CARD_SCALE;
const POLE_RADIUS_BOTTOM = 0.03 * CARD_SCALE;
const MARKER_POLE_RADIUS_TOP = 0.07 * CARD_SCALE;
const MARKER_POLE_RADIUS_BOTTOM = 0.12 * CARD_SCALE;
const MARKER_POLE_HEIGHT = 0.26 * CARD_SCALE;
const MARKER_SPHERE_RADIUS = 0.15 * CARD_SCALE;
const MARKER_SPHERE_HEIGHT = 0.17 * CARD_SCALE;
const MARKER_VERTICAL_OFFSET = 1.35 * CARD_SCALE;
const HTML_SCALE = 80;
const HTML_DISTANCE_FACTOR = 26;
const DESCRIPTION_MAX = 180;

const formatDate = (date: Date) =>
  date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });

const truncateText = (value: string, max: number) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
};

export const EventMarkers3D = () => {
  const data = useCovidStore((state) => state.data);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const terrainSampler = useCovidStore((state) => state.terrainSampler);

  type MarkerData = {
    event: typeof covidEvents[0];
    boardPoint: THREE.Vector3;
    markerPoint: THREE.Vector3;
    rotationY: number;
    index: number;
  };

  const markers = useMemo(() => {
    const markerList: MarkerData[] = [];
    if (!data.length || !mountainPoints.length) return markerList;

    covidEvents.forEach((event) => {
      const index = data.findIndex((d) => d.date.toISOString().slice(0, 10) === event.date);
      if (index !== -1 && mountainPoints[index]) {
        const current = mountainPoints[index];
        const prev = mountainPoints[Math.max(index - 1, 0)] ?? current;
        const next = mountainPoints[Math.min(index + 1, mountainPoints.length - 1)] ?? current;

        const tangent = new THREE.Vector3().subVectors(next, prev);
        tangent.y = 0;
        if (tangent.lengthSq() === 0) {
          tangent.set(1, 0, 0);
        } else {
          tangent.normalize();
        }

        const forwardOffset = index === 0 ? BOARD_FORWARD_OFFSET_PRIMARY : BOARD_FORWARD_OFFSET_DEFAULT;
        const up = new THREE.Vector3(0, 1, 0);
        const lateral = new THREE.Vector3().crossVectors(up, tangent).normalize().multiplyScalar(BOARD_LATERAL_OFFSET * (index % 2 === 0 ? 1 : -1));
        const boardAnchor = new THREE.Vector3(current.x, 0, current.z)
          .add(tangent.clone().multiplyScalar(forwardOffset))
          .add(lateral);
        const sampledBoardHeight = terrainSampler?.sampleHeight(boardAnchor.x, boardAnchor.z);
        const boardGround =
          sampledBoardHeight !== undefined && sampledBoardHeight !== null
            ? sampledBoardHeight + 0.04
            : Math.max(current.y + BOARD_VERTICAL_OFFSET, BOARD_MIN_HEIGHT);
        boardAnchor.y = boardGround;

        const markerLocation = new THREE.Vector3(current.x, 0, current.z);
        const sampledMarkerHeight = terrainSampler?.sampleHeight(markerLocation.x, markerLocation.z);
        markerLocation.y =
          (sampledMarkerHeight ?? current.y) + MARKER_VERTICAL_OFFSET;

        const facing = tangent.clone().multiplyScalar(-1);
        const rotationY = Math.atan2(facing.x, facing.z);

        const entry: MarkerData = { event, boardPoint: boardAnchor, markerPoint: markerLocation, rotationY, index };
        markerList.push(entry);
      }
    });

    return markerList;
  }, [data, mountainPoints, terrainSampler]);

  const sortedMarkers = useMemo(() => [...markers].sort((a, b) => a.index - b.index), [markers]);
  const activeData = useMemo(() => {
    if (!sortedMarkers.length) return null;

    const upcoming = sortedMarkers.find((marker) => marker.index >= currentDateIndex);
    return upcoming ?? sortedMarkers[sortedMarkers.length - 1];
  }, [currentDateIndex, sortedMarkers]);

  const activeDate = useMemo(() => {
    if (!activeData) return null;
    return data[activeData.index]?.date ?? new Date(activeData.event.date);
  }, [activeData, data]);
  const activeDescription = useMemo(() => {
    if (!activeData) return '';
    return truncateText(activeData.event.description, DESCRIPTION_MAX);
  }, [activeData]);
  const primaryLink = useMemo(() => {
    if (!activeData) return null;
    if (activeData.event.source) {
      return { url: activeData.event.source, label: 'Fonte oficial' };
    }
    const attachment = activeData.event.attachments?.find((item) => item.url);
    if (!attachment?.url) return null;
    const label =
      attachment.label ??
      (attachment.type === 'video'
        ? 'Assistir vídeo'
        : attachment.type === 'image'
          ? 'Ver imagem'
          : 'Abrir referência');
    return { url: attachment.url, label };
  }, [activeData]);

  return (
    <group>
      {/* Static markers along the ridge */}
      {markers.map((marker) => (
        <group key={`marker-${marker.index}`} position={marker.markerPoint.toArray()}>
          <mesh receiveShadow>
            <cylinderGeometry args={[MARKER_POLE_RADIUS_TOP, MARKER_POLE_RADIUS_BOTTOM, MARKER_POLE_HEIGHT, 12]} />
            <meshStandardMaterial color="#2b1a0d" roughness={0.92} metalness={0.04} />
          </mesh>
          <mesh position={[0, MARKER_SPHERE_HEIGHT, 0]}>
            <sphereGeometry args={[MARKER_SPHERE_RADIUS, 16, 16]} />
            <meshStandardMaterial color="#f4a261" emissive="#f4a261" emissiveIntensity={0.35} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {activeData && (
        <group position={activeData.boardPoint.toArray()} rotation={[0, activeData.rotationY, 0]}>
          <mesh position={[0, POLE_HEIGHT / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[POLE_RADIUS_TOP, POLE_RADIUS_BOTTOM, POLE_HEIGHT, 12]} />
            <meshStandardMaterial color="#3a271a" roughness={0.92} metalness={0.08} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0, TOPPER_RADIUS, TOPPER_LENGTH, 14]} />
            <meshStandardMaterial color="#28170f" roughness={0.95} metalness={0.04} />
          </mesh>
          <group position={[0, POLE_HEIGHT, 0]}>
            <mesh castShadow receiveShadow>
              <planeGeometry args={[BOARD_WIDTH + BOARD_BORDER_OFFSET_X, BOARD_HEIGHT + BOARD_BORDER_OFFSET_Y]} />
              <meshStandardMaterial color="#1a100a" roughness={0.9} metalness={0.05} />
            </mesh>
            <mesh position={[0, 0, 0.02]} castShadow receiveShadow>
              <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
              <meshStandardMaterial color="#3f2819" roughness={0.82} metalness={0.06} />
            </mesh>
            <Html
              transform
              position={[0, 0, 0.03]}
              distanceFactor={HTML_DISTANCE_FACTOR}
              style={{
                width: `${BOARD_WIDTH * HTML_SCALE}px`,
                height: `${BOARD_HEIGHT * HTML_SCALE}px`,
                pointerEvents: 'auto',
              }}
            >
              <div
                className="flex h-full w-full flex-col gap-1 overflow-hidden rounded-lg border border-white/20 bg-black/90 px-3 py-2 text-[10px] leading-snug text-white shadow-2xl"
                style={{ textShadow: '0 2px 10px rgba(0, 0, 0, 0.65)' }}
              >
              <div className="text-[10px] uppercase tracking-[0.28em] text-amber-200">
                {activeDate ? formatDate(activeDate) : formatDate(new Date(activeData.event.date))}
              </div>
              <h3 className="text-[13px] font-semibold leading-snug text-white">
                {activeData.event.title}
              </h3>
              <p className="text-[11px] leading-snug text-white/80">{activeDescription}</p>

              {primaryLink && (
                <a
                  href={primaryLink.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-200/40 bg-amber-200/10 px-2 py-1 text-[10px] uppercase tracking-[0.25em] text-amber-200 hover:bg-amber-200/20"
                >
                  {primaryLink.label}
                  <span aria-hidden>↗</span>
                </a>
              )}
              </div>
            </Html>
          </group>
        </group>
      )}
    </group>
  );
};

export default EventMarkers3D;
