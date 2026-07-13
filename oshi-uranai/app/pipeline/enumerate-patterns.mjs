#!/usr/bin/env node
// パターン空間の列挙。validate-texts.mjs と生成バッチの分割に使う

export const PLANETS = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
export const NATAL_POINTS = [...PLANETS, "asc", "mc"];
export const ASPECTS = ["conjunction", "sextile", "square", "trine", "opposition"];
const OUTER = ["uranus", "neptune", "pluto"];

function aspectIds(category, transits, aspects) {
  const ids = [];
  for (const t of transits) {
    for (const n of NATAL_POINTS) {
      if (OUTER.includes(t) && OUTER.includes(n)) continue; // skip: 世代天体同士
      for (const a of aspects) ids.push(`${category}:${t}:natal_${n}:${a}`);
    }
  }
  return ids;
}

export function enumerate() {
  const cats = {
    "W-ASP": aspectIds("W-ASP", ["sun", "mercury", "venus", "mars"], ASPECTS),
    "W-LUN": [],
    "M-ASP": aspectIds("M-ASP", ["jupiter", "saturn"], ASPECTS),
    "M-OUT": aspectIds("M-OUT", OUTER, ["conjunction", "square", "opposition"]),
    "M-HSE": [],
    "M-SUN": [],
    "FALLBACK": [],
    "LEADS": [],
  };
  for (const phase of ["new", "full"]) {
    for (let h = 1; h <= 12; h++) cats["W-LUN"].push(`W-LUN:${phase}:house_${h}`);
  }
  for (const t of ["jupiter", "saturn"]) {
    for (let h = 1; h <= 12; h++) cats["M-HSE"].push(`M-HSE:${t}:house_${h}`);
  }
  for (let h = 1; h <= 12; h++) cats["M-SUN"].push(`M-SUN:sun:house_${h}`);
  for (const p of ["weekly", "monthly"]) {
    for (let v = 1; v <= 3; v++) cats["FALLBACK"].push(`FALLBACK:${p}:${v}`);
  }
  // リード比喩: 天体グループ×質（各5変奏はJSON側で配列）
  const groups = ["sun", "mercury", "venus", "mars", "jupsat", "outer"];
  for (const g of groups) {
    for (const q of ["merge", "tension", "harmony"]) cats["LEADS"].push(`${g}:${q}`);
  }
  return cats;
}

export function leadKeyFor(transit, aspect) {
  const group = ["jupiter", "saturn"].includes(transit) ? "jupsat"
    : OUTER.includes(transit) ? "outer" : transit;
  const quality = aspect === "conjunction" ? "merge"
    : ["square", "opposition"].includes(aspect) ? "tension" : "harmony";
  return `${group}:${quality}`;
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cats = enumerate();
  let total = 0;
  for (const [cat, ids] of Object.entries(cats)) {
    console.log(`${cat}: ${ids.length}`);
    total += ids.length;
  }
  console.log(`total: ${total}`);
  if (process.argv.includes("--ids")) {
    for (const ids of Object.values(cats)) for (const id of ids) console.log(id);
  }
}
