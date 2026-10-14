import { describe, expect, it } from "vitest";
import {
  HOST_PROMPT_FIT,
  charCount,
  hostChoiceColumns,
  hostOptionFit,
  hostOrderColumns,
  hostOrderFit,
  longestText,
  playerChoiceLayout,
  playerOrderFit,
  smallerFit,
  textFit,
} from "./choiceLayout";

const opts = (...texts: string[]): { text: string }[] => texts.map((text) => ({ text }));
const ofLength = (n: number): string => "x".repeat(n);

describe("text fit", () => {
  it("counts code points, not UTF-16 units", () => {
    expect(charCount("Štrbské pleso")).toBe(13);
    expect(charCount("🎵🎵")).toBe(2);
    expect(longestText(opts("a", "abcd", "ab"))).toBe(4);
    expect(longestText([])).toBe(0);
  });

  it("steps down with the length, bounds inclusive", () => {
    expect(textFit(60, HOST_PROMPT_FIT)).toBe("l");
    expect(textFit(61, HOST_PROMPT_FIT)).toBe("m");
    expect(textFit(120, HOST_PROMPT_FIT)).toBe("m");
    expect(textFit(200, HOST_PROMPT_FIT)).toBe("s");
    // the longest allowed prompt (300 characters) motivated the xs step
    expect(textFit(300, HOST_PROMPT_FIT)).toBe("xs");
  });

  it("makes a step smaller, xs stays xs", () => {
    expect(smallerFit("l")).toBe("m");
    expect(smallerFit("s")).toBe("xs");
    expect(smallerFit("xs")).toBe("xs");
  });
});

describe("host layout", () => {
  it("keeps 2 × 2 for ≤ 4 options and 3 columns for 5–6", () => {
    expect(hostChoiceColumns(2)).toBe(2);
    expect(hostChoiceColumns(4)).toBe(2);
    expect(hostChoiceColumns(5)).toBe(3);
  });

  it("scales long options down, earlier with three columns", () => {
    expect(hostOptionFit(opts("Sydney", "Canberra"))).toBe("l");
    expect(hostOptionFit(opts(ofLength(120), "B"))).toBe("xs");
    // 25 characters fit a 2-column tile, but not a 3-column one
    expect(hostOptionFit(opts(ofLength(25), "B", "C", "D"))).toBe("l");
    expect(hostOptionFit(opts(ofLength(25), "B", "C", "D", "E"))).toBe("m");
  });

  it("puts more than 4 order items into two smaller columns", () => {
    expect(hostOrderColumns(4)).toBe(1);
    expect(hostOrderColumns(5)).toBe(2);
    expect(hostOrderFit(opts("a", "b", "c"))).toBe("l");
    expect(hostOrderFit(opts("a", "b", "c", "d", "e"))).toBe("m");
  });
});

describe("player choice layout", () => {
  it("puts only short options (numbers, single words) into a 2-column grid", () => {
    // real quiz: Q2 – numbers
    expect(playerChoiceLayout(opts("24", "25", "26", "27"))).toEqual({ mode: "grid", columns: 2, fit: "l" });
    expect(playerChoiceLayout(opts("Áno", "Nie"))).toEqual({ mode: "grid", columns: 2, fit: "l" });
    expect(playerChoiceLayout(opts(ofLength(12), "B", "C"))).toEqual({ mode: "grid", columns: 2, fit: "m" });
    expect(playerChoiceLayout(opts("A", "B", "C", "D", "E", "F")).columns).toBe(2);
  });

  it("uses a list (one row per option) as soon as an option is longer than 12 characters", () => {
    // huge grid tiles with small text motivated the list – real quiz Q1, Q5, Q7
    expect(
      playerChoiceLayout(
        opts("Hlas e-commerce komunity", "E-commerce osobnosť roka", "E-commerce objav roka", "Žena slovenského e-commerce"),
      ),
    ).toEqual({ mode: "list", columns: 1, fit: "l" });
    expect(playerChoiceLayout(opts("Lukostreľba", "Cyklistika", "Športová streľba", "Krasokorčuľovanie")).mode).toBe("list");
    expect(playerChoiceLayout(opts("Škrečka", "Rybyčku", "Morské prasiatko", "Papagája")).mode).toBe("list");
    expect(playerChoiceLayout(opts(ofLength(13), "B")).mode).toBe("list");
  });

  it("keeps the full text size in list rows up to 70 characters, then scales down", () => {
    // real quiz Q4: the longest option has 68 characters
    expect(
      playerChoiceLayout(
        opts(
          "Je ľaváčka",
          "Ma zdeformovaný prst na pravej ruke a nechce aby si to ľudia všimli",
          "Nemá to dôvod",
          "Na pravej ruke si nestrihá nechty a zavadzali by jej",
        ),
      ),
    ).toEqual({ mode: "list", columns: 1, fit: "l" });
    expect(playerChoiceLayout(opts(ofLength(90), "B")).fit).toBe("m");
    expect(playerChoiceLayout(opts(ofLength(120), "B")).fit).toBe("s");
  });

  it("uses wider layouts on a landscape phone", () => {
    expect(playerChoiceLayout(opts("24", "25", "26", "27"), true)).toEqual({ mode: "grid", columns: 4, fit: "l" });
    expect(playerChoiceLayout(opts("A", "B"), true).columns).toBe(2);
    expect(playerChoiceLayout(opts("A", "B", "C", "D", "E", "F"), true).columns).toBe(3);
    expect(playerChoiceLayout(opts(ofLength(40), "B", "C"), true)).toEqual({ mode: "list", columns: 2, fit: "m" });
  });

  it("scales order items down for long texts and many items", () => {
    expect(playerOrderFit(opts("Rím", "Paríž", "Londýn"))).toBe("l");
    expect(playerOrderFit(opts(ofLength(50), "b", "c"))).toBe("s");
    expect(playerOrderFit(opts("a", "b", "c", "d", "e", "f"))).toBe("m");
  });
});
