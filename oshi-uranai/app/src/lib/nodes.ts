/**
 * ドラゴンヘッド／テイル（月の交点）。
 * 平均交点（Mean Node）を採用。真交点は半月周期で±1.5度ゆらぐため、
 * 出生図の解釈では慣例的に平均交点を使う。
 */
const J2000 = 2451545.0;

/** 平均ドラゴンヘッドの黄経（度） */
export function meanNorthNode(date: Date): number {
  const jd = date.getTime() / 86_400_000 + 2440587.5;
  const T = (jd - J2000) / 36525;
  const om =
    125.0445479 -
    1934.1362891 * T +
    0.0020754 * T * T +
    T ** 3 / 467_441 -
    T ** 4 / 60_616_000;
  return ((om % 360) + 360) % 360;
}

/** ドラゴンテイルはヘッドの対向 */
export function meanSouthNode(date: Date): number {
  return (meanNorthNode(date) + 180) % 360;
}
