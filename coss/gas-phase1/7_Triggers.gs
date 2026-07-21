// ================================================================
// 7_Triggers.gs
// ================================================================

/**
 * カスタムメニューの追加
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📊 COSSレポート')
    .addItem('⚙️ 初期セットアップ（初回のみ）', 'initialSetup')
    .addSeparator()
    .addItem('📧 Gmail添付を今すぐ取得', 'importFromGmail')
    .addItem('📥 CSVを今すぐ取込', 'importAllCSV')
    .addItem('📈 GA4日別データを今すぐ更新', 'updateGA4Daily')
    .addItem('🛍️ Shopifyデータを今すぐ更新', 'shopifyWeeklyUpdate')
    .addItem('📊 週次レポートを今すぐ生成', 'generateWeeklyReport')
    .addItem('📊 月次レポートを今すぐ生成', 'generateMonthlyReport')
    .addSeparator()
    .addItem('🔄 あとから取込（自動検出で再生成）', 'backfillAuto')
    .addItem('🔁 期間指定で週次・月次を再生成', 'backfillByRange')
    .addItem('🧹 履歴の重複を掃除（最新を残す）', 'menuDedupeHistory')
    .addSeparator()
    .addItem('🔁 自動実行トリガーを設定', 'setupTriggers')
    .addItem('🗑️ トリガーをすべて削除', 'deleteAllTriggers')
    .addToUi();
}

/**
 * 自動実行トリガーの設定
 * - 毎週月曜 12:00：CSV取込 → Shopify更新 → 週次レポート生成
 * - 毎月3日 08:00：月次レポート生成
 *   （GA4は集計確定まで最大48時間かかるため、月末データが確定する3日に実行）
 */
function setupTriggers() {
  deleteAllTriggers(); // 既存を削除してから再設定

  // 毎週月曜 12:00 - CSV取込 + 週次レポート
  ScriptApp.newTrigger('runWeeklyPipeline')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(12)
    .create();

  // 毎月3日 08:00 - 月次レポート
  ScriptApp.newTrigger('runMonthlyPipeline')
    .timeBased()
    .onMonthDay(3)
    .atHour(8)
    .create();

  const msg = '✅ トリガーを設定しました！\n\n' +
    '・毎週月曜 12:00 → CSV取込 + Shopify更新 + 週次レポート生成\n' +
    '・毎月3日 08:00 → 月次レポート生成';
  try {
    SpreadsheetApp.getUi().alert(msg); // スプレッドシートのメニューから実行した場合
  } catch (e) {
    Logger.log(msg); // スクリプトエディタから実行した場合はUIが使えない
  }
}

/**
 * 週次パイプライン（Gmail添付取得 → CSV取込 → Shopify更新 → 週次レポート）
 * Shopify注文明細を最新化してからレポートを生成する順序が重要。
 * GA4日別の更新は generateWeeklyReport 内で行われる。
 */
function runWeeklyPipeline() {
  try {
    Logger.log('=== 週次パイプライン開始 ===');
    importFromGmail();
    Utilities.sleep(2000);
    importAllCSV();
    Utilities.sleep(3000);
    shopifyWeeklyUpdate();
    Utilities.sleep(2000);
    generateWeeklyReport();
    Logger.log('=== 週次パイプライン完了 ===');
  } catch (e) {
    Logger.log('週次パイプラインエラー: ' + e.message);
    const config = getConfig();
    if (config.REPORT_EMAIL) {
      MailApp.sendEmail(config.REPORT_EMAIL, '❌ 週次レポートエラー', e.message + '\n\n' + e.stack);
    }
  }
}

/**
 * 月次パイプライン（Shopify更新 → 月次レポート）
 * 返金などの状態変化を注文明細に反映してから集計する。
 */
function runMonthlyPipeline() {
  try {
    Logger.log('=== 月次パイプライン開始 ===');
    shopifyWeeklyUpdate();
    Utilities.sleep(2000);
    generateMonthlyReport();
    Logger.log('=== 月次パイプライン完了 ===');
  } catch (e) {
    Logger.log('月次パイプラインエラー: ' + e.message);
    const config = getConfig();
    if (config.REPORT_EMAIL) {
      MailApp.sendEmail(config.REPORT_EMAIL, '❌ 月次レポートエラー', e.message + '\n\n' + e.stack);
    }
  }
}

/**
 * 全トリガーを削除
 */
function deleteAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
}


// ================================================================
// 8_Utils.gs（ユーティリティ）
// ================================================================

/** 日付フォーマット（yyyy-MM-dd） */
function fmtDate_(date) {
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/** 数値フォーマット（通貨・数値・パーセント） */
function formatVal_(val, type) {
    if (val == null || isNaN(val)) return '-';
    switch (type) {
      case 'currency': return `¥${Math.round(val).toLocaleString()}`;
      case 'pct': return `${Math.round(val * 100) / 100}%`;
      case 'number': return Math.round(val).toLocaleString();
      case 'roas': return (Math.round(val * 100) / 100).toLocaleString();
      default: return val;
    }
  }

/** 前週比・前月比などの変化率テキスト */
function pct_(current, previous) {
  if (!previous || previous === 0) return '-';
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${Math.round(change * 10) / 10}%`;
}

/** 短縮形（他ファイルから呼ばれる共通フォーマット） */
function fmt_(num) {
  return Math.round(num).toLocaleString();
}


/**
 * メニュー用: 履歴シート（📋週次履歴 / 📋月次履歴）の重複行を掃除する。
 * ドライランで件数を提示 → 確認 → 「キーごとに記録日時が最新の1行」を残して削除。
 * 実処理は 14_DedupCleanup.gs の dedupeHistorySheets_ を使用。
 */
function menuDedupeHistory() {
  const ui = SpreadsheetApp.getUi();
  const dry = dedupeHistorySheets_(true);
  const total = dry.reduce(function(s, r) { return s + r.deleted; }, 0);
  if (total === 0) {
    ui.alert('履歴の重複掃除', '重複行はありませんでした。', ui.ButtonSet.OK);
    return;
  }
  const detail = dry.map(function(r) { return '・' + r.sheet + '：' + r.deleted + '行'; }).join('\n');
  const res = ui.alert('履歴の重複を掃除',
    '以下の重複行を削除します（各キーで「記録日時が最新」の行だけ残します）。\n\n' +
    detail + '\n\n合計 ' + total + ' 行\n\n実行しますか？',
    ui.ButtonSet.YES_NO);
  if (res !== ui.Button.YES) return;
  const done = dedupeHistorySheets_(false);
  const total2 = done.reduce(function(s, r) { return s + r.deleted; }, 0);
  ui.alert('✅ 掃除完了',
    done.map(function(r) { return '・' + r.sheet + '：' + r.deleted + '行削除'; }).join('\n') +
    '\n\n合計 ' + total2 + ' 行を削除しました。',
    ui.ButtonSet.OK);
}
