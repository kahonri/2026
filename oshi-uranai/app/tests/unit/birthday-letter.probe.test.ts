// 誕生日メール（太陽回帰図＋プロフェクション）の素材出力プローブ。
// 環境変数で渡して実行する（未設定ならスキップされ、npm test を汚さない）。
//   BDAY_BIRTH="1990-01-15 08:30"（時刻不明は "1990-01-15 --"）
//   BDAY_PLACE="34.69,135.50"（出生地の緯度,東経）
//   BDAY_STAY="35.68,139.69"（いま住んでいる場所。省略時は出生地で計算＝本文に前提を書く）
//   BDAY_ASOF="2026-10-13"（省略時は今日。この日を含む1年＝直近の太陽回帰から読む）
//   BDAY_TZ=540（省略可。1948-51の夏時間出生は 600）
// 設計書：oshi-uranai/docs/birthday-reminder-design.md 3章
import { it } from "vitest";
import { computeNatal, type BirthData } from "../../src/lib/natal";
import { eclipticLon, isRetrograde } from "../../src/lib/ephemeris";
import { ascMc } from "../../src/lib/houses";
import { findSolarReturn, profection, dignity, TRAD_RULER } from "../../src/lib/solar-return";
import { PLANETS, PLANET_LABELS, SIGNS, signOf, degInSign, type Planet } from "../../src/lib/types";

const BIRTH = process.env.BDAY_BIRTH;
const PLACE = process.env.BDAY_PLACE;
const STAY = process.env.BDAY_STAY;
const ASOF = process.env.BDAY_ASOF;
const TZ = Number(process.env.BDAY_TZ ?? "540");

const fmt = (l: number) => `${SIGNS[signOf(l)]} ${degInSign(l).toFixed(1)}度`;
const jst = (d: Date) => new Date(d.getTime() + 540 * 60_000).toISOString().slice(0, 16).replace("T", " ");
const ASPECTS: [string, number][] = [["合", 0], ["衝", 180], ["矩", 90], ["三分", 120], ["六分", 60]];

interface Pt { name: string; key: Planet | "asc" | "mc"; lon: number; retro?: boolean }

/** 太陽回帰図1枚ぶん。base＝ハウスの起点サイン（時刻あり＝回帰図のASC／時刻不明＝出生の太陽のサイン） */
function srChart(when: Date, lat: number, lon: number, timeKnown: boolean, sunSign: number) {
  const pts: Pt[] = PLANETS
    .filter(p => timeKnown || p !== "moon") // 時刻不明だと回帰の瞬間が最大半日ずれる＝月は6度ずれるので使わない
    .map(p => ({ name: PLANET_LABELS[p], key: p, lon: eclipticLon(p, when), retro: isRetrograde(p, when) }));
  let base = sunSign;
  if (timeKnown) {
    const { asc, mc } = ascMc(when, lat, lon);
    pts.push({ name: "アセンダント", key: "asc", lon: asc }, { name: "MC", key: "mc", lon: mc });
    base = signOf(asc);
  }
  const house = (l: number) => ((signOf(l) - base + 12) % 12) + 1;
  return { pts, base, house };
}

function aspectsOf(pts: Pt[], focus?: string) {
  const out: string[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    if (focus && pts[i].name !== focus && pts[j].name !== focus) continue;
    let d = Math.abs(pts[i].lon - pts[j].lon); if (d > 180) d = 360 - d;
    const lum = [pts[i].name, pts[j].name].some(n => n === "太陽" || n === "月");
    for (const [nm, ang] of ASPECTS) {
      const orb = Math.abs(d - ang);
      if (orb <= (lum ? 6 : 5)) out.push(`${orb.toFixed(1).padStart(4)}  ${pts[i].name} ${nm} ${pts[j].name}`);
    }
  }
  return out.sort();
}

