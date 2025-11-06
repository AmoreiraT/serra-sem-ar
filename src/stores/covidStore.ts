import * as THREE from 'three';
import { create } from 'zustand';
import { MountainPoint, ProcessedCovidData } from '../types/covid';

interface CovidStore {
  data: ProcessedCovidData[];
  mountainPoints: MountainPoint[];
  isLoading: boolean;
  error: string | null;
  currentDateIndex: number;
  revealedX: number;
  mountainMesh: THREE.Object3D | null;

  setData: (data: ProcessedCovidData[]) => void;
  setMountainPoints: (points: MountainPoint[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentDateIndex: (index: number) => void;
  setRevealedX: (x: number) => void;
  setMountainMesh: (mesh: THREE.Object3D | null) => void;

  // Navigation state
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  setCameraPosition: (position: [number, number, number]) => void;
  setCameraTarget: (target: [number, number, number]) => void;
}

export const useCovidStore = create<CovidStore>((set) => ({
  data: [],
  mountainPoints: [],
  isLoading: false,
  error: null,
  currentDateIndex: 0,
  revealedX: 0,
  mountainMesh: null,

  setData: (data) => set({ data }),
  setMountainPoints: (points) => set({ mountainPoints: points }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setCurrentDateIndex: (index) => set({ currentDateIndex: index }),
  setRevealedX: (x) =>
    set((state) => {
      if (x <= state.revealedX) return state;
      return { revealedX: x };
    }),
  setMountainMesh: (mesh) => set({ mountainMesh: mesh }),

  // Default camera position - viewing the mountain from a distance
  cameraPosition: [50, 30, 50],
  cameraTarget: [0, 0, 0],
  setCameraPosition: (position) =>
    set((state) => {
      const [px, py, pz] = state.cameraPosition;
      if (
        Math.abs(px - position[0]) < 0.05 &&
        Math.abs(py - position[1]) < 0.05 &&
        Math.abs(pz - position[2]) < 0.05
      ) {
        return state;
      }
      return { cameraPosition: position };
    }),
  setCameraTarget: (target) =>
    set((state) => {
      const [tx, ty, tz] = state.cameraTarget;
      if (
        Math.abs(tx - target[0]) < 0.05 &&
        Math.abs(ty - target[1]) < 0.05 &&
        Math.abs(tz - target[2]) < 0.05
      ) {
        return state;
      }
      return { cameraTarget: target };
    }),
}));
