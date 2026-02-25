Você é um LLM coder (estilo Codex) e deve implementar um pipeline automatizado completo para Thiago no repositório `AmoreiraT/serra-sem-ar`, seguindo **exatamente** os requisitos abaixo (quando algo estiver ausente, escrever literalmente **“não especificado”** e usar placeholders como `PATH_TO_MD`). Produza código, estrutura de pastas, logs, metadados, runbook e um snippet TypeScript React Three Fiber “runnable” (exemplo) conforme solicitado. **Sem perguntas.**

# Contexto do repositório e restrições de implementação

- O projeto é um app React + Vite com Three.js / React Three Fiber; a montanha central é gerada em `src/components/Mountain3D.tsx` e renderizada em `src/components/Scene3D.tsx`. **Não alterar a montanha.**
- O repositório é **ESM** (`"type": "module"`), e já existe um script Node ESM em `scripts/fetch-brasil-covid-data.mjs` (use isso como padrão de estilo/execução para scripts).
- TypeScript está em **strict**.
- A cena já tem `Sky` e `fog` em `Scene3D.tsx`; o ambiente de fundos deve respeitar essa atmosfera e **não** competir com a montanha.

# Entrega obrigatória

Implementar:

1) **CRAWLER/DOWNLOADER** (Node ESM) que lê um Markdown local `PATH_TO_MD` (**não especificado**) e baixa **somente** imagens/vídeos referenciados, com logs e metadados completos.

2) **FILTER & OUTPUT SETS**: gerar dois conjuntos (A `free_use`, B `editorial_rights_managed` + `license_unspecified`) com índices JSON, e garantir ≥10 `free_use` (ou reportar `missing_free_use_count`).

3) **CONVERT TO 3D‑READY ASSETS**: processar imagens (2K/4K + normal/roughness + 2 alpha masks), vídeos (loops MP4+WebM), e cubemaps quando aplicável.

4) **GENERATIVE SCENE ALGORITHM** (Three.js / React Three Fiber): descrever e fornecer snippet TSX determinístico e seedable que carrega manifestos, lazy-load, cria painéis/billboards em camadas FAR/MID/NEAR, com LOD/streaming e garantia de nunca ocultar a montanha.

5) **OUTPUTS, METADATA & RUNBOOK**: estrutura de pastas exatamente como especificada, schema JSON por asset, scripts CLI, e `docs/pandemic-assets/RUNBOOK.md`.

# Requisitos detalhados (implementar literalmente)

## CRAWLER/DOWNLOADER

### Entrada
- `PATH_TO_MD`: caminho local do arquivo Markdown (**não especificado**). Use placeholder `PATH_TO_MD`.
- O `.md` contém:
  - URLs seed (links para páginas e/ou URLs diretas de mídia).
  - Possíveis links do Wikimedia Commons, agências e bancos “free”.

### Política de escopo (hard rules)
- Somente seguir links presentes no `.md` (seed URLs).
- **Não** crawl outras páginas “relacionadas”, “próximas”, “ver mais”, etc.
- Para cada seed URL:
  - Se for URL direta de mídia (image/video) listada no `.md`, baixar diretamente.
  - Se for página HTML, baixar **somente** os arquivos de imagem/vídeo **descobertos nessa mesma página** (ou metatags/JSON-LD dessa página).
- **Nunca** baixar HTML como asset.

### Detecção e skip de login/paywall (obrigatório)
Se ocorrer qualquer um:
- HTTP **401/402/403**
- HTML contém keywords comuns: `subscribe`, `assine`, `login`, `paywall`, `metered`
- Ou sinais de cookie-wall/overlay bloqueante (heurística: overlay “cookie/consent/subscribe” que impede conteúdo principal)
Então:
- pular a página
- registrar em `logs/skipped_paywall.jsonl` com `url` e `reason`

### Descoberta de mídia na página HTML (somente dentro da seed page)
Extrair URLs:
- OpenGraph: `meta[property="og:image"]`, `meta[property="og:video"]`, `meta[property="og:video:url"]`
- Twitter: `meta[name="twitter:image"]`, e stream direto se houver
- JSON-LD: `contentUrl`, `thumbnailUrl`
- `<img src|data-src|srcset>` (do `srcset`, escolher a maior)
- `<video><source src>` e `<source type="video/...">`

