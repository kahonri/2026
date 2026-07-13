import { eclipticLon, isRetrograde } from "./ephemeris";
import { ascMc } from "./houses";
import { PLANETS, signOf, degInSign, type ChartPoint, type NatalChart } from "./types";

export interface BirthData {
  /** JSTでの出生年月日時 */
  year: number;
  month: number; // 1-12
  day: number;
  hour: number | null;   // null = 時刻不明
  minute: number | null;
  lat: number;
  lon: number;           // 東経+
  tzOffsetMinutes: number; // 日本は540
}

function toUtcDate(b: BirthData, hour: number, minute: number): Date {
  return new Date(Date.UTC(b.year, b.month - 1, b.day, hour, minute) - b.tzOffsetMinutes * 60_000);
}

function point(lon: number, retro?: boolean): ChartPoint {
  return { lon, sign: signOf(lon), degInSign: degInSign(lon), ...(retro !== undefined && { retro }) };
}

export function computeNatal(b: BirthData): NatalChart {
  const birthTimeKnown = b.hour !== null;
  const dt = toUtcDate(b, b.hour ?? 12, b.minute ?? 0);

  const chart: NatalChart = { points: {}, birthTimeKnown };

  for (const p of PLANETS) {
    chart.points[p] = point(eclipticLon(p, dt), isRetrograde(p, dt));
  }

  if (birthTimeKnown) {
    const { asc, mc } = ascMc(dt, b.lat, b.lon);
    chart.points.asc = point(asc);
    chart.points.mc = point(mc);
    chart.ascSign = signOf(asc);
  } else {
    // 正午計算では月は最大±7度ずれる。サイン境界に近ければ「不確か」扱い
    const moonDeg = chart.points.moon!.degInSign;
    chart.moonUncertain = moonDeg < 7 || moonDeg > 23;
  }

  return chart;
}
