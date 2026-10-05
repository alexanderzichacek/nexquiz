# NexQuiz – Dizajn

## Princípy

- **Štyri kontexty, štyri layouty.** Landing je vstupná brána, editor je pracovný nástroj, host screen je „pódium“ na projektore a player screen je ovládač v ruke. Nezdieľajú layout, iba design tokeny a komponenty.
- **Čitateľnosť na diaľku.** Host screen musí byť čitateľný zo 4–5 m na TV alebo projektore.
- **Jedna ruka, jeden palec.** Player UI používa veľké tap targety a primárne akcie v dolnej tretine obrazovky.
- **Farba nikdy nie je jediný nosič informácie.** Možnosti majú farbu, tvar aj písmeno, stav správne/nesprávne má farbu, ikonu aj text.
- **Okamžitá spätná väzba.** Každá akcia hráča (odoslanie, join) má viditeľné potvrdenie do 100 ms (optimistický stav, potom ack).
- **Hravé, ale nie rušivé.** Animácie podporujú dianie (odpočet, odhalenie, posun v poradí), nie sú samoúčelné.

## Kontexty a zariadenia

| Kontext | Zariadenie | Orientácia / šírka | Téma |
|---|---|---|---|
| Landing (`/`) | Mobil aj desktop | Mobile-first, obsah max. 960 px na stred | Podľa systému |
| Editor (`/host`, `/host/quizzes/:id`) | Desktop / notebook | ≥ 1024 px | Svetlá (podľa systému) |
| Host game screen (lobby, otázka, reveal, leaderboard) | TV / projektor / notebook | 16:9, škálovanie podľa viewportu | **Tmavá** (lepší kontrast na projektore) |
| Player (`/play`) | Mobil (primárne), PC | 360–430 px portrait; na PC max. 480 px na stred | Podľa systému |

Host game screen škáluje písmo cez `clamp()` a `vw`, takže vyzerá rovnako na 13" notebooku aj na 65" TV.

## Značka

- Názov aplikácie je **NexQuiz**.
- Wordmark je textový: `Nex` vo farbe `--text` a `Quiz` vo farbe `--primary`, font `--font`, váha 800, letter-spacing −0.02em.
- Wordmark sa zobrazuje v hlavičke landing stránky, v hlavičke host admin stránok a malý v rohu host game screen (lobby a pódium).
- Favicon je písmeno `N` v zaoblenom štvorci `--primary`.
- `<title>` má tvar `NexQuiz` (landing) a `NexQuiz – {názov stránky}` (ostatné), počas hry napríklad `NexQuiz – PIN 123 456`.

---

## Design tokeny

```css
:root {
  /* základ */
  --bg: #f7f7fb;
  --surface: #ffffff;
  --surface-2: #eef0f6;
  --text: #15161c;
  --text-muted: #5b6070;
  --border: #dde0ea;
  --primary: #5b3df5;
  --primary-contrast: #ffffff;

  /* stavy */
  --success: #1f9d55;
  --danger:  #d6334a;
  --warning: #e3a008;   /* čiastočne správne */
  --info:    #2a7de1;

  /* farby možností odpovedí (dostatočný kontrast s bielym textom) */
  --opt-1: #e5484d;   /* ▲ A */
  --opt-2: #2f6fed;   /* ◆ B */
  --opt-3: #d39e00;   /* ● C */
  --opt-4: #1f9d55;   /* ■ D */
  --opt-5: #8e4ec6;   /* ★ E */
  --opt-6: #e5661a;   /* ⬢ F */

  /* typografia */
  --font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  /* rozostupy (4 px grid) */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;

  /* tvar */
  --radius-sm: 8px;
  --radius:    14px;
  --radius-lg: 22px;
  --shadow:    0 2px 8px rgb(0 0 0 / .08);
  --shadow-lg: 0 8px 28px rgb(0 0 0 / .16);

  /* pohyb */
  --ease: cubic-bezier(.2, .8, .2, 1);
  --t-fast: 120ms;
  --t: 220ms;
  --t-slow: 450ms;
}

/* tmavá téma (player podľa systému, host game screen vždy) */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* rovnaké hodnoty ako nižšie */ } }
:root[data-theme="dark"], .stage {
  --bg: #0f1020;
  --surface: #1a1c33;
  --surface-2: #24274a;
  --text: #f4f5ff;
  --text-muted: #a3a8c7;
  --border: #2f3358;
  --primary: #7c66ff;
}
```

