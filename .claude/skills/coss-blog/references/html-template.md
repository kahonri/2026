# Shopify用HTML変換ルール

出典: `coss/blog/backup/HTML変換用プロンプト_v2.md`
構造の実例: `coss/blog/pilates-shopify.html`（既存16記事のいずれでも可）

---

## 1. 基本構造

- すべてのMarkdownをHTMLに変換する
- 全体を `<div class="blog-article">` で囲む
- 段落は `<p>` タグ
- 見出しはそのまま `<h2>` `<h3>` を使う
- リストは `<ul>` `<ol>`
- **「この記事で分かること」ボックスは入れない**（v2記事はこのセクションを書かない）

---

## 2. セクション区切り

各H2セクションの間に挿入する。

```html
<hr style="margin: 40px 0; border: none; border-top: 1px solid #e0e0e0;">
```

---

## 3. 商品リンクの処理

Markdownの商品紹介テキストは**そのまま `<p>` タグに変換する**。
旧テンプレートの箇条書きボックスや「私たちCOSSでは〜を提供しています」の文章は差し込まない。

本文中に「COSS THE GEL（コスザゲル）」が登場したら:

```html
<a href="/products/coss-the-gel-45g" style="color: #ff6b35; font-weight: bold;">COSS THE GEL（コスザゲル）</a>
```

Markdownの `[詳しく見る →](/products/coss-the-gel-45g)` は:

```html
<p>
  <a href="/products/coss-the-gel-45g" style="color: #ff6b35; font-weight: bold; text-decoration: none;">
    詳しく見る →
  </a>
</p>
```

---

## 4. 画像プレースホルダー

画像が必要な箇所に挿入する。

```html
<!-- 画像X: [画像の説明] -->
<!-- 画像指示: [詳細な指示] -->
<!-- AI生成プロンプト: [英語プロンプト] -->
<!-- 推奨サイズ: 1200×630px -->
<div style="margin: 30px 0; text-align: center;">
  <img src="[画像Xをここに挿入]" alt="[alt属性]" style="max-width: 100%; height: auto; border-radius: 8px;">
</div>
```

---

## 5. 記事末尾CTA（まとめセクションの後）

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
    <a href="/products/coss-the-gel-45g" style="display: inline-block; background: #ff6b35; color: white; padding: 15px 40px; border-radius: 30px; text-decoration: none; font-weight: bold;">
      COSS THE GELを見てみる →
    </a>
  </div>
  <p style="font-size: 14px; color: #999; margin-bottom: 0;">¥1,980 / 約1ヶ月分</p>
</div>
```

---

## 6. スタイリング規約（Shopifyテーマ干渉防止）

- 外側divは必ず `<div class="blog-article">` のみ
- **h2・h3にインラインスタイルを付けない**
  - OK: `<h2>見出しテキスト</h2>`
  - NG: `<h2 style="font-family: ...">見出しテキスト</h2>`
- 全体の `font-family` / `font-size` / `color` を外側divに指定しない
- 重要情報の強調ボックスは `border-radius: 8px` で角丸
- リンク色は `#ff6b35`（COSSブランドカラー）
- レスポンシブ対応は `max-width: 100%`

---

## 7. 画像指示の書き方

画像指示は**HTMLコメントとして本文に埋め込む**。別ファイル（.txt など）に外出ししない。
記事とセットで動くほうが、あとから画像を差し替えるときに迷わない。

コメントに入れる項目:

| 項目 | 必須 | 内容 |
|------|------|------|
| `画像N:` | ○ | 何の画像か（アイキャッチ / 本文中のどのセクションか） |
| `画像指示:` | ○ | シーン・被写体・雰囲気を1〜3文で |
| `避けること:` | | NGな構図・被写体（あると外注・生成時に効く） |
| `カラートーン:` | | ブランドカラー #ff6b35 の入れ方など |
| `AI生成プロンプト:` | ○ | **英語**。Midjourney / DALL-E にそのまま渡せる形 |
| `推奨サイズ:` | ○ | アイキャッチ 1200×630px（OGP兼用）／本文中 1200×600px |

`alt` 属性は `<img>` タグ側に直接書く（SEO用に内容を説明する日本語で）。

記述例:

```html
<!-- 画像1: アイキャッチ / ジムに向かう女性 -->
<!-- 画像指示: ジムの入口付近・受付前など。30〜40代の女性、シンプルなTシャツ＋レギンス、前向きな表情。明るく開放的で「入りやすそう」な印象。 -->
<!-- 避けること: 筋肉質すぎる人物、暗い背景、ハードすぎるトレーニングシーン -->
<!-- AI生成プロンプト: A Japanese woman in her 30s walking into a bright modern gym entrance, wearing a simple t-shirt and leggings, positive relaxed expression, open airy space, natural lighting, photorealistic -->
<!-- 推奨サイズ: 1200×630px（OGP兼用も可） -->
<div style="margin: 30px 0; text-align: center;">
  <img src="[画像1をここに挿入]" alt="ジムに通い始めた女性のイメージ" style="max-width: 100%; height: auto; border-radius: 8px;">
</div>
```

---

## 8. Shopifyへの貼り付け手順

記事HTMLができたら、ユーザーに以下の手順を案内する。

1. Shopify管理画面でブログ記事の編集画面を開き、**HTMLモードに切り替える**
2. `{slug}-shopify.html` の内容をそのまま貼り付ける
3. `[画像Xをここに挿入]` を、ファイルマネージャーにアップ済みの画像URLに差し替える
4. プレビューで各セクションの余白・ボーダー・画像の表示を確認する

管理画面: https://admin.shopify.com/store/coss-coss
