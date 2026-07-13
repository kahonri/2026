import { PLANETS, SIGNS, type NatalChart, type Planet } from "../lib/types";

const PLANET_GLYPH: Record<Planet, string> = {
  sun: "☉", moon: "☽", mercury: "☿", venus: "♀", mars: "♂",
  jupiter: "♃", saturn: "♄", uranus: "♅", neptune: "♆", pluto: "♇",
};
const SIGN_GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

// 0°牡羊を左端（9時方向）に置き、反時計回り（西洋占星術の標準）
function lonToXY(lon: number, radius: number, cx: number, cy: number): [number, number] {
  const a = (180 - lon) * (Math.PI / 180);
  return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
}

export default function ChartWheel({ chart }: { chart: NatalChart }) {
  const size = 320;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 150;
  const rSignBand = 128;
  const rPlanet = 100;

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
        const [x1, y1] = lonToXY(i * 30, rSignBand, cx, cy);
        const [x2, y2] = lonToXY(i * 30, rOuter, cx, cy);
        const [gx, gy] = lonToXY(i * 30 + 15, (rSignBand + rOuter) / 2, cx, cy);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9b8e8" />
            <text x={gx} y={gy} font-size="14" text-anchor="middle" dominant-baseline="central" fill="#7c5cbf">
              {SIGN_GLYPH[i]}
            </text>
          </g>
        );
      })}
      {chart.points.asc && (() => {
        const [ax, ay] = lonToXY(chart.points.asc.lon, rOuter, cx, cy);
        const [ix, iy] = lonToXY(chart.points.asc.lon, rSignBand - 12, cx, cy);
        return <>
          <line x1={ix} y1={iy} x2={ax} y2={ay} stroke="#e0567a" stroke-width="2" />
          <text x={(ax - cx) * 1.08 + cx} y={(ay - cy) * 1.08 + cy} font-size="10" text-anchor="middle" fill="#e0567a">ASC</text>
        </>;
      })()}
      {PLANETS.map((p) => {
        const pt = chart.points[p];
        if (!pt) return null;
        const r = radiusFor(pt.lon);
        const [x, y] = lonToXY(pt.lon, r, cx, cy);
        return (
          <text key={p} x={x} y={y} font-size="15" text-anchor="middle" dominant-baseline="central" fill="#443355">
            {PLANET_GLYPH[p]}
          </text>
        );
      })}
    </svg>
  );
}