Aceitar apenas:
- imagens: `.jpg`, `.jpeg`, `.png`, `.webp` (ou `Content-Type image/*`)
- vídeos: `.mp4`, `.webm`, `.mov`, `.m4v` (ou `Content-Type video/*`)
- rejeitar streaming (`.m3u8`, `.mpd`) → log `streaming_non_downloadable`

### Preservação de filename e metadados (obrigatório)
- Preserve `original_filename`:
  - preferir `Content-Disposition: filename=...`
  - senão usar caminho do `final_url` após redirects
- Preservar e gravar no metadata:
  - `date_published` (se detectável na página) e/ou `date_captured` (EXIF quando houver)
  - `author_credit` / crédito (se detectável na página/Commons)
  - `source_page_url` (seed)
  - `original_media_url` (URL do arquivo baixado)
  - `http_headers` relevantes (ao menos `content-type`, `content-length`, `last-modified` se existir)
- Calcular checksum SHA‑256 e salvar.

### Licença: verificação e classificação (obrigatório)
- Extrair e registrar `license.text_snippet` e/ou `license.url` da página.
- Para Wikimedia Commons:
  - Usar MediaWiki API `w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&format=json&titles=File:...`
  - Ler `extmetadata` para preencher licença e autor.
- Classificar `license.status` como:
  - `free_use` (CC, Public Domain, PDM, CC0)
  - `editorial_rights_managed` (rights-managed/editorial)
  - `license_unspecified` (não achou licença clara)
- Se `license_unspecified`, escrever também em `logs/licenses_unspecified.jsonl`.

### Deduplicação (obrigatório)
- Deduplicar por:
  - checksum SHA‑256
  - URL canônica (`final_url` normalizada: remover fragment, normalizar host; não remover query se parece essencial)
- Manter `public/pandemic-assets/_work/hash_index.json` e `url_index.json`.

### Rate limit e retries (obrigatório)
- Rate limit por domínio:
  - mínimo 500ms entre requisições do mesmo host (configurável)
  - concorrência global (ex.: 6) e por host (ex.: 2)
- Retries:
  - 3 tentativas para erros transitórios (timeouts/5xx)
  - backoff exponencial + jitter
- Logs JSONL de eventos:
  - `download_started`, `download_completed`, `download_failed`
  - `media_discovered`
  - `page_skipped_paywall`
  - `license_verified`, `license_unspecified`, `license_classified_editorial`

## FILTER & OUTPUT SETS

Gerar índices:
- `public/pandemic-assets/metadata/index_A_free_use.json`
- `public/pandemic-assets/metadata/index_B_editorial.json`
- `public/pandemic-assets/metadata/index_all.json`

Regras:
- Set A: somente `license.status === "free_use"` (Creative Commons / Public Domain / PDM / CC0)
- Set B: inclui `editorial_rights_managed` **e** `license_unspecified` (com nota de licenciamento)
- Garantir `index_A_free_use.length >= 10`:
  - se menor, escrever em `public/pandemic-assets/reports/summary.md`:
    - `missing_free_use_count = 10 - index_A_free_use.length`

## CONVERT TO 3D‑READY ASSETS

### Imagens
Para cada imagem em `raw/images`:
- Gerar texturas:
  - 2K (long edge 2048)
  - 4K (long edge 4096)
- Gerar:
  - `normal map` (heurística aceitável)
  - `roughness map` (heurística aceitável)
  - pelo menos 2 alpha masks:
    - `vignette` suave
    - `organic tear` (rasgo/ruído)
- Salvar e atualizar metadata com caminhos e resoluções.

### Vídeos
Para cada vídeo em `raw/videos`:
- Criar loops curtos:
  - duração alvo 3–10s (default 6s)
- Saídas:
  - MP4 H.264 (`processed/videos/mp4`)
  - WebM VP9 (`processed/videos/webm`)
  - thumbs (`processed/videos/thumbs`)
