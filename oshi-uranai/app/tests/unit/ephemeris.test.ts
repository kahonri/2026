import { describe, it, expect } from "vitest";
import { eclipticLon } from "../../src/lib/ephemeris";
import { PLANETS } from "../../src/lib/types";
import golden from "../golden/golden-positions.json";

function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe("eclipticLon vs Skyfield golden (fetch_astro.py)", () => {
  for (const entry of golden) {
    it(entry.utc, () => {
      const date = new Date(entry.utc);
      for (const p of PLANETS) {
        const expected = (entry.positions as Record<string, number>)[p];
        const actual = eclipticLon(p, date);
        expect(angDiff(actual, expected), `${p} @ ${entry.utc}`).toBeLessThan(0.01);
      }
    });
  }
});
