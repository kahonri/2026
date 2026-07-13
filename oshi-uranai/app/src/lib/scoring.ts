import { fallbackPatternId } from "./pattern-id";
import type { TransitEvent } from "./transits";
import type { NatalChart, NatalPoint, Planet } from "./types";

const W_TRANSIT: Record<Planet, number> = {
  pluto: 10, neptune: 9, uranus: 8, saturn: 7, jupiter: 6,
  mars: 4, sun: 3.5, venus: 3, mercury: 2.5, moon: 1,
};

const W_ASPECT = { conjunction: 1.0, opposition: 0.9, square: 0.9, trine: 0.7, sextile: 0.5 } as const;

const W_NATAL: Record<NatalPoint, number> = {
  sun: 1.2, moon: 1.2, asc: 1.2,
  mercury: 1.0, venus: 1.0, mars: 1.0, mc: 1.0,
  jupiter: 0.8, saturn: 0.8, uranus: 0.6, neptune: 0.6, pluto: 0.6,
};

// アスペクト以外のイベントの基礎スコア
const BASE_SCORE: Partial<Record<TransitEvent["category"], number>> = {
  "W-LUN": 5.0,   // 新月・満月は週の主役級
  "M-HSE": 3.5,   // 木土在泊は月の背景テーマ
  "M-SUN": 1.5,   // サブ専用
};

export interface ScoredEvent extends TransitEvent {
  score: number;
}

export function scoreEvent(ev: TransitEvent, chart: NatalChart, maxOrb: number): number {
  if (ev.category === "W-LUN" || ev.category === "M-HSE" || ev.category === "M-SUN") {
    let s = BASE_SCORE[ev.category]!;
    if (ev.category === "W-LUN" && ev.phase === "new") s *= 1.1;
    return s;
  }
  const wT = W_TRANSIT[ev.transit!];
  const wA = W_ASPECT[ev.aspect!];
  let wN = W_NATAL[ev.natal!];
  if (ev.natal === "moon" && chart.moonUncertain) wN *= 0.5;
  const orbFactor = 1 - (ev.minOrb ?? 0) / maxOrb;
  const bonus = ev.exact ? 1.3 : ev.applying ? 1.1 : 1.0;
  return wT * wA * wN * orbFactor * bonus;
}

export interface Reading {
  main: ScoredEvent;
  subs: ScoredEvent[];
  all: ScoredEvent[];
}

/** 週番号ベースの決定的ハッシュ（フォールバック変奏・lead選択に共用） */
export function periodHash(periodLabel: string): number {
  let h = 0;
  for (const ch of periodLabel) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function selectReading(
  events: TransitEvent[],
  chart: NatalChart,
  periodKind: "weekly" | "monthly",
  periodLabel: string,
): Reading {
  const maxOrb = periodKind === "weekly" ? 6 : 6;
  const scored: ScoredEvent[] = events
    .map((ev) => ({ ...ev, score: scoreEvent(ev, chart, ev.category === "M-OUT" ? 3 : maxOrb) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    const variant = (periodHash(periodLabel) % 3) + 1;
    const fallback: ScoredEvent = {
      category: "FALLBACK",
      patternId: fallbackPatternId(periodKind, variant),
      exact: false, applying: false, score: 0,
    };
    return { main: fallback, subs: [], all: [] };
  }

  const main = scored[0];
  const subs: ScoredEvent[] = [];
  // サブ: メインとトランジット天体・ネイタル感受点の両方が異なるものを優先
  for (const ev of scored.slice(1)) {
    if (subs.length >= 2) break;
    const dup = subs.some((s) => s.transit === ev.transit && s.natal === ev.natal);
    if (dup) continue;
    if (ev.transit !== main.transit && ev.natal !== main.natal) subs.push(ev);
  }
  for (const ev of scored.slice(1)) {
    if (subs.length >= 2) break;
    if (ev === main || subs.includes(ev)) continue;
    subs.push(ev);
  }
  return { main, subs, all: scored };
}
