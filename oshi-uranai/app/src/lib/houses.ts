import { MakeTime, SiderealTime, e_tilt } from "astronomy-engine";

const DEG = Math.PI / 180;

/** ASC/MC の黄経（度）。latDeg: 地理緯度（北+）、lonDegEast: 地理経度（東+） */
export function ascMc(date: Date, latDeg: number, lonDegEast: number): { asc: number; mc: number } {
  const time = MakeTime(date);
  const gastHours = SiderealTime(time);
  const ramc = (((gastHours * 15 + lonDegEast) % 360) + 360) % 360;
  const eps = e_tilt(time).tobl * DEG;
  const ramcRad = ramc * DEG;
  const phi = latDeg * DEG;

  const mc = Math.atan2(Math.sin(ramcRad), Math.cos(ramcRad) * Math.cos(eps)) / DEG;
  const asc =
    Math.atan2(
      Math.cos(ramcRad),
      -(Math.sin(ramcRad) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps)),
    ) / DEG;

  return { asc: ((asc % 360) + 360) % 360, mc: ((mc % 360) + 360) % 360 };
}

const norm = (x: number) => ((x % 360) + 360) % 360;

/** 赤経（度）に対応する黄道上の点の黄経（度） */
function raToEclipticLon(raDeg: number, eps: number): number {
  const ra = raDeg * DEG;
  return norm(Math.atan2(Math.sin(ra), Math.cos(ra) * Math.cos(eps)) / DEG);
}

/**
 * プラシーダス方式の中間カスプ。
 * 天球上の点は、地平線からMCまでを半昼弧 SD = 90 + AD の時間で移動する（AD = 赤緯差）。
 * プラシーダスはこの弧を3等分するので、各カスプの赤経は
 *   11室 = RAMC + 30 + AD/3 / 12室 = RAMC + 60 + 2AD/3
 *   2室  = RAMC + 120 + 2AD/3 / 3室 = RAMC + 150 + AD/3
 * となる。AD はカスプ自身の黄経に依存するため反復で解く。
 */
function intermediateCusp(ramc: number, eps: number, phi: number, base: number, coef: number): number {
  let lon = raToEclipticLon(ramc + base, eps);
  for (let i = 0; i < 30; i++) {
    const dec = Math.asin(Math.sin(eps) * Math.sin(lon * DEG));
    const t = Math.tan(phi) * Math.tan(dec);
    if (Math.abs(t) > 1) return NaN; // 極圏：プラシーダスは定義できない
    const ad = Math.asin(t) / DEG;
    const next = raToEclipticLon(ramc + base + coef * ad, eps);
    if (Math.abs(norm(next - lon + 180) - 180) < 1e-9) return next;
    lon = next;
  }
  return lon;
}

/**
 * プラシーダス方式の12ハウスカスプ（度、cusps[0] が1室＝ASC）。
 * 極圏など計算できない場合は null を返す（呼び出し側でホールサインにフォールバック）。
 */
export function placidusCusps(date: Date, latDeg: number, lonDegEast: number): number[] | null {
  const time = MakeTime(date);
  const ramc = norm(SiderealTime(time) * 15 + lonDegEast);
  const eps = e_tilt(time).tobl * DEG;
  const phi = latDeg * DEG;
  const { asc, mc } = ascMc(date, latDeg, lonDegEast);

  const c11 = intermediateCusp(ramc, eps, phi, 30, 1 / 3);
  const c12 = intermediateCusp(ramc, eps, phi, 60, 2 / 3);
  const c2 = intermediateCusp(ramc, eps, phi, 120, 2 / 3);
  const c3 = intermediateCusp(ramc, eps, phi, 150, 1 / 3);
  if ([c11, c12, c2, c3].some(Number.isNaN)) return null;

  const cusps = [asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180)];
  return [...cusps, ...cusps.map((c) => norm(c + 180))];
}

/** プラシーダスのカスプ配列から、黄経 lon が何ハウスか（1-12） */
export function houseOfPlacidus(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    const span = norm(cusps[(i + 1) % 12] - cusps[i]);
    if (norm(lon - cusps[i]) < span) return i + 1;
  }
  return 12;
}
