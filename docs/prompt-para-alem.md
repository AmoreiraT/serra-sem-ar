# Prompt Codex para implementar pipeline de assets de pandemia e ambiente 3D no repo `AmoreiraT/serra-sem-ar`

Você é um LLM coder (estilo Codex) trabalhando **dentro do repositório `AmoreiraT/serra-sem-ar`**. O projeto já usa **React 19 + Vite + TypeScript (strict) + React Three Fiber + Drei + Zustand + React Query** e possui uma montanha 3D central (`src/components/Mountain3D.tsx`) renderizada em `src/components/Scene3D.tsx`. Esse repositório é **ESM** (`"type": "module"` no `package.json`) e já possui scripts Node em `scripts/*.mjs` (ex.: `scripts/fetch-brasil-covid-data.mjs`).  
Usuário final: **Thiago**.

Implemente um **pipeline automatizado** (Node.js + ferramentas externas) que:

- Baixa e processa **somente imagens/vídeos** referenciados por links presentes em um **Markdown local**.
- Classifica por licença (free-use vs editorial/rights-managed vs license_unspecified).
- Converte os assets em formatos “3D-ready”.
- Gera manifestos/JSONs de metadados e logs.
- Inclui **pseudocódigo + snippet realista** de integração (Three.js / React Three Fiber) para compor um ambiente de fundo em camadas ao redor da montanha, sem nunca ocultá-la.
- Entrega um **runbook** com comandos.

Restrições/assunções obrigatórias:
- Caminho do `.md` de entrada: **não especificado** → use placeholder `PATH_TO_MD`.
- Runtime/ambiente alvo: **não especificado** → forneça exemplos com **Node.js / FFmpeg / ImageMagick / Three.js**, mas marque premissas como “não especificado” quando necessário.
- O crawler deve **seguir apenas URLs do `.md`** (seed URLs); pode acessar **apenas** os **arquivos de mídia** encontrados dentro dessas páginas seed (imagens/vídeos), mas **não pode** navegar para outras páginas de conteúdo.
- Deve **pular** páginas com login/paywall e registrar em log.
- Deve preservar **nomes originais**, coletar **data/autor/crédito**, e guardar **URL da página + URL do arquivo**.
- Deve verificar/registrar **texto de licença**; se não for encontrado, marcar `license_unspecified`.
- Deve produzir dois conjuntos:
  - (A) `free_use` (CC / public domain / PDM / CC0 etc.)
  - (B) `editorial_rights_managed` (ou itens sem licença clara; sempre com nota)
- Garantir **≥ 10** itens `free_use`; se menor, reportar `missing_free_use_count`.
- Converter:
  - Fotos → texturas 2K/4K + normal/roughness + alpha masks
  - Vídeos → loop curto MP4 (H.264) + WebM (VP9), sem áudio, com crossfade de loop
  - Panoramas → cubemap aproximado quando possível
- Integrar no app: ambiente em camadas ao redor da montanha **sem nunca ocultá-la** (regras de render, profundidade, máscara/oclusão).

Não faça perguntas. Se algo estiver faltando, escreva literalmente **“não especificado”** no lugar.

## Implementação do pipeline no repositório

Crie uma área dedicada (ferramenta de build, não runtime) em:

- `scripts/pandemic-assets/` (Node ESM, `.mjs`) para o pipeline
- `public/pandemic-assets/` para outputs consumíveis pelo frontend (não usar import do Vite para texturas grandes)
- `docs/pandemic-assets/RUNBOOK.md` e `docs/pandemic-assets/SCHEMA.md`

Atualize `package.json` adicionando scripts `pnpm` (o repo já usa `pnpm` no README). Não remova scripts existentes. Sugestão:

- `assets:extract` → extrai URLs do MD
- `assets:download` → crawl + download
- `assets:classify` → licença e conjuntos A/B
- `assets:process` → imagens/vídeos/cubemap
- `assets:manifest` → index e relatório
- `assets:all` → roda tudo em sequência
- `assets:validate` → valida integridade (checksums, schema, contagem, caminhos)

