import { describe, it, expect } from "vitest";
import { parseCzkawkaGroups } from "./parser";

describe("parseCzkawkaGroups", () => {
  it("parses duplicate-style groups (bare paths)", () => {
    const text = [
      "-------------------------------------------------Files with same hashes",
      "Found 4 duplicated files in 2 groups",
      "",
      "---- Size 1024 (1024) - 2 files",
      "/data/photos/a.jpg",
      "/data/photos/b.jpg",
      "",
      "---- Size 2048 (2048) - 2 files",
      "/data/photos/c.jpg",
      "/data/photos/d.jpg",
      "",
    ].join("\n");
    const groups = parseCzkawkaGroups(text);
    expect(groups).toHaveLength(2);
    expect(groups[0].members.map((m) => m.path)).toEqual([
      "/data/photos/a.jpg",
      "/data/photos/b.jpg",
    ]);
  });

  it("parses similar-image groups and captures similarity", () => {
    const text = [
      "-------------------------------------------------Similar pictures",
      "Found 3 images which have similar friends",
      "",
      "/data/photos/x.jpg - 1920x1080 - 500.00 KiB - Original",
      "/data/photos/y.jpg - 1920x1080 - 480.00 KiB - Very High",
      "",
    ].join("\n");
    const groups = parseCzkawkaGroups(text);
    expect(groups).toHaveLength(1);
    expect(groups[0].members[0].path).toBe("/data/photos/x.jpg");
    expect(groups[0].members[1].similarity).toBe("Very High");
  });

  it("ignores singleton and empty results", () => {
    expect(parseCzkawkaGroups("")).toEqual([]);
    expect(parseCzkawkaGroups("/data/photos/only.jpg\n")).toEqual([]);
  });

  it("handles Windows drive paths", () => {
    const text = "C:\\photos\\a.jpg\nC:\\photos\\b.jpg\n";
    const groups = parseCzkawkaGroups(text);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });
});
