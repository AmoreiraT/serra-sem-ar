import { z } from 'zod';

export const LicenseStatusSchema = z.enum([
  'free_use',
  'editorial_rights_managed',
  'license_unspecified',
]);

const NonEmptyStringSchema = z.string().min(1);

export const AssetLocalPathsSchema = z.object({
  raw: NonEmptyStringSchema,
  texture_2k: NonEmptyStringSchema.or(z.literal('não aplicável')).or(z.literal('não especificado')),
  texture_4k: NonEmptyStringSchema.or(z.literal('não aplicável')).or(z.literal('não especificado')),
  normal: NonEmptyStringSchema.or(z.literal('não aplicável')).or(z.literal('não especificado')),
  roughness: NonEmptyStringSchema.or(z.literal('não aplicável')).or(z.literal('não especificado')),
  alpha_masks: z.array(NonEmptyStringSchema),
  video_mp4: NonEmptyStringSchema.or(z.literal('não aplicável')).or(z.literal('não especificado')),
  video_webm: NonEmptyStringSchema.or(z.literal('não aplicável')).or(z.literal('não especificado')),
  thumb: NonEmptyStringSchema.or(z.literal('não aplicável')).or(z.literal('não especificado')),
  cubemap_faces: z.array(NonEmptyStringSchema).or(z.literal('não especificado')),
});

export const AssetMetadataSchema = z.object({
  id: NonEmptyStringSchema,
  type: z.enum(['image', 'video']),
  source_name: NonEmptyStringSchema,
  source_page_url: NonEmptyStringSchema,
  original_media_url: NonEmptyStringSchema,
  original_filename: NonEmptyStringSchema,
  local_paths: AssetLocalPathsSchema,
  resolution: z.object({
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
  }),
  duration_seconds: z.number().nonnegative().or(z.literal('não aplicável')),
  fps: z.number().nonnegative().or(z.literal('não aplicável')),
  author_credit: NonEmptyStringSchema,
  date_published: NonEmptyStringSchema,
  date_captured: NonEmptyStringSchema,
  caption: NonEmptyStringSchema,
  city_region: NonEmptyStringSchema,
  license: z.object({
    status: LicenseStatusSchema,
    name: NonEmptyStringSchema,
    url: NonEmptyStringSchema,
    text_snippet: NonEmptyStringSchema,
    verified: z.boolean(),
  }),
  hashes: z.object({
    sha256: NonEmptyStringSchema,
  }),
  ingest: z.object({
    downloaded_at: NonEmptyStringSchema,
    http_status: z.number().int(),
    content_type: NonEmptyStringSchema,
    final_url: NonEmptyStringSchema,
    http_headers: z.record(z.string(), z.string()),
    content_length: NonEmptyStringSchema,
    last_modified: NonEmptyStringSchema,
  }),
  processed: z.object({
    loop_duration_seconds: z.number().nonnegative().or(z.literal('não aplicável')),
    loop_status: NonEmptyStringSchema,
    cubemap_status: NonEmptyStringSchema,
  }),
});

export const IndexSchema = z.array(NonEmptyStringSchema);

export const parseAssetMetadata = (value) => AssetMetadataSchema.parse(value);
export const parseIndex = (value) => IndexSchema.parse(value);