### Dependências (adicionar com cuidado)

O repo já tem `zod`, `axios`, `yauzl`. Adicione apenas o necessário como **devDependencies**:

- `cheerio` (parse HTML)
- `p-limit` (concorrência)
- `mime-types` (detectar mime por extensão)
- `exifr` (ler EXIF quando existir)
- `sharp` (resize/encode imagens)
- `tiny-glob` ou similar (varrer arquivos localmente)
- Opcional, se preferir logs melhores: `pino` (ou manter JSONL manual)

Ferramentas externas:
- `ffmpeg` + `ffprobe` (não especificado)
- `magick` (ImageMagick) (não especificado)

No runbook, inclua verificação de presença dessas ferramentas (com mensagens claras).

## Crawler: extração, navegação restrita, download, logs

### Entrada e regra de escopo

Entrada: `PATH_TO_MD` (**não especificado**).  
Regra hard: o crawler pode fazer HTTP requests somente para:

1) URLs presentes no `.md` (seed)  
2) URLs diretas de **mídia** (`image/*`, `video/*`) descobertas **dentro** de uma seed page (HTML), sem seguir outros links editoriais.

Qualquer tentativa de navegação fora disso deve ser bloqueada e logada como `navigation_blocked`.

### Extração de URLs do Markdown

Implemente `scripts/pandemic-assets/01_extract_links.mjs`:

- Parse markdown por regex robusta:
  - links `[texto](url)`
  - URLs nuas
- Normalização:
  - remover espaços e pontuação colada
  - manter querystrings
  - remover fragments `#...` (exceto quando necessário para identificar mídia; se incerto, mantenha e logue)
- Deduplicar
- Output: `public/pandemic-assets/_work/seed_urls.json`

### Download/crawl com detecção de paywall/login

Implemente `scripts/pandemic-assets/02_crawl_download_media.mjs`:

- Para cada seed URL:
  - Faça `HEAD` (quando possível) e/ou `GET` com timeout.
  - Se `Content-Type` for `image/*` ou `video/*`: baixar diretamente.
  - Se `text/html`: parsear e extrair mídia por:
    - OpenGraph: `og:image`, `og:video`, `og:video:url`
    - Twitter: `twitter:image`, `twitter:player:stream` (se for URL direta)
    - JSON-LD: `contentUrl`, `thumbnailUrl`
    - `<img src|data-src|srcset>` → escolher maior candidato de `srcset`
    - `<video><source src>` e `<source type="video/...">`
- Restringir a mídia a extensões e/ou content-type:
  - imagens: jpg/jpeg/png/webp
  - vídeos: mp4/webm/mov/m4v
  - ignorar HLS/DASH (`.m3u8`, `.mpd`) → log `streaming_non_downloadable`
- Detecção de paywall/login (skip + log em `logs/skipped_paywall.jsonl`):
  - status 401/402/403
  - HTML com sinais fortes: `subscribe`, `assine`, `login`, `sign in`, `paywall`, `metered`, “habilite cookies para continuar” impedindo conteúdo
  - cookie-wall bloqueante (heurística: body muito curto + overlay; se incerto, marcar `paywall_suspected` e pular)
- Preservar filename:
  - preferir `Content-Disposition`
  - senão, a partir do pathname do URL final (após redirects)
  - sanitizar (sem perder extensão)
- Output raw:
  - `public/pandemic-assets/raw/images/<original_filename>`
  - `public/pandemic-assets/raw/videos/<original_filename>`
- Deduplicação:
  - compute SHA-256 de cada arquivo e manter `public/pandemic-assets/_work/hash_index.json`
  - se o mesmo hash aparecer, criar hardlink/cópia lógica via metadata (não duplicar bytes)

### Metadados mínimos no momento do download

Crie um registro JSON por arquivo (ainda pré-licença) em:
- `public/pandemic-assets/metadata/assets/<asset_id>.json` (com campos “license” ainda pendentes)

