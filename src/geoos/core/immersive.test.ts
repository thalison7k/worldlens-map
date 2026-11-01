import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { shouldEnterImmersive, shouldExitImmersive } from "./immersive";

describe("locality immersive transitions", () => {
  test("enters only at close zoom", () => {
    assert.equal(shouldEnterImmersive(16, false, false), true);
    assert.equal(shouldEnterImmersive(15, false, false), false);
  });
  test("never enters in timeline globe or after dismissal", () => {
    assert.equal(shouldEnterImmersive(18, true, false), false);
    assert.equal(shouldEnterImmersive(18, false, true), false);
  });
  test("exits when zooming out without boundary flicker", () => {
    assert.equal(shouldExitImmersive(13), true);
    assert.equal(shouldExitImmersive(14), false);
  });
});