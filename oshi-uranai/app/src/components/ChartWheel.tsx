import { PLANETS, SIGNS, type NatalChart, type Planet } from "../lib/types";

const PLANET_GLYPH: Record<Planet, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂",
  jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇",
};
const SIGN_GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

// エレメント順: 火・地・風・水（牡羊から順に繰り返し）
const ELEMENT_FILL = ["#f9dede", "#daefdb", "#fcf3cd", "#dae6f8"];
const ELEMENT_GLYPH = ["#d9534f", "#3f9e5f", "#c08c00", "#3f6fd1"];

// ハード=赤 / ソフト=青。合は線にならないため除外
const ASPECT_DEFS = [
  { angle: 60, orb: 4, color: "#3f6fd1" },
  { angle: 90, orb: 6, color: "#d9534f" },
  { angle: 120, orb: 6, color: "#3f6fd1" },
  { angle: 180, orb: 7, color: "#d9534f" },
] as const;

function angularSep(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// rot（アセンダント黄経）を左端＝9時方向に置き、反時計回り（西洋占星術の標準）。
// 出生時刻不明でアセンダントがない場合は 0°牡羊を左端に置く
function lonToXY(lon: number, rot: number, radius: number, cx: number, cy: number): [number, number] {
  const a = (180 - (lon - rot)) * (Math.PI / 180);
  return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
}

export default function ChartWheel({ chart }: { chart: NatalChart }) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 150;
  const rSignBand = 128;
  const rPlanet = 100;
  const rot = chart.points.asc?.lon ?? 0;
  const toXY = (lon: number, radius: number) => lonToXY(lon, rot, radius, cx, cy);

  // 同じ度数付近で重ならないよう、近接天体は半径を少しずらす
  const placed: { lon: number; r: number }[] = [];
  function radiusFor(lon: number): number {
    let r = rPlanet;
    while (placed.some((p) => Math.abs(((p.lon - lon + 180) % 360) - 180) < 9 && Math.abs(p.r - r) < 14)) {
      r -= 16;
    }
    placed.push({ lon, r });
    return r;
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: "340px", display: "block", margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={rOuter} fill="#faf7ff" stroke="#c9b8e8" />
      <circle cx={cx} cy={cy} r={rSignBand} fill="none" stroke="#c9b8e8" />
      {SIGNS.map((_, i) => {
        const [x1, y1] = toXY(i * 30, rSignBand);
        const [x2, y2] = toXY(i * 30, rOuter);
        const [ox2, oy2] = toXY((i + 1) * 30, rOuter);
        const [ix2, iy2] = toXY((i + 1) * 30, rSignBand);
        const [gx, gy] = toXY(i * 30 + 15, (rSignBand + rOuter) / 2);
        const el = i % 4;
        const band = `M ${x2} ${y2} A ${rOuter} ${rOuter} 0 0 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${rSignBand} ${rSignBand} 0 0 0 ${x1} ${y1} Z`;
        return (
          <g key={i}>
            <path d={band} fill={ELEMENT_FILL[el]} stroke="none" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9b8e8" />
            <text x={gx} y={gy} font-size="14" text-anchor="middle" dominant-baseline="central" fill={ELEMENT_GLYPH[el]}>
              {SIGN_GLYPH[i]}
            </text>
          </g>
        );
      })}
      {chart.points.asc && (() => {
        const [ax, ay] = toXY(chart.points.asc.lon, rOuter);
        const [ix, iy] = toXY(chart.points.asc.lon, rSignBand - 12);
        return <>
          <line x1={ix} y1={iy} x2={ax} y2={ay} stroke="#e0567a" stroke-width="2" />
          <text x={ix + 4} y={iy - 5} font-size="10" text-anchor="start" fill="#e0567a">ASC</text>
        </>;
      })()}
      <circle cx={cx} cy={cy} r={78} fill="#fff" stroke="#eee6f7" />
      {PLANETS.flatMap((pa, i) =>
        PLANETS.slice(i + 1).map((pb) => {
          const a = chart.points[pa];
          const b = chart.points[pb];
          if (!a || !b) return null;
          const sep = angularSep(a.lon, b.lon);
          const def = ASPECT_DEFS.find((d) => Math.abs(sep - d.angle) <= d.orb);
          if (!def) return null;
          const tight = Math.abs(sep - def.angle) <= 3;
          const [x1, y1] = toXY(a.lon, 78);
          const [x2, y2] = toXY(b.lon, 78);
          return (
            <line key={`${pa}-${pb}`} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={def.color} stroke-width={tight ? 1.3 : 1}
              stroke-dasharray={tight ? undefined : "4 3"} opacity={tight ? 0.85 : 0.55} />
          );
        }),
      )}
      {PLANETS.map((p) => {
        const pt = chart.points[p];
        if (!pt) return null;
        const r = radiusFor(pt.lon);
        const [x, y] = toXY(pt.lon, r);
        return (
          <text key={p} x={x} y={y} font-size="15" text-anchor="middle" dominant-baseline="central" fill="#443355">
            {PLANET_GLYPH[p]}
          </text>
        );
      })}
    </svg>
  );
}
