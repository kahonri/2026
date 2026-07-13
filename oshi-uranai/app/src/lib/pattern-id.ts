import type { NatalPoint, Planet } from "./types";

export const ASPECTS = [
  { angle: 0, key: "conjunction", label: "合" },
  { angle: 60, key: "sextile", label: "セクスタイル" },
  { angle: 90, key: "square", label: "スクエア" },
  { angle: 120, key: "trine", label: "トライン" },
  { angle: 180, key: "opposition", label: "オポジション" },
] as const;

export type AspectKey = (typeof ASPECTS)[number]["key"];

export type Category = "W-ASP" | "W-LUN" | "M-ASP" | "M-OUT" | "M-HSE" | "M-SUN" | "FALLBACK";

export function aspectPatternId(
  category: "W-ASP" | "M-ASP" | "M-OUT",
  transit: Planet,
  natal: NatalPoint,
  aspect: AspectKey,
): string {
  return `${category}:${transit}:natal_${natal}:${aspect}`;
}

export function lunationPatternId(phase: "new" | "full", house: number): string {
  return `W-LUN:${phase}:house_${house}`;
}

export function housePatternId(category: "M-HSE" | "M-SUN", transit: Planet, house: number): string {
  return `${category}:${transit}:house_${house}`;
}

export function fallbackPatternId(period: "weekly" | "monthly", variant: number): string {
  return `FALLBACK:${period}:${variant}`;
}

/** 意味が薄い・扱わない組み合わせ（生成もスキップ、ランタイムも除外） */
export function isSkippedAspectPattern(transit: Planet, natal: NatalPoint): boolean {
  // トランジット天体とネイタル同天体の合以外は残すが、
  // 世代天体同士（T天海冥×N天海冥）はほぼ全員共通で個人鑑定に不向き
  const outer = ["uranus", "neptune", "pluto"];
  return outer.includes(transit) && outer.includes(natal);
}
