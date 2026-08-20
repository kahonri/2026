import { describe, it, expect } from "vitest";
import {
  lastAspectBefore, planetAspects, scanMoonIngresses,
  scanMoonPhases, scanRetroChanges, type MundaneAspect,
} from "../../src/lib/mundane";
import golden from "../golden/golden-events.json";

const DAY = 86400_000;
const HOUR = 3600_000;

/** エンジン差（黄経0.01°未満）による時刻ずれの許容幅：月の移動速度換算で±2分程度 → 5分 */
const TIME_TOL_MIN = 5;

function minutesApart(a: Date, isoUtc: string): number {
  return Math.abs(a.getTime() - new Date(isoUtc).getTime()) / 60_000;
}

function aspectKey(x: { a: string; b: string; angle: number }): string {
  return `${x.a}-${x.b}:${x.angle}`;
}

for (const week of golden.weeks) {
  describe(`${week.week} vs fetch_astro.py golden`, () => {
    const start = new Date(week.start_utc);
    const end = new Date(week.end_utc);

    it("moon ingresses & void-of-course", () => {
      // fetch_astro.main と同じく前後に余裕を持って走査し週内に絞る
      const all = scanMoonIngresses(
        new Date(start.getTime() - 3 * DAY),
        new Date(end.getTime() + DAY),
      );
      const inWeek = all.filter(
        (x) => x.date.getTime() >= start.getTime() && x.date.getTime() < end.getTime(),
      );
      expect(inWeek.length).toBe(week.ingresses.length);

      inWeek.forEach((ing, i) => {
        const g = week.ingresses[i];
        expect(ing.sign, `sign @ ${g.utc}`).toBe(g.sign);
        expect(minutesApart(ing.date, g.utc), `ingress @ ${g.utc}`).toBeLessThan(TIME_TOL_MIN);

        const idx = all.indexOf(ing);
        const prev = idx > 0 ? all[idx - 1].date : new Date(ing.date.getTime() - 3 * DAY);
        const voc = lastAspectBefore(ing.date, prev);
        if (g.voc_start_utc) {
          expect(voc, `voc @ ${g.utc}`).not.toBeNull();
          expect(minutesApart(voc!, g.voc_start_utc), `voc @ ${g.utc}`).toBeLessThan(TIME_TOL_MIN);
        } else {
          expect(voc).toBeNull();
        }
      });
    });

    it("moon phases", () => {
      const phases = scanMoonPhases(start, end);
      expect(phases.map((p) => p.angle)).toEqual(week.phases.map((p) => p.angle));
      phases.forEach((p, i) => {
        expect(minutesApart(p.date, week.phases[i].utc), `phase ${p.angle}`).toBeLessThan(TIME_TOL_MIN);
      });
    });

    it("retro changes", () => {
      const changes = scanRetroChanges(start, end);
      expect(changes.map((r) => `${r.planet}:${r.startsRetro}`).sort())
        .toEqual(week.retro_changes.map((r) => `${r.planet}:${r.startsRetro}`).sort());
      // 6時間グリッド検出なので、ステーション付近のエンジン差はグリッド1コマ以内で許容
      for (const g of week.retro_changes) {
        const m = changes.find((r) => r.planet === g.planet && r.startsRetro === g.startsRetro)!;
        expect(Math.abs(m.date.getTime() - new Date(g.utc).getTime()), `retro ${g.planet}`)
          .toBeLessThanOrEqual(6 * HOUR);
      }
    });

    it("planet aspects (week start / end)", () => {
      const cases: Array<[Date, typeof week.aspects_start]> = [
        [start, week.aspects_start],
        [end, week.aspects_end],
      ];
      for (const [dt, gold] of cases) {
        const detected = planetAspects(dt);
        const orbByKey = new Map(detected.map((x: MundaneAspect) => [aspectKey(x), x.orb]));
        for (const g of gold) {
          // オーブ6°境界すれすれ（>5.9）はエンジン差で検出が割れうるため除外
          if (g.orb > 5.9) continue;
          expect(orbByKey.has(aspectKey(g)), `${aspectKey(g)} @ ${dt.toISOString()}`).toBe(true);
          expect(Math.abs(orbByKey.get(aspectKey(g))! - g.orb), aspectKey(g)).toBeLessThan(0.05);
        }
        // TS側だけが検出したアスペクトは境界すれすれのみ許容
        const goldKeys = new Set(gold.map(aspectKey));
        for (const x of detected) {
          if (!goldKeys.has(aspectKey(x))) {
            expect(x.orb, `TS-only ${aspectKey(x)} @ ${dt.toISOString()}`).toBeGreaterThan(5.9);
          }
        }
      }
    });
  });
}
