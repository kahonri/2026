import type { ScoredEvent } from "./scoring";
import { PLANET_LABELS, type NatalPoint } from "./types";
import { ASPECTS } from "./pattern-id";

/** 影響を受ける人生エリア（名詞形） */
const AREA_NAME: Record<NatalPoint, string> = {
  sun: "生き方の軸", moon: "心と暮らし", mercury: "言葉と考え",
  venus: "好きなものと関係", mars: "行動と情熱", jupiter: "成長と希望",
  saturn: "積み重ねてきたもの", uranus: "変化への欲求", neptune: "夢と感受性",
  pluto: "深いところの自分", asc: "あなたのあり方", mc: "仕事と目標",
};

export const HOUSE_THEME = [
  "", "自分自身", "価値とお金", "言葉と学び", "家と土台", "創造と恋", "日常と体",
  "パートナーシップ", "深い絆と継承", "遠くへの憧れ", "仕事と到達", "仲間と未来", "内省と癒し",
];

const ASPECT_LABELS = Object.fromEntries(ASPECTS.map((a) => [a.key, a.label])) as Record<string, string>;

/** カード見出し（エリア×アスペクトの質で完結した一文にする） */
export function cardTitle(ev: ScoredEvent): string {
  switch (ev.category) {
    case "W-LUN":
      return ev.phase === "new"
        ? `${HOUSE_THEME[ev.house!]}に、新しいサイクルが始まる`
        : `${HOUSE_THEME[ev.house!]}が、満ちて実るとき`;
    case "M-HSE":
      return `${HOUSE_THEME[ev.house!]}が、じっくり深まる時期`;
    case "M-SUN":
      return `${HOUSE_THEME[ev.house!]}に、光が差す`;
    case "FALLBACK":
      return "静かに整う時間";
    default: {
      const area = AREA_NAME[ev.natal!];
      if (ev.aspect === "conjunction") return `${area}に、新しい流れが生まれる`;
      if (ev.aspect === "square" || ev.aspect === "opposition") return `${area}が、試されるとき`;
      return `${area}に、追い風が吹く`;
    }
  }
}

function jstMonthDay(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 3600_000);
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}

/** カード見出しの上に小さく出すメタ情報（どの星がどう動くか） */
export function cardMeta(ev: ScoredEvent): string | null {
  switch (ev.category) {
    case "W-LUN":
      return `${jstMonthDay(ev.peakDate!)}、${HOUSE_THEME[ev.house!]}のエリアで${ev.phase === "new" ? "新月" : "満月"}`;
    case "M-HSE":
      return `${PLANET_LABELS[ev.transit!]}が${HOUSE_THEME[ev.house!]}のエリアを運行中`;
    case "M-SUN":
      return `太陽が${HOUSE_THEME[ev.house!]}のエリアを運行中`;
    case "FALLBACK":
      return null;
    default:
      return `${PLANET_LABELS[ev.transit!]}が${PLANET_LABELS[ev.natal!]}と${ASPECT_LABELS[ev.aspect!]}`;
  }
}

type Quality = "merge" | "tension" | "harmony";

function qualityOf(aspect: string): Quality {
  if (aspect === "conjunction") return "merge";
  if (aspect === "square" || aspect === "opposition") return "tension";
  return "harmony";
}

