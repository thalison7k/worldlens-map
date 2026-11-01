import { describe, expect, test } from "bun:test";
import { shouldEnterImmersive, shouldExitImmersive } from "./immersive";

describe("locality immersive transitions", () => {
  test("enters only at close zoom", () => {
    expect(shouldEnterImmersive(16, false, false)).toBe(true);
    expect(shouldEnterImmersive(15, false, false)).toBe(false);
  });
  test("never enters in timeline globe or after dismissal", () => {
    expect(shouldEnterImmersive(18, true, false)).toBe(false);
    expect(shouldEnterImmersive(18, false, true)).toBe(false);
  });
  test("exits when zooming out without boundary flicker", () => {
    expect(shouldExitImmersive(13)).toBe(true);
    expect(shouldExitImmersive(14)).toBe(false);
  });
});