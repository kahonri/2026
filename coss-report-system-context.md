# COSS 売上・広告レポートシステム — Claude用コンテキスト

このドキュメントをブラウザ版Claudeとの会話の冒頭に貼り付けてください。
最終更新: 2026-10-19

---

## いまの状態（2026-10-19）

- 仕組みは稼働中。毎週月曜12:00に自動で取込→週次レポート→履歴更新。
- 手動CSV（Amazon売上・楽天売上・楽天RPP・楽天クーポンAD）は **2026-10-17まで取込済み**。次回は **10/18〜**。
- Amazon広告は8/20〜10/19まで表示0回だった（出品SKUが 4600→4605 に替わり、広告が旧SKUのままだったため）。10/19に全キャンペーンをSKU 4605へ付け替え済み。10/26の週次レポートから行が入る見込み。
- 履歴シートの合算列（週次 T/U、月次 S/T/U）は2026-04以降空欄だった → 6_History.gs で書くよう修正（2026-10-19）。

## 主要リソース

| 項目 | 値 |
|------|-----|
| スプレッドシート | https://docs.google.com/spreadsheets/d/1-nmlC2t0aKB0_r5r8HZHBfUqXZl0d9DAKE5P0QThyYs/edit |
| Apps Script | https://script.google.com/u/0/home/projects/1vDBd8Bi6Jr7gJyVkgkBbcEBJgeBMGKiOYsGFzs2cTvUdTlc2UNRhVqDr/edit |
| 運用アカウント | coss.coss.cosmetics@gmail.com（Drive・Gmail・GASすべてこのアカウント） |
| Shopifyドメイン | coss-ec.myshopify.com |
| ローカルのGASソース | `coss/gas-phase1/`（一部ファイルはGASエディタ側が正。全置換の前に必ずエディタ側の関数一覧を確認） |

## シート構成

| シート名 | 用途 |
|---------|------|
| ⚙️ 設定 | GA4 ID・DriveフォルダID等 |
| 📥 Amazon_日別 | Amazon売上CSV取込先 |
| 📥 Amazon広告_日別 | Amazon広告CSV取込先（Gmail経由で自動） |
| 📥 楽天_日別 | 楽天売上CSV取込先（ヘッダー4行目） |
| 📥 楽天RPP_日別 | 楽天RPP広告CSV取込先（ヘッダー9行目） |
| 📥 楽天クーポンAD_日別 | 楽天クーポンアドバンスCSV取込先 |
| 📥 GA4_日別 | GA4日別（API自動） |
| 📊 週次レポート / 📊 月次レポート | 最新週・最新月のKPI（実行のたび上書き） |
| 📋 週次履歴 / 📋 月次履歴 | 全期間の累積ログ（同じ週・月は上書き） |
| Shopify_注文明細 / 週次売上 / 月次売上 | Shopify専用 |

## データソース別の取得方法

| チャネル | 方法 | 人の作業 |
|---------|------|----------|
| Shopify | REST API自動 | 不要 |
| GA4 | Data API自動 | 不要 |
| Amazon広告 | 広告コンソールの週次スケジュールレポート（月曜8:00、メール本文のDLリンク）→ GASがGmailから取得 | 不要（**配信終了日 2027-07-12 までに延長**） |
| Amazon売上 | セラーセントラル ビジネスレポート「売上・トラフィック」日別CSV → Driveへ | 要CSV |
| 楽天売上 | RMS 日別売上（デバイス別）CSV → Driveへ | 要CSV |
| 楽天RPP | RPPパフォーマンスレポート **日別** CSV → Driveへ | 要CSV |
| 楽天クーポンAD | クーポンアドバンス 日別CSV → Driveへ | 要CSV |

## 手動CSVを入れたあとの手順（大事）

1. CSVを各Driveフォルダへ入れる
2. メニュー「📥 CSVを今すぐ取込」 ← **期間指定の再生成はCSVを取り込まないので、必ず先に取込**
3. メニュー「🔁 期間指定で週次・月次を再生成」を **4週ずつ** 実行（8週＋3か月で6分の実行上限に当たる）
4. メニュー「🧹 履歴の重複を掃除（最新を残す）」

月曜12:00の自動実行より前にCSVを入れておけば、その週の分は1〜4不要。

### よくある失敗
- 楽天RPPを「期間合計」で出すと、日付列が「2026年07月15日〜…」の1行になり集計されない → **日別**で出す
- 同じ日付の行は取込でスキップされる（上書きされない）。未確定の当日分は入れない
- Amazon広告CSVが見出し行だけ（153バイト）＝ 広告の表示0回。取込の故障ではない。広告側（SKU・在庫・入札）を確認する

## Apps Scriptファイル構成（2026-07-16 連番化）

| エディタ上の名前 | 主な関数 | 役割 |
|---------|---------|------|
| 1_Config | getConfig(), initialSetup() | 設定 |
| 2_ImportCSV | importAllCSV() | CSV取込（複合キーで重複除外） |
| 3_GA4 | fetchGA4Weekly_() 等 | GA4 |
| 4_Aggregate | aggregateAmazonSales_() 等 | 日別→週・月集計 |
| 5_Report | generateWeeklyReport(), _runWeeklyReportForMonday() | 週次レポート |
| 6_History | saveWeeklyHistory_(), saveMonthlyHistory_(), generateMonthlyReport | 履歴・月次 |
| 7_Triggers | onOpen(メニュー), runWeeklyPipeline(), setupTriggers() | 自動実行・メニュー |
| 8_Charts_AI | グラフ・AI考察 | |
| 9_ShopifySales / 10_shopify_orders | Shopify | |
| 11_GmailImport（ローカル 12_GmailImport.gs） | importFromGmail() | Amazon広告メール取込 |
| 12_Backfill（ローカル 13_Backfill.gs） | backfillAuto(), backfillByRange() | あとから取込・期間指定再生成 |
| 13_DedupCleanup（ローカル 14_DedupCleanup.gs） | dedupeAllImportSheets(), dedupeHistorySheets() | 重複掃除 |

## 自動トリガー

| タイミング | 関数 | 内容 |
|-----------|------|------|
| 毎週月曜 12:00 | runWeeklyPipeline() | Gmail取込→CSV取込→週次レポート→Shopifyシート更新 |
| 毎月3日 8:00 | runMonthlyPipeline() | 月次レポート |

## 履歴の列構成

週次: 週開始日 / 週終了日 / 自社サイト売上 / 自社注文数 / 定期便注文数 / GA4セッション / GA4ユーザー / GA4新規 / CVR(%) / AOV / Amazon売上 / Amazon注文数 / Amazon広告費 / Amazon ROAS / 楽天売上 / 楽天注文数 / 楽天RPP広告費 / 楽天RPP ROAS / 記録日時 / 3CH合算売上 / 合算広告費

月次: 年月 / 自社サイト売上 / … / 楽天RPP ROAS / 記録日時 / 3CH合算売上 / 合算広告費 / 全体ROAS（売上÷広告費）

- 3CH合算売上 = 自社サイト売上 + Amazon売上 + 楽天売上
- 合算広告費 = Amazon広告費 + 楽天RPP広告費

## AI考察機能（オプション）

⚙️設定シートに `GEMINI_API_KEY` を設定するとGeminiによる週次考察が週次レポート末尾に追記される。未設定ならスキップ。
