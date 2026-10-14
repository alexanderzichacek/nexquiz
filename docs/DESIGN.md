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
- Logo (znak `N` v zaoblenom štvorci `--primary` + väčší wordmark, `--fs-logo` 40 px, znak `--logo-mark` 56 px) je na landing stránke vycentrované navrchu a nahrádza claim; samostatná hlavička tam nie je.
- Wordmark sa zobrazuje v hlavičke host admin stránok a malý v rohu host game screen (lobby a pódium).
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

- veľkosti písma podľa tabuľky Typografia: `--fs-player-*`, `--fs-host-*` (clamp hodnoty), `--fs-editor-*`, `--fs-body`, `--fs-label`, `--fs-small`, `--fs-pin-input` (28 px), `--fs-wordmark`, `--fs-logo`, `--fs-claim`,
- váhy `--fw-regular` / `--fw-semibold` / `--fw-bold` / `--fw-black`,
- rozmery `--tap-min` (48 px), `--btn-h`, `--btn-h-player` (52 px), `--input-h` (52 px), `--focus-ring` (2 px), `--ring-selected` (3 px), `--border-w`,
- šírky `--w-landing` (960 px), `--w-player` (480 px),
- avatar hráča: `--avatar-bg`, `--avatar-ink` (oči, ústa, okuliare, cylinder), `--avatar-light` (golier, pruhy), pleť `--avatar-skin-1…5`, vlasy `--avatar-hair-1…4`, veľkosti `--avatar-sm`, `--avatar-chip`, `--avatar-row`, `--avatar-podium`, `--avatar-podium-player`, `--avatar-waiting`, `--avatar-preview`, `--avatar-pick`; tričká používajú `--opt-n`,
- `--motion` (1, pri `prefers-reduced-motion: reduce` 0) ako násobič posunov a mierky animácií,
- prispôsobenie dlhých textov (pozri Responzivita – „Nič sa neposúva“): kroky `--fit-m` / `--fit-s` / `--fit-xs` (triedy `.fit-*` nastavia `--fit`), minimá `--fs-player-min` / `--fs-player-prompt-min`, rozloženie host obrazovky `--stage-pad-y`, `--stage-gap`, `--stage-tile-pad`, `--stage-media-min`, `--stage-tiles-max`, `--fs-host-row` a na playerovi `--h-player-tile`, `--h-player-grid-tile`, `--fs-player-grid-option`, `--h-player-card-max`.

## Typografia

| Rola | Player (mobil) | Host screen | Editor |
|---|---|---|---|
| Text otázky | 20–22 px / 600 | `clamp(24px, min(3.6vw, 6.4vh), 64px)` / 700 | 18 px / 600 |
| Text možnosti | 17 px / 600 | `clamp(18px, min(2.2vw, 3.9vh), 40px)` / 600 | 15 px |
| PIN | 32 px / 800, mono | `clamp(48px, min(9vw, 16vh), 160px)` / 800, mono, letter-spacing .08em | – |
| Odpočet | 18 px / 700 | `clamp(28px, min(4vw, 7.1vh), 72px)` / 800 | – |
| Body / text | 16 px / 400 | `clamp(16px, min(1.6vw, 2.85vh), 28px)` | 14–15 px |
| Label | 13 px / 600, uppercase, letter-spacing .04em | `clamp(13px, min(1.2vw, 2.1vh), 20px)` | 12–13 px |

Host veľkosti počítajú so šírkou aj výškou (`min(vw, vh)`), aby sa obrazovka zmestila aj v nižšom okne. Dlhé texty otázky a možností sa zmenšujú krokmi `--fit-*` (pozri Responzivita).

Čísla (skóre, odpočet, PIN) používajú `font-variant-numeric: tabular-nums`, aby neposkakovali.

---

## Komponenty

