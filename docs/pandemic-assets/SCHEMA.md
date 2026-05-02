# Metadata Schema

Cada arquivo em `public/pandemic-assets/metadata/assets/<asset_id>.json` segue o schema validado em `scripts/pandemic-assets/lib/schema.mjs`.

Campos principais:

- `id`
- `type` (`image` ou `video`)
- `source_page_url`
- `original_media_url`
- `original_filename`
- `local_paths` (raw/processed)
- `resolution`
- `duration_seconds`
- `fps`
- `author_credit`
- `date_published`
- `date_captured`
- `caption`
- `city_region`
- `license` (`free_use`, `editorial_rights_managed`, `license_unspecified`)
- `hashes.sha256`
- `ingest` (status + headers + final_url)
- `processed` (loop/cubemap status)
