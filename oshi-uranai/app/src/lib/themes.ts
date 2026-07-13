import type { ScoredEvent } from "./scoring";
import { PLANET_LABELS, type NatalPoint } from "./types";
import { ASPECTS } from "./pattern-id";

const AREA_HEADING: Record<NatalPoint, string> = {
  sun: "生き方の軸に", moon: "心と暮らしに", mercury: "言葉と考えに",
  venus: "好きなものと関係に", mars: "行動と情熱に", jupiter: "成長と希望に",
  saturn: "積み重ねてきたものに", uranus: "変化への欲求に", neptune: "夢と感受性に",
  pluto: "深いところの自分に", asc: "あなたのあり方に", mc: "仕事と目標に",
};

export const HOUSE_THEME = [
  "", "自分自身", "価値とお金", "言葉と学び", "家と土台", "創造と恋", "日常と体",
  "パートナーシップ", "深い絆と継承", "遠くへの憧れ", "仕事と到達", "仲間と未来", "内省と癒し",
];

const ASPECT_LABELS = Object.fromEntries(ASPECTS.map((a) => [a.key, a.label])) as Record<string, string>;

/** カード見出し（天体名ではなく鑑定テーマの言葉） */
export function cardTitle(ev: ScoredEvent): string {
  switch (ev.category) {
    case "W-LUN":
      return `${ev.phase === "new" ? "新月" : "満月"}：${HOUSE_THEME[ev.house!]}`;
    case "M-HSE":
      return `${HOUSE_THEME[ev.house!]}が深まる時期`;
    case "M-SUN":
      return `${HOUSE_THEME[ev.house!]}に光が差す`;
    case "FALLBACK":
      return "静かに整う時間";
    default:
      return AREA_HEADING[ev.natal!];
  }
}

/** 折りたたみ内に出す占星術的な根拠（透明性のため） */
export function basisText(ev: ScoredEvent): string {
  if (ev.category === "W-LUN") {
    return `${ev.phase === "new" ? "新月" : "満月"}が第${ev.house}ハウス（${HOUSE_THEME[ev.house!]}）で起こる`;
  }
  if (ev.category === "M-HSE" || ev.category === "M-SUN") {
    return `${PLANET_LABELS[ev.transit!]}が第${ev.house}ハウス（${HOUSE_THEME[ev.house!]}）を運行中`;
  }
  if (ev.category === "FALLBACK") {
    return "大きな天体の動きがない、静かな期間";
  }
  const detail = ev.exact ? "・期間内に正確に重なる" : ev.applying ? "・近づいている最中" : "";
  return `${PLANET_LABELS[ev.transit!]} が ネイタル${PLANET_LABELS[ev.natal!]} と ${ASPECT_LABELS[ev.aspect!]}（誤差${ev.minOrb?.toFixed(1)}度${detail}）`;
}