Campos mínimos a preencher agora:
- `id`, `type`, `source_page_url`, `original_media_url`, `original_filename`
- `local_paths.raw`
- `ingest.downloaded_at`, `ingest.http_status`, `ingest.content_type`, `ingest.final_url`
- `hashes.sha256`
- `author_credit`, `date_published`, `date_captured`, `caption`, `city_region` = **não especificado** (a menos que o `.md` tenha anotação; suporte opcional: parse de legenda no MD se existir)

Logs obrigatórios (JSONL):
- `public/pandemic-assets/logs/crawl.jsonl`
- `public/pandemic-assets/logs/errors.jsonl`
- `public/pandemic-assets/logs/skipped_paywall.jsonl`

## Verificação/classificação de licença e conjuntos A/B

Implemente `scripts/pandemic-assets/03_verify_license_classify.mjs`:

### Estratégia de licença (ordem)

1) **Wikimedia Commons**
   - Se seed URL ou source_page_url for `commons.wikimedia.org/wiki/File:...`:
     - Use MediaWiki API `action=query&prop=imageinfo&iiprop=url|extmetadata`
     - Preencher:
       - `license.status = free_use`
       - `license.name` (ex.: `CC BY-SA 4.0`, `Public Domain Mark`)
       - `license.url`
       - `license.text_snippet`
       - `author_credit`, `date_captured` (se disponível)
       - `original_media_url` deve apontar para `upload.wikimedia.org/...`
2) Bancos “free-use” (Pixabay, Pexels etc.)
   - Parsear página e identificar explicitamente o tipo de licença (texto/URL).
   - Se não achar texto claro, marcar `license_unspecified`.
3) Agências/jornais
   - Se detectar “©”, “All rights reserved”, “uso editorial”, “rights-managed”, “licenciamento”, classificar como:
     - `license.status = editorial_rights_managed`
   - Se não achar nada claro:
     - `license.status = license_unspecified`
     - registrar em `logs/licenses_unspecified.jsonl`

### Produção dos dois conjuntos

Gerar:
- `public/pandemic-assets/metadata/index_A_free_use.json`
- `public/pandemic-assets/metadata/index_B_editorial.json`
- `public/pandemic-assets/metadata/index_all.json`

Regra de contagem:
- Se `index_A_free_use.length < 10`, gerar no relatório:
  - `missing_free_use_count = 10 - index_A_free_use.length`

Também salvar:
- `public/pandemic-assets/reports/summary.md` com:
  - totals (downloaded, skipped, by license)
  - top domínios
  - missing_free_use_count (se aplicável)

## Processamento de assets para 3D-ready

Implemente `scripts/pandemic-assets/04_process_images.mjs`, `05_process_videos.mjs`, `06_build_cubemaps.mjs`.

### Fotos → texturas + mapas

Para cada imagem raw:

1) **Texturas 2K e 4K**
   - long edge = 2048 e 4096
   - formato de saída:
     - `.jpg` (qualidade 82–90) OU `.webp` (se preferir; documentar)
   - saída:
     - `public/pandemic-assets/processed/textures/2k/<asset_id>.jpg`
     - `public/pandemic-assets/processed/textures/4k/<asset_id>.jpg`

2) **Normal map**
   - Estratégia aceitável (documentar como heurística):
     - criar heightmap em grayscale (luma)
     - aplicar sobel para gradient X/Y
     - compor normal (nx, ny, nz) e normalizar
   - saída:
     - `public/pandemic-assets/processed/maps/normal/<asset_id>_normal.png`

3) **Roughness map**
   - Estratégia aceitável:
     - roughness = função de luminância + contraste local (invertendo onde necessário)
   - saída:
     - `public/pandemic-assets/processed/maps/roughness/<asset_id>_roughness.png`

4) **Alpha masks**
   - Gerar pelo menos 2:
     - vinheta suave radial (para dissolver bordas)
     - máscara “rasgo/ruído” (para layering orgânico)
   - saída:
     - `public/pandemic-assets/processed/masks/alpha/<asset_id>_alpha_vignette.png`
     - `public/pandemic-assets/processed/masks/alpha/<asset_id>_alpha_rip.png`

