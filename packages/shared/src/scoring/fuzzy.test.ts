import { describe, expect, it } from "vitest";
import { isMatch, levenshtein, maxDistance, THRESHOLDS } from "./fuzzy.js";

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
    expect(levenshtein("metallica", "metalika")).toBe(2);
    expect(levenshtein("metallica", "metalica")).toBe(1);
  });

  it("works on code points, not UTF-16 units", () => {
    expect(levenshtein("a😀b", "ab")).toBe(1);
  });
});

describe("maxDistance", () => {
  it("follows the threshold table", () => {
    expect(THRESHOLDS).toEqual({ strict: [0, 0, 1], normal: [0, 1, 2], loose: [1, 2, 3] });
    expect(maxDistance(4, "strict")).toBe(0);
    expect(maxDistance(4, "normal")).toBe(0);
    expect(maxDistance(4, "loose")).toBe(1);
    expect(maxDistance(5, "strict")).toBe(0);
    expect(maxDistance(5, "normal")).toBe(1);
    expect(maxDistance(8, "loose")).toBe(2);
    expect(maxDistance(9, "strict")).toBe(1);
    expect(maxDistance(9, "normal")).toBe(2);
    expect(maxDistance(9, "loose")).toBe(3);
  });
});

describe("isMatch", () => {
  describe('LOGIC.md examples for accepted = ["Metallica"], tolerance normal', () => {
    const accepted = ["Metallica"];
    it.each(["metallica", "METALLICA", "Metalica", "Metallika", "Metalika"])("accepts %s", (input) => {
      expect(isMatch(input, accepted, "normal")).toBe(true);
    });
    it("rejects Megadeth", () => {
      expect(isMatch("Megadeth", accepted, "normal")).toBe(false);
    });
  });

  it("defaults to normal tolerance", () => {
    expect(isMatch("Metalika", ["Metallica"])).toBe(true);
  });

  it("is stricter with strict tolerance", () => {
    expect(isMatch("Metalica", ["Metallica"], "strict")).toBe(true);
    expect(isMatch("Metalika", ["Metallica"], "strict")).toBe(false);
  });

  it("is more lenient with loose tolerance", () => {
    expect(isMatch("Metlika", ["Metallica"], "loose")).toBe(true);
    expect(isMatch("Metlika", ["Metallica"], "normal")).toBe(false);
  });

  it("matches The Beatles vs Beatles in both directions", () => {
    expect(isMatch("Beatles", ["The Beatles"])).toBe(true);
    expect(isMatch("the beatles", ["Beatles"])).toBe(true);
    expect(isMatch("  The Beatles ", ["Beatles"])).toBe(true);
  });

  it("ignores feat. and bracketed suffixes", () => {
    expect(isMatch("Despacito", ["Despacito (feat. Justin Bieber)"])).toBe(true);
    expect(isMatch("Luis Fonsi feat. Daddy Yankee", ["Luis Fonsi"])).toBe(true);
    expect(isMatch("Hey Jude", ["Hey Jude (Remastered 2015)"])).toBe(true);
  });

  it("ignores diacritics and case", () => {
    expect(isMatch("strbske pleso", ["Štrbské Pleso"])).toBe(true);
    expect(isMatch("GERLACHOVSKY STIT", ["Gerlachovský štít"])).toBe(true);
    expect(isMatch("Gerlachovský štít", ["gerlachovsky stit"])).toBe(true);
  });

  it("treats & and and the same", () => {
    expect(isMatch("Simon and Garfunkel", ["Simon & Garfunkel"])).toBe(true);
  });

  it("supports aliases", () => {
    const accepted = ["Bratislava", "BA", "Pressburg"];
    expect(isMatch("bratislava", accepted)).toBe(true);
    expect(isMatch("ba", accepted)).toBe(true);
    expect(isMatch("Presburg", accepted)).toBe(true);
    expect(isMatch("Pozsony", accepted)).toBe(false);
  });

  it("never matches empty input", () => {
    expect(isMatch("", ["Metallica"])).toBe(false);
    expect(isMatch("   ", ["Metallica"])).toBe(false);
    expect(isMatch("?!", ["Metallica"], "loose")).toBe(false);
    expect(isMatch("", [""], "loose")).toBe(false);
  });

  it("requires exact match for very short answers except with loose", () => {
    expect(isMatch("U2", ["U2"], "strict")).toBe(true);
    expect(isMatch("U3", ["U2"], "strict")).toBe(false);
    expect(isMatch("U3", ["U2"], "normal")).toBe(false);
    expect(isMatch("U3", ["U2"], "loose")).toBe(true);
    expect(isMatch("ABBA", ["Abba"], "normal")).toBe(true);
    expect(isMatch("ABBO", ["Abba"], "normal")).toBe(false);
  });

  it("ignores aliases that normalize to an empty string", () => {
    expect(isMatch("a", ["(intro)"], "loose")).toBe(false);
  });

  it("returns false for no aliases", () => {
    expect(isMatch("anything", [])).toBe(false);
  });
});