`.stage` je trieda koreňa host game screen, ktorá vynúti tmavú tému.

Tokeny sú v `apps/web/src/styles/tokens.css`. Okrem základných sú tam odvodené tokeny, aby komponenty nemuseli mať natvrdo zadané veľkosti:

- veľkosti písma podľa tabuľky Typografia: `--fs-player-*`, `--fs-host-*` (clamp hodnoty), `--fs-editor-*`, `--fs-body`, `--fs-label`, `--fs-small`, `--fs-pin-input` (28 px), `--fs-wordmark`, `--fs-claim`,
- váhy `--fw-regular` / `--fw-semibold` / `--fw-bold` / `--fw-black`,
- rozmery `--tap-min` (48 px), `--btn-h`, `--btn-h-player` (52 px), `--input-h` (52 px), `--focus-ring` (2 px), `--ring-selected` (3 px), `--border-w`,
- šírky `--w-landing` (960 px), `--w-player` (480 px),
- `--motion` (1, pri `prefers-reduced-motion: reduce` 0) ako násobič posunov a mierky animácií.

## Typografia

| Rola | Player (mobil) | Host screen | Editor |
|---|---|---|---|
| Text otázky | 20–22 px / 600 | `clamp(28px, 3.6vw, 64px)` / 700 | 18 px / 600 |
| Text možnosti | 17 px / 600 | `clamp(20px, 2.2vw, 40px)` / 600 | 15 px |
| PIN | 32 px / 800, mono | `clamp(64px, 9vw, 160px)` / 800, mono, letter-spacing .08em | – |
| Odpočet | 18 px / 700 | `clamp(32px, 4vw, 72px)` / 800 | – |
| Body / text | 16 px / 400 | `clamp(18px, 1.6vw, 28px)` | 14–15 px |
| Label | 13 px / 600, uppercase, letter-spacing .04em | `clamp(14px, 1.2vw, 20px)` | 12–13 px |

Čísla (skóre, odpočet, PIN) používajú `font-variant-numeric: tabular-nums`, aby neposkakovali.

---

## Komponenty

| Komponent | Popis |
|---|---|
| **Button** | `primary`, `secondary`, `ghost`, `danger`. Na playerovi min. výška 52 px a full-width primárne akcie. Stav `loading` so spinnerom, `disabled` |
| **AnswerTile** | Farba `--opt-n` + ikona tvaru + písmeno + text. Stavy: `idle`, `selected` (biely 3 px ring + ✓), `correct`, `wrong` (stlmená opacity .35), `disabled` |
| **TimerRing** | Kruhový odpočet (SVG stroke) s číslom v strede. Posledných 5 s sa sfarbí na `--danger` a jemne pulzuje |
| **TimerBar** | Tenký pruh pod hlavičkou na playerovi (šetrí miesto) |
| **AnsweredCounter** | `12 / 18` + mini progress bar (host) |
| **PlayerChip** | Prezývka v „pilulke“ s náhodnou farbou podľa hashu mena. V lobby sa objaví s pop animáciou, odpojený hráč má opacity .4 |
| **PinDisplay** | PIN rozdelený `123 456`, kopírovanie kliknutím (editor) |
| **QrCard** | Biele pozadie (vždy, kvôli čitateľnosti skenerom), QR + krátka URL pod ním |
| **SortableList** | Položky s úchytom ⠿ a šípkami ↑↓. Počas ťahania sa položka zdvihne (`--shadow-lg`, scale 1.02) |
| **HotspotImage** | Obrázok `object-fit: contain`. Značka ťuku je terčík 28 px s bielym okrajom, s možnosťou presunu ťahaním. V editore kruhy s úchytom pre polomer |
| **HotspotHeatmap** | Reveal: cieľ ako poloprehľadný zelený kruh, ťuky hráčov ako bodky 10 px (zelené / červené) |
| **TextAnswerGroups** | Reveal pre text/music: riadky `odpoveď × počet` s prepínačom ✓/✗. Automaticky uznané majú zelený ľavý okraj, manuálne zmenené ikonu ✋ |
| **AudioControl** | Iba host: veľké tlačidlo ▶/❚❚, replay klipu, progress klipu, ekvalizér animácia počas prehrávania |
| **ResultBanner** | Player: celoplošný stav `Správne` / `Čiastočne` / `Nesprávne` + body (`+0.85`) |
| **LeaderboardRow** | Poradie, prezývka, skóre, delta (`+0.85`), zmena poradia (▲2 / ▼1) |
| **Podium** | Tri stĺpce (2-1-3), postupné odhalenie od 3. miesta |
| **Toast** | Chyby a info (reconnect, „Odpoveď odoslaná“) |
| **ConnectionBadge** | Player: malý indikátor v rohu pri strate spojenia „Pripájam…“ |
| **AppHeader** | Wordmark vľavo. Na host admin stránkach vpravo tlačidlo **Odhlásiť** (`ghost`) |
| **AppFooter** | Centrovaný text `Vytvoril Alnexio` (13 px, `--text-muted`), padding `--s-5`, horný okraj `1px solid --border`. „Alnexio“ je odkaz na `https://alnexio.sk` vo farbe `--primary`, underline pri hover a focus, otvára sa v novom tabe. Používa sa na landing stránke a na host admin stránkach, nie počas hry a nie v player UI |

