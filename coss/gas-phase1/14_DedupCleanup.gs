// ================================================================
// 14_DedupCleanup.gs
// 📥取込シートの重複行クリーンアップ（高速版）
// ================================================================
// 再取込の際に同一キーの行が除外されず積み増しされてしまった重複を、
// キーごとに「取込日時が最新の1行」だけ残して削除します。
//
// 楽天RPP_日別 / 楽天クーポンAD_日別 で同一日付が最大13回積み増しされていた
// 問題（2026-07-15検出、余剰1,244行）の是正用。2026-07-16に本番実行し
// 全1,244行を削除・完了（このプロジェクトへデプロイ済み＝旧「無題.gs」）。
//
// 判定キー（複合キー）:
//   📥 GA4_日別          … 日付
//   📥 Amazon_日別       … 日付
//   📥 Amazon広告_日別   … 日付 + キャンペーン名
//   📥 楽天_日別         … 日付 + デバイス
//   📥 楽天RPP_日別      … 日付
//   📥 楽天クーポンAD_日別 … 日付
//
// 残す行の選び方: 同一キー内で「取込日時（最終列）が最新」の行を残す。
//   → 楽天_日別の「初回は速報¥0、後日に実数へ確定」ケースで実数側を残せる。
//
// 高速化: deleteRow を1行ずつ呼ぶと1,244行で6分の実行上限を超過するため、
//   「残す行だけを一括 setValues で書き戻し → 余剰分の末尾行を1回の
//   deleteRows でまとめて削除」に変更。数秒で完了する。
// ================================================================

const DEDUP_KEY_COLS = {
  '📥 GA4_日別':          [0],
  '📥 Amazon_日別':       [0],
  '📥 Amazon広告_日別':   [0, 1],
  '📥 楽天_日別':         [0, 2],
  '📥 楽天RPP_日別':      [0],
  '📥 楽天クーポンAD_日別': [0],
};

/** 実削除せずに件数だけ集計してログ表示 */
function dedupeAllImportSheets_dryRun() {
  _dedupNotify(dedupeAllImportSheets_(true), true);
}

/** 実削除を実行 */
function dedupeAllImportSheets() {
  _dedupNotify(dedupeAllImportSheets_(false), false);
}

/**
 * @param {boolean} dryRun trueなら削除せず件数のみ
 * @return {Array<{sheet:string, groups:number, deleted:number}>}
 */
function dedupeAllImportSheets_(dryRun) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = [];

  Object.keys(DEDUP_KEY_COLS).forEach(function(name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 3) {
      result.push({ sheet: name, groups: 0, deleted: 0, missing: !sheet });
      return;
    }
    const keyCols = DEDUP_KEY_COLS[name];
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const tCol = lastCol - 1; // 取込日時=最終列（0-based index）

    const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const values = range.getValues();        // 書き戻し用の生値
    const disp = range.getDisplayValues();   // キー判定用（gviz CSV分析と一致）

    // キー -> [{idx, tkey}]
    const groups = {};
    disp.forEach(function(r, i) {
      const key = keyCols.map(function(c) { return String(r[c]).trim(); }).join('|');
      const tkey = String(r[tCol] || '').replace(/\//g, '-'); // 比較用に正規化
      (groups[key] = groups[key] || []).push({ idx: i, tkey: tkey });
    });

    // 各グループで最新取込日時を残し、それ以外を削除対象に
    const delSet = {};
    let dupGroups = 0;
    Object.keys(groups).forEach(function(key) {
      const m = groups[key];
      if (m.length <= 1) return;
      dupGroups++;
      m.sort(function(a, b) { return a.tkey < b.tkey ? -1 : a.tkey > b.tkey ? 1 : a.idx - b.idx; });
      for (let k = 0; k < m.length - 1; k++) delSet[m[k].idx] = true;
    });

    // 残す行だけを元の順序で抽出
    const kept = [];
    for (let i = 0; i < values.length; i++) { if (!delSet[i]) kept.push(values[i]); }
    const deleted = values.length - kept.length;

    if (!dryRun && deleted > 0) {
      if (kept.length) sheet.getRange(2, 1, kept.length, lastCol).setValues(kept);
      // 余剰になった末尾行を1回でまとめて削除
      const delStart = 2 + kept.length;
      const delCount = lastRow - delStart + 1;
      if (delCount > 0) sheet.deleteRows(delStart, delCount);
    }
    result.push({ sheet: name, groups: dupGroups, deleted: deleted });
  });

  return result;
}