| Komponent | Popis |
|---|---|
| **Button** | `primary`, `secondary`, `ghost`, `danger`. Na playerovi min. výška 52 px a full-width primárne akcie. Stav `loading` so spinnerom, `disabled` |
| **AnswerTile** | Farba `--opt-n` + ikona tvaru + písmeno + text (na playerovi riadok zoznamu, pri krátkych možnostiach dlaždica s odznakom tvaru a písmena v rohu – `badge`). Stavy: `idle`, `selected` (biely 3 px ring + ✓), `correct`, `wrong` (stlmená opacity .35), `disabled` |
| **TimerRing** | Kruhový odpočet (SVG stroke) s číslom v strede. Posledných 5 s sa sfarbí na `--danger` a jemne pulzuje |
| **TimerBar** | Tenký pruh pod hlavičkou na playerovi (šetrí miesto) |
| **AnsweredCounter** | `12 / 18` + mini progress bar (host) |
| **PlayerChip** | Avatar + prezývka v „pilulke“ s náhodnou farbou podľa hashu mena. V lobby sa objaví s pop animáciou, odpojený hráč má opacity .4 |
| **PlayerAvatar** | Vlastné jednoduché SVG v kruhu: telo (5 variantov tvaru a farby trička), hlava (5 variantov pleti a účesu), voliteľne okuliare, klobúk a fúzy (po 3 variantoch). Je dekoratívny (`aria-hidden`), informáciu nesie prezývka vedľa neho. Veľkosť cez `--avatar-size` |
| **AvatarPicker** | Krok prezývky: veľký náhľad, tlačidlo „🎲 Náhodne“, prepínače častí (Telo · Hlava · Okuliare · Klobúk · Fúzy) a varianty aktívnej časti ako celé avatary (tap target ≥ 48 px, zvolený má 3 px ring). Voliteľné časti majú aj „Bez“. Štartuje s náhodným telom a hlavou bez doplnkov |
| **PinDisplay** | PIN rozdelený `123 456`, kopírovanie kliknutím (editor) |
| **QrCard** | Biele pozadie (vždy, kvôli čitateľnosti skenerom), QR + krátka URL pod ním |
| **SortableList** | Položky s úchytom ⠿ a šípkami ↑↓. Počas ťahania sa položka zdvihne (`--shadow-lg`, scale 1.02). S `slotArrows` šípky vykreslí obsah položky sám (zoznam otázok) |
| **HotspotImage** | Obrázok `object-fit: contain`. Značka ťuku je terčík 28 px s bielym okrajom, s možnosťou presunu ťahaním. V editore kruhy s úchytom pre polomer |
| **HotspotHeatmap** | Reveal: cieľ ako poloprehľadný zelený kruh, ťuky hráčov ako bodky 10 px (zelené / červené) |
| **HotspotResult** | Player výsledok `hotspot`: obrázok so správnymi oblasťami (zelené kruhy) a vlastným ťukom (rovnaký terčík ako pri odpovedi) + legenda „Správne miesto · Tvoj ťuk“ |
| **TextAnswerGroups** | Reveal pre text/music: riadky `odpoveď × počet` s prepínačom ✓/✗. Automaticky uznané majú zelený ľavý okraj, manuálne zmenené ikonu ✋ |
| **AudioControl** | Iba host: veľké tlačidlo ▶/❚❚, replay klipu, progress klipu, ekvalizér animácia počas prehrávania |
| **MediaToggle** | Player: prepínač (switch, `role="switch"`, celý riadok je tap target ≥ 48 px) „🔊 Zvuk a video na tomto zariadení“, predvolene vypnutý. Na kroku prezývky s nápovedou pod ním, na čakacích obrazovkách (lobby, medzi otázkami) bez nej |
| **PlayerClip** | Player so zapnutým zvukom: jeden riadok ▶/❚❚ (`--primary`), ↺ replay (oba 48 px), nad progress barom stav „🎵 Počúvaj“ / „Načítavam ukážku…“ / „Ukážku sa nepodarilo načítať.“. Nahrádza text „🎵 Počúvaj“ pri `music` a `text` s audiom |
| **NumberGuesses** | Reveal pre `number`: riadky `✓/✗ hodnota · o rozdiel · počet× · body / bez bodov`, od najbližšieho tipu k správnemu číslu, max. 10 riadkov a zhrnutie zvyšku |
| **ResultBanner** | Player: celoplošný stav `Správne` / `Čiastočne` / `Nesprávne` + body (`+850`); pri `hotspot` s `HotspotResult`, pri `number` vlastný tip a správne číslo |
| **LeaderboardRow** | Poradie, avatar + prezývka, skóre, delta (`+850`), zmena poradia (▲2 / ▼1) |
| **Podium** | Tri stĺpce (2-1-3) s avatarom a prezývkou, postupné odhalenie od 3. miesta. Na playerovi má vlastný stĺpec prezývku v `--primary` a štítok „Ty“ |
| **RankingTable** | Koniec hry: ďalšie miesta od 4. (poradie, avatar, prezývka, skóre, tabulárne číslice). Varianty `host` / `player`, voliteľne 2 stĺpce (po stĺpcoch). Scrolluje vo vlastnej oblasti (focusovateľná pre klávesnicu). Vlastný riadok: tučné písmo, rámček `--primary`, štítok „Ty“, `aria-current` |
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
│                                                              │
│                        [N] NexQuiz                           │
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
│ [+ Otázka]    │ Interpret  (500 b)               │                  │
│               │ [Metallica ×] [+ alias]          │ ─ Kvíz ─         │
│               │ Názov skladby (500 b)            │ ☑ Bonus za čas   │
│               │ [Nothing Else Matters ×][+ alias]│ ☑ Leaderboard    │
│               │                                  │                  │
│               │ [Náhľad hráča]   Uložené ✓       │ [▶ Spustiť hru]  │
└───────────────┴──────────────────────────────────┴──────────────────┘
```

- Aktívna otázka v zozname má podfarbenie `--surface-2` a ľavý okraj `--primary`.
- Položka zoznamu otázok má celú šírku pre číslo, ikonu typu, typ a text otázky (oba skrátené s „…“). Akcie ↑ ↓ ⧉ × sú v samostatnom riadku iba pod aktívnou otázkou (úzky panel 260 px by ich inak nezmestil vedľa textu). Úchyt ⠿ ostáva pri každej položke.
- Otázka s chybou validácie má v zozname červenú bodku a chybové hlášky sa zobrazia inline pri poli.
- Stav autosave vpravo dole: `Ukladám…` → `Uložené ✓` / `Chyba ukladania – skúsiť znova` (klik zopakuje uloženie). Kým má kvíz chyby validácie, zobrazí sa `Neuložené – oprav chyby`.

- **Stránka** (položka bez otázky, ikona ▭): v zozname nemá číslo, v strednom paneli je nadpis, popis a obrázok (aspoň jedno vyplnené, inak chyba „Pridaj nadpis, popis alebo obrázok.“). Pravý panel nezobrazuje čas ani body.

Type-specific editory:
- **single / multi:** riadky možností s farebnou značkou, prepínač správnosti (radio pri `single`, checkbox pri `multi`), max. 6 možností.
- **order:** zoznam položiek v správnom poradí (drag & drop) + poznámka „Hráčom sa zamieša“.
- **hotspot:** upload obrázka, klik pridá kruh, ťahanie úchytu mení polomer, `Delete` zmaže kruh.
- **text:** aliasy ako chipy (Enter pridá ďalší) + pole „Otestuj odpoveď“, ktoré okamžite ukáže ✓/✗ podľa fuzzy pravidiel.
- **music:** audio upload s mini prehrávačom, výber klipu (od/dĺžka) s tlačidlom prehrať klip, dve polia aliasov s váhami a rovnaké pole „Otestuj odpoveď“.
- **number:** pole „Správne číslo“ (ikona typu `#`), dve radio voľby „Najbližší tip“ / „Tip v tolerancii“ s krátkym vysvetlením a pri tolerancii pole „Tolerancia (±)“.

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
│  👥 8 hráčov                                     [Spustiť ▶] │
│  (Jano) (Zuzka) (Peťo) (Mišo) (Katka) (Ivo) (Lucia) (Dano)  │
└──────────────────────────────────────────────────────────────┘
```

- QR má min. 30 % výšky obrazovky, aby sa dal naskenovať z diaľky.
- Názov kvízu (max. 2 riadky) je v ľavom stĺpci nad URL a PIN-om, **Spustiť** v riadku s počtom hráčov. Pri veľa hráčoch sa posúva iba oblasť s čipmi, nie stránka.

### Otázka – choice typy

```
┌──────────────────────────────────────────────────────────────┐
│ 3 / 15 [Ukončiť otázku teraz]                ◯ 24   12/18 ✓ │
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