### Mapovanie možností

| # | Farba | Tvar | Písmeno |
|---|---|---|---|
| 1 | `--opt-1` červená | ▲ trojuholník | A |
| 2 | `--opt-2` modrá | ◆ kosoštvorec | B |
| 3 | `--opt-3` žltá | ● kruh | C |
| 4 | `--opt-4` zelená | ■ štvorec | D |
| 5 | `--opt-5` fialová | ★ hviezda | E |
| 6 | `--opt-6` oranžová | ⬢ šesťuholník | F |

Tvary sú inline SVG ikony, vlastné jednoduché geometrické tvary.

---

## Obrazovky – Landing (`/`)

### Desktop

```
┌──────────────────────────────────────────────────────────────┐
│ NexQuiz                                                      │
│                                                              │
│               Kvízy pre partiu. Bez inštalácie.              │
│                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  │
│  │ Pripojiť sa do hry       │  │ Prihlásenie hosta        │  │
│  │                          │  │                          │  │
│  │ PIN hry                  │  │ Heslo                    │  │
│  │ [ 123 456              ] │  │ [ ••••••••             ] │  │
│  │                          │  │                          │  │
│  │ [       Pripojiť       ] │  │ [      Prihlásiť       ] │  │
│  └──────────────────────────┘  └──────────────────────────┘  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                       Vytvoril Alnexio                       │
└──────────────────────────────────────────────────────────────┘
```

### Mobil

```
┌────────────────────┐
│ NexQuiz            │
│                    │
│ Kvízy pre partiu.  │
│                    │
│ ┌────────────────┐ │
│ │ Pripojiť sa    │ │
│ │ [ 123 456    ] │ │
│ │ [  Pripojiť  ] │ │
│ └────────────────┘ │
│ ┌────────────────┐ │
│ │ Prihlásenie    │ │
│ │ [ ••••••••   ] │ │
│ │ [ Prihlásiť  ] │ │
│ └────────────────┘ │
│────────────────────│
│  Vytvoril Alnexio  │
└────────────────────┘
```

Detaily:
- **Join karta je vizuálne dominantná.** Väčšina návštevníkov sú hráči, preto má primárne tlačidlo a na mobile je prvá. Login karta má `secondary` tlačidlo.
- PIN input: veľké mono písmo (28 px, `tabular-nums`, letter-spacing .1em) s automatickým formátovaním `123 456`. Tlačidlo **Pripojiť** je aktívne až pri 6 číslicách.
- Autofocus na PIN iba na desktope. Na mobile nie, aby sa klávesnica neotvárala hneď po načítaní.
- Chyby (neplatný PIN, nesprávne heslo) sa zobrazujú inline pod inputom vo farbe `--danger` a input dostane červený okraj.
- Po prihlásení (platná session) sa v Login karte namiesto formulára zobrazí „Si prihlásený“ + tlačidlo **Pokračovať do host sekcie**.
- Pätička je prilepená na spodok viewportu, ak je obsah krátky (layout `min-height: 100dvh` + flex column).

