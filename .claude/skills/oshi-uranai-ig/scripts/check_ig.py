#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""推しの占い子 IG投稿の文体チェッカー。

references/voice.md の規則のうち、機械で判定できるものだけを見る。
通っても人間が声に出して読むこと。

usage: python check_ig.py oshi-uranai/ig-main/2026-09-07_xxx.md
"""
import re
import sys
import io
import statistics
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# (パターン, 説明, 1投稿あたりの許容回数)
RULES = [
    # --- 抽象名詞：読者の生活の主語にしない（voice.md 1-①）---
    (r"空白|余白|順番|違和感|輪郭|本質|構造|状態|感覚|意識|自分軸|エネルギー|"
     r"タイミング|バランス|ステージ|フェーズ|方向性|可能性|選択肢|価値観|"
     r"距離感|温度感|解像度",
     "抽象名詞。読者が生活で口に出す言葉に置き換える", 1),

    # --- スピリチュアル語：世界観と衝突（voice.md 2-2）---
    (r"宇宙|波動|引き寄せ|魂|本来のあなた|ステージが上が|浄化|覚醒|"
     r"潜在意識|ハイヤーセルフ|ご縁|メッセージが届",
     "スピリチュアル語。設計書11章の世界観と衝突する", 0),

    # --- 構造予告：骨組みを読者に見せない（voice.md 1-②）---
    (r"聞きたいのは|大事なのは|ポイントは|理由は[0-9一二三四五]|まとめると|"
     r"要するに|整理すると|結論から言うと",
     "構造の予告。**直後が抽象語なら✕、具体的な台詞なら◯**（voice.md 1-②）", 1),

    # --- 対句の連発（voice.md 1-③）---
    (r"ではなく|じゃなくて|ではありません|じゃない[。、]",
     "「〜ではなく、〜です」の対句。1投稿1回まで", 1),

    # --- 敬体の詰問（voice.md 1-④）---
    (r"ますか[。？?]|ませんか[。？?]",
     "敬体の疑問で読者を診断している。1投稿2回まで", 2),

    # --- AI定番の接続・文末（voice.md 2-4）---
    (r"とはいえ|一方で|そして何より|という観点|だなと感じ|"
     r"ではないでしょうか|と言えるでしょう",
     "AI定番の接続・文末", 0),

    # --- 予言・断定（設計書 禁止事項）---
    (r"でしょう|はずです|必ず[^ず]|絶対に",
     "予言口調・断定。占いとしてやらない", 0),
]

# 三点の番号列挙（voice.md 3）
ENUM = re.compile(r"[①②③]")

# 日本語の文章に混入してはいけない他言語の文字。
# 2026-09-07、生成中に「три日ほど」「высшая自己」とロシア語が混入した事故への対策。
# 概念は合っているのに表層形だけ別言語になる（3→три、higher→высшая）ため、
# 読み流すと気づかない。機械で必ず弾く。
FOREIGN_SCRIPTS = [
    (r"[Ѐ-ӿ]", "キリル文字（ロシア語等）"),
    (r"[Ͱ-Ͽ]", "ギリシャ文字"),
    (r"[가-힯ᄀ-ᇿ]", "ハングル"),
    (r"[฀-๿]", "タイ文字"),
    (r"[؀-ۿ]", "アラビア文字"),
    (r"[ऀ-ॿ]", "デーヴァナーガリー"),
    (r"[À-ÖØ-öø-ÿ]", "ラテン拡張（アクセント付き）"),  # × ÷ は数学記号なので除外
]

ABSTRACT_HINT = {
    "空白": "予定が空いてる／手をつけてない",
    "順番": "どれから",
    "違和感": "なんか変",
    "可能性": "〜かもしれない",
    "タイミング": "いつやるか",
}


def extract_body(text):
    """カルーセル本文・キャプション・1枚目 のセクションだけを (行番号, 本文) で返す。"""
    out = []
    active = False
    in_meta = False
    for i, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip()
        if line.startswith("## "):
            active = bool(re.search(r"カルーセル|キャプション|1枚目", line))
            continue
        if not active:
            continue
        if line.startswith("#"):
            continue
        # 表・メタ情報・注記・コードフェンス記号は本文ではない
        if not line or line.startswith(("|", "```", "※", "- **", "**", "---", "🔺")):
            continue
        if "要事実確認" in line or line.startswith("〔"):
            continue
        # ハッシュタグ行は文体判定の対象外
        if line.lstrip().startswith("#") or line.count("#") >= 3:
            continue
        line = re.sub(r"^>\s?", "", line)          # 引用記号
        line = re.sub(r"^[-*]\s+", "", line)       # 箇条書き記号
        out.append((i, line))
    return out


def sentences(body):
    """(行番号, 文) のリスト。"""
    res = []
    for ln, line in body:
        for s in re.split(r"(?<=[。！？])", line):
            s = s.strip()
            if s:
                res.append((ln, s))
    return res


def main():
    if len(sys.argv) < 2:
        print("usage: python check_ig.py <投稿ファイル.md>")
        return 2
    path = Path(sys.argv[1])
    text = io.open(path, encoding="utf-8").read()
    body = extract_body(text)
    if not body:
        print("本文セクション（## カルーセル本文 / ## キャプション）が見つかりません。")
        return 2

    joined = "\n".join(l for _, l in body)
    sents = sentences(body)

    errors, warns = [], []

    # --- 回数制限ルール ---
    for pat, why, allow in RULES:
        hits = []
        for ln, line in body:
            for m in re.finditer(pat, line):
                hits.append((ln, m.group(0), line))
        if len(hits) > allow:
            bucket = errors if allow == 0 else warns
            head = f"{why}（{len(hits)}件／許容{allow}）"
            detail = [f"    L{ln}: 「{w}」  {line[:38]}" for ln, w, line in hits[: allow + 4]]
            bucket.append(head + "\n" + "\n".join(detail))

    # --- 他言語文字の混入（文体以前の事故。全文を見る） ---
    for i, raw in enumerate(text.splitlines(), 1):
        for pat, name in FOREIGN_SCRIPTS:
            found = re.findall(pat, raw)
            if found:
                errors.append(
                    f"{name}が混入している  L{i}: 「{''.join(found)}」  {raw.strip()[:40]}"
                )

    # --- 三点の番号列挙 ---
    if len(set(ENUM.findall(joined))) >= 3:
        errors.append("三点の番号列挙（①②③）。地の文に崩す（voice.md 3）")

    # --- 文末の単調さ ---
    run, prev = 0, None
    for ln, s in sents:
        end = "です。" if s.endswith("です。") else ("ます。" if s.endswith("ます。") else None)
        if end and end == prev:
            run += 1
            if run >= 2:
                warns.append(f"文末「{end}」が3回以上連続（L{ln}付近）。1つ崩す")
                run = 0
        else:
            run = 0
        prev = end

    # --- 短文が混ざっているか ---
    lengths = [len(s) for _, s in sents]
    if lengths:
        short = [n for n in lengths if n <= 15]
        if len(short) < max(2, len(lengths) // 8):
            warns.append(
                f"短文（15字以下）が{len(short)}文しかない。"
                "全部が同じ長さだと機械に見える（voice.md 3）"
            )

    # --- 出力 ---
    print(f"■ {path.name}")
    print(f"  文数 {len(lengths)} / 平均 {statistics.mean(lengths):.1f}字 / "
          f"最短 {min(lengths)} / 最長 {max(lengths)}")
    print()

    if errors:
        print("✕ 直す（voice.md 違反）")
        for e in errors:
            print("  - " + e)
        print()
    if warns:
        print("△ 見直す")
        for w in warns:
            print("  - " + w)
        print()

    hints = [f"「{k}」→ {v}" for k, v in ABSTRACT_HINT.items() if k in joined]
    if hints:
        print("言い換えの当たり:")
        for h in hints:
            print("  " + h)
        print()

    if not errors and not warns:
        print("機械チェックは通過。最後に声に出して読むこと。")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