it.skipIf(!BIRTH || !PLACE)("誕生日メールの素材一覧を出力する", () => {
  const [datePart, timePart] = BIRTH!.split(/\s+/);
  const [y, mo, d] = datePart.split("-").map(Number);
  const timeKnown = !!timePart && timePart !== "--";
  const [h, mi] = timeKnown ? timePart.split(":").map(Number) : [null, null];
  const [bLat, bLon] = PLACE!.split(",").map(Number);
  const [sLat, sLon] = (STAY ?? PLACE!).split(",").map(Number);
  const b: BirthData = { year: y, month: mo, day: d, hour: h, minute: mi, lat: bLat, lon: bLon, tzOffsetMinutes: TZ };
  const natal = computeNatal(b);
  const natalSun = natal.points.sun!.lon;
  const sunSign = signOf(natalSun);
  const baseSign = timeKnown ? natal.ascSign! : sunSign;
  const baseName = timeKnown ? "アセンダント" : "太陽";

  // 直近の太陽回帰＝ASOF以前で最後の回帰
  const asof = ASOF ? new Date(`${ASOF}T23:59:00+09:00`) : new Date();
  const nearOf = (yr: number) => new Date(Date.UTC(yr, mo - 1, d, 12) - TZ * 60_000);
  let srYear = Number(jst(asof).slice(0, 4));
  let sr = findSolarReturn(natalSun, nearOf(srYear));
  if (sr > asof) { srYear -= 1; sr = findSolarReturn(natalSun, nearOf(srYear)); }
  const sr2 = findSolarReturn(natalSun, nearOf(srYear + 1));
  const age = srYear - y;

  console.log(`\n=== 誕生日メール素材 ${BIRTH}（${timeKnown ? "通常版" : "★簡易版：出生時刻不明"}）===`);
  console.log(`出生：太陽 ${fmt(natalSun)}${timeKnown ? `／アセンダント ${fmt(natal.points.asc!.lon)}` : ""}`);
  console.log(`ハウスの起点：${baseName}のサイン＝${SIGNS[baseSign]}（ホールサイン）`);
  console.log(`計算した場所：${sLat},${sLon}${STAY ? "（いま住んでいる場所）" : "　★出生地で代用＝本文末に前提を書く"}`);
  console.log(`対象期間：${jst(sr)} 〜 ${jst(sr2)}（JST）／この1年の年齢＝${age}歳`);

  const natalHouse = (l: number) => ((signOf(l) - baseSign + 12) % 12) + 1;

  for (const [label, when, a] of [["今年", sr, age], ["来年", sr2, age + 1]] as const) {
    const pf = profection(a, baseSign);
    const c = srChart(when, sLat, sLon, timeKnown, sunSign);
    const lordNatal = natal.points[pf.lord]!;
    const lordSR = c.pts.find(p => p.key === pf.lord);

    console.log(`\n────── ${label}（${a}歳・回帰 ${jst(when)}）──────`);
    console.log(`[STEP${label === "今年" ? 1 : 4}] プロフェクション：${pf.house}ハウス（${SIGNS[pf.sign]}）／年の支配星＝${PLANET_LABELS[pf.lord]}`);
    console.log(`  年の支配星・出生：${fmt(lordNatal.lon)}・出生${natalHouse(lordNatal.lon)}ハウス・品位 ${dignity(pf.lord, lordNatal.sign)}`);
    if (lordSR) {
      console.log(`  年の支配星・回帰図：${fmt(lordSR.lon)}・${c.house(lordSR.lon)}ハウス・品位 ${dignity(pf.lord, signOf(lordSR.lon))}${lordSR.retro ? "・逆行" : ""}`);
    } else {
      console.log(`  年の支配星・回帰図：月（時刻不明のため使わない）`);
    }
    const sun = c.pts.find(p => p.key === "sun")!;
    if (timeKnown) {
      const asc = c.pts.find(p => p.key === "asc")!;
      const ascLord = TRAD_RULER[signOf(asc.lon)];
      console.log(`  回帰図：アセンダント ${fmt(asc.lon)}（ASCの支配星＝${PLANET_LABELS[ascLord]}）／MC ${fmt(c.pts.find(p => p.key === "mc")!.lon)}`);
      console.log(`  回帰図の太陽：${c.house(sun.lon)}ハウス　← プロフェクション${pf.house}ハウスと見比べる`);
    } else {
      console.log(`  回帰図の太陽：（簡易版では常に1ハウスなので使わない）`);
    }

    console.log(`  天体（回帰図・ハウスは起点＝${timeKnown ? "回帰図のASC" : "出生の太陽"}のサイン）`);
    console.log(c.pts.filter(p => p.key !== "asc" && p.key !== "mc")
      .map(p => `    ${p.name.padEnd(4)} ${fmt(p.lon).padEnd(12)} ${String(c.house(p.lon)).padStart(2)}ハウス${p.retro ? " R" : ""}`).join("\n"));

    if (label === "今年") {
      const lordName = lordSR?.name;
      console.log(`[STEP2] 広がる可能性：木星 ${c.house(c.pts.find(p => p.key === "jupiter")!.lon)}ハウス／金星 ${c.house(c.pts.find(p => p.key === "venus")!.lon)}ハウス`);
      console.log(`[STEP3] 意識したいこと：土星 ${c.house(c.pts.find(p => p.key === "saturn")!.lon)}ハウス／火星 ${c.house(c.pts.find(p => p.key === "mars")!.lon)}ハウス`);
      console.log(`  年の支配星へのアスペクト（回帰図内）\n${lordName ? aspectsOf(c.pts, lordName).map(s => "    " + s).join("\n") || "    （なし）" : "    （月のため省略）"}`);
      console.log(`  太陽へのアスペクト（回帰図内）\n${aspectsOf(c.pts, "太陽").map(s => "    " + s).join("\n") || "    （なし）"}`);
      if (timeKnown) {
        console.log(`  アセンダントへのアスペクト（回帰図内）\n${aspectsOf(c.pts, "アセンダント").map(s => "    " + s).join("\n") || "    （なし）"}`);
      }
    } else {
      console.log(`  木星 ${c.house(c.pts.find(p => p.key === "jupiter")!.lon)}ハウス／土星 ${c.house(c.pts.find(p => p.key === "saturn")!.lon)}ハウス`);
    }
  }
});