## Obrazovky – Editor

### Zoznam kvízov

```
┌────────────────────────────────────────────────────────────┐
│ NexQuiz                                         [Odhlásiť] │
├────────────────────────────────────────────────────────────┤
│ Kvízy                                        [+ Nový kvíz] │
├────────────────────────────────────────────────────────────┤
│ Hudobný kvíz 90s       15 otázok   upravené 2 h  [▶ Hrať] ⋯│
│ Zemepis                10 otázok   upravené 3 d  [▶ Hrať] ⋯│
├────────────────────────────────────────────────────────────┤
│ História hier                                              │
│ 28.9.  Hudobný kvíz 90s   12 hráčov   víťaz: Jano          │
├────────────────────────────────────────────────────────────┤
│                      Vytvoril Alnexio                      │
└────────────────────────────────────────────────────────────┘
```

Rovnaká hlavička (`AppHeader`) a pätička (`AppFooter`) sú na všetkých admin stránkach host sekcie vrátane editora a detailu výsledkov.

### Editor kvízu (3 panely)

```
┌───────────────┬──────────────────────────────────┬──────────────────┐
│ Otázky        │ [Typ: Hudba ▾]                   │ Nastavenia       │
│ ⠿ 1 ◉ Single  │                                  │ Čas: [30] s      │
│ ⠿ 2 ☑ Multi   │ Text otázky                      │ Body: [1]        │
│ ⠿ 3 ↕ Poradie │ [Ktorá kapela a skladba?_______] │                  │
│ ⠿ 4 ⌖ Obrázok │                                  │ Tolerancia       │
│ ⠿ 5 ✎ Text    │ 🎵 track.mp3  [▶] 3:42           │ ( ) prísna       │
│ ⠿ 6 ♫ Hudba ● │ Klip: od [0:45] dĺžka [15] s     │ (•) normálna     │
│               │                                  │ ( ) voľná        │
│ [+ Otázka]    │ Interpret  (0.5 b)               │                  │
│               │ [Metallica ×] [+ alias]          │ ─ Kvíz ─         │
│               │ Názov skladby (0.5 b)            │ ☑ Bonus za čas   │
│               │ [Nothing Else Matters ×][+ alias]│ ☑ Leaderboard    │
│               │                                  │                  │
│               │ [Náhľad hráča]   Uložené ✓       │ [▶ Spustiť hru]  │
└───────────────┴──────────────────────────────────┴──────────────────┘
```

- Aktívna otázka v zozname má podfarbenie `--surface-2` a ľavý okraj `--primary`.
- Otázka s chybou validácie má v zozname červenú bodku a chybové hlášky sa zobrazia inline pri poli.
- Stav autosave vpravo dole: `Ukladám…` → `Uložené ✓` / `Chyba ukladania – skúsiť znova` (klik zopakuje uloženie). Kým má kvíz chyby validácie, zobrazí sa `Neuložené – oprav chyby`.

Type-specific editory:
- **single / multi:** riadky možností s farebnou značkou, prepínač správnosti (radio pri `single`, checkbox pri `multi`), max. 6 možností.
- **order:** zoznam položiek v správnom poradí (drag & drop) + poznámka „Hráčom sa zamieša“.
- **hotspot:** upload obrázka, klik pridá kruh, ťahanie úchytu mení polomer, `Delete` zmaže kruh.
- **text:** aliasy ako chipy (Enter pridá ďalší) + pole „Otestuj odpoveď“, ktoré okamžite ukáže ✓/✗ podľa fuzzy pravidiel.
- **music:** audio upload s mini prehrávačom, výber klipu (od/dĺžka) s tlačidlom prehrať klip, dve polia aliasov s váhami a rovnaké pole „Otestuj odpoveď“.

---

## Obrazovky – Host game screen (16:9, tmavá)

### Lobby

