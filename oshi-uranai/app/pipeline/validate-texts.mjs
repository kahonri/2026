#!/usr/bin/env node
// src/data/texts/ の全JSONを検証する: 文字数・NG語・パターン網羅
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerate } from "./enumerate-patterns.mjs";

const TEXTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "texts");

const NG_WORDS = [
  "最悪", "不運", "大吉", "開運", "危険", "絶対", "必ず",
  "アスペクト", "オーブ", "トランジット", "ハウス",
  "スクエア", "トライン", "セクスタイル", "コンジャンクション", "オポジション", "逆行",
];

// リードなし単体表示（280-320字）のカテゴリ
const STANDALONE = (id) => id.startsWith("W-LUN") || id.startsWith("FALLBACK") ||
  id.startsWith("M-HSE") || id.startsWith("M-SUN");

const LIMITS = {
  bodyStandalone: [245, 340],
  body: [160, 270],
  sub: [30, 100],
  lead: [42, 110],
};

const errors = [];
const entries = {};
let leads = null;

if (!existsSync(TEXTS_DIR)) {
  console.error(`not found: ${TEXTS_DIR}`);
  process.exit(1);
}

for (const f of readdirSync(TEXTS_DIR).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(TEXTS_DIR, f), "utf-8"));
  if (f === "leads.json") { leads = data; continue; }
  for (const [id, entry] of Object.entries(data.entries ?? {})) {
    if (entries[id]) errors.push(`duplicate id: ${id} (${f})`);
    entries[id] = entry;
  }
}

function checkLen(id, field, text, [min, max]) {
  if (typeof text !== "string") { errors.push(`${id}: ${field} missing`); return; }
  if (text.length < min || text.length > max) {
    errors.push(`${id}: ${field} length ${text.length} (expect ${min}-${max})`);
  }
  for (const ng of NG_WORDS) {
    if (text.includes(ng)) errors.push(`${id}: ${field} contains NG word 「${ng}」`);
  }
}

for (const [id, entry] of Object.entries(entries)) {
  checkLen(id, "body", entry.body, STANDALONE(id) ? LIMITS.bodyStandalone : LIMITS.body);
  if (entry.sub !== undefined) checkLen(id, "sub", entry.sub, LIMITS.sub);
}

// 網羅チェック（存在するカテゴリのみ。--require で必須カテゴリ指定）
const required = process.argv.filter((a) => a.startsWith("--require=")).flatMap((a) => a.slice(10).split(","));
const cats = enumerate();
for (const [cat, ids] of Object.entries(cats)) {
  if (cat === "LEADS") continue;
  const present = ids.filter((id) => entries[id]).length;
  const missing = ids.filter((id) => !entries[id]);
  if (required.includes(cat) && missing.length > 0) {
    errors.push(`${cat}: missing ${missing.length} entries: ${missing.slice(0, 5).join(", ")}...`);
  }
  console.log(`${cat}: ${present}/${ids.length}`);
}

if (leads) {
  for (const key of cats["LEADS"]) {
    const arr = leads[key];
    if (!Array.isArray(arr)) {
      if (required.includes("LEADS")) errors.push(`leads: missing key ${key}`);
      continue;
    }
    if (arr.length !== 5) errors.push(`leads:${key}: expect 5 variants, got ${arr.length}`);
    arr.forEach((t, i) => checkLen(`leads:${key}[${i}]`, "lead", t, LIMITS.lead));
  }
} else if (required.includes("LEADS")) {
  errors.push("leads.json not found");
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log("\nvalidation OK");
