#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""COSSブログ記事の品質チェック。

usage: python check_article.py <article.md|article.html> [--keyword キーワード] [--title タイトル]

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

# 薬機法・景表法リスクのある語（references/yakkihou.md）
# (パターン, 説明, 許容回数)
RISK_PHRASES = [
    (r"簡単に痩せ", "根拠のない効果訴求", 0),
    (r"すぐに効果が出", "根拠のない効果訴求", 0),
    (r"これだけでOK", "根拠のない効果訴求", 0),
    # --- 状態変化の断定 ---
    # 「改善しない場合は医療機関へ」のような否定形は正当な表現なので除外する
    (r"改善(され|する|でき|に直結)(?!ない|ず|なけれ)|改善し(?!ない|ず|なけれ)",
     "状態変化の断定。「〜と感じる人が多い」等に", 0),
    (r"治(り|る|す|せ)ま|完治", "医薬品的表現。化粧品では言えない", 0),
    (r"解消(され|する|し|でき)", "状態変化の断定。「〜が整いやすくなる」等に", 0),
    (r"(くすみ|シミ|しみ|たるみ|シワ|しわ)[がはを][^。]{0,10}"
     r"(取れ|消え|なくな|薄くな|改善|解消)", "見た目の改善の断定。化粧品では言えない", 0),
    (r"毛穴が(小さく|目立たなく|引き締ま)", "見た目の改善の断定", 0),
    (r"肌質が変わ", "状態変化の断定。「肌の調子の傾向が変わってきたと感じる」等に", 0),
    (r"(疲れ|むくみ|こり|肩こり|腰痛)[がはを][^。]{0,8}(取れ|消え|なくな)",
     "身体症状の改善の断定。「〜と感じる人が多い」等に", 0),
    (r"ハリが(出|戻|生ま)", "状態変化の断定。「ハリのある印象を保ちやすい」等に", 0),
    # --- 因果の直結 ---
    (r"血行[^。]{0,25}(肌|くすみ|美肌|ハリ|ツヤ|美容)", "身体機能と美容効果の因果直結", 0),
    (r"血流[^。]{0,25}(肌|くすみ|美肌|ハリ|ツヤ|美容)", "身体機能と美容効果の因果直結", 0),
    (r"代謝[^。]{0,20}(肌|美肌|くすみ)", "身体機能と美容効果の因果直結", 0),
    (r"ターンオーバーが(整|正常)", "断定。生活習慣の影響を受ける、程度にとどめる", 0),
    # --- 誤解を招く美容表現 ---
    (r"老廃物|デトックス|毒素", "科学的に不正確な美容表現。使わない", 0),
    (r"毛穴が(開|閉じ)", "科学的に不正確。「汗と皮脂が肌に残った状態」に", 0),
    (r"(?<!角層まで)浸透し", "化粧品では範囲を明記する。「角層までうるおいを与える」に", 0),
    (r"殺菌|除菌|抗菌", "化粧品では言えない。「肌を清潔に保つ」に", 0),
    (r"(肌が)?(再生|若返)", "医薬品的表現。使わない", 0),
]

# 一般論の断定・煽り・口語（references/yakkihou.md「断定を外す」, ai-humanize.md）
ASSERT_NG = [
    # FAQの質問文「〜した方がいいですか？」は断定ではないので除外する
    (r"(方|ほう)がいいです(?!か)", "「〜しておくと安心です」「〜という方法もあります」に"),
    (r"が正解です", "「〜がひとつの目安です」に"),
    (r"が最適です|が理想です", "「自分に合う方法を見つけましょう」に"),
    (r"逆効果", "「〜につながることがあります」に"),
    (r"を防げます|を防ぐことができます", "「〜の負担を減らせます」に"),
    (r"妥協しない|ケチらない|省かない", "煽り表現。見出しにも使わない"),
    (r"でも大丈夫。|わかります。|正直しんどい|地味に効き|これだけです。",
     "馴れ馴れしい口語。丁寧語を崩さない"),
    (r"想像以上", "不安を煽る表現。使わない"),
]

