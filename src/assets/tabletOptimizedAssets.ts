export type OptimizedTextureRole = 'color' | 'normal' | 'data';

export type OptimizedTextureVariant = {
  readonly tier: 'low' | 'standard';
  readonly maxSize: number;
  readonly fallback: string;
  readonly ktx2: string;
};

export type OptimizedTextureAsset = {
  readonly label: string;
  readonly fallback: string;
  readonly ktx2: string;
  readonly role: OptimizedTextureRole;
  readonly variants?: readonly OptimizedTextureVariant[];
};

export const TABLET_OPTIMIZED_ASSET_BASE = '/assets/optimized/tablet/v1';

export const TABLET_OPTIMIZED_TEXTURES = {
  mountainRock: {
    label: 'tablet-mountain-rock',
    fallback: `${TABLET_OPTIMIZED_ASSET_BASE}/textures/serra-rock-baked.webp`,
    ktx2: `${TABLET_OPTIMIZED_ASSET_BASE}/textures/serra-rock-baked.ktx2`,
    role: 'color',
    variants: [
      {
        tier: 'low',
        maxSize: 512,
        fallback: `${TABLET_OPTIMIZED_ASSET_BASE}/textures/serra-rock-baked-512.webp`,
        ktx2: `${TABLET_OPTIMIZED_ASSET_BASE}/textures/serra-rock-baked-512.ktx2`,
      },
      {
        tier: 'standard',
        maxSize: 1024,
        fallback: `${TABLET_OPTIMIZED_ASSET_BASE}/textures/serra-rock-baked.webp`,
        ktx2: `${TABLET_OPTIMIZED_ASSET_BASE}/textures/serra-rock-baked.ktx2`,
      },
    ],
  },
  road: {
    label: 'tablet-road-baked',
    fallback: `${TABLET_OPTIMIZED_ASSET_BASE}/textures/road-baked.webp`,
    ktx2: `${TABLET_OPTIMIZED_ASSET_BASE}/textures/road-baked.ktx2`,
    role: 'color',
  },
} satisfies Record<string, OptimizedTextureAsset>;

export const TABLET_PLAYER_MODEL_URL = `${TABLET_OPTIMIZED_ASSET_BASE}/models/player.tablet.glb`;
