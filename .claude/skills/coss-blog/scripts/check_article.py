#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""COSSブログ記事の品質チェック。

usage: python check_article.py <article.md|article.html> [--keyword キーワード]

キーワード管理表の品質チェックシートの項目を機械判定できる範囲で自動化する。
段落の長さのバラツキなど機械で拾えない項目は references/ai-humanize.md の
最終チェックリストで目視確認すること。
"""
import argparse
import itertools
import re
import sys
from pathlib import Path

# Windowsコンソール(cp932)でも日本語・記号を落とさずに出力する
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

GAP = "[^" + "。、" + "\n" + "]{0,6}?"  # 語間に最大6文字を許す（句読点・改行は跨がない）

# NG表現: (パターン, 説明, 許容回数)
NG_PHRASES = [
    (r"安心してください", "AIの定番の読者なだめフレーズ", 0),
    (r"さあ、", "AIの締め・呼びかけの定番", 0),
    (r"一緒に[^。]{0,12}(しましょう|しよう)", "仲間感の演出がAIっぽい", 0),
    (r"見ていきましょう", "読む前に予告するAIの癖", 0),
    (r"解説していきます", "読む前に予告するAIの癖", 0),
    (r"そんなときに便利なのが", "AI商品紹介の定番導入", 0),
    (r"はずです", "根拠のない断言。「〜ことが多い」に置き換える", 0),
    (r"内側と外側の両方", "バランス感が作られすぎ", 0),
    (r"多角的に|多面的に", "曖昧なAI修飾語", 0),
    (r"——|――", "ダッシュ。読点か句点で切る", 0),
    (r"私たちCOSSでは", "AIっぽい企業主語の商品紹介", 0),
    (r"ですよね[？?]", "多用はAIっぽい（2回まで）", 2),
    (r"からこそ", "多用はAIっぽい（1回まで）", 1),
    (r"絶対|必ず", "断定の多用を避ける（2回まで）", 2),
]

# 薬機・表現リスクのある語
RISK_PHRASES = [
    (r"簡単に痩せ", "根拠のない効果訴求"),
    (r"すぐに効果が出", "根拠のない効果訴求"),
    (r"これだけでOK", "根拠のない効果訴求"),
]

CLOSING_NG = [
    r"輝くはずです", r"輝きます", r"一歩を踏み出",
    r"新しい自分に", r"出会えるはずです",
]


def strip_html(text):
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<(script|style).*?</\1>", "", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", "\n", text)
    return text


def body_chars(text):
    """本文の文字数。空白・改行・記号を除いた実質量に近づける。"""
    t = re.sub(r"\s+", "", text)
    return len(t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--keyword", "-k", default=None, help="SEOキーワード（出現回数を数える）")
    args = ap.parse_args()

    p = Path(args.path)
    if not p.exists():
        print(f"ファイルが見つかりません: {p}")
        return 2

    raw = p.read_text(encoding="utf-8", errors="replace")
    is_html = p.suffix.lower() in (".html", ".htm")

    if is_html:
        h1 = re.findall(r"<h1[^>]*>(.*?)</h1>", raw, re.I | re.S)
        h2 = re.findall(r"<h2[^>]*>(.*?)</h2>", raw, re.I | re.S)
        h3 = re.findall(r"<h3[^>]*>(.*?)</h3>", raw, re.I | re.S)
        text = strip_html(raw)
    else:
        h1 = re.findall(r"^# .+$", raw, re.M)
        h2 = re.findall(r"^## .+$", raw, re.M)
        h3 = re.findall(r"^### .+$", raw, re.M)
        text = raw

    errors, warns, oks = [], [], []

    # --- 文字数 ---
    n = body_chars(text)
    if 2500 <= n <= 3200:
        oks.append(f"文字数 {n}字（目標2,500〜3,000）")
    elif n < 2500:
        warns.append(f"文字数 {n}字 — 目標2,500字に不足（あと{2500 - n}字）")
    else:
        warns.append(f"文字数 {n}字 — 3,000字を超過")

    # --- 見出し構造 ---
    if is_html:
        oks.append(f"H2 {len(h2)}個 / H3 {len(h3)}個")
        if len(h2) < 5:
            warns.append(f"H2が{len(h2)}個 — 5〜6個が目安")
    else:
        if len(h1) != 1:
            errors.append(f"H1が{len(h1)}個 — 1個にする")
        else:
            oks.append("H1 1個")
        if len(h2) < 5:
            warns.append(f"H2が{len(h2)}個 — 5〜6個が目安")
        else:
            oks.append(f"H2 {len(h2)}個 / H3 {len(h3)}個")

    # --- 必須セクション ---
    heads = "\n".join(h2 + h3)
    if re.search(r"スキンケア|運動後|汗", heads):
        oks.append("運動後のケアセクションあり")
    else:
        errors.append("運動後のケアセクションが見当たらない（★必須）")

    if re.search(r"よくある質問|Q&A|FAQ", heads):
        oks.append("FAQセクションあり")
    else:
        errors.append("よくある質問セクションがない")

    if re.search(r"まとめ", heads):
        oks.append("まとめセクションあり")
    else:
        errors.append("まとめセクションがない")

    # --- 商品導線 ---
    if "COSS THE GEL" in text:
        oks.append("商品名の記載あり")
    else:
        errors.append("COSS THE GELへの言及がない")
    if "coss-the-gel-45g" in raw:
        oks.append("商品リンクあり")
    else:
        errors.append("商品ページへのリンク(/products/coss-the-gel-45g)がない")

    # --- 導入部の予告リスト ---
    if re.search(r"この記事で(分かる|わかる)こと", text):
        errors.append("「この記事で分かること」リストがある — v2では書かない")

    # --- NG表現 ---
    for pat, why, allow in NG_PHRASES:
        hits = re.findall(pat, text)
        if len(hits) > allow:
            msg = f"「{hits[0]}」×{len(hits)} — {why}"
            (errors if allow == 0 else warns).append(msg)

    for pat, why in RISK_PHRASES:
        if re.search(pat, text):
            errors.append(f"「{re.search(pat, text).group()}」 — {why}")

    # --- 締め ---
    tail = text.strip()[-300:]
    for pat in CLOSING_NG:
        if re.search(pat, tail):
            errors.append(f"締めが抽象的な応援になっている（「{re.search(pat, tail).group()}」）")
            break

    # --- まとめの箇条書き ---
    summary = ""
    m = re.split(r"(?:^|\n)#{2}\s*まとめ|<h2[^>]*>\s*まとめ", raw)
    if len(m) > 1:
        summary = m[-1]
        if re.search(r"^\s*[-*・✓]", summary, re.M) or re.search(r"<li", summary, re.I):
            errors.append("まとめが箇条書きになっている — 2〜3文の文章にする")
        else:
            oks.append("まとめは文章形式")

    # --- キーワード ---
    if args.keyword:
        # 管理表のキーワードは「ヨガ 効果」のような検索クエリ形式。
        # 本文では「ヨガ効果」と詰めたり「ヨガの効果」と助詞が挟まったりするので、
        # 完全一致・空白詰め・語間に数文字を許す緩い一致の3通りで数える。
        kw = args.keyword
        parts = [w for w in re.split(r"[\s　]+", kw) if w]
        kw_join = "".join(parts)
        if len(parts) > 1:
            # 日本語では修飾順が入れ替わる（「筋トレ 女性」→「女性の筋トレ」）ので
            # 語順の入れ替わりも数える
            alts = [GAP.join(re.escape(w) for w in perm)
                    for perm in itertools.permutations(parts)]
            loose = re.compile("|".join(alts))
            cnt = len(loose.findall(text))
        else:
            cnt = text.count(kw_join)
        if 8 <= cnt <= 12:
            oks.append(f"キーワード「{kw}」{cnt}回（目標8〜10回）")
        elif cnt < 8:
            warns.append(f"キーワード「{kw}」{cnt}回 — 8〜10回が目安")
        else:
            warns.append(f"キーワード「{kw}」{cnt}回 — 多すぎる可能性")
        if len(parts) > 1:
            in_h2 = sum(1 for h in h2 if loose.search(h))
        else:
            in_h2 = sum(1 for h in h2 if kw_join in h)
        if in_h2 == 0:
            warns.append(f"H2見出しにキーワード「{kw}」が入っていない")
        else:
            oks.append(f"H2見出しにキーワード {in_h2}個")

    # --- HTMLのみのチェック ---
    if is_html:
        # 末尾CTAブロック内のh3は規定テンプレートなので除外して判定する
        body_html = re.sub(
            r"<div style=\"background: ?#f9f9f9.*?</div>\s*$", "", raw, flags=re.S | re.I
        )
        styled = re.findall(r"<h[23][^>]*style=[^>]*>", body_html, re.I)
        if styled:
            errors.append(
                f"h2/h3にインラインスタイルが付いている（{len(styled)}箇所）: テーマ干渉の原因"
            )
        else:
            oks.append("h2/h3にインラインスタイルなし")
        if 'class="blog-article"' not in raw:
            errors.append('外側divが <div class="blog-article"> になっていない')
        if "COSS THE GELを見てみる" not in raw:
            warns.append("記事末尾CTAブロックが見当たらない")

    # --- 出力 ---
    print(f"\n=== {p.name} ===\n")
    if errors:
        print("■ 要修正")
        for e in errors:
            print(f"  x {e}")
        print()
    if warns:
        print("■ 確認")
        for w in warns:
            print(f"  ! {w}")
        print()
    if oks:
        print("■ OK")
        for o in oks:
            print(f"  o {o}")
        print()

    print("■ 目視で確認（機械では拾えない）")
    print("  - 各段落の長さにバラツキがあるか（全部同じ長さになっていないか）")
    print("  - 全セクションが同じ形式になっていないか")
    print("  - 商品紹介が場面描写→課題→紹介の流れになっているか")
    print("  - 具体性（「効果が期待できます」で止まっていないか）")
    print()

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
