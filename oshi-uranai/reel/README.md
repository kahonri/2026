# 推しの占い子 リール生成

JSONの設定1枚から、1080×1920・無音のmp4を書き出す。**最後は必ずエンドカード**（`assets/reel-endcard.png`・自動で付く）。BGMは入れない（必要ならInstagramで付ける）。

```bash
python oshi-uranai/reel/make_reel.py oshi-uranai/reel/specs/2026-10-11_天秤座新月.json
python oshi-uranai/reel/make_reel.py <spec.json> --still 2.0   # 2秒目の1コマだけPNGで確認
```

出力は設定ファイルと同じ場所・同じ名前の `.mp4`（`"out"` で変更可）。見本は `examples/`（6系統すべて）。

## 見た目（全テンプレート共通）

生成りの紙の背景／墨色の明朝（BIZ UD明朝・字間広め）／薄くまたたく星／文字は行ごとに下からふわっと出る／場面の切り替えは短いフェード。色はベージュ・白・グレー・黒だけ。

## テンプレート（`"template"`）

| 値 | 系統 | 流れ | 使う項目 |
|---|---|---|---|
| `moon` | 新月・満月 | 表紙（月相の線画）→ メッセージ → 問いを1つずつ → 締め | `date` `theme` `phase`（new/full/waxing/waning/crescent）`sub` `message` `questions_title` `questions`[] `closing` |
| `sky` | 今の星 | 表紙 → 言葉が消えて別の言葉へ → メッセージ → 締め | `date` `theme` `phase`（任意）`swap`["前","後"] `message` `closing` |
| `tarot` | タロット1枚引き | 伏せたカード＋問い → 返る → カード名 → 意味 → 締め | `question` `card`{`face` `name` `reversed`} `meaning`[] `closing`（省略時「答えを決めるためじゃなく、今の自分を知るために。」）。`meaning` と `closing` は `{"text","image","ypos"}` にすると、イラストを全面に敷いて札に字幕を載せる場面になる（例：`specs/2026-10-05_タロット_女教皇.json`） |
| `know` | 自分を知る | 表紙 → 項目を1つずつ → 問い | `kicker` `theme` `sub` `items_title` `items`[] `numbered` `question` |
| `decide` | 自分で決める | 短い言葉を1場面ずつ → 締め | `lines`[] `closing`（`versus` も使える） |
| `essay` | 自分を推す | 昔の私（グレー）→ 今の私（墨）→ 言葉 → 締め | `versus`{`before`[] `after`[]} `lines`[] `closing` |

共通の任意項目：
- `duration`：秒数を指定すると、エンドカード以外を等倍で伸び縮み（1場面の最短1.5秒）。省略時は文字量から自動
- `images`：イラスト・写真を場面として差し込む。`[{"at": 1, "image": "clips/…/03.jpg", "text": "字幕", "ypos": 0.2}]`（`at`＝何番目の前に入れるか。字幕は生成りの札に載る）
- パスは `oshi-uranai/` からの相対でも絶対でもよい
- 改行は `\n`。1行が長すぎると自動で文字が小さくなる（目安：1行15字以内）

## 守ること

- **タロットは実際に引いたカードだけ。** ユーザーから引いたカード（名前・正逆・デッキ）を共有してもらってから作る。絵柄は `assets/tarot/`（一般的なライダー版の構図を線画にしたもの）。無いカードはCanvaで1枚だけ生成して追加する（逆位置は絵を回すのでなく `"reversed": true`）
- 断定しない（「未来はこうなる」「これを選べば正解」）。星やカードの情報は必ず自分への問いにつなげる（`docs/brand-concept.md`）
- 天体の日付・星座は実測する（`oshi-uranai-ig` の `month_astro.py` / `oshi-uranai-weekly` の `fetch_astro.py`）

## 見本（`examples/`）

`moon.json`（10/11 天秤座新月）／`sky.json`（10/3 金星逆行はじまり）／`tarot.json`（節制・**見本用。実際に引いたカードではない**）／`know.json`（金星星座・項目は見本の仮文）／`decide.json`（今は決めなくていい）／`essay.json`（昔の私 vs 今の私）