- Remover áudio (`-an`).
- Trim + crossfade para loop quando necessário.
- Atualizar metadata com `duration_seconds`, `fps`, `loop_status`.

### Cubemaps
- Se panorama detectado (aspect ratio ≥ 2:1) **ou** galeria multi-imagem adequada:
  - gerar faces `px/nx/py/ny/pz/nz` via FFmpeg `v360` (ou equivalente).
- Se não for possível:
  - marcar `cubemap_status` como `"não especificado"` no metadata.

## GENERATIVE SCENE ALGORITHM (Three.js / React Three Fiber)

### Regras de composição (obrigatórias)
- Placement determinístico, seedable; camadas:
  - FAR / MID / NEAR
- Incluir regras para:
  - ranges de escala por banda
  - distância por banda
  - parallax multipliers
  - ranges de opacidade
  - drift sutil e parallax lento
  - sugestão de vignette/pós (leve, sem roubar foco)
- LOD/streaming:
  - lazy load de texturas distantes
  - começar com 2K e promover para 4K quando aproximar
  - limite de loads concorrentes
- Garantir que a montanha nunca é ocultada:
  - calcular bounding sphere/box da montanha (via `useCovidStore(state => state.mountainMesh)`), rejeitar placements que invadam o volume ou projeção
  - **e/ou** usar técnicas de render:
    - assegurar que painéis ficam fisicamente atrás (distância/radius)
    - `depthWrite=false`
    - `depthTest=true` (recomendado para transparência não cobrir montanha)
    - se optar por `depthTest=false`, então implementar stencil/máscara para “furar” a área da montanha (alternativa), e registrar como “não especificado” se não implementar

### Snippet TypeScript (conciso e executável como exemplo)
Forneça um snippet TSX (exemplo) que:
- carrega `index_A_free_use.json` e `index_B_editorial.json`
- lazy-load texturas 2K primeiro e promove 4K por proximidade
- cria billboards/planes com propriedades de material
- usa RNG determinístico, bands FAR/MID/NEAR
- usa bounding sphere da montanha para evitar colisão/oclusão
- define `depthWrite=false`, e **preferencialmente** `depthTest=true` para não cobrir a montanha (se mencionar `depthTest=false`, explique no snippet o requisito do stencil)

## OUTPUTS, METADATA & RUNBOOK

### Estrutura de pastas (criar exatamente)
```
public/pandemic-assets/_work/
public/pandemic-assets/raw/images/
public/pandemic-assets/raw/videos/
public/pandemic-assets/processed/textures/2k/
public/pandemic-assets/processed/textures/4k/
public/pandemic-assets/processed/maps/normal/
public/pandemic-assets/processed/maps/roughness/
public/pandemic-assets/processed/masks/alpha/
public/pandemic-assets/processed/videos/mp4/
public/pandemic-assets/processed/videos/webm/
public/pandemic-assets/processed/videos/thumbs/
public/pandemic-assets/processed/cubemaps/
public/pandemic-assets/metadata/assets/
public/pandemic-assets/metadata/index_*.json
public/pandemic-assets/logs/*.jsonl
public/pandemic-assets/reports/summary.md
```

### Schema de metadata por asset (obrigatório)
Criar schema (ex.: via Zod) e escrever um exemplo em docs e no código.