- **Ukončiť otázku teraz** je v hornom riadku vedľa `3 / 15` (nie v pätičke), aby otázka mala viac výšky.
- Text otázky sa pri dlhom znení zmenšuje (krok podľa dĺžky) a ako posledná možnosť sa oreže na 4 riadky. Obrázok / video zaberá zvyšnú výšku (`object-fit: contain`, min. `--stage-media-min`), dlaždice si výšku delia rovnomerne (riadky `1fr`) a ich text sa zmenšuje podľa najdlhšej možnosti a orezáva na riadky, ktoré sa do dlaždice zmestia.

Varianty pre ostatné typy:
- **order:** zamiešané položky ako statický zoznam (host ich iba zobrazuje), pri viac ako 4 položkách v dvoch stĺpcoch.
- **hotspot:** obrázok na maximálnu možnú plochu, bez cieľov.
- **text:** iba otázka + médium, dole hint „Napíšte odpoveď na svojom zariadení“.
- **music:** veľká animovaná ikona 🎵 / ekvalizér, `AudioControl` a pod tým popisky polí „Interpret · Názov skladby“.
- **number:** otázka + médium, dole hint „Napíšte číslo na svojom zariadení“ a pravidlo („Body získa najbližší tip“ / „…s odchýlkou najviac ±1“). Správne číslo sa neukazuje.

