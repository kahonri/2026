import wAspSun from "../data/texts/w-asp-sun.json";
import wAspMercury from "../data/texts/w-asp-mercury.json";
import wAspVenus from "../data/texts/w-asp-venus.json";
import wAspMars from "../data/texts/w-asp-mars.json";
import wLunFallback from "../data/texts/w-lun-fallback.json";
import mAspJupiter from "../data/texts/m-asp-jupiter.json";
import mAspSaturn from "../data/texts/m-asp-saturn.json";
import mOut from "../data/texts/m-out.json";
import mStandalone from "../data/texts/m-standalone.json";
import leads from "../data/texts/leads.json";
import { periodHash } from "./scoring";
import type { ScoredEvent } from "./scoring";
import type { AspectKey } from "./pattern-id";
import type { Planet } from "./types";

interface TextEntry {
  body: string;
  sub?: string;
}

const ENTRIES: Record<string, TextEntry> = Object.assign(
  {},
  wAspSun.entries, wAspMercury.entries, wAspVenus.entries, wAspMars.entries,
  wLunFallback.entries,
  mAspJupiter.entries, mAspSaturn.entries, mOut.entries, mStandalone.entries,
);

const LEADS = leads as Record<string, string[]>;

export function leadKeyFor(transit: Planet, aspect: AspectKey): string {
  const group = transit === "jupiter" || transit === "saturn" ? "jupsat"
    : transit === "uranus" || transit === "neptune" || transit === "pluto" ? "outer"
    : transit;
  const quality = aspect === "conjunction" ? "merge"
    : aspect === "square" || aspect === "opposition" ? "tension" : "harmony";
  return `${group}:${quality}`;
}

const ASPECT_CATEGORIES = new Set(["W-ASP", "M-ASP", "M-OUT"]);

export interface ComposedText {
  /** リード比喩（アスペクト系のみ）＋本文の段落配列 */
  paragraphs: string[];
  sub?: string;
  available: boolean;
}

export function composeText(ev: ScoredEvent, periodLabel: string): ComposedText {
  const entry = ENTRIES[ev.patternId];
  if (!entry) return { paragraphs: [], available: false };

  if (ASPECT_CATEGORIES.has(ev.category) && ev.transit && ev.aspect) {
    const pool = LEADS[leadKeyFor(ev.transit, ev.aspect)];
    if (pool && pool.length > 0) {
      const lead = pool[periodHash(periodLabel + ev.patternId) % pool.length];
      return { paragraphs: [lead, entry.body], sub: entry.sub, available: true };
    }
  }
  return { paragraphs: [entry.body], sub: entry.sub, available: true };
}
