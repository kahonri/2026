import { expect, it } from "vitest";
import { computeNatal } from "../../src/lib/natal";
import { NODE_LABELS, PLANETS, PLANET_LABELS, SIGNS, houseOf, signOf, degInSign } from "../../src/lib/types";
import { houseOfPlacidus } from "../../src/lib/houses";
const fmt = (l: number) => `${SIGNS[signOf(l)]} ${degInSign(l).toFixed(2)}度`;

it("出生図の素材を出力する（1966-12-03 17:00 狛江）", () => {
  const b = { year: 1966, month: 12, day: 3, hour: 17, minute: 0, lat: 35.6344, lon: 139.5786, tzOffsetMinutes: 540 };
  const c = computeNatal(b);
  const asc = c.ascSign!;
  const rows: [string, number, boolean | undefined][] = [];
  for (const p of PLANETS) rows.push([PLANET_LABELS[p], c.points[p]!.lon, c.points[p]!.retro]);
  rows.push(["アセンダント", c.points.asc!.lon, undefined]);
  rows.push(["MC", c.points.mc!.lon, undefined]);
  rows.push([NODE_LABELS.northNode, c.nodes!.northNode.lon, undefined]);
  rows.push([NODE_LABELS.southNode, c.nodes!.southNode.lon, undefined]);
  const cusps = c.cusps!;
  const out = rows.map(([n, l, r]) => `${n.padEnd(7)} ${fmt(l).padEnd(16)} P:${String(houseOfPlacidus(l, cusps)).padStart(2)}H  WS:${String(houseOf(l, asc)).padStart(2)}H${r ? " R" : ""}`);
  console.log("\nカスプ\n" + cusps.map((cu, i) => `${String(i + 1).padStart(2)}室 ${fmt(cu)}`).join("\n"));
  console.log("\n" + out.join("\n"));

  // アスペクト（ASC/MC含む）
  const pts = rows.filter(r => r[0] !== "ドラゴンテイル");
  const ASP: [string, number][] = [["合", 0], ["衝", 180], ["矩", 90], ["三分", 120], ["六分", 60]];
  const asps: string[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    let d = Math.abs(pts[i][1] - pts[j][1]); if (d > 180) d = 360 - d;
    for (const [nm, ang] of ASP) {
      const orb = Math.abs(d - ang);
      if (orb <= 8) asps.push(`${orb.toFixed(2).padStart(5)}  ${pts[i][0]} ${nm} ${pts[j][0]}`);
    }
  }
  console.log("\n" + asps.sort().join("\n"));

  // サイン集中
  const cnt: Record<number, string[]> = {};
  for (const [n, l] of pts) (cnt[signOf(l)] ??= []).push(n);
  console.log("\n" + Object.entries(cnt).filter(([, v]) => v.length >= 3).map(([s, v]) => `${SIGNS[+s]}: ${v.join("・")}`).join("\n"));
});
