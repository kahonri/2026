import { Body, GeoVector, Ecliptic, MakeTime } from "astronomy-engine";
import type { Planet } from "./types";

const BODY_MAP: Record<Planet, Body> = {
  sun: Body.Sun, moon: Body.Moon, mercury: Body.Mercury, venus: Body.Venus,
  mars: Body.Mars, jupiter: Body.Jupiter, saturn: Body.Saturn,
  uranus: Body.Uranus, neptune: Body.Neptune, pluto: Body.Pluto,
};

/** 地心・見かけ・瞬時の黄道（of date）基準の黄経（度）。fetch_astro.py の lon() と同定義 */
export function eclipticLon(planet: Planet, date: Date): number {
  const time = MakeTime(date);
  const vec = GeoVector(BODY_MAP[planet], time, true);
  const ecl = Ecliptic(vec);
  return ((ecl.elon % 360) + 360) % 360;
}

/** 逆行判定: +1時間後との黄経差の符号（fetch_astro.py と同方式） */
export function isRetrograde(planet: Planet, date: Date): boolean {
  if (planet === "sun" || planet === "moon") return false;
  const l1 = eclipticLon(planet, date);
  const l2 = eclipticLon(planet, new Date(date.getTime() + 3600_000));
  let diff = l2 - l1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}
