# NexQuiz

Kahoot-like kvízová platforma na súkromné použitie. Host tvorí kvízy a spúšťa hru, hráči sa pripájajú z mobilu či PC cez PIN alebo QR kód. Všetko beží v Dockeri (Fastify + Socket.IO, Postgres, Redis, Vue 3).

Podrobnosti: [`docs/STACK.md`](docs/STACK.md) (stack, Docker, tunel, env, testy), [`docs/LOGIC.md`](docs/LOGIC.md) (logika hry, WS a REST API, dáta), [`docs/DESIGN.md`](docs/DESIGN.md) (dizajn).

## Spustenie

```bash
cp .env.example .env     # vyplň POSTGRES_PASSWORD, ADMIN_PASSWORD, SESSION_SECRET (min. 32 znakov)
docker compose up -d --build
docker compose logs api  # "database migrations done", "Server listening …"
```

- Aplikácia: <http://localhost:3000> (aj z LAN cez IP počítača), stav: <http://localhost:3000/api/health>.
- **Admin heslo** hosta je `ADMIN_PASSWORD` v súbore `.env` (prihlásenie na landing stránke `/`). Po zmene hesla treba `docker compose up -d` (kontajner načíta `.env` pri vytvorení).
- Verejný prístup cez Cloudflare quick tunnel: `docker compose --profile tunnel up -d --build`, URL zistíš cez `docker compose logs tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'`. Host musí otvoriť aplikáciu cez tunelovú URL, aby QR kód ukazoval na ňu.
- Vývoj s hot reloadom: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` (frontend na <http://localhost:5173>), späť na prod-like stack: `docker compose up -d --build`.

Dáta sú vo volumes `pgdata`, `redisdata` a `media`. `docker compose down -v` ich **zmaže**.

## Testy

Projekt cieli na Node 22; ak ho na hostovi nemáš, spusti kontroly v kontajneri:

```bash
docker run --rm -v "$PWD":/app -v nexquiz_dev_node_modules:/app/node_modules -w /app node:22-alpine \
  sh -c "npm install --no-audit --no-fund && npm run typecheck && npm run lint && npm test"
```

End-to-end smoke test proti bežiacemu stacku (kvíz so všetkými 6 typmi otázok, host + 2 hráči, override, rejoin, história, CSV):

```bash
docker compose --profile smoke run --rm smoke
```

Viac v [`docs/STACK.md`](docs/STACK.md#testy).

---

Vytvoril [Alnexio](https://alnexio.sk)
