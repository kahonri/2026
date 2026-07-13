export const SIGNS = [
  "牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座",
  "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座",
] as const;

export const PLANETS = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto",
] as const;

export type Planet = (typeof PLANETS)[number];
export type NatalPoint = Planet | "asc" | "mc";

export const PLANET_LABELS: Record<NatalPoint, string> = {
  sun: "太陽", moon: "月", mercury: "水星", venus: "金星", mars: "火星",
  jupiter: "木星", saturn: "土星", uranus: "天王星", neptune: "海王星", pluto: "冥王星",
  asc: "アセンダント", mc: "MC",
};

export interface ChartPoint {
  lon: number;        // 黄経（度、0-360）
  sign: number;       // 0=牡羊座
  degInSign: number;  // サイン内度数
  retro?: boolean;
}

export interface NatalChart {
  points: Partial<Record<NatalPoint, ChartPoint>>;
  birthTimeKnown: boolean;
  /** 時刻不明時、月がサイン境界±7度以内なら true */
  moonUncertain?: boolean;
  /** ASCサイン番号（時刻既知のみ）。ホールサインハウス計算の基点 */
  ascSign?: number;
}

export function signOf(lon: number): number {
  return Math.floor(((lon % 360) + 360) % 360 / 30);
}

export function degInSign(lon: number): number {
  return (((lon % 360) + 360) % 360) % 30;
}

/** ホールサイン: ネイタル黄経がASC基点で何ハウスか（1-12） */
export function houseOf(lon: number, ascSign: number): number {
  return ((signOf(lon) - ascSign + 12) % 12) + 1;
}
