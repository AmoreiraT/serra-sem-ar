declare module 'simplex-noise' {
  class SimplexNoise {
    constructor(random?: () => number);
    noise2D(xin: number, yin: number): number;
    noise3D(xin: number, yin: number, zin: number): number;
    noise4D(x: number, y: number, z: number, w: number): number;
  }
  export = SimplexNoise;
}