### Stránka

- Vycentrovaný nadpis (`--fs-host-pin`, `--fw-black`), pod ním popis (`--fs-host-option`, `--text-muted`) a obrázok (max. 45 vh). Vpravo dole **Ďalej**. Bez odpočtu, bez počítadla odpovedí.
- Dlhý nadpis a popis sa zmenšujú, obrázok sa zmenší na voľnú výšku a veľmi dlhý popis sa posúva vo vlastnom boxe.
- Na mobile hráča sa zobrazí ten istý obsah (nadpis `--fs-player-pin`, popis `--fs-player-question`, obrázok max. 40 dvh) bez ovládacích prvkov.

### Reveal

- **choice:** dlaždice sa premenia na stĺpcový graf (výška = počet hlasov, graf zaberá voľnú výšku). Správne majú ✓ a plnú farbu, nesprávne sú stlmené. Text možnosti pod stĺpcom má max. 2 riadky.
- **order:** správne poradie s očíslovaním (pri viac ako 4 položkách v dvoch stĺpcoch) + „Priemerná úspešnosť 64 %“.
- **hotspot:** `HotspotHeatmap`.
- **number:** správne číslo veľkým písmom s pravidlom a pod ním `NumberGuesses` (viac ako 5 riadkov v dvoch stĺpcoch).
- **text / music:** správne odpovede veľkým písmom (max. 2 riadky, aliasy tiež) a pod nimi `TextAnswerGroups` (pri music v dvoch stĺpcoch: Interpret | Názov). Host tu klikaním uznáva odpovede. Zmena sa prejaví okamžite s jemným flashom riadku.
- Dlhé zoznamy (poradie, tipy, skupiny odpovedí) sa posúvajú vo vlastnom boxe, stránka nikdy.