function _dedupNotify(summary, dryRun) {
  const lines = summary.map(function(r) {
    return r.sheet + ': 重複' + r.groups + 'グループ / ' + (dryRun ? '削除予定' : '削除') + r.deleted + '行' +
      (r.missing ? ' (シートなし)' : '');
  });
  const total = summary.reduce(function(s, r) { return s + r.deleted; }, 0);
  const msg = (dryRun ? '【ドライラン】\n' : '【実行完了】\n') +
    lines.join('\n') + '\n\n合計 ' + total + ' 行' + (dryRun ? ' が削除対象です。' : ' を削除しました。');
  Logger.log(msg);
  // 注: editorから実行するとgetUi().alert()がスプレッドシート側でブロックするため使わない
}


// ================================================================
// 履歴シートの重複クリーンアップ（📋週次履歴 / 📋月次履歴）
// ================================================================
// 週次履歴は追記方式のため、同一週が複数回生成されると重複行が溜まる
// （2026-07-21検出：週次はほぼ全週が2重・一部5重、月次は2026-06が4行）。
// キー（週開始日 / 年月）ごとに「記録日時が最新の1行」だけ残して削除する。
// 記録日時が最終列ではないため、列位置はヘッダー名で解決する。
const HISTORY_DEDUP = {
  '📋 週次履歴': { keyHeaders: ['週開始日'], tsHeader: '記録日時' },
  '📋 月次履歴': { keyHeaders: ['年月'],     tsHeader: '記録日時' },
};

/** 実削除せず件数のみ */
function dedupeHistorySheets_dryRun() { _dedupNotify(dedupeHistorySheets_(true), true); }
/** 実削除 */
function dedupeHistorySheets()        { _dedupNotify(dedupeHistorySheets_(false), false); }

function dedupeHistorySheets_(dryRun) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = [];
  Object.keys(HISTORY_DEDUP).forEach(function(name) {
    const conf = HISTORY_DEDUP[name];
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 3) {
      result.push({ sheet: name, groups: 0, deleted: 0, missing: !sheet });
      return;
    }
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const header = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0].map(function(h) { return String(h).trim(); });
    const keyCols = conf.keyHeaders.map(function(h) { return header.indexOf(h); });
    const tCol = header.indexOf(conf.tsHeader);
    if (keyCols.some(function(c) { return c < 0; }) || tCol < 0) {
      result.push({ sheet: name, groups: 0, deleted: 0, headerError: true });
      return;
    }
    const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const values = range.getValues();
    const disp = range.getDisplayValues();
    const groups = {};
    disp.forEach(function(r, i) {
      const key = keyCols.map(function(c) { return String(r[c]).trim(); }).join('|');
      const tkey = String(r[tCol] || '').replace(/\//g, '-');
      (groups[key] = groups[key] || []).push({ idx: i, tkey: tkey });
    });
    const delSet = {};
    let dupGroups = 0;
    Object.keys(groups).forEach(function(key) {
      const m = groups[key];
      if (m.length <= 1) return;
      dupGroups++;
      m.sort(function(a, b) { return a.tkey < b.tkey ? -1 : a.tkey > b.tkey ? 1 : a.idx - b.idx; });
      for (let k = 0; k < m.length - 1; k++) delSet[m[k].idx] = true;
    });
    const kept = [];
    for (let i = 0; i < values.length; i++) { if (!delSet[i]) kept.push(values[i]); }
    const deleted = values.length - kept.length;
    if (!dryRun && deleted > 0) {
      if (kept.length) sheet.getRange(2, 1, kept.length, lastCol).setValues(kept);
      const delStart = 2 + kept.length;
      const delCount = lastRow - delStart + 1;
      if (delCount > 0) sheet.deleteRows(delStart, delCount);
    }
    result.push({ sheet: name, groups: dupGroups, deleted: deleted });
  });
  return result;
}
