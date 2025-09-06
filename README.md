# SERRA SEM AR - Web Art Brasil

Uma representação artística interativa dos dados da COVID-19 no Brasil como uma montanha 3D navegável, criada com React TypeScript, Three.js e React Three Fiber.

## 🎨 Conceito Artístico

Este projeto transforma dados epidemiológicos em uma experiência visual imersiva, onde:

- **Largura da montanha** = Número de casos diários
- **Altura da montanha** = Número de mortes diárias  
- **Distância temporal** = Progressão no tempo (cada dia da pandemia)
- **Cores** = Taxa de mortalidade (vermelho = alta, verde = baixa)

A montanha evolui ao longo do tempo, permitindo "caminhar" pela história da pandemia no Brasil de forma visual e interativa.

## 🚀 Tecnologias Utilizadas

- **React 19** com TypeScript
- **Vite** para build e desenvolvimento
- **Three.js** e **React Three Fiber** para renderização 3D
- **React Three Drei** para utilitários 3D
- **Zustand** para gerenciamento de estado
- **TanStack React Query** para cache de dados
- **Tailwind CSS** para estilização
- **Shadcn/UI** para componentes de interface

## 📊 Fonte dos Dados

Os dados da COVID-19 são provenientes do **Our World in Data**, uma fonte confiável e atualizada que compila informações epidemiológicas globais.

## 🎮 Controles de Navegação

### Movimento da Câmera
- `↑ / W` - Mover para frente
- `↓ / S` - Mover para trás  
- `← / A` - Mover para esquerda
- `→ / D` - Mover para direita
- `Espaço` - Mover para cima
- `Shift` - Mover para baixo
- `Q` - Rotacionar esquerda
- `E` - Rotacionar direita
- `R` - Resetar câmera

### Mouse
- **Arrastar** - Rotacionar câmera
- **Scroll** - Zoom in/out
- **Botão direito + arrastar** - Pan

### Navegação Temporal
- `, / <` - Dia anterior
- `. / >` - Próximo dia
- **Timeline** - Controles de reprodução automática

## 🛠️ Instalação e Execução

### Pré-requisitos
- Node.js 18+ 
- pnpm (recomendado) ou npm

### Instalação
```bash
# Clone o repositório
git clone [url-do-repositorio]
cd serra-sem-ar

# Instale as dependências
pnpm install

# Execute em modo de desenvolvimento
pnpm run dev

# Build para produção
pnpm run build
```

### Estrutura do Projeto
```
src/
├── components/          # Componentes React
│   ├── Mountain3D.tsx   # Componente principal da montanha 3D
│   ├── Scene3D.tsx      # Cena 3D com iluminação e controles
│   ├── InfoPanel.tsx    # Painel de informações dos dados
│   ├── TimelineControls.tsx # Controles de timeline
│   └── ...
├── hooks/               # Hooks customizados
│   ├── useCovidData.ts  # Hook para carregar dados da COVID
│   └── useKeyboardControls.ts # Hook para controles de teclado
├── stores/              # Gerenciamento de estado (Zustand)
│   └── covidStore.ts    # Store principal dos dados
├── types/               # Definições TypeScript
│   └── covid.ts         # Tipos para dados da COVID
└── providers/           # Providers React
    └── QueryProvider.tsx # Provider do React Query
```

## 🎯 Funcionalidades

### ✅ Implementadas
- [x] Visualização 3D da montanha baseada em dados reais
- [x] Navegação interativa com teclado e mouse
- [x] Timeline para navegar pelos dados temporais
- [x] Painel de informações em tempo real
- [x] Controles de reprodução automática
- [x] Sistema de cores baseado na taxa de mortalidade
- [x] Interface responsiva e acessível
- [x] Tratamento de erros e loading states

### 🔮 Possíveis Melhorias Futuras
- [ ] Integração com Firebase para dados em tempo real
- [ ] Múltiplas visualizações (por estado, região)
- [ ] Exportação de imagens/vídeos da visualização
- [ ] Modo VR/AR para imersão completa
- [ ] Comparação com outros países
- [ ] Análise de tendências e previsões

## 🎨 Design e UX

A interface foi projetada para ser:
- **Imersiva**: Foco na experiência 3D
- **Informativa**: Dados contextuais sempre visíveis
- **Intuitiva**: Controles familiares de jogos
- **Acessível**: Suporte a teclado e múltiplas formas de navegação

## 📱 Compatibilidade

- **Navegadores**: Chrome, Firefox, Safari, Edge (com suporte a WebGL)
- **Dispositivos**: Desktop, tablet, mobile (com limitações de performance)
- **WebGL**: Requerido para renderização 3D

## 🤝 Contribuição

Este é um projeto de Web Art que combina dados científicos com expressão artística. Contribuições são bem-vindas para:

- Melhorias na visualização 3D
- Otimizações de performance
- Novas formas de interação
- Acessibilidade
- Documentação

## 📄 Licença

Este projeto é uma obra de arte digital criada para fins educacionais e artísticos.

## 🙏 Agradecimentos

- **Our World in Data** pelos dados confiáveis da COVID-19
- **Three.js** e **React Three Fiber** pela tecnologia 3D
- **Comunidade open source** pelas ferramentas utilizadas

---

*"Transformar dados em arte é uma forma de humanizar números e criar empatia através da visualização."*

