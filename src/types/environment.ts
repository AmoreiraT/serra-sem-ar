import * as THREE from 'three';

export type EnvironmentBand = 'FAR' | 'MID' | 'GROUND';

export interface PandemicTexture {
  readonly url: string;
  readonly texture: THREE.Texture;
}

export interface PandemicTextureState {
  readonly textures: ReadonlyArray<PandemicTexture>;
  readonly isLoading: boolean;
  readonly error: Error | null;
}

export interface SpatialLayoutItem {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number;
  readonly opacity: number;
}

export interface LayeredLayoutItem extends SpatialLayoutItem {
  readonly id: string;
  readonly band: EnvironmentBand;
  readonly renderOrder: number;
}

export interface MemoryVideoEntry {
  readonly id: string;
  readonly source_asset_id: string;
  readonly video_mp4: string;
  readonly video_webm: string;
  readonly thumb: string;
  readonly duration_seconds: number;
  readonly fps: number;
}

export interface PandemicAssetLocalPaths {
  readonly raw: string;
  readonly texture_2k: string | 'não aplicável' | 'não especificado';
  readonly texture_4k: string | 'não aplicável' | 'não especificado';
  readonly normal: string | 'não aplicável' | 'não especificado';
  readonly roughness: string | 'não aplicável' | 'não especificado';
  readonly alpha_masks: ReadonlyArray<string>;
  readonly video_mp4: string | 'não aplicável' | 'não especificado';
  readonly video_webm: string | 'não aplicável' | 'não especificado';
  readonly thumb: string | 'não aplicável' | 'não especificado';
  readonly cubemap_faces: ReadonlyArray<string> | 'não especificado';
}

export interface PandemicAssetMetadata {
  readonly id: string;
  readonly type: 'image' | 'video';
  readonly source_name: string;
  readonly source_page_url: string;
  readonly original_media_url: string;
  readonly original_filename: string;
  readonly local_paths: PandemicAssetLocalPaths;
  readonly resolution: {
    readonly width: number;
    readonly height: number;
  };
  readonly duration_seconds: number | 'não aplicável';
  readonly fps: number | 'não aplicável';
  readonly author_credit: string;
  readonly date_published: string;
  readonly date_captured: string;
  readonly caption: string;
  readonly city_region: string;
  readonly license: {
    readonly status: 'free_use' | 'editorial_rights_managed' | 'license_unspecified';
    readonly name: string;
    readonly url: string;
    readonly text_snippet: string;
    readonly verified: boolean;
  };
  readonly hashes: {
    readonly sha256: string;
  };
  readonly ingest: {
    readonly downloaded_at: string;
    readonly http_status: number;
    readonly content_type: string;
    readonly final_url: string;
    readonly http_headers: Readonly<Record<string, string>>;
    readonly content_length: string;
    readonly last_modified: string;
  };
  readonly processed: {
    readonly loop_duration_seconds: number | 'não aplicável';
    readonly loop_status: string;
    readonly cubemap_status: string;
  };
}
