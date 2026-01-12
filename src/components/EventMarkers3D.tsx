import { useMemo } from 'react';
import * as THREE from 'three';
import { covidEvents } from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';

const MARKER_SCALE = 0.6;
const MARKER_POLE_RADIUS_TOP = 0.07 * MARKER_SCALE;
const MARKER_POLE_RADIUS_BOTTOM = 0.12 * MARKER_SCALE;
const MARKER_POLE_HEIGHT = 0.26 * MARKER_SCALE;
const MARKER_SPHERE_RADIUS = 0.15 * MARKER_SCALE;
const MARKER_SPHERE_HEIGHT = 0.17 * MARKER_SCALE;
const MARKER_VERTICAL_OFFSET = 1.35 * MARKER_SCALE;
export const EventMarkers3D = () => {
  const data = useCovidStore((state) => state.data);
  const mountainPoints = useCovidStore((state) => state.mountainPoints);
  const terrainSampler = useCovidStore((state) => state.terrainSampler);

  type MarkerData = {
    markerPoint: THREE.Vector3;
    index: number;
  };

  const markers = useMemo(() => {
    const markerList: MarkerData[] = [];
    if (!data.length || !mountainPoints.length) return markerList;

    covidEvents.forEach((event) => {
      const index = data.findIndex((d) => d.date.toISOString().slice(0, 10) === event.date);
      if (index !== -1 && mountainPoints[index]) {
        const current = mountainPoints[index];

        const markerLocation = new THREE.Vector3(current.x, 0, current.z);
        const sampledMarkerHeight = terrainSampler?.sampleHeight(markerLocation.x, markerLocation.z);
        markerLocation.y =
          (sampledMarkerHeight ?? current.y) + MARKER_VERTICAL_OFFSET;

        const entry: MarkerData = { markerPoint: markerLocation, index };
        markerList.push(entry);
      }
    });

    return markerList;
  }, [data, mountainPoints, terrainSampler]);

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
    </group>
  );
};

export default EventMarkers3D;
