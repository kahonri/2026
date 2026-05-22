# COSS 売上・広告レポートシステム — Claude用コンテキスト

このドキュメントをブラウザ版Claudeとの会話の冒頭に貼り付けてください。

---

## システム概要

COSSブランドの売上・広告データを自動集計するGoogle Sheets + Apps Scriptシステムです。
GA4・Shopify APIは自動取得、Amazon/楽天はCSVをDriveにアップロードして取り込みます。

## 主要リソース

| 項目 | 値 |
|------|-----|
| スプレッドシート | https://docs.google.com/spreadsheets/d/1-nmlC2t0aKB0_r5r8HZHBfUqXZl0d9DAKE5P0QThyYs/edit |
| Apps Script | https://script.google.com/u/0/home/projects/1vDBd8Bi6Jr7gJyVkgkBbcEBJgeBMGKiOYsGFzs2cTvUdTlc2UNRhVqDr/edit |
| Shopifyドメイン | coss-ec.myshopify.com |

## シート構成

| シート名 | 用途 |
|---------|------|
| ⚙️ 設定 | GA4 ID・DriveフォルダID等 |
| 📥 Amazon_日別 | Amazon売上CSV取込先 |
| 📥 楽天_日別 | 楽天売上CSV取込先（ヘッダー4行目） |
| 📥 Amazon広告_日別 | Amazon広告CSV取込先 |
| 📥 楽天RPP_日別 | 楽天RPP広告CSV取込先（ヘッダー9行目） |
| 📥 楽天クーポンAD_日別 | 楽天クーポン広告CSV取込先 |
| 📊 週次レポート | 最新週のKPIレポート（実行のたび上書き） |
| 📊 月次レポート | 最新月のKPIレポート（実行のたび上書き） |
| 📋 週次履歴 | 全週分の累積ログ（追記のみ） |
| 📋 月次履歴 | 全月分の累積ログ |
| Shopify_注文明細 | 注文ごとの詳細 |
| Shopify_週次売上 | Shopify週次集計 |
| Shopify_月次売上 | Shopify月次集計 |

## データソース別の取得方法

| チャネル | 方法 | 必要な作業 |
|---------|------|----------|
| Shopify | REST API自動取得 | 不要 |
| GA4 | Analytics Data API自動取得 | 不要 |
| Amazon | CSVをDriveフォルダへアップロード | 要CSV |
| 楽天 | CSVをDriveフォルダへアップロード | 要CSV |

## Apps Scriptファイル構成（2026-04-21整理済み）

| ファイル | 主な関数 | 役割 |
|---------|---------|------|
| 1_Config.gs | getConfig(), initialSetup() | 設定取得・初期セットアップ |
| 2_ImportCSV.gs | importAllCSV(), importAllBulk() | CSV取込 |
| 3_GA4.gs | fetchGA4Weekly_(), fetchGA4Monthly_() | GA4データ取得 |
| 4_Aggregate.gs | aggregateAmazonSales_() 等 | 日別シートから週次集計 |
| 5_Report.gs | generateWeeklyReport(), _runWeeklyReportForMonday() | レポート生成 |
| 6_History.gs | saveWeeklyHistory_(), saveMonthlyHistory_() | 履歴蓄積・月次レポート |
| 7_Triggers.gs | runWeeklyPipeline(), setupTriggers() | 自動実行管理 |
| 8_Utils.gs | fmtDate_(), pct_() 等 | ユーティリティ |
| 9_Charts_AI.gs | addChartsToWeeklyReport_(), addAIAnalysis_() | グラフ・AI考察 |
| 10_ShopifySales.gs | fetchShopifySales_() | Shopify売上取得（レポート・履歴用） |
| 11_ShopifyOrders.gs | shopifyWeeklyUpdate(), updateOrderDetailsSheet() | Shopify専用シート更新 |

## 通常の週次作業（毎週月曜12:00に自動実行）

トリガーが `runWeeklyPipeline` のみ設定済み。この1つで以下を一括処理：
1. `importAllCSV()` — CSV取込
2. `generateWeeklyReport()` — レポート・履歴更新（GA4・Shopify自動取得）
3. `shopifyWeeklyUpdate()` — Shopify専用シート更新

手動実行する場合も `runWeeklyPipeline()` を叩けばOK。

## 過去週のバックフィル手順

1. 対象週のCSVをDriveフォルダへアップロード
2. `importAllBulk()` を実行
3. コンソールで実行（月は0始まり）：
```javascript
_runWeeklyReportForMonday(new Date(2026, 3, 20))  // 例：4/20週
```
4. Shopify専用シートも更新する場合は `shopifyWeeklyUpdate()` を追加実行

## 自動トリガー

| タイミング | 関数 | 内容 |
|-----------|------|------|
| 毎週月曜 12:00 | runWeeklyPipeline() | CSV取込→週次レポート→Shopifyシート更新 |
| 毎月2日 08:00 | runMonthlyPipeline() | 月次レポート生成 |

## 週次履歴の列構成（📋 週次履歴シート）

週開始日 / 週終了日 / 自社サイト売上 / 自社注文数 / 定期便注文数 / GA4セッション / GA4ユーザー / GA4新規 / CVR(%) / AOV / Amazon売上 / Amazon注文数 / Amazon広告費 / Amazon ROAS / 楽天売上 / 楽天注文数 / 楽天RPP広告費 / 楽天RPP ROAS / 記録日時

## CSV形式の仕様

| CSV種類 | ヘッダー行 | 備考 |
|--------|----------|------|
| Amazon売上 | 1行目 | 文字コード: UTF-8 |
| Amazon広告 | 1行目 | 文字コード: UTF-8 |
| 楽天売上 | 4行目 | 文字コード: Shift_JIS、「デバイス=すべて」行のみ集計 |
| 楽天RPP広告 | 9行目 | 文字コード: Shift_JIS |
| 楽天クーポンAD | 1行目 | 文字コード: UTF-8 |

## 既知の修正済みバグ

### toJSTDateStr_のInvalid time valueエラー（2026-04-21修正済み）
`4_Aggregate.gs` の `toJSTDateStr_` に空行・不正値ガードを追加：
```javascript
function toJSTDateStr_(d) {
  if (!d || d === '') return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
```

## AI考察機能（オプション）

⚙️設定シートに `GEMINI_API_KEY` を設定するとGemini 2.0 Flashによる週次考察が週次レポート末尾に追記される。未設定の場合はスキップ。