### Leaderboard a pódium

```
┌──────────────────────────────────────────────┐
│  Poradie po 3. otázke                        │
│  1  Zuzka        3420   +910   ▲1             │
│  2  Jano         3100   +500   ▼1             │
│  3  Peťo         2750  +1000   ▲3             │
│  …                                            │
└──────────────────────────────────────────────┘
```

- Riadky sa animovane presunú na nové pozície (FLIP), skóre sa načíta count-up animáciou (600 ms).
- Pódium odhaľuje 3. → 2. → 1. miesto s krátkou pauzou a pri víťazovi spustí konfety.

Koniec hry (host):

```
┌──────────────────────────────────────────────────────────────┐
│          Koniec hry          │ ĎALŠIE MIESTA                 │
│            (☺)               │  4. (☺) Mišo  2100 │ 15. …    │
│      (☺) ┌─────┐             │  5. (☺) Katka 1980 │ 16. …    │
│     ┌────┤  1  ├────┐        │  6. …              │ …        │
│     │ 2  │     │ 3  │        │  …                 │ 25. …    │
│     └────┴─────┴────┘        │                               │
│ [Exportovať CSV] [Detail] [← Späť na kvízy]                  │
└──────────────────────────────────────────────────────────────┘
```

- Na širokej obrazovke (> 900 px) sú vedľa seba: vľavo nadpis, pódium a akcie (CSV, detail, späť), vpravo tabuľka ďalších miest (od 4. miesta, `RankingTable`). Všetko sa zmestí na jednu obrazovku (`100dvh`), bez scrollu stránky.
- Od 9 riadkov sa tabuľka láme do 2 stĺpcov po stĺpcoch (4.–14. | 15.–25.), ak má každý stĺpec aspoň `--ranking-col-min`. Ak sa ani tak nezmestí, scrolluje sa iba oblasť tabuľky. Pri ~25 hráčoch sa zmestí na 1920 × 1080 aj 1366 × 768 bez scrollu.
- Pri ≤ 3 hráčoch tabuľka nie je a pódium je na stred. Pod 900 px šírky sú bloky pod sebou a scrolluje sa stage.

---

## Obrazovky – Player (mobil)

