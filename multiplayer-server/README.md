# Serra Sem Ar Multiplayer Server

Servidor opcional de co-presenca viva usando WebRTC via geckos.io. Ele nao substitui RTDB/Firestore: se o servidor nao estiver configurado ou cair, o frontend continua usando a presenca leve via RTDB.

## Rodar local

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:9208/health
```

No frontend:

```bash
VITE_ENABLE_MULTIPLAYER=true
VITE_MULTIPLAYER_URL=http://localhost:9208
```

## Deploy

Este servidor precisa de processo persistente. Nao rode em Cloud Functions. Use um host que aceite processo Node persistente e trafego WebRTC, como Fly.io, Render, Railway ou VPS pequeno.

O Dockerfile expõe `PORT=9208`:

```bash
docker build -t serra-sem-ar-multiplayer .
docker run -p 9208:9208 serra-sem-ar-multiplayer
```

## Politica mobile

- Mobile recebe snapshots com menor frequencia.
- O servidor envia no maximo 18 visitantes proximos por pacote.
- O filtro usa sala por `dayIndex` e distancia 3D.
- O payload e somente `sessionId`, `dayIndex`, `position`, `isMobile` e `lastSeenAt`.

## MavonEngine

MavonEngine usa a mesma base conceitual que queremos: entidades, servidor autoritativo, WebRTC e sync por distancia. Como o pacote ainda esta em versao inicial, este servidor com geckos.io fica como primeiro passo estavel. A migracao natural e trocar o estado interno simples por entidades Mavon quando o protocolo da obra estiver mais definido.
