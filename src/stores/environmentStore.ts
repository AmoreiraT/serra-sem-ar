import { create } from 'zustand';

interface EnvironmentState {
  readonly seed: number;
  readonly textureAnisotropy: number;
  setSeed: (seed: number) => void;
  setTextureAnisotropy: (anisotropy: number) => void;
}

export const useEnvironmentStore = create<EnvironmentState>((set) => ({
  seed: 2020,
  textureAnisotropy: 8,
  setSeed: (seed) => set({ seed }),
  setTextureAnisotropy: (anisotropy) => {
    const clamped = Math.max(1, Math.min(16, Math.round(anisotropy)));
    set({ textureAnisotropy: clamped });
  },
}));
