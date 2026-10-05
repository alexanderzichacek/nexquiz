# CLAUDE.md – NexQuiz

Kahoot-like kvízová platforma. Host tvorí kvízy a spúšťa hru, hráči sa pripájajú cez PIN alebo QR kód z mobilu či PC.
Fáza 1 beží v Dockeri na lokálnom PC cez Cloudflare Tunnel, fáza 2 je nasadenie na VPS.

## Zdroj pravdy

Pred zmenou si prečítaj relevantný dokument. Pri rozpore platí dokument, nie tvoj odhad.

| Dokument | Obsah |
|---|---|
| `docs/STACK.md` | Technológie, Docker, tunel, env, štruktúra repa |
| `docs/LOGIC.md` | Routy, typy otázok, scoring, fuzzy matching, stavový automat, WS eventy, REST, DB a Redis schéma |
| `docs/DESIGN.md` | Tokeny, komponenty, wireframy, pätička, prístupnosť, texty |

- Ak implementácia mení správanie popísané v dokumentoch, **aktualizuj dokument v tom istom kroku**.
- Ak niečo v dokumentoch chýba alebo si odporuje, **opýtaj sa**, nedomýšľaj.

## Stack (stručne)

- TypeScript všade. Node 22, Fastify, Socket.IO, Zod, Drizzle + Postgres 17, Redis 7.
- Frontend: Vue 3, Vite, Vue Router, Pinia.
- Monorepo cez npm workspaces: `apps/api`, `apps/web`, `packages/shared`.
- Jeden `api` kontajner servuje REST, WebSocket, build frontendu aj `/media/:id`.

## Príkazy

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up   # dev s hot reload
docker compose --profile tunnel up -d --build                        # prod-like + quick tunnel
npm run typecheck
npm run lint
npm test                      # vitest
npm run db:generate           # drizzle-kit generate (po zmene schémy)
npm run db:migrate
```

Pred tým, než prehlásiš úlohu za hotovú, musia prejsť `typecheck`, `lint` a `test`.

## Štruktúra a hranice modulov

- `packages/shared` obsahuje Zod schémy (otázky, WS eventy, REST DTO) a scoring (`normalize`, `isMatch`, scorery). Je to jediný zdroj typov, **nikdy nedefinuj ten istý typ druhýkrát** v `api` alebo `web`.
- `apps/api/src`:
  - `rest/` iba HTTP vrstva (validácia, volanie služieb),
  - `realtime/` iba socket handlery,
  - `game/` herná logika a stavový automat,
  - `store/` prístup k Redisu,
  - `db/` Drizzle.
  - Handlery neobsahujú biznis logiku.
- `apps/web/src`: `landing/`, `host/`, `play/`, `components/`.
  - Host časť je lazy-loaded chunk.
  - `play/` nesmie importovať nič z `host/`.

## Na čo určite myslieť

### Bezpečnosť a férovosť hry
- **Správne odpovede nikdy neodchádzajú klientovi pred reveal**: `correctId`, `correctIds`, poradie `items`, `targets`, `accepted`. Payload `question:start` stavaj cez explicitný whitelist (sanitizer), nie cez spread snapshotu.
- **Scoring beží iba na serveri.** Kód je v `shared` kvôli testom, ale klient ho nevolá na rozhodovanie.
- **Čas meria server**: `questionStartedAt`, `deadline`, `receivedAt`. Klientský čas slúži iba na zobrazenie odpočtu (offset zo `serverNow`).
- **Jedna odpoveď na hráča a otázku** cez `HSETNX`. Odpoveď mimo stavu `QUESTION`, mimo `currentIndex` alebo po `deadline + grace` sa odmietne.
- Každý REST a WS vstup prechádza Zod validáciou, vrátane kontroly, že ID patria k aktuálnej otázke a `order` je permutácia.
- Host routy a `/host` socket namespace vyžadujú session. `/play` iba token hráča (server drží jeho hash).
- Pri hre sa pracuje so **snapshotom kvízu**, nie so živými dátami z DB.

### Stav a odolnosť
- Stav bežiacej hry žije v Redise, nie v pamäti procesu. In-memory sú iba timery a tie sa po reštarte obnovia z `deadline`.
- Prechody stavového automatu vykonáva iba server, a to v jednej funkcii (`GameService.transition`). Neplatný prechod vyhodí chybu.
- Pri `player:rejoin` aj `host:attach` musí server vrátiť kompletný `game:state`.
- Persistencia do Postgresu prebieha po každom reveal a pri `FINISHED`.
- Redis kľúče hry majú vždy TTL.

### Scoring a fuzzy matching
- Každá zmena v `normalize`, `isMatch`, prahoch alebo scoreroch musí mať **unit testy**. Pridaj prípad, ktorý zmenu motivoval.
- Body: `points × correctness × speedFactor`, ukladané ako `numeric(8,2)`. Pri počítaní nepoužívaj nekontrolovaný float, zaokrúhľuj až pri uložení a zobrazení.
- Override hosta má prednosť pred automatickým vyhodnotením a spúšťa prepočet všetkých dotknutých hráčov aj leaderboardu.

### Frontend
- Player UI je mobile-first: tap targety ≥ 48 px, `100dvh`, safe-area, klávesnica nesmie prekryť Odoslať.
- Farba nikdy nie je jediný nosič informácie: možnosti majú farbu, tvar aj písmeno.
- Používaj iba design tokeny (CSS premenné z `DESIGN.md`), žiadne natvrdo zadané farby či veľkosti.
- `AppFooter` („Vytvoril Alnexio“ → `https://alnexio.sk`, `target="_blank" rel="noopener"`) patrí na landing a host admin stránky. **Nie** na game screen počas hry a nie do player UI.
- Rešpektuj `prefers-reduced-motion`.