Exemplo (snippet):
```json
{
  "id": "asset_000123",
  "type": "image",
  "source_name": "não especificado",
  "source_page_url": "https://exemplo.com/pagina-seed",
  "original_media_url": "https://cdn.exemplo.com/media.jpg",
  "original_filename": "media.jpg",
  "local_paths": {
    "raw": "/pandemic-assets/raw/images/media.jpg",
    "texture_2k": "/pandemic-assets/processed/textures/2k/asset_000123.jpg",
    "texture_4k": "/pandemic-assets/processed/textures/4k/asset_000123.jpg",
    "normal": "/pandemic-assets/processed/maps/normal/asset_000123_normal.png",
    "roughness": "/pandemic-assets/processed/maps/roughness/asset_000123_roughness.png",
    "alpha_masks": [
      "/pandemic-assets/processed/masks/alpha/asset_000123_alpha_vignette.png",
      "/pandemic-assets/processed/masks/alpha/asset_000123_alpha_tear.png"
    ],
    "video_mp4": "não aplicável",
    "video_webm": "não aplicável",
    "thumb": "não aplicável",
    "cubemap_faces": "não especificado"
  },
  "resolution": { "width": 6000, "height": 4000 },
  "duration_seconds": "não aplicável",
  "author_credit": "não especificado",
  "date_published": "não especificado",
  "date_captured": "não especificado",
  "caption": "não especificado",
  "city_region": "não especificado",
  "license": {
    "status": "license_unspecified",
    "name": "não especificado",
    "url": "não especificado",
    "text_snippet": "não especificado",
    "verified": false
  },
  "hashes": { "sha256": "..." },
  "ingest": {
    "downloaded_at": "2026-02-24T00:00:00-03:00",
    "http_status": 200,
    "content_type": "image/jpeg",
    "final_url": "https://cdn.exemplo.com/media.jpg",
    "http_headers": {
      "content-type": "image/jpeg",
      "last-modified": "não especificado"
    }
  },
  "processed": {
    "loop_status": "não aplicável",
    "cubemap_status": "não especificado"
  }
}
```

### Runbook (obrigatório)
Criar `docs/pandemic-assets/RUNBOOK.md` com:
- Ambiente/runtime: **não especificado**
- Exemplos usando Node.js + FFmpeg + ImageMagick:
  - como checar `ffmpeg -version`, `ffprobe -version`, `magick -version`
- Comandos para executar scripts (exemplos):
  - `node scripts/pandemic-assets/01_extract_links.mjs --md PATH_TO_MD`
  - `node scripts/pandemic-assets/02_crawl_download_media.mjs --md PATH_TO_MD`
  - `node scripts/pandemic-assets/03_verify_license_classify.mjs`
  - `node scripts/pandemic-assets/04_process_images.mjs --sizes 2048,4096`
  - `node scripts/pandemic-assets/05_process_videos.mjs --loopSeconds 6`
  - `node scripts/pandemic-assets/06_build_cubemaps.mjs`
  - `node scripts/pandemic-assets/07_build_indexes_and_report.mjs`
  - `node scripts/pandemic-assets/08_validate.mjs`
- Política de erro:
  - falhas em um asset não abortam o pipeline
  - logs JSONL completos
  - relatório final com contagens e `missing_free_use_count`

# Implementação no repositório (arquivos e scripts)

## Criar scripts Node ESM (em `scripts/pandemic-assets/`)
Criar os seguintes executáveis `.mjs` (idempotentes):

1. `01_extract_links.mjs`
2. `02_crawl_download_media.mjs`
3. `03_verify_license_classify.mjs`
4. `04_process_images.mjs`
5. `05_process_videos.mjs`
6. `06_build_cubemaps.mjs`
7. `07_build_indexes_and_report.mjs`
8. `08_validate.mjs`

Criar também utilitários internos em `scripts/pandemic-assets/lib/*.mjs`:
- `paths.mjs` (constantes de diretório)
- `logger.mjs` (JSONL)
- `net.mjs` (rate limit + retries + fetch/HEAD)
- `html_media_extractor.mjs` (cheerio)
- `license_extractor.mjs` (inclui MediaWiki extmetadata)
- `hash.mjs` (sha256)
- `schema.mjs` (Zod para metadata)
- `image_processing.mjs` (sharp + optional magick)
- `video_processing.mjs` (ffmpeg wrappers)
- `cubemap.mjs` (ffmpeg v360)

## Atualizar `package.json` com scripts pnpm (exemplos)
Adicionar (sem remover os existentes):
- `assets:extract`
- `assets:download`
- `assets:classify`
- `assets:process:images`
- `assets:process:videos`
- `assets:process:cubemaps`
- `assets:manifest`
- `assets:validate`
- `assets:all` (sequência)

# Exemplo de snippet React Three Fiber (TypeScript) para o ambiente em camadas

