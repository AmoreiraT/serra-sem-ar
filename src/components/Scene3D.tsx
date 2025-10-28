import { Grid, Sky, Stats } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '../stores/covidStore';
import { Mountain3D } from './Mountain3D';
import { EventMarkers3D } from './EventMarkers3D';
import { MonthlyPlaques3D } from './MonthlyPlaques3D';
import { Player } from './Player';



function TerrainWalker({ meshRef, enabled = true, eyeHeight = 2 }: { meshRef: React.RefObject<THREE.Mesh>, enabled?: boolean, eyeHeight?: number }) {
  const { camera } = useThree();
  const raycaster = useRef(new THREE.Raycaster()).current;
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);

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
  const cameraPosition = useCovidStore((state) => state.cameraPosition);
  const cameraTarget = useCovidStore((state) => state.cameraTarget);
  const setCameraPosition = useCovidStore((state) => state.setCameraPosition);
  const setCameraTarget = useCovidStore((state) => state.setCameraTarget);
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
        dpr={[1, 1.5]}
        className="bg-gradient-to-b from-orange-900 to-amber-700"
      >
        {/* Sky and atmosphere */}
        <color attach="background" args={['#130a05']} />
        <Sky
          distance={450000}
          inclination={0.47}
          azimuth={0.25}
          turbidity={12}
          rayleigh={1.8}
          mieCoefficient={0.015}
          mieDirectionalG={0.85}
        />
        <fog attach="fog" args={['#5f3c26', 60, 320]} />
        {/* Sync store updates into the actual three.js camera */}
        <CameraSync cameraPosition={cameraPosition} cameraTarget={cameraTarget} onSync={(pos, tgt) => {
          // make sure store and controls target stay coherent if needed
          setCameraPosition(pos);
          setCameraTarget(tgt);
        }} />
        {/* Lighting */}
        <hemisphereLight color={"#FCC884FF"} groundColor={"#4C331EFF"} intensity={0.6} />
        <directionalLight
          position={[80, 100, 50]}
          intensity={1.1}
          color="#ffd6a3"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={240}
          shadow-camera-left={-110}
          shadow-camera-right={110}
          shadow-camera-top={110}
          shadow-camera-bottom={-110}
        />
        <pointLight position={[-60, 40, -40]} intensity={0.6} color="#ff7a59" />

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} receiveShadow>
          <planeGeometry args={[1600, 1600, 1, 1]} />
          <meshStandardMaterial color="#27170d" roughness={0.95} metalness={0.02} />
        </mesh>

        {/* Grid for reference */}
        <Grid
          position={[0, -2.19, 0]}
          args={[400, 400]}
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
          <Mountain3D ref={mountainRef} />
        </Suspense>
        <EventMarkers3D />
        <MonthlyPlaques3D />

        {/* First-person player with pointer lock and flashlight */}
        <Player terrainRef={mountainRef} eyeHeight={2.2} />

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
