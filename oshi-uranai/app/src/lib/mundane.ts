import { MakeTime, SearchMoonPhase } from "astronomy-engine";
import { eclipticLon, isRetrograde } from "./ephemeris";
import { PLANETS, signOf, type Planet } from "./types";

/**
 * 世運（マンデーン）系の計算。fetch_astro.py と同一のアルゴリズム・定数で、
 * golden-events.json（Skyfield生成）との突合テストで一致を保証する。
 * 現状アプリのUIでは未使用（全体運が必要になったときにそのまま使う）。
 */

export const MUNDANE_ASPECT_ANGLES = [0, 60, 90, 120, 180] as const;
export const MUNDANE_ASPECT_ORB = 6.0;

const MIN_MS = 60_000;
const HOUR_MS = 3600_000;
const NON_MOON: Planet[] = PLANETS.filter((p) => p !== "moon");

function wrap180(x: number): number {
  return ((((x + 180) % 360) + 360) % 360) - 180;
}

function separation(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** f(lo)とf(hi)の符号が異なる前提で、f=0 の時刻を二分探索（fetch_astro.py の bisect_time と同方式） */
function bisectTime(f: (d: Date) => number, lo: Date, hi: Date, tolSec = 30): Date {
  let loT = lo.getTime();
  let hiT = hi.getTime();
  let flo = f(lo);
  while (hiT - loT > tolSec * 1000) {
    const midT = loT + (hiT - loT) / 2;
    const fm = f(new Date(midT));
    if (flo < 0 === fm < 0) {
      loT = midT;
      flo = fm;
    } else {
      hiT = midT;
    }
  }
  return new Date(loT + (hiT - loT) / 2);
}

export interface MoonIngress {
  date: Date;
  sign: number; // 入った先のサイン（0=牡羊座）
}

/** [start, end] 内の月の星座入り時刻（30分グリッド＋二分探索） */
export function scanMoonIngresses(startUtc: Date, endUtc: Date): MoonIngress[] {
  const step = 30 * MIN_MS;
  const out: MoonIngress[] = [];
  const endT = endUtc.getTime();
  let t = startUtc.getTime();
  let prevSign = signOf(eclipticLon("moon", startUtc));
  while (t < endT) {
    const t2 = Math.min(t + step, endT);
    const s2 = signOf(eclipticLon("moon", new Date(t2)));
    if (s2 !== prevSign) {
      const boundary = ((prevSign + 1) % 12) * 30;
      const exact = bisectTime(
        (d) => wrap180(eclipticLon("moon", d) - boundary),
        new Date(t), new Date(t2),
      );
      out.push({ date: exact, sign: s2 });
      prevSign = s2;
    }
    t = t2;
  }
  return out;
}

/** 月が現在のサイン滞在中に成立した最後の正確なメジャーアスペクト時刻（=ボイド開始） */
export function lastAspectBefore(ingress: Date, prevIngress: Date): Date | null {
  const step = 30 * MIN_MS;
  const endT = ingress.getTime();
  let latest: Date | null = null;
  let t = prevIngress.getTime();
  const moonLon0 = eclipticLon("moon", prevIngress);
  const prevSep = new Map<Planet, number>(
    NON_MOON.map((k) => [k, separation(moonLon0, eclipticLon(k, prevIngress))]),
  );
  while (t < endT) {
    const t2 = Math.min(t + step, endT);
    const d2 = new Date(t2);
    const moonLon = eclipticLon("moon", d2);
    for (const k of NON_MOON) {
      const cur = separation(moonLon, eclipticLon(k, d2));
      for (const angle of MUNDANE_ASPECT_ANGLES) {
        const d1v = prevSep.get(k)! - angle;
        const d2v = cur - angle;
        if (d1v === 0 || d1v < 0 !== d2v < 0) {
          const exact = bisectTime(
            (x) => separation(eclipticLon("moon", x), eclipticLon(k, x)) - angle,
            new Date(t), d2,
          );
          if (!latest || exact.getTime() > latest.getTime()) latest = exact;
        }
      }
      prevSep.set(k, cur);
    }
    t = t2;
  }
  return latest;
}

export interface MoonPhaseEvent {
  date: Date;
  angle: 0 | 90 | 180 | 270; // 新月・上弦・満月・下弦
}

/** [start, end) 内の新月・上弦・満月・下弦（月-太陽の視黄経差、fetch_astro.py と同定義） */
export function scanMoonPhases(startUtc: Date, endUtc: Date): MoonPhaseEvent[] {
  const limitDays = (endUtc.getTime() - startUtc.getTime()) / 86400_000 + 0.1;
  const out: MoonPhaseEvent[] = [];
  for (const angle of [0, 90, 180, 270] as const) {
    const found = SearchMoonPhase(angle, MakeTime(startUtc), limitDays);
    if (found && found.date.getTime() < endUtc.getTime()) {
      out.push({ date: found.date, angle });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface RetroChange {
  date: Date; // 6時間グリッド上の検出時刻（「〜頃」の精度）
  planet: Planet;
  startsRetro: boolean; // true=逆行開始 / false=逆行終了（順行へ）
}

/** 週内の逆行開始・終了（月・太陽以外、6時間グリッド） */
export function scanRetroChanges(startUtc: Date, endUtc: Date): RetroChange[] {
  const step = 6 * HOUR_MS;
  const endT = endUtc.getTime();
  const out: RetroChange[] = [];
  for (const p of NON_MOON) {
    if (p === "sun") continue;
    let prev = isRetrograde(p, startUtc);
    let t = startUtc.getTime();
    while (t < endT) {
      const t2 = Math.min(t + step, endT);
      const cur = isRetrograde(p, new Date(t2));
      if (cur !== prev) {
        out.push({ date: new Date(t2), planet: p, startsRetro: cur });
        prev = cur;
      }
      t = t2;
    }
  }
  return out;
}

export interface MundaneAspect {
  a: Planet;
  b: Planet;
  angle: number;
  orb: number;
}

/** 月以外の天体間の主要アスペクト（オーブ6度以内、オーブ昇順） */
export function planetAspects(date: Date): MundaneAspect[] {
  const lons = new Map<Planet, number>(NON_MOON.map((k) => [k, eclipticLon(k, date)]));
  const out: MundaneAspect[] = [];
  for (let i = 0; i < NON_MOON.length; i++) {
    for (let j = i + 1; j < NON_MOON.length; j++) {
      const sep = separation(lons.get(NON_MOON[i])!, lons.get(NON_MOON[j])!);
      for (const angle of MUNDANE_ASPECT_ANGLES) {
        const orb = Math.abs(sep - angle);
        if (orb <= MUNDANE_ASPECT_ORB) {
          out.push({ a: NON_MOON[i], b: NON_MOON[j], angle, orb });
        }
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}