Fornecer (no mínimo) um arquivo de exemplo em `docs/pandemic-assets/UrbanVoidExample.tsx` (ou `src/components/UrbanVoidEnvironment3D.tsx` se preferir), com este estilo:

```tsx
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCovidStore } from "@/stores/covidStore";

type LicenseStatus = "free_use" | "editorial_rights_managed" | "license_unspecified";

type ManifestEntry = {
  id: string;
  type: "image" | "video";
  licenseStatus: LicenseStatus;
  texture2k?: string;
  texture4k?: string;
  videoMp4?: string;
  videoWebm?: string;
  alphaVignette?: string;
};

type Band = "FAR" | "MID" | "NEAR";

type Spawn = {
  id: string;
  band: Band;
  position: THREE.Vector3;
  scale: number;
  opacity: number;
  parallax: number;
  drift: number;
};

function makeRng(seed: string): () => number {
  // RNG determinístico simples (seedable)
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export function UrbanVoidEnvironment3D(props: { seed?: string }): JSX.Element | null {
  const seed = props.seed ?? "serra-sem-ar-pandemic-bg";
  const mountainMesh = useCovidStore((s) => s.mountainMesh);

  const [freeUse, setFreeUse] = useState<ManifestEntry[]>([]);
  const [editorial, setEditorial] = useState<ManifestEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const a = await fetchJson<string[]>("/pandemic-assets/metadata/index_A_free_use.json");
      const b = await fetchJson<string[]>("/pandemic-assets/metadata/index_B_editorial.json");
      // Exemplo: carregar só uma amostra inicial do metadata por id (lazy-load real deve paginar/limitar concorrência)
      const loadEntries = async (ids: string[]): Promise<ManifestEntry[]> => {
        const out: ManifestEntry[] = [];
        for (let i = 0; i < Math.min(ids.length, 24); i++) {
          const asset = await fetchJson<any>(`/pandemic-assets/metadata/assets/${ids[i]}.json`); // substituir por tipo real
          out.push({
            id: asset.id,
            type: asset.type,
            licenseStatus: asset.license.status as LicenseStatus,
            texture2k: asset.local_paths.texture_2k,
            texture4k: asset.local_paths.texture_4k,
            videoMp4: asset.local_paths.video_mp4,
            videoWebm: asset.local_paths.video_webm,
            alphaVignette: Array.isArray(asset.local_paths.alpha_masks) ? asset.local_paths.alpha_masks[0] : undefined
          });
        }
        return out;
      };
      const [A, B] = await Promise.all([loadEntries(a), loadEntries(b)]);
      if (!cancelled) { setFreeUse(A); setEditorial(B); }
    })().catch(() => {
      // Em produção, logar/telemetria (não especificado)
    });
    return () => { cancelled = true; };
  }, []);

  const bounds = useMemo(() => {
    if (!mountainMesh) return null;
    const box = new THREE.Box3().setFromObject(mountainMesh);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    return { box, sphere };
  }, [mountainMesh]);

  const spawns: readonly Spawn[] = useMemo(() => {
    if (!bounds) return [];
    const rng = makeRng(seed);
    const { sphere } = bounds;

    const mkSpawn = (band: Band, idx: number): Spawn => {
      const baseRadius = sphere.radius * (band === "FAR" ? 3.2 : band === "MID" ? 2.2 : 1.65);
      const r = baseRadius * (0.92 + rng() * 0.18);
      const theta = rng() * Math.PI * 2;

      const yBand = band === "FAR" ? sphere.center.y + sphere.radius * 0.35
                 : band === "MID" ? sphere.center.y + sphere.radius * 0.18
                 : sphere.center.y + sphere.radius * 0.05;

      const y = yBand + (rng() - 0.5) * (band === "FAR" ? 38 : band === "MID" ? 22 : 12);
      const pos = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);

      // Evitar atravessar/ocluir: manter fora do raio de segurança
      if (pos.distanceTo(sphere.center) < sphere.radius * 1.25) {
        return mkSpawn(band, idx); // reamostrar
      }

      const scale = band === "FAR" ? THREE.MathUtils.lerp(120, 220, rng())
                  : band === "MID" ? THREE.MathUtils.lerp(60, 140, rng())
                  : THREE.MathUtils.lerp(28, 80, rng());

      const opacity = band === "FAR" ? THREE.MathUtils.lerp(0.05, 0.12, rng())
                    : band === "MID" ? THREE.MathUtils.lerp(0.08, 0.20, rng())
                    : THREE.MathUtils.lerp(0.06, 0.18, rng());

      const parallax = band === "FAR" ? 0.15 : band === "MID" ? 0.35 : 0.6;
      const drift = band === "FAR" ? 0.002 : band === "MID" ? 0.006 : 0.01;

      return { id: `${band}_${idx}`, band, position: pos, scale, opacity, parallax, drift };
    };

    const far = Array.from({ length: 10 }, (_, i) => mkSpawn("FAR", i));
    const mid = Array.from({ length: 18 }, (_, i) => mkSpawn("MID", i));
    const near = Array.from({ length: 10 }, (_, i) => mkSpawn("NEAR", i));
    return [...far, ...mid, ...near];
  }, [bounds, seed]);

  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    const g = groupRef.current;
    if (!g) return;
    // Parallax lento ao redor da cena
    g.rotation.y += dt * 0.01;
    // Vignette/pós-process: sugestão (não especificado)
    void state;
  });

  if (!bounds) return null;

  // Exemplo minimalista: usar MeshBasicMaterial com depthWrite=false e depthTest=true p/ não cobrir montanha.
  // Se quiser depthTest=false (pedido), então precisa stencil/máscara para garantir “montanha nunca oculta” (não especificado aqui).
  return (
    <group ref={groupRef}>
      {spawns.map((s, i) => {
        const entry = (i % 2 === 0 ? freeUse[i % Math.max(1, freeUse.length)] : editorial[i % Math.max(1, editorial.length)]);
        const textureUrl = entry?.texture2k; // LOD: promover para 4K por proximidade (não especificado neste snippet)
        return (
          <mesh
            key={s.id}
            position={s.position}
            renderOrder={-100} // desenhar cedo; ainda assim, transparência é ordenada – use depthTest=true
            onUpdate={(m) => m.lookAt(state.camera.position)}
          >
            <planeGeometry args={[s.scale, s.scale * 0.62]} />
            <meshBasicMaterial
              map={textureUrl ? new THREE.TextureLoader().load(textureUrl) : undefined}
              transparent
              opacity={s.opacity}
              depthWrite={false}
              depthTest={true}
              fog={true}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}
```

