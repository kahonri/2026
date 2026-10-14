import { eclipticLon } from "./ephemeris";
import type { Planet } from "./types";

// 誕生日メール（太陽回帰図＋プロフェクション）の計算部品。
// 設計書：oshi-uranai/docs/birthday-reminder-design.md

const norm180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;

/**
 * 太陽が出生時の黄経 natalSunLon に戻る瞬間（太陽回帰）。
 * near（その年の誕生日あたり）の前後3日を二分法で探す。太陽は1日に約1度しか動かないので、この幅で必ず1回だけ通る。
 */
export function findSolarReturn(natalSunLon: number, near: Date): Date {
  let lo = near.getTime() - 3 * 86400_000;
  let hi = near.getTime() + 3 * 86400_000;
  const f = (t: number) => norm180(eclipticLon("sun", new Date(t)) - natalSunLon);
  if (f(lo) > 0 || f(hi) < 0) throw new Error("太陽回帰が探索範囲にない");
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return new Date((lo + hi) / 2);
}

/** 伝統的支配星（プロフェクションの「年の支配星」に使う。外惑星は使わない） */
export const TRAD_RULER: Planet[] = [
  "mars", "venus", "mercury", "moon", "sun", "mercury",
  "venus", "mars", "jupiter", "saturn", "saturn", "jupiter",
];

const EXALT: Partial<Record<Planet, number>> = {
  sun: 0, moon: 1, mercury: 5, venus: 11, mars: 9, jupiter: 3, saturn: 6,
};

/** 天体の品位（本来の座・高揚・障害・下降・なし） */
export function dignity(p: Planet, sign: number): string {
  const tags: string[] = [];
  if (TRAD_RULER[sign] === p) tags.push("本来の座");
  if (EXALT[p] === sign) tags.push("高揚");
  if (TRAD_RULER[(sign + 6) % 12] === p) tags.push("障害");
  if (EXALT[p] !== undefined && (EXALT[p]! + 6) % 12 === sign) tags.push("下降");
  return tags.length ? tags.join("・") : "なし";
}

/**
 * アニュアル・プロフェクション（ホールサイン）。
 * age 歳の1年は、起点サイン（ASC。出生時刻不明なら太陽のサイン）から age 個進んだサイン＝(age % 12 + 1) ハウス。
 */
export function profection(age: number, baseSign: number): { house: number; sign: number; lord: Planet } {
  const sign = (baseSign + age) % 12;
  return { house: (age % 12) + 1, sign, lord: TRAD_RULER[sign] };
}