```
┌──────────────────────────────────────────────────────────────┐
│  Hudobný kvíz 90s                                            │
│                                                              │
│   Pripoj sa na  quiz.domena.sk/play       ┌────────────┐    │
│                                            │  ▓▓ QR ▓▓  │    │
│   PIN:   123 456                           │  ▓▓▓▓▓▓▓▓  │    │
│                                            └────────────┘    │
│ ──────────────────────────────────────────────────────────── │
│  👥 8 hráčov                                                 │
│  (Jano) (Zuzka) (Peťo) (Mišo) (Katka) (Ivo) (Lucia) (Dano)  │
│                                                  [Spustiť ▶] │
└──────────────────────────────────────────────────────────────┘
```

- QR má min. 30 % výšky obrazovky, aby sa dal naskenovať z diaľky.

### Otázka – choice typy

```
┌──────────────────────────────────────────────────────────────┐
│ 3 / 15                                       ◯ 24   12/18 ✓ │
│                                                              │
│          Ktoré mesto je hlavným mestom Austrálie?            │
│                     [ obrázok, ak je ]                       │
│                                                              │
│ ┌───────────────────────────┐ ┌───────────────────────────┐ │
│ │ ▲ A  Sydney               │ │ ◆ B  Canberra             │ │
│ └───────────────────────────┘ └───────────────────────────┘ │
│ ┌───────────────────────────┐ ┌───────────────────────────┐ │
│ │ ● C  Melbourne            │ │ ■ D  Perth                │ │
│ └───────────────────────────┘ └───────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Varianty pre ostatné typy:
- **order:** zamiešané položky ako statický zoznam (host ich iba zobrazuje).
- **hotspot:** obrázok na maximálnu možnú plochu, bez cieľov.
- **text:** iba otázka + médium, dole hint „Napíšte odpoveď na svojom zariadení“.
- **music:** veľká animovaná ikona 🎵 / ekvalizér, `AudioControl` a pod tým popisky polí „Interpret · Názov skladby“.

### Reveal

- **choice:** dlaždice sa premenia na stĺpcový graf (výška = počet hlasov). Správne majú ✓ a plnú farbu, nesprávne sú stlmené.
- **order:** správne poradie s očíslovaním + „Priemerná úspešnosť 64 %“.
- **hotspot:** `HotspotHeatmap`.
- **text / music:** správne odpovede veľkým písmom a pod nimi `TextAnswerGroups` (pri music v dvoch stĺpcoch: Interpret | Názov). Host tu klikaním uznáva odpovede. Zmena sa prejaví okamžite s jemným flashom riadku.

### Leaderboard a pódium

```
┌──────────────────────────────────────────────┐
│  Poradie po 3. otázke                        │
│  1  Zuzka        3.42   +0.91   ▲1           │
│  2  Jano         3.10   +0.50   ▼1           │
│  3  Peťo         2.75   +1.00   ▲3           │
│  …                                            │
└──────────────────────────────────────────────┘
```

- Riadky sa animovane presunú na nové pozície (FLIP), skóre sa načíta count-up animáciou (600 ms).
- Pódium odhaľuje 3. → 2. → 1. miesto s krátkou pauzou a pri víťazovi spustí konfety.

---

## Obrazovky – Player (mobil)

```
 Join                 Prezývka            Čakanie
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│                │   │  PIN 123 456   │   │                │
│   Zadaj PIN    │   │                │   │   Si v hre! ✓  │
│ [ 1 2 3 4 5 6 ]│   │  Tvoja prezývka│   │                │
│                │   │ [Jano_______]  │   │     Jano       │
│                │   │                │   │                │
│ [  Pokračovať ]│   │ [   Vstúpiť  ] │   │ Čaká sa na     │
└────────────────┘   └────────────────┘   │ štart…         │
                                          └────────────────┘

 Single / Multi       Poradie             Hotspot
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ 3/15  ▬▬▬▬▬░ 24│   │ 4/15  ▬▬▬░░ 18 │   │ 5/15 ▬▬▬▬░ 20  │
│ Ktoré mesto je │   │ Zoraď od       │   │ Kde je         │
│ hlavné mesto…? │   │ najstaršieho   │   │ Bratislava?    │
│ ┌────────────┐ │   │ ⠿ Rome      ↑↓ │   │ ┌────────────┐ │
│ │▲ A Sydney  │ │   │ ⠿ Paríž     ↑↓ │   │ │   mapa  ⊙  │ │
│ ├────────────┤ │   │ ⠿ Londýn    ↑↓ │   │ │            │ │
│ │◆ B Canberra│ │   │ ⠿ Viedeň    ↑↓ │   │ └────────────┘ │
│ ├────────────┤ │   │                │   │                │
│ │● C Melbour.│ │   │                │   │                │
│ ├────────────┤ │   │                │   │                │
│ │■ D Perth   │ │   │ [  Odoslať   ] │   │ [  Odoslať   ] │
│ └────────────┘ │   └────────────────┘   └────────────────┘
└────────────────┘

 Text                 Hudba               Výsledok
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│ 6/15 ▬▬▬▬▬░ 25 │   │ 7/15 ▬▬▬▬░ 22  │   │   ◐ Čiastočne  │
│ Ako sa volá    │   │ 🎵 Počúvaj     │   │     +0.50      │
│ najvyšší štít  │   │                │   │                │
│ Tatier?        │   │ Interpret      │   │ Interpret ✓    │
│                │   │ [metalica____] │   │ Názov     ✗    │
│ [____________] │   │ Názov skladby  │   │ Správne:       │
│                │   │ [____________] │   │ Nothing Else   │
│ [  Odoslať   ] │   │ [  Odoslať   ] │   │ Matters        │
└────────────────┘   └────────────────┘   │ Skóre 3.10 · 2.│
                                          └────────────────┘
