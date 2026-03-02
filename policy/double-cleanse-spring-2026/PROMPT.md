# ダブル洗顔春2026 LP コーディング指示

## 概要
FigmaデザインをもとにLPを静的HTML/CSSで実装してください。
デスクトップ・モバイル両対応のレスポンシブ対応が必要です。

---

## ファイル構成

以下の構成でファイルを作成してください：

```
double-cleanse-spring-2026/
├── index.html
├── css/
│   ├── variables.css   ← デザイントークンをCSS変数で定義
│   ├── base.css        ← リセット・共通スタイル
│   └── style.css       ← ページスタイル
└── images/             ← 既存の画像フォルダをそのまま使用
```

---

## デザイントークン（variables.cssに定義すること）

### カラー
```css
:root {
  /* テキスト */
  --color-text-primary: #555555;
  --color-text-eyecatch: #ffffff;
  --color-text-cta: #ffffff;
  --color-text-data01: #EB6972;
  --color-text-data02: #55B5AE;

  /* 背景 */
  --color-bg-cta: #eb5600;
  --color-bg-empathy: #dfdfdf;
  --color-bg-eyecatch: #d9b783;
  --color-bg-cta2: #ffd4bf;
  --color-bg-faq: #f2ece0;
  --color-bg-datatitle: #f2ece0;
  --color-bg-company: #f2ece0;

  /* ライン */
  --color-line: #999999;
}
```

### タイポグラフィ（PC）
```css
:root {
  --font-family-base: 'Inter', sans-serif;

  --font-size-h1: 100px;
  --font-size-h2: 55px;
  --font-size-h3: 48px;
  --font-size-body: 36px;
  --font-size-note: 24px;

  --font-weight-bold: 700;
  --font-weight-regular: 400;

  --line-height-h2: 80px;
  --line-height-h3: 80px;
  --line-height-body: 65%;
  --line-height-auto: auto;

  --letter-spacing-wide: 0.03em;
  --letter-spacing-normal: 0.02em;
}
```

### タイポグラフィ（SP：max-width: 768px）
```css
@media (max-width: 768px) {
  :root {
    --font-size-h1: 50px;
    --font-size-h2: 25px;
    --font-size-h3: 24px;
    --font-size-body: 16px;
    --font-size-note: 12px;

    --line-height-h2: 32px;
    --line-height-h3: 32px;
  }
}
```

### スペーシング
```css
:root {
  --space-4: 4px;
  --space-8: 8px;
  --space-12: 12px;
  --space-16: 16px;
  --space-24: 24px;
  --space-32: 32px;
  --space-48: 48px;
  --space-80: 80px;
}
```

### ボーダー半径
```css
:root {
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-full: 100px;
}
```

---

## 画像一覧

以下の画像ファイルを `images/` フォルダから参照してください：

| ファイル名 | 用途 |
|-----------|------|
| `hero-mv.png` | ヒーローセクション メインビジュアル |
| `empathy-image01.png` | 共感セクション 画像1 |
| `empathy-image02.png` | 共感セクション 画像2 |
| `empathy-image03.png` | 共感セクション 画像3 |
| `education-image.png` | 教育セクション メイン画像 |
| `education-chart.png` | 教育セクション チャート |
| `data-image01.png` | データセクション 画像1 |
| `data-image02.png` | データセクション 画像2 |
| `product01-image.png` | 商品1 画像 |
| `product01-chart.png` | 商品1 チャート |
| `product02-image.png` | 商品2 画像 |
| `product02-chart.png` | 商品2 チャート |
| `cta-image.png` | CTAセクション 画像 |
| `company-image.png` | 会社紹介セクション 画像 |

---

## 実装ルール

- **CSS変数**：上記variables.cssのトークンを必ず使用すること（直接値を書かない）
- **レスポンシブ**：モバイルファースト、ブレイクポイントは `768px`
- **フォント**：Google Fonts から Inter を読み込む
- **画像**：`<img>` タグに `alt` 属性を必ず記述
- **クラス命名**：BEM記法（例：`.section__title`、`.card__image`）
- **セクションID**：各セクションに `id` を付与（ページ内リンク対応）
- **文字コード**：UTF-8

---

## セクション構成

Figmaのレイヤー名に基づき、以下のセクション順で実装してください：

1. **S01_Hero+TopCTA** (`#s01-hero`) - hero-mv.png 使用
2. **S02_Empathy** (`#s02-empathy`) - empathy-image01〜03 使用、背景色: `--color-bg-empathy`
3. **S03_Education** (`#s03-education`) - education-image、education-chart 使用
4. **S04_ProductSteps** (`#s04-product-steps`) - product01-image、product01-chart、product02-image、product02-chart 使用
5. **S05_BrandTrust** (`#s05-brand-trust`) - company-image 使用、背景色: `--color-bg-company`
6. **S06_DataProof** (`#s06-data-proof`) - data-image01〜02 使用、背景色: `--color-bg-datatitle`
7. **S07_FAQ** (`#s07-faq`) - 背景色: `--color-bg-faq`
8. **S08_CTA** (`#s08-cta`) - cta-image 使用、背景色: `--color-bg-cta`、テキスト色: `--color-text-cta`
9. **S09_FOOTER** (`#s09-footer`)

---

## その他

- Figmaデザインの詳細（テキスト内容・細かいレイアウト）は別途スクリーンショットを提供します
- まずHTMLの骨格とvariables.cssを先に作成し、確認後にスタイルを肉付けしてください
