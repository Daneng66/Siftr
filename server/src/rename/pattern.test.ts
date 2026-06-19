import { describe, it, expect } from "vitest";
import { applyPattern, sanitizeFilename, type RenameContext } from "./pattern";

const base: RenameContext = {
  originalName: "IMG_0001",
  currentName: "beach",
  dateTaken: "2023-07-04T15:30:45.000Z",
  cameraModel: "Pixel 7",
  index: 4,
  customText: "Holiday",
};

describe("applyPattern", () => {
  it("substitutes original and current name tokens", () => {
    expect(applyPattern("{original}", base)).toBe("IMG_0001");
    expect(applyPattern("{name}", base)).toBe("beach");
  });

  it("formats dates with default and custom formats", () => {
    const d = new Date(base.dateTaken!);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    expect(applyPattern("{date}", base)).toBe(`${y}${m}${day}`);
    expect(applyPattern("{date:YYYY-MM-DD}", base)).toBe(`${y}-${m}-${day}`);
  });

  it("handles missing dates gracefully", () => {
    expect(applyPattern("{date}", { ...base, dateTaken: null })).toBe(
      "unknown-date"
    );
  });

  it("produces 1-based, optionally padded sequence numbers", () => {
    expect(applyPattern("{seq}", base)).toBe("5");
    expect(applyPattern("{seq:3}", base)).toBe("005");
  });

  it("combines tokens and literal text", () => {
    expect(applyPattern("{custom}_{seq:2}", base)).toBe("Holiday_05");
    expect(applyPattern("{camera}-{seq}", base)).toBe("Pixel 7-5");
  });

  it("sanitizes illegal filename characters", () => {
    expect(sanitizeFilename('a/b:c*d?"e')).toBe("a_b_c_d__e");
  });
});
