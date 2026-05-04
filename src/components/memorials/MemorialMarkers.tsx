import { collection, limit as firestoreLimit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { db } from '../../services/firebaseConfig';

type MemorialMarker = {
  id: string;
  position: THREE.Vector3;
  message: string;
};

type MemorialMarkersProps = {
  enabled?: boolean;
  maxMarkers?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const parseMarker = (id: string, value: unknown): MemorialMarker | null => {
  if (!isRecord(value)) return null;
  if (value.type !== 'oxygen_collapse' && value.type !== 'presence_removed') return null;
  if (!isRecord(value.position)) return null;

  const x = finiteNumber(value.position.x);
  const y = finiteNumber(value.position.y);
  const z = finiteNumber(value.position.z);
  if (x === null || y === null || z === null) return null;

  return {
    id,
    position: new THREE.Vector3(x, y + 0.42, z),
    message: typeof value.message === 'string' ? value.message : 'memorialized',
  };
};

export const MemorialMarkers = ({ enabled = true, maxMarkers = 120 }: MemorialMarkersProps) => {
  const [markers, setMarkers] = useState<MemorialMarker[]>([]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);

  useEffect(() => {
    if (!enabled) {
      setMarkers([]);
      return undefined;
    }

    const memorialQuery = query(
      collection(db, 'memorials'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(maxMarkers)
    );

    const unsubscribe = onSnapshot(
      memorialQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((entry) => parseMarker(entry.id, entry.data()))
          .filter((entry): entry is MemorialMarker => Boolean(entry));
        setMarkers(next);
      },
      () => {
        setMarkers([]);
      }
    );

    return () => unsubscribe();
  }, [enabled, maxMarkers]);

  const geometry = useMemo(() => new THREE.OctahedronGeometry(0.22, 0), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#d8f7ff',
        transparent: true,
        opacity: 0.76,
        depthWrite: false,
      }),
    []
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    markers.forEach((marker, index) => {
      const scale = 0.72 + (index % 5) * 0.055;
      matrix.compose(
        marker.position,
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.47, 0)),
        new THREE.Vector3(scale, scale * 1.55, scale)
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [markers, matrix]);

  if (!enabled || markers.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, markers.length]}
      renderOrder={2}
      raycast={() => null}
      name="oxygen-memorial-markers"
    />
  );
};

export default MemorialMarkers;