Atualizar metadata do asset com:
- `resolution` (raw e processed)
- `local_paths.texture_2k`, `texture_4k`, `normal`, `roughness`, `alpha_masks[]`

### Vídeos → loops MP4/WebM

Para cada vídeo raw:

- Produzir:
  - `public/pandemic-assets/processed/videos/mp4/<asset_id>.mp4` (H.264, yuv420p, -movflags +faststart)
  - `public/pandemic-assets/processed/videos/webm/<asset_id>.webm` (VP9)
  - `public/pandemic-assets/processed/videos/thumbs/<asset_id>.jpg` (frame representativo)
- Remover áudio por padrão (`-an`).
- Loop:
  - medir duração com `ffprobe`
  - escolher janela 6s (configurável 3–10s)
  - aplicar crossfade final→início (0.35–0.75s) se possível
  - se não conseguir loop suave, marcar `loop_status="imperfect"` e registrar em log

Atualizar metadata:
- `duration_seconds`, `fps`, `resolution`
- `local_paths.video_mp4`, `local_paths.video_webm`
- `processed.loop_duration_seconds`, `processed.loop_status`

### Cubemaps a partir de panoramas

Detectar panorama se:
- `width/height >= 2.0` (heurística)

Se for panorama:
- usar FFmpeg `v360=equirect:cube`
- gerar faces em 2K (ou 1K para LOD distante):
  - `public/pandemic-assets/processed/cubemaps/<asset_id>/px.jpg` etc.

Se não for possível:
- `cubemap_status="indisponível"` (ou “não especificado” se não der para concluir)

Atualizar metadata:
- `processed.cubemap_faces` (ou status)

## Estrutura de pastas e schema JSON (obrigatório)

Crie exatamente esta estrutura (gerar se não existir):

- `public/pandemic-assets/_work/`
- `public/pandemic-assets/raw/images/`
- `public/pandemic-assets/raw/videos/`
- `public/pandemic-assets/processed/textures/2k/`
- `public/pandemic-assets/processed/textures/4k/`
- `public/pandemic-assets/processed/maps/normal/`
- `public/pandemic-assets/processed/maps/roughness/`
- `public/pandemic-assets/processed/masks/alpha/`
- `public/pandemic-assets/processed/videos/mp4/`
- `public/pandemic-assets/processed/videos/webm/`
- `public/pandemic-assets/processed/videos/thumbs/`
- `public/pandemic-assets/processed/cubemaps/`
- `public/pandemic-assets/metadata/assets/`
- `public/pandemic-assets/metadata/`
- `public/pandemic-assets/logs/`
- `public/pandemic-assets/reports/`
- `docs/pandemic-assets/`

### Schema de metadata por asset (exemplo)

Crie e valide com `zod` (o repo já usa `zod`):

```json
{
  "id": "asset_000123",
  "type": "image",
  "source_name": "não especificado",
  "source_page_url": "https://exemplo.com/materia",
  "original_media_url": "https://cdn.exemplo.com/img.jpg",
  "original_filename": "img.jpg",
  "local_paths": {
    "raw": "/pandemic-assets/raw/images/img.jpg",
    "texture_2k": "/pandemic-assets/processed/textures/2k/asset_000123.jpg",
    "texture_4k": "/pandemic-assets/processed/textures/4k/asset_000123.jpg",
    "normal": "/pandemic-assets/processed/maps/normal/asset_000123_normal.png",
    "roughness": "/pandemic-assets/processed/maps/roughness/asset_000123_roughness.png",
    "alpha_masks": [
      "/pandemic-assets/processed/masks/alpha/asset_000123_alpha_vignette.png",
      "/pandemic-assets/processed/masks/alpha/asset_000123_alpha_rip.png"
    ],
    "video_mp4": "não aplicável",
    "video_webm": "não aplicável",
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
    "final_url": "https://cdn.exemplo.com/img.jpg"
  },
  "processed": {
    "loop_duration_seconds": "não aplicável",
    "loop_status": "não aplicável",
    "cubemap_status": "não especificado"
  }
}
```

## Integração 3D: algoritmo generativo em camadas sem ocultar a montanha

