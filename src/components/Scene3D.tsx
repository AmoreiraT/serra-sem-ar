import { Environment, Grid, OrbitControls, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '../stores/covidStore';
import { Mountain3D } from './Mountain3D';



function TerrainWalker({ meshRef, enabled = true, eyeHeight = 2 }: { meshRef: React.RefObject<THREE.Mesh>, enabled?: boolean, eyeHeight?: number }) {
  const { camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster()).current;
  const { setCameraPosition } = useCovidStore();

  useFrame(() => {
    if (!enabled || !meshRef.current) return;
    const camPos = camera.position.clone();
    // Cast a ray straight down from above the camera XZ
    const origin = new THREE.Vector3(camPos.x, 200, camPos.z);
    raycaster.set(origin, new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(meshRef.current, true);
    if (hits.length > 0) {
      const groundY = hits[0].point.y;
      const desiredY = groundY + eyeHeight;
      if (Math.abs(camPos.y - desiredY) > 0.01) {
        camera.position.y = desiredY;
        // keep store in sync
        setCameraPosition([camera.position.x, camera.position.y, camera.position.z]);
      }
    }
  });
  return null;
}

interface Scene3DProps {
  enableControls?: boolean;
  showStats?: boolean;
}

export const Scene3D = ({ enableControls = true, showStats = false }: Scene3DProps) => {
  const { cameraPosition, cameraTarget, setCameraPosition, setCameraTarget } = useCovidStore();
  const mountainRef = useRef<THREE.Mesh>(null) as React.RefObject<THREE.Mesh>;

  return (
    <div className="w-full h-full">
      <Canvas
        camera={{
          position: cameraPosition,
          fov: 60,
          near: 0.1,
          far: 1000,
        }}
        shadows
        className="bg-gradient-to-b from-blue-900 to-blue-600"
      >
        {/* Sync store updates into the actual three.js camera */}
        <CameraSync cameraPosition={cameraPosition} cameraTarget={cameraTarget} onSync={(pos, tgt) => {
          // make sure store and controls target stay coherent if needed
          setCameraPosition(pos);
          setCameraTarget(tgt);
        }} />
        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[50, 50, 25]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={200}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
        />
        <pointLight position={[-50, 30, -25]} intensity={0.5} color="#ff6b6b" />

        {/* Environment */}
        <Environment preset="sunset" />

        {/* Grid for reference */}
        <Grid
          position={[0, -1, 0]}
          args={[200, 200]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#ffffff"
          sectionSize={25}
          sectionThickness={1}
          sectionColor="#ffffff"
          fadeDistance={100}
          fadeStrength={1}
          infiniteGrid
        />

        {/* Main mountain */}
        <Suspense fallback={null}>
          <Mountain3D ref={mountainRef} animated />
        </Suspense>

        {/* Stick camera to terrain height for a walking feel */}
        <TerrainWalker meshRef={mountainRef} enabled={enableControls} eyeHeight={2.2} />

        {/* Camera controls */}
        {enableControls && (
          <OrbitControls
            target={cameraTarget}
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={10}
            maxDistance={200}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2}
          />
        )}

        {/* Performance stats */}
        {showStats && <Stats />}
      </Canvas>
    </div>
  );
};

function CameraSync({ cameraPosition, cameraTarget, onSync }: { cameraPosition: [number, number, number]; cameraTarget: [number, number, number]; onSync?: (pos: [number, number, number], tgt: [number, number, number]) => void; }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera, controls?: any };
  const controlsRef = useRef<any>(null);

  // Try to get OrbitControls instance if present
  useEffect(() => {
    // three fiber injects default controls differently; we attempt to read from state
    // but we can still set camera position/target directly
  }, []);

  useEffect(() => {
    camera.position.set(...cameraPosition);
    if (controls && controls.target) {
      controls.target.set(...cameraTarget);
      controls.update();
    }
    onSync?.(cameraPosition, cameraTarget);
  }, [camera, controls, cameraPosition, cameraTarget, onSync]);

  return null;
}