```

Detaily:
- Hlavička otázky je sticky: `index/total`, `TimerBar`, zostávajúce sekundy.
- Pri `single` sa odpoveď odošle ťuknutím, dlaždica dostane stav `selected` a ostatné sa stlmia.
- Po odoslaní sa zobrazí overlay „Odpoveď odoslaná ✓ – čaká sa na ostatných“, pozadie ostane viditeľné a stlmené.
- Pri `text` a `music`:
  - input je full-width, 52 px výška, `autocomplete="off"`, `autocapitalize="off"`, `spellcheck="false"`,
  - Enter v prvom poli presunie fokus na druhé,
  - zobrazená klávesnica nesmie prekryť tlačidlo Odoslať (`visualViewport` / `100dvh`).
- `ResultBanner` má pozadie podľa stavu: `--success` / `--warning` / `--danger` + ikona.
- Pri vypršaní času bez odpovede sa zobrazí „Čas vypršal“ a 0 bodov.

---

## Pohyb a zvuk

| Moment | Animácia | Trvanie |
|---|---|---|
| Hráč vstúpi do lobby | PlayerChip pop (scale .6 → 1) | `--t` |
| Štart otázky | Otázka fade+slide hore, dlaždice staggered (40 ms) | `--t-slow` |
| Posledných 5 s | TimerRing pulz, tick zvuk na hoste | – |
| Odhalenie | Nesprávne sa stlmia, správne „bounce“ | `--t-slow` |
| Skóre | Count-up | 600 ms |
| Leaderboard | FLIP presun riadkov | 500 ms |
| Víťaz | Konfety (canvas) | 2 s |

- `prefers-reduced-motion: reduce` vypne presuny a konfety a ponechá iba fade.
- **Zvuky** hrajú iba na hoste: lobby loop (voliteľný, vypínač v rohu), tick pri posledných 5 s, gong na koniec otázky, fanfára na pódiu.
- Pri `music` otázke sa lobby hudba a tick automaticky stlmia.
- Prvé prehratie zvuku na hoste vyžaduje interakciu (autoplay policy). Tlačidlo **Spustiť** v lobby slúži zároveň na odomknutie audio kontextu.
- Player zvuky nemá, má iba haptiku: `navigator.vibrate(30)` pri odoslaní a vzor 2× pri nesprávnej odpovedi (ak to zariadenie podporuje).
- Zvuky hosta sa generujú cez WebAudio (`apps/web/src/host/game/sounds.ts`), bez externých audio súborov. Vypínač hudby (`♪ Hudba v lobby`) je v pravom hornom rohu host game screen; zapnutá hudba hrá v lobby aj počas hry, okrem `music` otázky (otázka aj reveal) a pódia.
- `AudioControl` sa pri štarte `music` otázky pokúsi klip spustiť automaticky; ak to prehliadač zablokuje (napr. po obnovení stránky bez interakcie), host ho spustí tlačidlom ▶. Prehráva sa iba úsek `clip.start` … `clip.start + clip.duration`.

### Implementačné poznámky (game screen a player)

- Host game screen má vpravo hore aj **Ukončiť hru** (`host:end`, s potvrdením) vo všetkých fázach okrem pódia. Počas zobrazenia nastaví `data-theme="dark"` na `<html>`, aby boli tmavé aj dialógy a toasty (renderujú sa mimo `.stage`).
- Grid choice dlaždíc na hoste: ≤ 4 možnosti 2 stĺpce (2 × 2), 5–6 možností 3 stĺpce v dvoch riadkoch (na 16:9 sa tak zmestia lepšie ako 3 riadky).
- Pódium s menej ako 3 hráčmi odhaľuje iba obsadené miesta (od najnižšieho). Pri `prefers-reduced-motion` sa zobrazí naraz a bez konfiet.
- Hotspot značku na playerovi je po položení možné posúvať aj šípkami (fokus na značke), ťuk do letterboxu mimo obrázka sa ignoruje.
- `ResultBanner` pri `text` / `music` ukazuje pre každé pole vlastnú odpoveď s ✓ / ✗ a prvý uznávaný alias ako správnu odpoveď.

---

## Prístupnosť

- Kontrast textu min. WCAG AA (4.5:1), biely text na farbách možností je overený.
- Tap targety min. 48 × 48 px, medzery medzi dlaždicami min. 8 px.
- Stavy majú vždy farbu, ikonu aj text (✓ / ◐ / ✗).
- Viditeľný `:focus-visible` (2 px `--primary` ring). Editor je plne ovládateľný klávesnicou a dlaždice na PC hráčovi reagujú na klávesy `A`–`F` / `1`–`6`.
- `order` má popri drag & drop aj tlačidlá ↑↓ (motorika, čítačky).
- Odpočet je `aria-live="polite"` iba v míľnikoch (10 s, 5 s), nie každú sekundu.
- Jazyk UI je slovenčina (`lang="sk"`). Texty sú v jednom súbore (`i18n/sk.ts`), takže pridanie ďalšieho jazyka je jednoduché.

## Texty (tón)

Tón je krátky, priateľský, bez technických hlášok.

| Situácia | Text |
|---|---|
| Neplatný PIN | „Hru s týmto PIN-om sme nenašli.“ |
| Obsadená prezývka | „Túto prezývku už niekto má, skús inú.“ |
| Odoslané | „Odpoveď odoslaná ✓“ |
| Neskoro | „Čas vypršal.“ |
| Výpadok spojenia | „Pripájam sa znova…“ |
| Vyhodený hráč | „Host ťa odstránil z hry.“ |
| Nesprávne heslo | „Nesprávne heslo.“ |
| Claim na landing stránke | „Kvízy pre partiu. Bez inštalácie.“ |
| Koniec | „Koniec hry! Skončil si {rank}. z {total}.“ |

## Responzivita

- **Landing:** pod 720 px sú karty pod sebou (Join prvá), nad 720 px vedľa seba v gride 2 × 1 s max. šírkou 960 px.
- **Player:** mobile-first. Pri šírke ≥ 600 px je obsah max. 480 px na stred s `--surface` kartou. Používaj `100dvh` (adresný riadok na mobile) a `env(safe-area-inset-*)` (notch, home indicator).
- **Choice dlaždice na playerovi:** pri 2–4 možnostiach mriežka 2 × 2 (ak sú texty krátke, do 20 znakov) alebo stĺpec. Pri 5–6 možnostiach vždy stĺpec.
- **Host screen:** grid 2 × 2 (≤ 4 možnosti) alebo 2 × 3 (5–6). Pod 900 px šírky (host na notebooku v okne) prepne na stĺpec.
- **Editor:** pod 1024 px sa pravý panel presunie pod editor a ľavý zoznam sa zbalí do rozbaľovacieho menu.
