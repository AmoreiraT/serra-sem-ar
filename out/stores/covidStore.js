"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCovidStore = void 0;
const zustand_1 = require("zustand");
exports.useCovidStore = (0, zustand_1.create)((set) => ({
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
    setCameraPosition: (position) => set((state) => {
        const [px, py, pz] = state.cameraPosition;
        if (Math.abs(px - position[0]) < 0.05 &&
            Math.abs(py - position[1]) < 0.05 &&
            Math.abs(pz - position[2]) < 0.05) {
            return state;
        }
        return { cameraPosition: position };
    }),
    setCameraTarget: (target) => set((state) => {
        const [tx, ty, tz] = state.cameraTarget;
        if (Math.abs(tx - target[0]) < 0.05 &&
            Math.abs(ty - target[1]) < 0.05 &&
            Math.abs(tz - target[2]) < 0.05) {
            return state;
        }
        return { cameraTarget: target };
    }),
}));
