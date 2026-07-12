import { describe, it, expect } from "vitest";
import { applyPathPattern, joinRelDir } from "./pathPattern";
import type { RenameContext } from "../rename/pattern";

const base: RenameContext = {
  originalName: "IMG_0001",
  currentName: "beach",
  dateTaken: "2023-07-04T15:30:45.000Z",
  cameraModel: "Pixel 7",
  index: 4,
  customText: "Holiday",
};

describe("applyPathPattern", () => {
  it("splits a pattern into folder segments and a base filename", () => {
    const r = applyPathPattern("{date:YYYY}/{date:MM}/{date:DD}/{original}", base);
    expect(r.dirSegments).toEqual(["2023", "07", "04"]);
    expect(r.base).toBe("IMG_0001");
  });

  it("resolves month name tokens", () => {
    const r = applyPathPattern("{date:YYYY}/{date:MMMM}/{original}", base);
    expect(r.dirSegments).toEqual(["2023", "July"]);
  });

  it("drops empty segments from stray slashes", () => {
    const r = applyPathPattern("{date:YYYY}//{original}", base);
    expect(r.dirSegments).toEqual(["2023"]);
    expect(r.base).toBe("IMG_0001");
  });

  it("resolves to just a base name when the pattern has no slashes", () => {
    const r = applyPathPattern("{original}", base);
    expect(r.dirSegments).toEqual([]);
    expect(r.base).toBe("IMG_0001");
  });

  it("returns an empty base when every segment is empty", () => {
    const r = applyPathPattern("//", base);
    expect(r.dirSegments).toEqual([]);
    expect(r.base).toBe("");
  });
});

describe("joinRelDir", () => {
  it("joins non-empty parts with a single slash", () => {
    expect(joinRelDir("a", "b", "c")).toBe("a/b/c");
  });

  it("skips empty parts", () => {
    expect(joinRelDir("", "b", "")).toBe("b");
    expect(joinRelDir()).toBe("");
  });

  it("flattens parts that already contain slashes", () => {
    expect(joinRelDir("a/b", "c")).toBe("a/b/c");
  });
});
