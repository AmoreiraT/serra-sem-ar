import { create } from 'zustand';
import { MountainPoint, ProcessedCovidData } from '../types/covid';

interface CovidStore {
  data: ProcessedCovidData[];
  mountainPoints: MountainPoint[];
  isLoading: boolean;
  error: string | null;
  currentDateIndex: number;

  setData: (data: ProcessedCovidData[]) => void;
  setMountainPoints: (points: MountainPoint[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentDateIndex: (index: number) => void;

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

  setData: (data) => set({ data }),
  setMountainPoints: (points) => set({ mountainPoints: points }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setCurrentDateIndex: (index) => set({ currentDateIndex: index }),

  // Default camera position - viewing the mountain from a distance
  cameraPosition: [50, 30, 50],
  cameraTarget: [0, 0, 0],
  setCameraPosition: (position) => set({ cameraPosition: position }),
  setCameraTarget: (target) => set({ cameraTarget: target }),
}));