### Jazyk
- Kód, identifikátory, komentáre, commit správy a názvy testov sú v **angličtine**.
- UI texty sú v **slovenčine** a iba v `apps/web/src/i18n/sk.ts`, nikdy nie natvrdo v komponentoch.

## Čo určite nerobiť

- Neposielať klientovi správne odpovede, `accepted` aliasy ani celý snapshot kvízu.
- Nedôverovať klientskému času, skóre ani `correctness` z klienta.
- Nepoužívať `localStorage` na nič iné ako token hráča (`nexquiz:{pin}`) a UI preferencie.
- Nemeniť verejný tvar WS eventov alebo REST bez úpravy Zod schémy v `shared` a sekcie v `LOGIC.md`.
- Nepridávať nové závislosti bez dôvodu. Ak treba novú knižnicu, zdôvodni ju a uprednostni malé, udržiavané balíky.
- Neupravovať existujúce migrácie, vždy vytvor novú cez `db:generate`.
- Necommitovať `.env`, tajomstvá ani tokeny. Nové premenné doplň do `.env.example` a tabuľky v `STACK.md`.
- Nepridávať features mimo rozsahu MVP (účty, tímy, pauza, polygóny, S3, viac inštancií…) bez výslovného zadania.
- Neriešiť škálovanie na viac inštancií predčasne, ale ani nerobiť rozhodnutia, ktoré ho zablokujú (globálny stav v pamäti procesu).
- Nepoužívať `any`, `@ts-ignore` ani vypínanie lint pravidiel bez komentára s dôvodom.
- Nevkladať do UI cudzie loga, značky ani chránené postavy. Tvary možností sú vlastné jednoduché SVG.
- Nemazať ani neprepisovať dáta v DB alebo volumoch (`down -v`, `drop`, `truncate`) bez výslovného súhlasu.

## Postup práce

1. Prečítaj si relevantnú časť `docs/`.
2. Pri netriviálnej úlohe najprv navrhni krátky plán (súbory, zmeny), až potom implementuj.
3. Rob malé, ucelené zmeny. Jedna úloha znamená jeden logický celok.
4. Najprv schéma v `shared`, potom server, potom klient.
5. Testy: scoring a fuzzy matching vždy, herná logika (prechody, odmietnutie neskorej či duplicitnej odpovede) pri zmene.
6. Spusti `typecheck`, `lint` a `test`.
7. Ak sa menilo správanie, aktualizuj `docs/`.
8. Na konci napíš stručné zhrnutie: čo sa zmenilo, čo ostáva otvorené, prípadné riziká.

## Konvencie

- ESM, `strict: true`, `noUncheckedIndexedAccess: true`.
- Chyby voči klientovi majú stabilné kódy (`PIN_NOT_FOUND`, `NICK_TAKEN`, `LATE`, `ALREADY_ANSWERED`, `INVALID`), nikdy nie stack trace.
- Logovanie cez Fastify logger (pino) so štruktúrovanými poľami (`pin`, `gameId`, `playerId`). Nelogovať heslá, tokeny ani obsah session.
- Commit správy podľa Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`).
