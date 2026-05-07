# Auditoria mobile (Safari iPhone) — Serra Sem Ar

## Diagnóstico do código atual

- O app já força **modo 2D no mobile/Safari** para evitar travamentos de WebGL no iPhone (`useRenderProfile` retorna `mode: '2d'` quando detecta mobile). Isso melhora estabilidade, mas muda radicalmente a experiência visual em relação ao desktop.  
- O shell principal usa `100vh` + `100dvh`, safe-area e vários ajustes por altura em `App.css`, o que ajuda no iOS, mas aumenta complexidade e risco de sobreposição em telas muito baixas (Safari com barra dinâmica).  
- O HUD mobile combina joystick + card de evento + botões superiores + overlays, com muitas media queries por altura/largura. Isso indica que o layout depende fortemente de ajuste manual por breakpoint, em vez de regras estruturais com prioridades de conteúdo.  
- O `Scene2D` está relativamente sofisticado e desenha muita coisa em canvas (profundidade, texturas, marcadores), o que pode pesar em iPhones antigos se não houver degradação dinâmica por FPS.

## Causas prováveis da “visão mobile ruim” no iPhone Safari

1. **Diferença abrupta entre desktop 3D e mobile 2D**  
   Quem compara com desktop pode perceber “queda de qualidade” por design, não necessariamente bug.
2. **Densidade de HUD alta para viewport baixa**  
   Muitos elementos competem por espaço útil em telas pequenas e em landscape.
3. **Dependência de breakpoints fixos**  
   iPhone Safari sofre variação de altura útil por barra de URL dinâmica; breakpoints por `max-height` podem oscilar.
4. **Ausência de telemetria de frame time no 2D**  
   Sem loop adaptativo por desempenho, o canvas pode manter custo alto mesmo em aparelhos fracos.

## Plano objetivo de melhoria (prioridade alta)

### 1) Criar perfil “mobile-high” para alguns iPhones modernos

Hoje todo mobile cai em 2D. Sugestão: permitir 3D leve (DPR baixo, sombras off, memória controlada) para iPhones capazes.

- Manter 2D para dispositivos realmente restritos.
- Liberar 3D “lean” para Safari/iOS com bons sinais (ex.: largura alta + sem `prefers-reduced-motion` + estabilidade de FPS após warm-up).

**Impacto:** aproxima visual mobile do desktop sem sacrificar estabilidade geral.

### 2) Reduzir disputa de espaço no HUD mobile

- Definir prioridade visual: **movimento > status vital > evento**.
- Em telas com altura baixa, transformar o card histórico em pill compacta (1 linha + CTA), abrindo conteúdo só em sheet.
- Recuar/colapsar botões secundários enquanto joystick estiver ativo.

**Impacto:** melhora legibilidade e controle no iPhone (principal reclamação de “visão ruim”).

### 3) Adaptação dinâmica por FPS no `Scene2D`

Adicionar monitor simples de frame time no loop do canvas:

- Se FPS médio cair, reduzir camadas não essenciais (pegadas remotas, densidade de partículas/sujeira, suavização).
- Se FPS subir e estabilizar, restaurar gradualmente detalhes.

**Impacto:** experiência mais consistente entre iPhone SE e iPhone Pro.

### 4) Ajustar viewport iOS com `viewport-fit=cover`

No `index.html`, usar viewport com `viewport-fit=cover` para padronizar safe areas no iPhone notch/dynamic island.

**Impacto:** reduz recortes e “saltos” perceptivos de layout.

## Melhorias adicionais (médio prazo)

- Criar “modo foco navegação” no mobile: esconder painéis não críticos durante movimento contínuo.
- Implementar “test matrix” manual por aparelhos iOS (SE, 12/13, 15 Pro Max) com métricas: FPS, jank, tempo de interação, taxa de abandono.
- Registrar `renderProfile.reason` + device class em analytics para comparar sessões 2D/3D mobile.

## Checklist de execução sugerido

1. Definir critérios de entrada no “mobile-high 3D”.
2. Refatorar HUD para estados (idle, moving, reading) em vez de só media query.
3. Inserir degradação dinâmica por FPS no `Scene2D`.
4. Rodar validação em Safari iPhone real (não só emulador).
5. Medir impacto antes/depois (FPS p50, crash rate, retenção 1ª sessão).
