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