/** いちばん大切にしてほしいこと（エリア×質、働く人の仕事・自己価値・転機に寄せた1行） */
const KEY_POINTS: Record<NatalPoint, Record<Quality, string>> = {
  sun: {
    merge: "「どう働きたいか」を、誰の目も気にせず一度言葉にしてみること。",
    tension: "評価と自分の軸がずれても、軸のほうを疑わないこと。",
    harmony: "「自分らしくいられる場面」を選んで、そこに力を注ぐこと。",
  },
  moon: {
    merge: "気持ちの変化を見逃さず、暮らしのリズムを先に整えること。",
    tension: "疲れを気合いでごまかさず、休む予定を先にカレンダーに入れること。",
    harmony: "心地よいと感じる時間を、遠慮せずに増やすこと。",
  },
  mercury: {
    merge: "頭の中の考えを、メモでも人にでも、一度外に出すこと。",
    tension: "言葉の行き違いを「自分のせい」にしすぎないこと。",
    harmony: "伝えたかったこと、相談したかったことを、今のうちに話すこと。",
  },
  venus: {
    merge: "「好き」と感じたものを、理由をつけて却下しないこと。",
    tension: "人に合わせすぎている場面に気づいたら、半歩だけ自分に戻ること。",
    harmony: "うれしかったこと・助けられたことを、ちゃんと言葉にして渡すこと。",
  },
  mars: {
    merge: "やりたかったことに、小さくてもいいから着手すること。",
    tension: "苛立ちを人にぶつける前に、自分が何を守りたいのかを確かめること。",
    harmony: "勢いのあるうちに、先延ばしにしていた一件を片づけること。",
  },
  jupiter: {
    merge: "「広げてみたい」という気持ちに、結論を急がず付き合うこと。",
    tension: "引き受けすぎに注意して、広げる範囲を自分で決めること。",
    harmony: "声がかかったら、できない理由よりできる理由から考えてみること。",
  },
  saturn: {
    merge: "これまでの実績を、自分の言葉で棚卸ししてみること。",
    tension: "「足りない」と感じても、積み上げてきた事実のほうを見ること。",
    harmony: "コツコツ続けてきたことを、やめずにそのまま続けること。",
  },
  uranus: {
    merge: "「変えたい」という直感を、否定せずにまずメモしておくこと。",
    tension: "飽きたのか限界なのかを、辞める前に見分けること。",
    harmony: "いつものやり方を、ひとつだけ変えて試してみること。",
  },
  neptune: {
    merge: "効率で測れない時間を、後ろめたさなしに持つこと。",
    tension: "曖昧な不安は、紙に書いて輪郭を与えること。",
    harmony: "「いつかやりたい」を、恥ずかしがらずに口に出すこと。",
  },
  pluto: {
    merge: "本音の「もう嫌だ」「こうしたい」から目をそらさないこと。",
    tension: "手放すことを、負けだと思わないこと。",
    harmony: "変わりはじめている自分を、以前の基準で測らないこと。",
  },
  asc: {
    merge: "「どう見られたいか」より「どうありたいか」で選ぶこと。",
    tension: "役割の鎧を、家に帰ったら一度脱ぐこと。",
    harmony: "無理のない自分のまま人に会うこと。それで十分だと知ること。",
  },
  mc: {
    merge: "キャリアの「次」を、誰にも見せない前提で書き出してみること。",
    tension: "今の評価がすべてではないと、意識して思い出すこと。",
    harmony: "仕事で欲しいものを、遠慮せずに口に出すこと。",
  },
};

/** メインイベントから「いちばん大切にしてほしいこと」を1行返す */
export function keyPoint(ev: ScoredEvent): string {
  switch (ev.category) {
    case "W-LUN":
      return ev.phase === "new"
        ? `「${HOUSE_THEME[ev.house!]}」のことで、小さくてもいいから新しい一歩をひとつ踏み出すこと。`
        : `「${HOUSE_THEME[ev.house!]}」のことで、やりきったものを認めて、手放すものを決めること。`;
    case "M-HSE":
      return ev.transit === "jupiter"
        ? `「${HOUSE_THEME[ev.house!]}」を広げる話がきたら、迷っても入り口までは行ってみること。`
        : `「${HOUSE_THEME[ev.house!]}」の土台を、焦らずひとつずつ固めること。`;
    case "M-SUN":
      return `「${HOUSE_THEME[ev.house!]}」に、意識して時間を割くこと。`;
    case "FALLBACK":
      return "予定を詰め込まず、自分の声を聞く余白を残しておくこと。";
    default:
      return KEY_POINTS[ev.natal!][qualityOf(ev.aspect!)];
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
