# Amigo Secreto — Sorteio Automático (15 Pessoas)

Aplicação web feita em Next.js pronta para deploy na **Vercel**.

## Como funciona

1. Cada participante acessa o site, digita seu nome e recebe uma **chave secreta única** (`AMIGO-XXXX-XXXX`) para guardar.
2. As chaves são armazenadas com hash SHA-256 (nunca expostas em texto puro).
3. Assim que o **15º participante** entra, o servidor fecha as inscrições e executa automaticamente o sorteio (algoritmo de Sattolo com `crypto.randomInt`, garantindo que ninguém tire a si mesmo e que todos tirem e sejam tirados exatamente uma vez).
4. Todos voltam ao site, informam a chave guardada na aba **Usar minha chave** e descobrem quem tiraram.

## Armazenamento na Vercel

Em ambiente local, o jogo salva automaticamente em `.data/amigo-secreto.json`.

Em produção na Vercel, o app suporta automaticamente:
- **Vercel Blob privado** (`BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID`) com controle de concorrência otimista via ETag (`ifMatch`), ou
- **Upstash Redis / Redis** (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` ou `REDIS_URL`).

## Variáveis opcionais

- `MAX_PARTICIPANTS`: quantidade de participantes para disparar o sorteio (padrão: `15`).
- `ADMIN_SECRET`: se definido, habilita `POST /api/admin/reset` enviando `{ "secret": "..." }` para iniciar uma nova rodada.
