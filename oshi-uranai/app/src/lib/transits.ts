import { MakeTime, SearchMoonPhase } from "astronomy-engine";
import { eclipticLon } from "./ephemeris";
import {
  ASPECTS, aspectPatternId, housePatternId, lunationPatternId,
  isSkippedAspectPattern, type AspectKey, type Category,
} from "./pattern-id";
import { houseOf, type NatalChart, type NatalPoint, type Planet } from "./types";

export interface Period {
  start: Date;
  end: Date;
  label: string;
}

export interface TransitEvent {
  category: Category;
  patternId: string;
  transit?: Planet;
  natal?: NatalPoint;
  aspect?: AspectKey;
  house?: number;
  phase?: "new" | "full";
  minOrb?: number;
  exact: boolean;
  applying: boolean;
  peakDate?: Date;
}

const JST_MS = 9 * 3600_000;

/** refDateを含むISO週（月曜0:00〜翌月曜0:00 JST） */
export function weekPeriod(refDate: Date): Period {
  const jst = new Date(refDate.getTime() + JST_MS);
  const dow = (jst.getUTCDay() + 6) % 7; // 月=0
  const monday = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - dow) - JST_MS;
  const start = new Date(monday);
  const end = new Date(monday + 7 * 86400_000);
  const s = new Date(monday + JST_MS);
  const e = new Date(monday + 6 * 86400_000 + JST_MS);
  return {
    start, end,
    label: `${s.getUTCMonth() + 1}/${s.getUTCDate()}〜${e.getUTCMonth() + 1}/${e.getUTCDate()}`,
  };
}

/** refDateを含む月（1日0:00〜翌月1日0:00 JST） */
export function monthPeriod(refDate: Date): Period {
  const jst = new Date(refDate.getTime() + JST_MS);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1) - JST_MS),
    end: new Date(Date.UTC(y, m + 1, 1) - JST_MS),
    label: `${y}年${m + 1}月`,
  };
}

function angularSep(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

interface AspectScanConfig {
  category: "W-ASP" | "M-ASP" | "M-OUT";
  transits: Planet[];
  aspects: readonly AspectKey[];
  maxOrb: number;
  stepHours: number;
}

const NATAL_TARGETS: NatalPoint[] = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto", "asc", "mc",
];

function scanAspects(chart: NatalChart, period: Period, cfg: AspectScanConfig): TransitEvent[] {
  const events: TransitEvent[] = [];
  const stepMs = cfg.stepHours * 3600_000;
  const samples: Date[] = [];
  for (let t = period.start.getTime(); t <= period.end.getTime(); t += stepMs) {
    samples.push(new Date(t));
  }

  for (const tp of cfg.transits) {
    const lons = samples.map((d) => eclipticLon(tp, d));
    for (const np of NATAL_TARGETS) {
      const natalPoint = chart.points[np];
      if (!natalPoint) continue;
      if (isSkippedAspectPattern(tp, np)) continue;

      for (const aspectDef of ASPECTS) {
        if (!cfg.aspects.includes(aspectDef.key)) continue;
        const orbs = lons.map((l) => angularSep(l, natalPoint.lon) - aspectDef.angle);
        const absOrbs = orbs.map(Math.abs);
        let minIdx = 0;
        for (let i = 1; i < absOrbs.length; i++) if (absOrbs[i] < absOrbs[minIdx]) minIdx = i;
        const minOrb = absOrbs[minIdx];
        if (minOrb > cfg.maxOrb) continue;

        // exact: 期間内に符号が反転する（=正確なアスペクト成立）
        let exact = false;
        for (let i = 1; i < orbs.length; i++) {
          if (Math.sign(orbs[i]) !== Math.sign(orbs[i - 1])) { exact = true; break; }
        }
        const applying = absOrbs[absOrbs.length - 1] < absOrbs[0];

        events.push({
          category: cfg.category,
          patternId: aspectPatternId(cfg.category, tp, np, aspectDef.key),
          transit: tp, natal: np, aspect: aspectDef.key,
          minOrb, exact, applying, peakDate: samples[minIdx],
        });
      }
    }
  }
  return events;
}

function scanLunations(chart: NatalChart, period: Period): TransitEvent[] {
  if (!chart.birthTimeKnown || chart.ascSign === undefined) return [];
  const events: TransitEvent[] = [];
  const limitDays = (period.end.getTime() - period.start.getTime()) / 86400_000 + 0.1;
  for (const [angle, phase] of [[0, "new"], [180, "full"]] as const) {
    const found = SearchMoonPhase(angle, MakeTime(period.start), limitDays);
    if (!found) continue;
    if (found.date.getTime() >= period.end.getTime()) continue;
    const moonLon = eclipticLon("moon", found.date);
    const house = houseOf(moonLon, chart.ascSign);
    events.push({
      category: "W-LUN",
      patternId: lunationPatternId(phase, house),
      phase, house, exact: true, applying: false, peakDate: found.date,
    });
  }
  return events;
}

function scanHouseTransits(chart: NatalChart, period: Period): TransitEvent[] {
  if (!chart.birthTimeKnown || chart.ascSign === undefined) return [];
  const mid = new Date((period.start.getTime() + period.end.getTime()) / 2);
  const events: TransitEvent[] = [];
  for (const tp of ["jupiter", "saturn"] as const) {
    const house = houseOf(eclipticLon(tp, mid), chart.ascSign);
    events.push({
      category: "M-HSE", patternId: housePatternId("M-HSE", tp, house),
      transit: tp, house, exact: false, applying: false,
    });
  }
  const sunHouse = houseOf(eclipticLon("sun", mid), chart.ascSign);
  events.push({
    category: "M-SUN", patternId: housePatternId("M-SUN", "sun", sunHouse),
    transit: "sun", house: sunHouse, exact: false, applying: false,
  });
  return events;
}

const ALL_ASPECT_KEYS = ASPECTS.map((a) => a.key);

export function weeklyTransits(chart: NatalChart, refDate: Date): { period: Period; events: TransitEvent[] } {
  const period = weekPeriod(refDate);
  const events = [
    ...scanAspects(chart, period, {
      category: "W-ASP",
      transits: ["sun", "mercury", "venus", "mars"],
      aspects: ALL_ASPECT_KEYS, maxOrb: 6, stepHours: 6,
    }),
    ...scanLunations(chart, period),
  ];
  return { period, events };
}

export function monthlyTransits(chart: NatalChart, refDate: Date): { period: Period; events: TransitEvent[] } {
  const period = monthPeriod(refDate);
  const events = [
    ...scanAspects(chart, period, {
      category: "M-ASP",
      transits: ["jupiter", "saturn"],
      aspects: ALL_ASPECT_KEYS, maxOrb: 6, stepHours: 12,
    }),
    ...scanAspects(chart, period, {
      category: "M-OUT",
      transits: ["uranus", "neptune", "pluto"],
      aspects: ["conjunction", "square", "opposition"], maxOrb: 3, stepHours: 12,
    }),
    ...scanHouseTransits(chart, period),
  ];
  return { period, events };
}
