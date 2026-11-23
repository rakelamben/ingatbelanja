import { describe, expect, it } from "vitest";
import { majorInputToMinor, minorToMajorInput } from "./money";

describe("currency minor-unit conversion", () => {
  it("parses decimal input using the selected currency precision", () => {
    expect(majorInputToMinor("12.50", 2)).toBe(1250);
    expect(majorInputToMinor("12500", 0)).toBe(12500);
    expect(majorInputToMinor("1.234", 2)).toBeNull();
  });

  it("formats stored minor values as user-facing amounts", () => {
    expect(minorToMajorInput(1250, 2)).toBe("12.50");
    expect(minorToMajorInput(12500, 0)).toBe("12500");
  });
});
