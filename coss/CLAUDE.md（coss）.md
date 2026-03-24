# CLAUDE.md（プロジェクト個別設定）
# 場所: C:\Users\kaori_hoshino\Documents\claude\2026\coss\CLAUDE.md
# ※ プロジェクトごとにコピーして中身を書き換えて使う

## プロジェクト概要

- **クライアント**: COSS（ジェラス株式会社）
- **サイト**: https://coss-coss.jp（Shopify）
- **商品**: COSS THE GEL（オールインワンスキンケアジェル）
- **ターゲット**: アクティブな女性

## 重要URL・管理画面

- Shopify 管理画面: https://admin.shopify.com/store/coss-coss
- GA4: （プロパティID:278124128）
- Google Ads: （アカウントID:159-168-6080）
- Meta 広告: （ビジネスポートフォリオID:342428030597860）

## 技術的な注意事項

- テーマのコアファイルは直接編集しないこと（カスタマイズは `custom.js` / `custom.css` に集約）
- Shopify の新しいカスタマーアカウントシステム（`/account` ページ）はカスタマイズ不可
- SendWILL のポップアップは商品ページでは Liquid 条件分岐で非表示にすること
- Rakuten RMS の HTML は Rakuten のタグ制限内で記述すること

## 現在進行中のタスク

- [ ] （ここに作業中のタスクを書く）

## よく使うファイル・パス

- カスタムJS: `assets/custom.js`
- カスタムCSS: `assets/custom.css`
- ランディングページ: `templates/page.lp-xxx.json`

## 過去の重要な決定事項

- サブスク購入をデフォルト選択に変更済み（custom.jsで制御）
- 「建物名なし」チェックボックスを登録フォームに追加済み