# 病名・診断名（references/evidence-rules.md）
DISEASE = (r"腸脛靭帯炎|膝蓋骨軟骨症|ランナーズニー|シンスプリント|足底腱膜炎|"
           r"疲労骨折|脂漏性皮膚炎|アトピー性皮膚炎")

# 本文中で2回以上出したくない出典の機関名（references/evidence-rules.md）
SOURCE_ORGS = [
    "健康づくりのための身体活動", "日本人の食事摂取基準", "日本臨床スポーツ医学会",
    "日本スポーツ協会", "Mayo Clinic", "米国皮膚科学会", "米国スポーツ医学会",
    "英国国民保健サービス", "e-ヘルスネット", "NCCIH", "米国国立補完統合衛生センター",
    "British Journal", "PeerJ", "Frontiers in Psychiatry", "Sports Medicine - Open",
    "Clinical, Cosmetic",
]

# 出典があるとみなす語（この語が同じ文にあれば、数値に根拠があると判定する）
# 注番号（※1 など）が同じ文にあれば、記事末の参考資料で根拠が担保されているとみなす。
# 機関名を本文に書かない方針（references/evidence-rules.md）に対応するための判定。
SOURCE_MARK = (r"※\s*\d|厚生労働省|消費者庁|環境省|NHS|国民保健サービス|Mayo|学会|協会|"
               r"研究|レビュー|報告|ガイド|基準|大学|プログラム|Clinic|Academy|College")

# 俗説として打ち消している数値（「1000kcalという宣伝には裏づけがない」等）は
# 出典なしの数値ではないので除外する
DEBUNK_MARK = r"裏づけ|裏付け|根拠がない|わけではありません|一概には言えません|限りません"

# 出典なしで書いてはいけない数値のパターン
NUM_PATS = [
    (r"\d+\s*[〜~ー–—-]\s*\d+\s*(分|回|日|週間|ヶ月|か月|kcal|km|kg|℃|g|円|%)", "範囲つきの数値"),
    (r"週\s*\d+\s*[〜~ー–—-]?\s*\d*\s*(回|日)", "頻度の数値"),
    (r"キロ\s*\d+\s*分", "ペースの数値"),
    (r"\d+\s*kcal", "カロリーの数値"),
]

CLOSING_NG = [
    r"輝くはずです", r"輝きます", r"一歩を踏み出",
    r"新しい自分に", r"出会えるはずです",
]

KANSUJI = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
           "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def strip_html(text):
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<(script|style).*?</\1>", "", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", "\n", text)
    return text


def body_chars(text):
    """本文の文字数。空白・改行・記号を除いた実質量に近づける。"""
    t = re.sub(r"\s+", "", text)
    return len(t)


def to_int(s):
    """「7」「七」を int にする。それ以外は None。"""
    s = s.strip()
    if s.isdigit():
        return int(s)
    if s in KANSUJI:
        return KANSUJI[s]
    return None


def numbers_in(s):
    """文字列に含まれる「N個」「Nつ」「N選」「Nステップ」等の N を拾う。"""
    out = []
    for m in re.finditer(r"([0-9０-９一二三四五六七八九十]+)\s*(つ|個|選|の(?:こと|ポイント|習慣|変化|理由|ステップ)|ステップ)", s):
        raw = m.group(1).translate(str.maketrans("０１２３４５６７８９", "0123456789"))
        v = to_int(raw)
        if v is not None:
            out.append(v)
    return out


def check_numbers(title, headings):
    """タイトルの数字と、見出しに出てくる別の数字の食い違いを検出する。

    「7つのこと」の記事に「3つの変化」があると、読者は何個の話か分からなくなる。
    """
    issues = []
    tnums = set(numbers_in(title))
    if not tnums:
        return issues
    for h in headings:
        # 「1. 服装は〜」のような連番見出しは対象外
        if re.match(r"^\s*[0-9０-９]+\s*[.．、]", h):
            continue
        for v in numbers_in(h):
            if v not in tnums:
                issues.append(
                    f"タイトルの数字{sorted(tnums)}と別の数字が見出しに出ている: 「{h}」"
                )
    return issues