Implemente um componente novo para consumo do manifest gerado pelo pipeline:

- `src/components/UrbanVoidEnvironment3D.tsx`

Ele deve:
- Ler (fetch) os índices:
  - `/pandemic-assets/metadata/index_A_free_use.json`
  - `/pandemic-assets/metadata/index_B_editorial.json`
- Depois carregar os `asset` JSON individuais sob demanda (lazy).
- Construir camadas com regras:
  - **FAR**: cubemap/panoramas muito suaves (opacidade 0.05–0.12)
  - **MID**: painéis (billboards) com fotos (opacidade 0.08–0.22)
  - **NEAR**: poucos planos com alpha masks e vídeos loopáveis (opacidade 0.06–0.18)
- Aplicar:
  - parallax lento (drift)
  - variação de escala por banda
  - animação sutil (ruído de opacidade + micro rotação)
  - LOD/streaming: começar com 2K e promover para 4K quando a câmera se aproximar
- **Nunca ocultar a montanha**:
  - Use `depthWrite=false` e `depthTest=false` nos materiais do ambiente
  - Use `renderOrder` negativo (ex.: `-100`)
  - Garanta que a montanha tenha `renderOrder >= 0` (já existe walkway `renderOrder=1`)
  - Além disso, use a malha da montanha via Zustand (`useCovidStore(state => state.mountainMesh)`) para calcular bounding sphere e posicionar anel/cilindro do ambiente fora do volume

### Regras de posicionamento sugeridas (determinísticas com seed)

- Calcular `mountainBounds`:
  - `new THREE.Box3().setFromObject(mountainMesh)`
  - `box.getBoundingSphere(sphere)`
- Definir:
  - `baseRadius = max(sphere.radius * 1.35, 220)` (ajustável)
  - `heightBand = [sphere.center.y - 20, sphere.center.y + sphere.radius * 0.9]`
- Gerar N painéis por camada, distribuídos num anel em torno do centro:
  - `theta ~ U(0, 2π)`
  - `r = baseRadius * layerMultiplier + jitter`
  - `y` dentro da banda da camada
- Rejeitar posicionamentos que aproximem demais do centro:
  - `if (pos.distanceTo(sphere.center) < sphere.radius * 1.2) reject`
- Billboard:
  - `lookAt(camera.position)` a cada frame (ou use `<Billboard />` do drei)

### Snippet de exemplo (React Three Fiber, TypeScript strict)

Forneça no código um exemplo funcional (não só pseudocódigo), mantendo tipagem rigorosa:

