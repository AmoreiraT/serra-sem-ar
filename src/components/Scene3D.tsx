import { Environment, Grid, OrbitControls, Stats } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { useCovidStore } from '../stores/covidStore';
import { Mountain3D } from './Mountain3D';

interface Scene3DProps {
  enableControls?: boolean;
  showStats?: boolean;
}

export const Scene3D = ({ enableControls = true, showStats = false }: Scene3DProps) => {
  const { cameraPosition, cameraTarget } = useCovidStore();

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
          <Mountain3D animated />
        </Suspense>

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

