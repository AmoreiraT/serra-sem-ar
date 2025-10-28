import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { covidEvents } from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';

const CARD_SCALE = 0.45;
const BOARD_WIDTH = 5.6 * CARD_SCALE;
const BOARD_HEIGHT = 1.45 * CARD_SCALE;
const POLE_HEIGHT = 4.8 * CARD_SCALE;
const BOARD_BORDER_OFFSET_X = 0.4 * CARD_SCALE;
const BOARD_BORDER_OFFSET_Y = 0.2 * CARD_SCALE;
const BOARD_VERTICAL_OFFSET = 1.4 * CARD_SCALE;
const BOARD_MIN_HEIGHT = 2.6 * CARD_SCALE;
const BOARD_FORWARD_OFFSET_PRIMARY = 8.2;
const BOARD_FORWARD_OFFSET_DEFAULT = 6.4;
const BOARD_LATERAL_OFFSET = 3.8;
const TOPPER_LENGTH = 1.1 * CARD_SCALE;
const TOPPER_RADIUS = 0.5 * CARD_SCALE;
const POLE_RADIUS_TOP = 0.08 * CARD_SCALE;
const POLE_RADIUS_BOTTOM = 0.02 * CARD_SCALE;
const MARKER_POLE_RADIUS_TOP = 0.06 * CARD_SCALE;
const MARKER_POLE_RADIUS_BOTTOM = 0.1 * CARD_SCALE;
const MARKER_POLE_HEIGHT = 0.22 * CARD_SCALE;
const MARKER_SPHERE_RADIUS = 0.12 * CARD_SCALE;
const MARKER_SPHERE_HEIGHT = 0.14 * CARD_SCALE;
const MARKER_VERTICAL_OFFSET = 1.2 * CARD_SCALE;

const formatDate = (date: Date) =>
  date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });

export const EventMarkers3D = () => {
  const data = useCovidStore((state) => state.data);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);

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
        const boardPoint = new THREE.Vector3(current.x, Math.max(current.y + BOARD_VERTICAL_OFFSET, BOARD_MIN_HEIGHT), current.z)
          .add(tangent.clone().multiplyScalar(forwardOffset))
          .add(lateral);
        const markerPoint = new THREE.Vector3(current.x, current.y + MARKER_VERTICAL_OFFSET, current.z);

        const facing = tangent.clone().multiplyScalar(-1);
        const rotationY = Math.atan2(facing.x, facing.z);

        const entry: MarkerData = { event, boardPoint, markerPoint, rotationY, index };
        markerList.push(entry);
      }
    });

    return markerList;
  }, [data, mountainPoints]);

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
              distanceFactor={32}
              style={{
                width: `${BOARD_WIDTH * 30}px`,
                height: `${BOARD_HEIGHT * 30}px`,
                pointerEvents: 'auto',
              }}
            >
              <div className="flex h-full w-full flex-col gap-0.5 rounded-lg border border-white/15 bg-black/85 px-1.5 py-1 text-white shadow-xl text-[6px] leading-tight">
                <div className="text-[5px] uppercase tracking-[0.35em] text-amber-200">
                  {activeDate ? formatDate(activeDate) : formatDate(new Date(activeData.event.date))}
                </div>
                <h3 className="text-[7px] font-semibold leading-snug">{activeData.event.title}</h3>
                <p className="text-[5px] leading-snug text-white/80">{activeData.event.description}</p>

                {activeData.event.attachments && activeData.event.attachments.length > 0 && (
                  <div className="space-y-1">
                    {activeData.event.attachments.map((attachment, idx) => {
                      const key = `${activeData.event.date}-attachment-${idx}`;
                      if (attachment.type === 'text' && attachment.content) {
                        return (
                          <blockquote
                            key={key}
                            className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[6px] text-white/80"
                          >
                            “{attachment.content}”
                          </blockquote>
                        );
                      }
                      if (attachment.type === 'image' && attachment.url) {
                        return (
                          <figure key={key} className="overflow-hidden rounded-md border border-white/15 bg-white/10">
                            <img
                              src={attachment.url}
                              alt={attachment.label ?? activeData.event.title}
                              className="h-10 w-full object-cover"
                              loading="lazy"
                            />
                            {attachment.label && (
                              <figcaption className="px-1.5 py-0.5 text-[5px] uppercase tracking-[0.35em] text-white/60">
                                {attachment.label}
                              </figcaption>
                            )}
                          </figure>
                        );
                      }
                      if (attachment.type === 'video' && attachment.url) {
                        return (
                          <div key={key} className="overflow-hidden rounded-md border border-white/15 bg-white/10">
                            <div className="aspect-video w-full">
                              <iframe
                                src={attachment.url}
                                title={attachment.label ?? activeData.event.title}
                                className="h-full w-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                            {attachment.label && (
                              <p className="px-1.5 py-0.5 text-[5px] uppercase tracking-[0.35em] text-white/60">
                                {attachment.label}
                              </p>
                            )}
                          </div>
                        );
                      }
                      if (attachment.type === 'link' && attachment.url) {
                        return (
                          <a
                            key={key}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 rounded-md border border-amber-200/40 bg-amber-200/10 px-1.5 py-0.5 text-[5px] uppercase tracking-[0.35em] text-amber-200 hover:bg-amber-200/20"
                          >
                            {attachment.label ?? 'Abrir referência'}
                            <span aria-hidden>↗</span>
                          </a>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}

                {activeData.event.source && (
                  <a
                    href={activeData.event.source}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-auto inline-flex items-center gap-1 text-[5px] uppercase tracking-[0.35em] text-amber-300 hover:text-amber-100"
                  >
                    Fonte oficial
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