# Checklist executivo de verificação (obrigatório no final do trabalho)

- [ ] `PATH_TO_MD` tratado como **não especificado** e implementado via CLI `--md PATH_TO_MD`
- [ ] O crawler **só** acessa seed URLs do `.md` e URLs diretas de mídia descobertas nessas seed pages
- [ ] Páginas com paywall/login são puladas e registradas em `logs/skipped_paywall.jsonl` com motivo
- [ ] Cada arquivo baixado preserva `original_filename`, registra headers, checksum SHA‑256 e URLs (page + media)
- [ ] Licença verificada quando possível (MediaWiki extmetadata para Commons); `license_unspecified` flagado em `logs/licenses_unspecified.jsonl`
- [ ] Deduplicação por checksum e URL canônica implementada
- [ ] Rate limit por domínio + retries com backoff exponencial + logs JSONL de eventos
- [ ] Índices `index_A_free_use.json`, `index_B_editorial.json`, `index_all.json` gerados
- [ ] `index_A_free_use.json` tem ≥10; senão, `reports/summary.md` contém `missing_free_use_count`
- [ ] Imagens processadas geram 2K/4K + normal + roughness + 2 alpha masks e atualizam metadata
- [ ] Vídeos processados geram MP4 H.264 + WebM VP9, sem áudio, loop 3–10s (default 6s), thumbs, e atualizam metadata
- [ ] Cubemaps gerados para panoramas/galerias quando possível; caso contrário `cubemap_status="não especificado"`
- [ ] Snippet R3F determinístico seedable, com FAR/MID/NEAR, LOD/streaming e garantia de nunca ocultar a montanha