```
 Join                 Prezývka            Čakanie
┌────────────────┐   ┌────────────────┐   ┌────────────────┐
│                │   │  PIN 123 456   │   │                │
│   Zadaj PIN    │   │  (☺) [🎲]      │   │   Si v hre! ✓  │
│ [ 1 2 3 4 5 6 ]│   │Telo|Hlava|Okul.│   │      (☺)       │
│                │   │ ◯ ◯ ◯ ◯ ◯      │   │                │
│                │   │  Tvoja prezývka│   │                │
│                │   │ [Jano_______]  │   │     Jano       │
│                │   │ (○ ) 🔊 Zvuk a │   │                │
│                │   │ video na tomto…│   │ Čaká sa na     │
│ [  Pokračovať ]│   │ [   Vstúpiť  ] │   │ štart…         │
└────────────────┘   └────────────────┘   │ (○ ) 🔊 Zvuk…  │
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
│ Ako sa volá    │   │ 🎵 Počúvaj     │   │     +500       │
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
- Hlavička otázky: `index/total`, `TimerBar`, zostávajúce sekundy. Obrazovka otázky sa neposúva (pozri Responzivita), preto hlavička nemusí byť sticky.
- Pri `single` sa odpoveď odošle ťuknutím, dlaždica dostane stav `selected` a ostatné sa stlmia.
- Po odoslaní sa zobrazí overlay „Odpoveď odoslaná ✓ – čaká sa na ostatných“, pozadie ostane viditeľné a stlmené.
- Pri `text` a `music`:
  - input je full-width, 52 px výška, `autocomplete="off"`, `autocapitalize="off"`, `spellcheck="false"`,
  - Enter v prvom poli presunie fokus na druhé,
  - zobrazená klávesnica nesmie prekryť tlačidlo Odoslať (`visualViewport` / `100dvh`).
- `ResultBanner` má pozadie podľa stavu: `--success` / `--warning` / `--danger` + ikona.
- Pri `number`: input s desatinnou klávesnicou (`inputmode="decimal"`), vľavo tlačidlo **±** (52 × 52 px, na decimálnej klávesnici iOS chýba mínus), nad ním nápoveda podľa režimu. Neplatný vstup ukáže chybu a deaktivuje Odoslať.
- Pri vypršaní času bez odpovede sa zobrazí „Čas vypršal“ a 0 bodov.
- **Koniec hry:** zhora „Koniec hry! Skončil si {rank}. z {total}.“, vlastné skóre, pódium a pod ním tabuľka ďalších miest (od 4. miesta, `RankingTable`). Vlastný riadok aj vlastný stĺpec na pódiu sú zvýraznené nielen farbou: tučné písmo, rámček `--primary` a štítok „Ty“. Tabuľka scrolluje vo vlastnej oblasti (max. `--player-ranking-h`) a pri načítaní posunie vlastný riadok do stredu. Je to jediná player obrazovka, kde môže na nízkom mobile scrollovať aj stránka; tlačidlo **Späť na úvod** je vtedy prilepené dole (sticky).

---

## Pohyb a zvuk

| Moment | Animácia | Trvanie |
|---|---|---|
| Hráč vstúpi do lobby | PlayerChip pop (scale .6 → 1) | `--t` |
| Štart otázky | Otázka fade+slide hore, dlaždice staggered (40 ms) | `--t-slow` |
| Posledných 5 s | TimerRing pulz, tick zvuk na hoste (a u hráča so zapnutým zvukom) | – |
| Odhalenie | Nesprávne sa stlmia, správne „bounce“ | `--t-slow` |
| Skóre | Count-up | 600 ms |
| Leaderboard | FLIP presun riadkov | 500 ms |
| Víťaz | Konfety (canvas) | 2 s |

- `prefers-reduced-motion: reduce` vypne presuny a konfety a ponechá iba fade.
- **Zvuky** hrajú na hoste: lobby loop (voliteľný, vypínač v rohu), tick pri posledných 5 s, gong na koniec otázky, fanfára na pódiu.
- Pri `music` otázke sa lobby hudba a tick automaticky stlmia.
- Prvé prehratie zvuku na hoste vyžaduje interakciu (autoplay policy). Tlačidlo **Spustiť** v lobby slúži zároveň na odomknutie audio kontextu.
- Player má predvolene iba haptiku: `navigator.vibrate(30)` pri odoslaní a vzor 2× pri nesprávnej odpovedi (ak to zariadenie podporuje).
- **Zvuk a video na zariadení hráča** (opt-in cez `MediaToggle`, pre hráča mimo miestnosti): tick posledných 5 s (nie pri otázke s klipom), gong na koniec otázky a fanfára pri konci hry, video otázky (s ovládaním, `playsinline`; ak prehliadač nedovolí štart so zvukom, spustí sa stlmené) a audio klip cez `PlayerClip`. Lobby loop hráč nemá. Zapnutie prepínača je zároveň gesto, ktoré odomkne audio; po reloade ho odomkne prvé ťuknutie kdekoľvek. Na iPhone sa nastaví `navigator.audioSession.type = "playback"`, aby zvuk hral aj pri tichom režime (ak to Safari podporuje).
- Zvuky sa generujú cez WebAudio (`apps/web/src/lib/sounds.ts`, host aj player), bez externých audio súborov. Vypínač hudby (`♪ Hudba v lobby`) je v pravom hornom rohu host game screen; zapnutá hudba hrá v lobby aj počas hry, okrem `music` otázky (otázka aj reveal) a pódia.
- `AudioControl` sa pri štarte `music` otázky pokúsi klip spustiť automaticky; ak to prehliadač zablokuje (napr. po obnovení stránky bez interakcie), host ho spustí tlačidlom ▶. Prehráva sa iba úsek `clip.start` … `clip.start + clip.duration`.

### Implementačné poznámky (game screen a player)

- Host game screen má vpravo hore aj **Ukončiť hru** (`host:end`, s potvrdením) vo všetkých fázach okrem pódia a ikonové tlačidlo **Celá obrazovka** (vlastné SVG, `aria-label` „Celá obrazovka“ / „Ukončiť celú obrazovku“, tooltip s „(F)“) vo všetkých fázach. Používa Fullscreen API na celý dokument (`document.documentElement.requestFullscreen`), stav sleduje cez `fullscreenchange` a kde API chýba (iPhone Safari), tlačidlo sa nezobrazí. Kláves `F` ho prepína tiež (nie pri písaní do poľa, s modifikátorom ani pri otvorenom dialógu). Odchod zo stránky celú obrazovku ukončí. Počas zobrazenia nastaví `data-theme="dark"` na `<html>`, aby boli tmavé aj dialógy a toasty (renderujú sa mimo `.stage`).
- Grid choice dlaždíc na hoste: ≤ 4 možnosti 2 stĺpce (2 × 2), 5–6 možností 3 stĺpce v dvoch riadkoch (na 16:9 sa tak zmestia lepšie ako 3 riadky).
- Pódium s menej ako 3 hráčmi odhaľuje iba obsadené miesta (od najnižšieho). Pri `prefers-reduced-motion` sa zobrazí naraz a bez konfiet.
- Hotspot značku na playerovi je po položení možné posúvať aj šípkami (fokus na značke), ťuk do letterboxu mimo obrázka sa ignoruje.
- `ResultBanner` pri `text` / `music` ukazuje pre každé pole vlastnú odpoveď s ✓ / ✗ a prvý uznávaný alias ako správnu odpoveď.
- `ResultBanner` pri `hotspot` ukazuje obrázok otázky so správnymi oblasťami a vlastným ťukom (`HotspotResult`), aby hráč videl, kde bolo správne miesto.
- `ResultBanner` pri `number` ukazuje vlastný tip a správne číslo. Čísla sa formátujú so slovenskou desatinnou čiarkou a medzerou po tisícoch od piatich cifier (`2026`, `12 450`), aby rok nevyzeral ako `2 026`.
- Avatar sa zobrazuje v lobby (`PlayerChip`), na čakacej obrazovke hráča, v leaderboarde, na pódiu a v tabuľke ďalších miest na konci hry (host aj player). V histórii výsledkov (`/host/results/:id`) nie je, neukladá sa do Postgresu.

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
| Rate limit | „Príliš veľa pokusov, skús to o chvíľu.“ |
| Server nedostupný (overenie PIN-u) | „Nepodarilo sa spojiť so serverom. Skontroluj pripojenie a skús to znova.“ |
| Obsadená prezývka | „Túto prezývku už niekto má, skús inú.“ |
| Odoslané | „Odpoveď odoslaná ✓“ |
| Neskoro | „Čas vypršal.“ |
| Výpadok spojenia | „Pripájam sa znova…“ |
| Vyhodený hráč | „Host ťa odstránil z hry.“ |
| Nesprávne heslo | „Nesprávne heslo.“ |
| Koniec | „Koniec hry! Skončil si {rank}. z {total}.“ |

## Responzivita

- **Landing:** pod 720 px sú karty pod sebou (Join prvá) s menším paddingom (`--s-4`), nad 720 px vedľa seba v gride 2 × 1 s max. šírkou 960 px. Stĺpce sú `minmax(0, 1fr)` a inputy `width: 100%`, aby PIN input (28 px mono) nerozšíril stránku na úzkom mobile (overené na 320 a 375 px).
- **Player:** mobile-first. Pri šírke aj výške ≥ 600 px je obsah max. 480 px na stred s `--surface` kartou (počas hry s výškou `min(100dvh − 2 × --s-7, --h-player-card-max)`). Telefón na šírku (výška < 600 px) ostáva bez karty a počas hry využije celú šírku. Používaj `100dvh` (adresný riadok na mobile) a `env(safe-area-inset-*)` (notch, home indicator).
- **Nič sa neposúva (host aj player počas hry):** obrazovka je presne `100dvh` (na playerovi mínus výška zobrazenej klávesnice z `visualViewport`), stĺpec flex/grid s `min-height: 0`. Médium sa zmenšuje (`object-fit: contain`). Na hoste si dlaždice delia zvyšnú výšku rovnomerne (riadky `1fr`), na playerovi majú choice odpovede prirodzenú výšku a pružný je obrázok (pozri nižšie). Dlhé texty sa zmenšujú krokmi podľa dĺžky (`components/choiceLayout.ts`: `textFit` → triedy `.fit-m` / `.fit-s` / `.fit-xs`, násobiče `--fit-m` .84 / `--fit-s` .7 / `--fit-xs` .58, na playerovi nie pod `--fs-player-min`), ako posledná možnosť sa orežú s „…“ (`.line-clamp`; dlaždice si počet riadkov, ktoré sa zmestia, zmerajú samy – `AnswerTile` s `fill`). Vlastný box sa smie posúvať iba pri dlhých zoznamoch: zoradenie na playerovi, čipy hráčov v lobby, tipy a skupiny odpovedí pri reveal, veľmi dlhý popis stránky. **Odoslať** je vždy viditeľné. Leaderboard má 10 rovnako vysokých riadkov (`--fs-host-row`).
- **Choice možnosti na playerovi** (`playerChoiceLayout`): odpovede majú prirodzenú výšku a sú dole nad **Odoslať** (zóna palca), nikdy sa nenaťahujú na celú obrazovku; voľnú výšku nad nimi zaberá obrázok otázky (bez obrázka ostane medzera pod otázkou).
  - **Zoznam** (predvolený, ak má niektorá možnosť viac ako 12 znakov): jeden riadok na možnosť, tvar + písmeno v pevnom stĺpci vľavo, text vpravo v tom istom riadku, zarovnaný vľavo a vertikálne na stred, `--fs-player-option`, max. 3 riadky. Riadky sú rovnako vysoké (podľa najvyššieho), jednoriadkový má cca `--h-player-tile`. Písmo sa zmenší až pri najdlhšej možnosti nad 70 znakov.
  - **Mriežka** iba pre krátke možnosti (všetky do 12 znakov: čísla, jedno slovo): 2 stĺpce, dlaždica vysoká `--h-player-grid-tile` (72–112 px), text väčší (`--fs-player-grid-option`) a na stred, tvar + písmeno ako malý odznak v ľavom hornom rohu. Nepárna posledná dlaždica ide cez oba stĺpce.
  - Na šírku (výška < 600 px): zoznam v 2 stĺpcoch, mriežka všetky možnosti v jednom riadku (5–6 v 3 stĺpcoch), obrázok otázky vľavo od odpovedí.
  - Keď sa ani tak nezmestia (dlhá otázka + 6 dlhých možností na malom mobile), blok odpovedí sa zmenší a dlaždice si samy orežú text na riadky, ktoré sa zmestia (`AnswerTile` s `fill`), **Odoslať** ostane viditeľné.
- **Host screen:** grid 2 × 2 (≤ 4 možnosti) alebo 2 × 3 (5–6). Pod 600 px šírky prepne na stĺpec. Funguje na 16:9 (1920 × 1080, 1366 × 768, 1280 × 720) v okne aj na celej obrazovke.
- **Koniec hry na hoste:** nad 900 px pódium vľavo a tabuľka ďalších miest vpravo (1–2 stĺpce), pod 900 px pod sebou.
- **Editor:** pod 1024 px sa pravý panel presunie pod editor a ľavý zoznam sa zbalí do rozbaľovacieho menu.
