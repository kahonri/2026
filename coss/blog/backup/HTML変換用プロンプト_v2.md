# Shopify用HTML変換プロンプト v2

MarkdownのブログをShopify用HTMLに変換します。

## 変更点（v1からの差分）

- 商品紹介HTMLを**Markdown本文をそのまま変換する形式**に変更（旧: 「COSS THE GELの特徴:」箇条書きボックスを差し込む形式）
- 「この記事で分かること」ボックスを**削除**（v2記事はこのセクションを書かない）

---

## 🎯 使い方

**入力するもの：** Markdown形式の記事全文（記事執筆プロンプト v2 で生成したもの）

**出力されるもの：**
- Shopify用HTML（コピペ可能）
- 画像指示書（AI生成プロンプト付き）

---

## 📋 プロンプト本体（ここからコピー）

以下のMarkdown記事をShopify用HTMLに変換してください。

---

## 変換ルール

### 1. 基本構造

- すべてのMarkdownをHTMLに変換する
- `<div class="blog-article">` で全体を囲む
- 段落は `<p>` タグ
- 見出しはそのまま `<h2>`, `<h3>` を使用
- リストは `<ul>`, `<ol>` を使用

### 2. セクション区切り

各H2セクションの間に `<hr>` を挿入：

```html
<hr style="margin: 40px 0; border: none; border-top: 1px solid #e0e0e0;">
```

### 3. 商品リンクの処理（重要・v2変更箇所）

Markdownの商品紹介テキストは**そのまま `<p>` タグに変換する**こと。
旧テンプレートの箇条書きボックスや「私たちCOSSでは〜を提供しています」の文章は**差し込まない**。

**COSS THE GEL（コスザゲル）というテキストが本文中に登場した場合：**

```html
<a href="/products/coss-the-gel-45g" style="color: #ff6b35; font-weight: bold;">COSS THE GEL（コスザゲル）</a>
```

**Markdownの `[詳しく見る →](/products/coss-the-gel-45g)` は以下に変換：**

```html
<p>
  <a href="/products/coss-the-gel-45g" style="color: #ff6b35; font-weight: bold; text-decoration: none;">
    詳しく見る →
  </a>
</p>
```

### 4. 画像プレースホルダー

画像が必要な箇所に以下を挿入：

```html
<!-- 画像X: [画像の説明] -->
<!-- 画像指示: [詳細な指示] -->
<!-- 推奨サイズ: [サイズ] -->
<div style="margin: 30px 0; text-align: center;">
  <img src="[画像Xをここに挿入]" alt="[alt属性]" style="max-width: 100%; height: auto; border-radius: 8px;">
</div>
```

### 5. 記事末尾CTA（まとめセクションの後に追加）

```html
<hr style="margin: 40px 0; border: none; border-top: 1px solid #e0e0e0;">

<div style="background: #f9f9f9; padding: 30px; border-radius: 10px; margin: 40px 0; text-align: center;">
  <h3 style="color: #333; margin-top: 0;">運動×美容を両立したいあなたへ</h3>
  <p style="color: #666; line-height: 1.8;">
    運動後の肌は毛穴が開き、乾燥しやすい状態。<br>
    でも、忙しい中でスキンケアの時間は取れない。
  </p>
  <p style="font-weight: bold; font-size: 20px; color: #ff6b35; margin: 25px 0;">
    運動後のスキンケア、1本で完結
  </p>
  <div style="margin: 25px 0;">
    <a href="/products/coss-the-gel-45g" style="
      display: inline-block;
      background: #ff6b35;
      color: white;
      padding: 15px 40px;
      border-radius: 30px;
      text-decoration: none;
      font-weight: bold;
    ">
      COSS THE GELを見てみる →
    </a>
  </div>
  <p style="font-size: 14px; color: #999; margin-bottom: 0;">
    ¥1,980 / 約1ヶ月分
  </p>
</div>
```

### 6. スタイリングルール（Shopifyテーマ干渉防止）

```
■ 外側divは必ず以下のみ：
  <div class="blog-article">

■ h2・h3にはインラインスタイルを付けない：
  ✅ <h2>見出しテキスト</h2>
  ❌ <h2 style="font-family: ...">見出しテキスト</h2>

■ 全体のfont-family・font-size・colorは外側divに指定しない

■ 重要情報の強調ボックス：border-radius: 8px で角丸
■ リンク色：#ff6b35（COSSブランドカラー）
■ レスポンシブ対応：max-width: 100%
```

---

## 画像指示書の生成ルール

HTMLと合わせて、以下の形式で画像指示書を出力してください：

```
【画像指示書】

画像1：[挿入箇所のH2見出し名]
- 内容：[何を写した画像か]
- イメージ：[具体的なビジュアルイメージ]
- AI生成プロンプト（英語）：[Midjourney/DALL-E用プロンプト]
- 推奨サイズ：1200×630px
- alt属性：[SEO用alt文]

画像2：...
```

---

## [Markdownをここに貼り付け]