def sentence_of(text, m):
    """マッチした箇所を含む一文を返す（エラー表示の文脈用）。"""
    start = text.rfind("。", 0, m.start()) + 1
    end = text.find("。", m.end())
    if end == -1:
        end = len(text)
    else:
        end += 1
    return re.sub(r"\s+", "", text[start:end])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--keyword", "-k", default=None, help="SEOキーワード（出現回数を数える）")
    ap.add_argument("--title", "-t", default=None,
                    help="記事タイトル（数字見出しの整合を判定する）")
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
    if 2500 <= n <= 4000:
        oks.append(f"文字数 {n}字（目標2,500〜4,000）")
    elif n < 2500:
        warns.append(f"文字数 {n}字 — 目標2,500字に不足（あと{2500 - n}字）")
    else:
        warns.append(f"文字数 {n}字 — 4,000字を超過")

    # --- 見出し構造 ---
    if is_html:
        oks.append(f"H2 {len(h2)}個 / H3 {len(h3)}個")
        if len(h2) < 5:
            warns.append(f"H2が{len(h2)}個 — 5〜7個が目安（参考資料を含む）")
    else:
        if len(h1) != 1:
            errors.append(f"H1が{len(h1)}個 — 1個にする")
        else:
            oks.append("H1 1個")
        if len(h2) < 5:
            warns.append(f"H2が{len(h2)}個 — 5〜7個が目安（参考資料を含む）")
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

    # --- 参考資料・免責注記（references/evidence-rules.md）---
    if re.search(r"参考資料", heads):
        oks.append("参考資料セクションあり")
    else:
        errors.append("参考資料セクションがない — まとめの後、記事末尾CTAの前に必須")

    if "本記事で紹介している" in text and "医療機関" in text:
        oks.append("免責注記あり")
    else:
        errors.append("免責注記がない — evidence-rules.md の定型文を入れる")

    # 参考資料より前を「本文」とみなす（出典の重複・数値チェックの対象）
    body_only = text.split("参考資料")[0]

    # --- 本文に機関名が残っていないか（注番号方式） ---
    named = [org for org in SOURCE_ORGS if org in body_only]
    if named:
        for org in named:
            errors.append(
                f"本文中に機関名「{org}」がある — 削除し、"
                "一般表現＋注番号（※N）にして記事末の参考資料で担保する"
            )
    else:
        oks.append("本文に機関名なし（注番号方式）")

    # --- 注番号と参考資料の対応 ---
    used = sorted({int(x) for x in re.findall(r"※\s*(\d+)", body_only)})
    listed = sorted({int(x) for x in re.findall(r"※\s*(\d+)\s", text.split("参考資料")[-1])})
    if used:
        missing = [n for n in used if n not in listed]
        if missing:
            errors.append(f"本文の注番号 {missing} に対応する参考資料がない")
        unused = [n for n in listed if n not in used]
        if unused:
            warns.append(f"参考資料の ※{unused} が本文から参照されていない")
        if not missing and not unused:
            oks.append(f"注番号 {used} と参考資料が対応")
    else:
        warns.append("本文に注番号（※N）がない — 出典の対応がとれていない可能性")

    # --- 出典のない具体的な数値 ---
    seen = set()
    for pat, label in NUM_PATS:
        for mm in re.finditer(pat, body_only):
            val = mm.group().strip()
            if val in seen:
                continue
            sent = sentence_of(body_only, mm)
            if not re.search(SOURCE_MARK, sent) and not re.search(DEBUNK_MARK, sent):
                seen.add(val)
                warns.append(
                    f"出典なしの{label}「{val}」 — 出典とセットにするか粒度を落とす\n"
                    f"        …{sent[:70]}…"
                )
    if not seen:
        oks.append("出典なしの具体的な数値なし")

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

    # --- 薬機法・景表法 ---
    for pat, why, allow in RISK_PHRASES:
        hits = list(re.finditer(pat, text))
        if len(hits) > allow:
            errors.append(
                f"[薬機] 「{hits[0].group()}」×{len(hits)} — {why}\n"
                f"        …{sentence_of(text, hits[0])[:70]}…"
            )

    # --- 一般論の断定・煽り・口語 ---
    for pat, hint in ASSERT_NG:
        mm = re.search(pat, text)
        if mm:
            errors.append(
                f"[断定] 「{mm.group()}」 — {hint}\n"
                f"        …{sentence_of(text, mm)[:70]}…"
            )

    # --- 病名・診断名 ---
    mm = re.search(DISEASE, text)
    if mm:
        errors.append(
            f"[病名] 「{mm.group()}」 — 病名は書かない。"
            "「受診すべきサインの列挙 → 医療機関へ」の型にする"
        )

    # --- 締め ---
    tail = text.strip()[-300:]
    for pat in CLOSING_NG:
        if re.search(pat, tail):
            errors.append(f"締めが抽象的な応援になっている（「{re.search(pat, tail).group()}」）")
            break

    # --- まとめの箇条書き ---
    m = re.split(r"(?:^|\n)#{2}\s*まとめ|<h2[^>]*>\s*まとめ", raw)
    if len(m) > 1:
        summary = m[-1]
        # まとめの後ろには参考資料セクションが続く。次の見出しで打ち切らないと
        # 参考資料の <li> を「まとめの箇条書き」と誤判定する。
        cut = re.search(r"(?:^|\n)##\s|<h2[^>]*>", summary)
        if cut:
            summary = summary[:cut.start()]
        if re.search(r"^\s*[-*・✓]", summary, re.M) or re.search(r"<li", summary, re.I):
            errors.append("まとめが箇条書きになっている — 2〜3文の文章にする")
        else:
            oks.append("まとめは文章形式")

    # --- 数字見出しの整合 ---
    title_src = args.title or (h1[0] if h1 else "")
    title_src = re.sub(r"^#\s*", "", strip_html(title_src)).strip()
    all_heads = [re.sub(r"\s+", " ", strip_html(h)).strip() for h in (h2 + h3)]
    if title_src:
        num_issues = check_numbers(title_src, all_heads)
        if num_issues:
            for i in num_issues:
                errors.append(i)
        else:
            oks.append("タイトルと見出しの数字に食い違いなし")
    else:
        warns.append("タイトル未指定 — 数字見出しの整合は未チェック（--title で渡す）")

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
        # 完全一致の回数を稼ぐと不自然な繰り返しになりAI文体に近づく。
        # 主語（第1語）が十分に出ていれば密度は足りているとみなし、
        # ペアは「要所に置けているか」で判定する。
        head = parts[0]
        head_cnt = text.count(head)
        if head_cnt >= 8:
            oks.append(f"主語「{head}」{head_cnt}回")
        else:
            warns.append(f"主語「{head}」{head_cnt}回 — 8回以上が目安")
        if cnt >= 3:
            oks.append(f"キーワード「{kw}」{cnt}回")
        else:
            warns.append(f"キーワード「{kw}」{cnt}回 — 見出し・導入・まとめの3箇所には置きたい")
        if head_cnt >= 20:
            warns.append(f"主語「{head}」{head_cnt}回 — 繰り返しが多く不自然になっていないか確認")
        if len(parts) > 1:
            in_h2 = sum(1 for h in h2 if loose.search(h))
        else:
            in_h2 = sum(1 for h in h2 if kw_join in h)
        if in_h2 == 0:
            errors.append(f"H2見出しにキーワード「{kw}」が入っていない（必須）")
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
        if "運動後のスキンケアを、シンプルに" not in raw and "COSS THE GELを見てみる" in raw:
            warns.append("CTA見出しが最新の文言（運動後のスキンケアを、シンプルに）になっていない")

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
    print("  - [根拠] 主要な主張に出典があるか／出典は5年以内か")
    print("  - [根拠] 出典に書いていないことを、その出典の名前で書いていないか")
    print("  - [根拠] 俗説の打ち消しが1〜2箇所入っているか")
    print("  - [薬機] 肌や体の状態が「変わる」と断定していないか")
    print("  - [薬機] 身体機能（血行・代謝）と美容効果を「だから」でつないでいないか")
    print("  - [薬機] 化粧品の説明が「整える・保つ・うるおいを与える」の範囲か")
    print()

    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
