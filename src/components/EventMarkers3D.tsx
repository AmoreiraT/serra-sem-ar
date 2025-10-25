import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { covidEvents } from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';

const BOARD_WIDTH = 4.6;
const BOARD_HEIGHT = 2.8;
const POLE_HEIGHT = 2.8;

const formatDate = (date: Date) =>
  date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });

export const EventMarkers3D = () => {
  const data = useCovidStore((state) => state.data);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);

  type MarkerData = { event: typeof covidEvents[0]; point: THREE.Vector3; rotationY: number };

  const eventMap = useMemo(() => {
    if (!data.length || !mountainPoints.length) return new Map<number, MarkerData>();
    const map = new Map<number, MarkerData>();

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

        const offsetDistance = index === 0 ? 10 : 6;
        const position = new THREE.Vector3(current.x, Math.max(current.y + 2.6, 4), current.z)
          .add(tangent.clone().multiplyScalar(offsetDistance));

        const facing = tangent.clone().multiplyScalar(-1);
        const rotationY = Math.atan2(facing.x, facing.z);

        map.set(index, { event, point: position, rotationY });
      }
    });

    return map;
  }, [data, mountainPoints]);

  const targetIndex = useMemo(() => Math.round(currentDateIndex), [currentDateIndex]);
  const active = eventMap.get(targetIndex);

  if (!active) return null;

  const { event, point, rotationY } = active;

  return (
    <group>
      <group position={point.toArray()} rotation={[0, rotationY, 0]}>
        <mesh position={[0, POLE_HEIGHT / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.18, 0.25, POLE_HEIGHT, 12]} />
          <meshStandardMaterial color="#3a271a" roughness={0.92} metalness={0.08} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0, 0.65, 1.4, 14]} />
          <meshStandardMaterial color="#28170f" roughness={0.95} metalness={0.04} />
        </mesh>
        <group position={[0, POLE_HEIGHT, 0]}>
          <mesh castShadow receiveShadow>
            <planeGeometry args={[BOARD_WIDTH + 0.6, BOARD_HEIGHT + 0.4]} />
            <meshStandardMaterial color="#1a100a" roughness={0.9} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0, 0.02]} castShadow receiveShadow>
            <planeGeometry args={[BOARD_WIDTH, BOARD_HEIGHT]} />
            <meshStandardMaterial color="#3f2819" roughness={0.82} metalness={0.06} />
          </mesh>
          <Html
            transform
            position={[0, 0, 0.03]}
            distanceFactor={22}
            style={{ width: `${BOARD_WIDTH * 38}px`, height: `${BOARD_HEIGHT * 38}px`, pointerEvents: 'auto' }}
          >
            <div className="flex h-full w-full flex-col gap-3 rounded-xl border border-white/15 bg-black/85 p-4 text-white shadow-xl">
              <div className="text-xs uppercase tracking-[0.35em] text-amber-200">
                {formatDate(data[targetIndex]?.date ?? new Date(event.date))}
              </div>
              <h3 className="text-lg font-semibold leading-tight">{event.title}</h3>
              <p className="text-sm leading-relaxed text-white/80">{event.description}</p>

              {event.attachments && event.attachments.length > 0 && (
                <div className="space-y-2">
                  {event.attachments.map((attachment, idx) => {
                    const key = `${event.date}-attachment-${idx}`;
                    if (attachment.type === 'text' && attachment.content) {
                      return (
                        <blockquote
                          key={key}
                          className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs text-white/80"
                        >
                          “{attachment.content}”
                        </blockquote>
                      );
                    }
                    if (attachment.type === 'image' && attachment.url) {
                      return (
                        <figure key={key} className="overflow-hidden rounded-lg border border-white/15 bg-white/10">
                          <img
                            src={attachment.url}
                            alt={attachment.label ?? event.title}
                            className="h-24 w-full object-cover"
                            loading="lazy"
                          />
                          {attachment.label && (
                            <figcaption className="px-2 py-1 text-[10px] uppercase tracking-[0.35em] text-white/60">
                              {attachment.label}
                            </figcaption>
                          )}
                        </figure>
                      );
                    }
                    if (attachment.type === 'video' && attachment.url) {
                      return (
                        <div key={key} className="overflow-hidden rounded-lg border border-white/15 bg-white/10">
                          <div className="aspect-video w-full">
                            <iframe
                              src={attachment.url}
                              title={attachment.label ?? event.title}
                              className="h-full w-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                          {attachment.label && (
                            <p className="px-2 py-1 text-[10px] uppercase tracking-[0.35em] text-white/60">
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
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-200/40 bg-amber-200/10 px-2 py-1 text-[11px] uppercase tracking-[0.35em] text-amber-200 hover:bg-amber-200/20"
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

              {event.source && (
                <a
                  href={event.source}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-auto inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-amber-300 hover:text-amber-100"
                >
                  Fonte oficial
                  <span aria-hidden>↗</span>
                </a>
              )}
            </div>
          </Html>
        </group>
      </group>
    </group>
  );
};

export default EventMarkers3D;
