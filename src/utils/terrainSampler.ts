import * as THREE from 'three';

export interface TerrainSamplerConfig {
  heights: Float32Array;
  columns: number;
  rows: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TerrainSampler {
  columns: number;
  rows: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  heights: Float32Array;
  sampleHeight: (x: number, z: number) => number;
}

const sampleIndex = (columns: number, rows: number, heights: Float32Array, column: number, row: number) => {
  const c = THREE.MathUtils.clamp(column, 0, columns - 1);
  const r = THREE.MathUtils.clamp(row, 0, rows - 1);
  return heights[c * rows + r] ?? 0;
};

export const createTerrainSampler = ({
  heights,
  columns,
  rows,
  minX,
  maxX,
  minZ,
  maxZ,
}: TerrainSamplerConfig): TerrainSampler => {
  const clampedColumns = Math.max(1, columns);
  const clampedRows = Math.max(1, rows);
  const safeHeights = heights.length >= clampedColumns * clampedRows ? heights : new Float32Array(clampedColumns * clampedRows);
  const xRange = Math.max(1e-5, maxX - minX);
  const zRange = Math.max(1e-5, maxZ - minZ);

  const sampleHeight = (x: number, z: number) => {
    if (!safeHeights.length) return 0;

    const clampedX = THREE.MathUtils.clamp(x, minX, maxX);
    const clampedZ = THREE.MathUtils.clamp(z, minZ, maxZ);

    const colFloat = clampedColumns === 1 ? 0 : ((clampedX - minX) / xRange) * (clampedColumns - 1);
    const rowFloat = clampedRows === 1 ? 0 : ((clampedZ - minZ) / zRange) * (clampedRows - 1);

    const c0 = Math.floor(colFloat);
    const c1 = Math.min(c0 + 1, clampedColumns - 1);
    const r0 = Math.floor(rowFloat);
    const r1 = Math.min(r0 + 1, clampedRows - 1);
    const tx = colFloat - c0;
    const tz = rowFloat - r0;

    const h00 = sampleIndex(clampedColumns, clampedRows, safeHeights, c0, r0);
    const h10 = sampleIndex(clampedColumns, clampedRows, safeHeights, c1, r0);
    const h01 = sampleIndex(clampedColumns, clampedRows, safeHeights, c0, r1);
    const h11 = sampleIndex(clampedColumns, clampedRows, safeHeights, c1, r1);

    const hx0 = THREE.MathUtils.lerp(h00, h10, tx);
    const hx1 = THREE.MathUtils.lerp(h01, h11, tx);
    return THREE.MathUtils.lerp(hx0, hx1, tz);
  };

  return {
    columns: clampedColumns,
    rows: clampedRows,
    minX,
    maxX,
    minZ,
    maxZ,
    heights: safeHeights,
    sampleHeight,
  };
};