```ts
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCovidStore } from '@/stores/covidStore';

type LicenseStatus = 'free_use' | 'editorial_rights_managed' | 'license_unspecified';

type AssetIndexEntry = {
  id: string;
  type: 'image' | 'video';
  licenseStatus: LicenseStatus;
  texture2k?: string;
  texture4k?: string;
  alphaVignette?: string;
  videoMp4?: string;
  videoWebm?: string;
};

type PanelInstance = {
  id: string;
  position: THREE.Vector3;
  scale: number;
  opacity: number;
  driftSpeed: number;
};

export function UrbanVoidEnvironment3D(props: { seed?: string }): JSX.Element | null {
  const seed = props.seed ?? 'serra-sem-ar-pandemic-bg';
  const mountainMesh = useCovidStore((s) => s.mountainMesh);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  const bounds = useMemo(() => {
    if (!mountainMesh) return null;
    const box = new THREE.Box3().setFromObject(mountainMesh);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    return { box, sphere };
  }, [mountainMesh]);

  const instances: readonly PanelInstance[] = useMemo(() => {
    if (!bounds) return [];
    const { sphere } = bounds;

    const baseRadius = Math.max(sphere.radius * 1.35, 220);
    const count = 28; // ajuste pela performance (mobile vs desktop), não especificado

    const rng = makeDeterministicRng(seed);
    const out: PanelInstance[] = [];

    for (let i = 0; i < count; i++) {
      const theta = rng() * Math.PI * 2;
      const r = baseRadius * (1.0 + (rng() - 0.5) * 0.12);
      const y = sphere.center.y + (rng() - 0.5) * (sphere.radius * 0.55);

      const pos = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r);

      if (pos.distanceTo(sphere.center) < sphere.radius * 1.2) {
        i--;
        continue;
      }

      out.push({
        id: `panel_${i}`,
        position: pos,
        scale: THREE.MathUtils.lerp(26, 64, rng()),
        opacity: THREE.MathUtils.lerp(0.08, 0.18, rng()),
        driftSpeed: THREE.MathUtils.lerp(0.003, 0.012, rng()),
      });
    }
    return out;
  }, [bounds, seed]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    g.rotation.y += dt * 0.02;

    // drift individual e billboard pode ser aplicado em cada mesh.
    // Garantia “montanha nunca oculta” é principalmente via depthTest/depthWrite/renderOrder.
    void camera;
  });

  if (!bounds) return null;

  return (
    <group ref={groupRef} renderOrder={-100}>
      {/* Substitua o placeholder abaixo por meshes reais carregando texturas/vídeos do manifest */}
      {instances.map((p) => (
        <mesh
          key={p.id}
          position={p.position}
          renderOrder={-100}
          onUpdate={(m) => {
            m.lookAt(camera.position);
          }}
        >
          <planeGeometry args={[p.scale, p.scale * 0.6]} />
          <meshBasicMaterial
            transparent
            opacity={p.opacity}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function makeDeterministicRng(seed: string): () => number {
  // Use a mesma ideia de cyrb128/sfc32 já presente em Mountain3D.tsx (sem duplicar code style).
  // Implementar aqui de forma pequena e determinística.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return ((h >>> 0) % 1000000) / 1000000;
  };
}
```

Integração mínima em `src/components/Scene3D.tsx`:
- Importar e renderizar `<UrbanVoidEnvironment3D />` dentro do `<Canvas>`, preferencialmente **antes** das malhas principais (mas com `renderOrder` negativo já garante).

## Runbook, comandos e checklist de verificação

Crie `docs/pandemic-assets/RUNBOOK.md` com:

- Pré-requisitos (marcar como “não especificado” quando aplicável):
  - Node.js (não especificado; no repo há Node 18+ para frontend, mas pipeline deve rodar em Node moderno)
  - ffmpeg/ffprobe (não especificado)
  - ImageMagick `magick` (não especificado)

- Instalação:
  - `pnpm install`
  - `pnpm add -D cheerio p-limit mime-types exifr sharp`

- Execução do pipeline (exemplos):
  - `pnpm assets:all -- --md PATH_TO_MD`
  - ou em passos:
    - `pnpm assets:extract -- --md PATH_TO_MD`
    - `pnpm assets:download -- --md PATH_TO_MD`
    - `pnpm assets:classify`
    - `pnpm assets:process`
    - `pnpm assets:manifest`
    - `pnpm assets:validate`

- Import no Three Fiber:
  - mostrar como o frontend consome `/pandemic-assets/metadata/index_A_free_use.json`

Checklist curto (inclua no RUNBOOK e automatize em `assets:validate`):
- [ ] O crawler só acessou URLs do `.md` e arquivos diretos de mídia encontrados nessas páginas seed.
- [ ] Páginas com login/paywall foram puladas e listadas em `logs/skipped_paywall.jsonl`.
- [ ] Cada asset possui `metadata/assets/<id>.json` válido (Zod) com `sha256`.
- [ ] Existem `index_A_free_use.json` e `index_B_editorial.json`.
- [ ] `index_A_free_use.json` tem ≥ 10; senão, `reports/summary.md` inclui `missing_free_use_count`.
- [ ] Imagens processadas possuem 2K/4K + normal + roughness + alpha masks.
- [ ] Vídeos processados possuem MP4+WebM loopável sem áudio.
- [ ] O ambiente 3D usa `depthTest=false`, `depthWrite=false` e `renderOrder` negativo, garantindo que a montanha nunca seja ocultada.

Entregue o código completo (scripts `.mjs`, schemas Zod, logs, runbook, e o componente R3F) implementado e pronto para rodar no repositório.