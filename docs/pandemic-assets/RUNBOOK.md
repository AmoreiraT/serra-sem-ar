# RUNBOOK - Pandemic Assets Pipeline

## Pré-requisitos
- Node.js >= 20
- pnpm
- ffmpeg
- ffprobe
- sharp (dependência Node)
- ImageMagick (`magick`) opcional

Verificação rápida:

```bash
node -v
pnpm -v
ffmpeg -version
ffprobe -version
magick -version
```

## Estrutura de entrada
- Markdown seeds suportados:
  - `docs/deep-research-report.md`
  - `docs/para-alem-montanha.md`
  - `docs/prompt-para-alem.md`

## Comandos por etapa

```bash
pnpm assets:extract
pnpm assets:extract -- --md docs/para-alem-montanha.md
pnpm assets:extract -- --md docs/deep-research-report.md --md docs/para-alem-montanha.md
pnpm assets:extract -- --mdAll

pnpm assets:download
pnpm assets:classify
pnpm assets:process:images
pnpm assets:process:videos
pnpm assets:process:cubemaps
pnpm assets:manifest
pnpm assets:validate

pnpm assets:all
```

## Logs JSONL
Local: `public/pandemic-assets/logs/`

- `crawl.jsonl`: eventos de descoberta/download/licença
- `errors.jsonl`: falhas por asset/página
- `skipped_paywall.jsonl`: páginas puladas por paywall/login
- `licenses_unspecified.jsonl`: ativos sem licença clara
- `streaming_non_downloadable.jsonl`: links `.m3u8/.mpd` ignorados
- `no_discoverable_media.jsonl`: páginas seed sem mídia extraível

Exemplo de leitura:

```bash
tail -n 50 public/pandemic-assets/logs/crawl.jsonl
```

## Política de falha
- Falha de um asset não aborta o pipeline inteiro.
- Erros por item são registrados em JSONL.
- `assets:validate` consolida erros críticos e retorna código de falha se houver inconsistências estruturais.

## Relatório final
- Arquivo: `public/pandemic-assets/reports/summary.md`
- Inclui totais, índices A/B/all e `missing_free_use_count` quando `A < 10`.

## Checklist Final

- [ ] Sem any no TS/JS gerado
- [ ] Só usa seeds dos 3 MDs
- [ ] Paywall/login pulado e logado
- [ ] Mídias baixadas com SHA-256 e headers
- [ ] Licenças registradas; Commons via extmetadata
- [ ] Índices A/B/all gerados; A>=10 ou missing_free_use_count reportado
- [ ] Imagens 2K/4K + normal + roughness + 2 alpha masks geradas
- [ ] Vídeos loop MP4/WebM + thumbs sem áudio gerados
- [ ] Ambiente 3D não ofusca a montanha (opacidade/fog/desaturação/renderOrder)
- [ ] Scene3D integra UrbanVoidEnvironment sem modificar Mountain3D
