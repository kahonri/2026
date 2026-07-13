import { describe, it, expect } from "vitest";
import { MakeTime, SiderealTime, e_tilt } from "astronomy-engine";
import { ascMc } from "../../src/lib/houses";

const DEG = Math.PI / 180;

/** 黄道上の点（β=0）→ 見かけの赤道座標（of date） */
function eclToEq(lonDeg: number, epsDeg: number): { ra: number; dec: number } {
  const l = lonDeg * DEG;
  const e = epsDeg * DEG;
  const ra = Math.atan2(Math.sin(l) * Math.cos(e), Math.cos(l)) / DEG;
  const dec = Math.asin(Math.sin(e) * Math.sin(l)) / DEG;
  return { ra: ((ra % 360) + 360) % 360, dec };
}

function altitudeOf(lonEcl: number, date: Date, latDeg: number, lonDegEast: number): { alt: number; sinH: number } {
  const time = MakeTime(date);
  const eps = e_tilt(time).tobl;
  const { ra, dec } = eclToEq(lonEcl, eps);
  const lst = (((SiderealTime(time) * 15 + lonDegEast) % 360) + 360) % 360;
  const H = (lst - ra) * DEG; // 時角
  const phi = latDeg * DEG;
  const d = dec * DEG;
  const alt = Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H)) / DEG;
  return { alt, sinH: Math.sin(H) };
}

const CASES = [
  { label: "東京 1985-07-21 21:15UTC", date: new Date("1985-07-21T21:15:00Z"), lat: 35.68, lon: 139.69 },
  { label: "札幌 2000-01-01 00:00UTC", date: new Date("2000-01-01T00:00:00Z"), lat: 43.06, lon: 141.35 },
  { label: "那覇 2024-08-08 08:08UTC", date: new Date("2024-08-08T08:08:00Z"), lat: 26.21, lon: 127.68 },
  { label: "高緯度 2016-02-29 15:00UTC", date: new Date("2016-02-29T15:00:00Z"), lat: 60.17, lon: 24.94 },
];

describe("ascMc self-consistency", () => {
  for (const c of CASES) {
    it(`${c.label}: ASCは東の地平線上（高度≈0・昇り側）`, () => {
      const { asc } = ascMc(c.date, c.lat, c.lon);
      const { alt, sinH } = altitudeOf(asc, c.date, c.lat, c.lon);
      expect(Math.abs(alt), "ASC altitude").toBeLessThan(0.02);
      // 東側（時角が -180〜0 → sin H < 0）で昇る点であること
      expect(sinH, "ASC rising in east").toBeLessThan(0);
    });

    it(`${c.label}: MCは子午線上（時角≈0）かつ南中側`, () => {
      const { mc } = ascMc(c.date, c.lat, c.lon);
      const time = MakeTime(c.date);
      const eps = e_tilt(time).tobl;
      const { ra } = eclToEq(mc, eps);
      const lst = (((SiderealTime(time) * 15 + c.lon) % 360) + 360) % 360;
      let dH = Math.abs(lst - ra) % 360;
      if (dH > 180) dH = 360 - dH;
      expect(dH, "MC hour angle").toBeLessThan(0.02);
    });
  }
});
