import { eclipticLon } from "./ephemeris";
import { ASPECTS } from "./pattern-id";
import type { Period } from "./transits";
import type { NatalChart, NatalPoint } from "./types";

/** attack=攻める日 / arrange=整える日 / rest=休む日 */
export type DayType = "attack" | "arrange" | "rest";

export interface DayCondition {
  /** JSTでの日付表示用 */
  month: number;
  day: number;
  weekday: number; // 0=日
  type: DayType;
  score: number;
}

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  attack: "攻める日",
  arrange: "整える日",
  rest: "休む日",
};

const JST_MS = 9 * 3600_000;
const HARMONY = new Set(["trine", "sextile"]);
const TENSION = new Set(["square", "opposition"]);
const TARGETS: NatalPoint[] = [
  "sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "asc", "mc",
];

function angularSep(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * 期間内の各日について、トランジットの月がネイタルに作るアスペクトから
 * 「攻める日／整える日／休む日」を判定する。
 * 調和が優勢な日=攻める、緊張が優勢な日=整える、拮抗・無風の日=休む。
 */
export function dailyConditions(chart: NatalChart, period: Period): DayCondition[] {
  const out: DayCondition[] = [];
  for (let t = period.start.getTime(); t < period.end.getTime(); t += 86400_000) {
    let harmony = 0;
    let tension = 0;
    let merge = 0;
    const counted = new Set<string>();
    for (const h of [0, 6, 12, 18]) {
      const moonLon = eclipticLon("moon", new Date(t + h * 3600_000));
      for (const np of TARGETS) {
        const pt = chart.points[np];
        if (!pt) continue;
        for (const a of ASPECTS) {
          const key = `${np}:${a.key}`;
          if (counted.has(key)) continue;
          if (Math.abs(angularSep(moonLon, pt.lon) - a.angle) > 4) continue;
          counted.add(key);
          if (HARMONY.has(a.key)) harmony++;
          else if (TENSION.has(a.key)) tension++;
          else merge++;
        }
      }
    }
    const score = harmony + merge * 0.5 - tension;
    const type: DayType = score >= 1 ? "attack" : score <= -1 ? "arrange" : "rest";
    const jst = new Date(t + JST_MS);
    out.push({
      month: jst.getUTCMonth() + 1,
      day: jst.getUTCDate(),
      weekday: jst.getUTCDay(),
      type, score,
    });
  }
  return out;
}

/** 月間表示用：タイプごとに代表日（スコア順で最大limit件、日付順に返す） */
export function pickDaysByType(days: DayCondition[], type: DayType, limit: number): DayCondition[] {
  const filtered = days.filter((d) => d.type === type);
  const ranked = [...filtered].sort((a, b) =>
    type === "arrange" ? a.score - b.score : b.score - a.score,
  ).slice(0, limit);
  return ranked.sort((a, b) => a.month * 100 + a.day - (b.month * 100 + b.day));
}
