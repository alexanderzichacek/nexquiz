import { describe, expect, it } from "vitest";
import { normalize } from "./normalize.js";

describe("normalize", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalize("Štrbské Pleso")).toBe("strbske pleso");
    expect(normalize("ĽUBOŠ Ťažký")).toBe("lubos tazky");
  });

  it("replaces & with and", () => {
    expect(normalize("Simon & Garfunkel")).toBe("simon and garfunkel");
    expect(normalize("Simon&Garfunkel")).toBe("simon and garfunkel");
  });

  it("removes bracketed content", () => {
    expect(normalize("Hey Jude (Remastered 2015)")).toBe("hey jude");
    expect(normalize("Song [Live]")).toBe("song");
  });

  it("removes everything from feat. / ft.", () => {
    expect(normalize("Luis Fonsi feat. Daddy Yankee")).toBe("luis fonsi");
    expect(normalize("Song ft. Somebody")).toBe("song");
    expect(normalize("Song feat Somebody")).toBe("song");
    expect(normalize("Despacito (feat. Justin Bieber)")).toBe("despacito");
  });

  it("does not treat words containing ft as featuring", () => {
    expect(normalize("Daft Punk")).toBe("daft punk");
    expect(normalize("Left Behind")).toBe("left behind");
  });

  it("removes the leading article the", () => {
    expect(normalize("The Beatles")).toBe("beatles");
    expect(normalize("  The   Beatles  ")).toBe("beatles");
    expect(normalize("(Live) The Beatles")).toBe("beatles");
    expect(normalize("Theatre")).toBe("theatre");
    expect(normalize("The")).toBe("the");
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalize("  AC/DC!!  ")).toBe("acdc");
    expect(normalize("Guns N' Roses")).toBe("guns n roses");
    expect(normalize("a \t\n b")).toBe("a b");
  });

  it("returns an empty string for empty or punctuation-only input", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
    expect(normalize("?!.")).toBe("");
    expect(normalize("(Remastered)")).toBe("");
  });
});
