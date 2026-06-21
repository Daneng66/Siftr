import { describe, it, expect } from "vitest";
import { parseDuplicatesJson, parseImagesJson } from "./parser";

describe("parseDuplicatesJson", () => {
  it("parses the size-keyed dup compact JSON (real czkawka 9 shape)", () => {
    const json = JSON.stringify({
      "16144": [
        [
          { path: "/data/photos/original.jpg", size: 16144, hash: "abc" },
          { path: "/data/photos/original_copy1.jpg", size: 16144, hash: "abc" },
          { path: "/data/photos/original_copy2.jpg", size: 16144, hash: "abc" },
        ],
      ],
      "2048": [
        [
          { path: "/data/photos/a.png", size: 2048, hash: "def" },
          { path: "/data/photos/b.png", size: 2048, hash: "def" },
        ],
      ],
    });
    const groups = parseDuplicatesJson(json);
    expect(groups).toHaveLength(2);
    const paths = groups.map((g) => g.members.map((m) => m.path));
    expect(paths).toContainEqual([
      "/data/photos/original.jpg",
      "/data/photos/original_copy1.jpg",
      "/data/photos/original_copy2.jpg",
    ]);
    expect(paths).toContainEqual(["/data/photos/a.png", "/data/photos/b.png"]);
  });

  it("returns [] for empty output or no duplicates", () => {
    expect(parseDuplicatesJson("")).toEqual([]);
    expect(parseDuplicatesJson("{}")).toEqual([]);
    expect(parseDuplicatesJson("not json")).toEqual([]);
  });
});

describe("parseImagesJson", () => {
  it("parses the flat array image JSON and captures similarity", () => {
    const json = JSON.stringify([
      [
        { path: "/data/photos/x.jpg", similarity: "Original" },
        { path: "/data/photos/y.jpg", similarity: "VeryHigh" },
      ],
    ]);
    const groups = parseImagesJson(json);
    expect(groups).toHaveLength(1);
    expect(groups[0].members[0].path).toBe("/data/photos/x.jpg");
    expect(groups[0].members[1].similarity).toBe("VeryHigh");
  });

  it("ignores empty results and singletons", () => {
    expect(parseImagesJson("[]")).toEqual([]);
    expect(parseImagesJson(JSON.stringify([[{ path: "/only.jpg" }]]))).toEqual(
      []
    );
  });
});
