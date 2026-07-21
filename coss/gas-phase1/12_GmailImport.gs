// ================================================================
// 12_GmailImport.gs
// Gmail経由のCSV自動取込
// ================================================================
// スケジュールレポートのメールを検索し、対応するDriveフォルダへCSVを保存します。
//  (A) 添付方式（旧）: csv/tsv/txt/xlsx 添付をそのまま保存（xlsxはGoogleスプレッドシートに変換）
//  (B) ダウンロードリンク方式（新・Amazon Ads /reporting）:
//      メール本文に添付は無く「レポートをダウンロード」のS3署名付きURLだけが入る。
//      本文からURLを抽出し UrlFetchApp で取得してCSVとして保存する。
// どちらの場合も保存後は既存の importAllCSV が取り込む（重複行は appendNoDuplicate_ が除外）。
// 処理済みスレッドにはラベルを付けて二重処理を防ぎます。
// ※ ダウンロードリンクは生成から48時間で失効するため、DL失敗時はラベルを付けず次回再試行させる。

const GMAIL_IMPORT_LABEL = 'COSS取込済';

// 取込元の定義：検索クエリ → 保存先フォルダ（設定シートのキー）
// クエリは設定シートに同名キーがあればそちらを優先します。
const GMAIL_SOURCES = [
  {
    name: 'Amazon広告',
    queryKey: 'GMAIL_QUERY_AMAZON_ADS',
    // 新レポートは no-reply@ads.amazon.com から添付なし（本文にDLリンク）で届く。
    // 旧添付方式（amazon.co.jp 等）も一応拾えるよう from を広めに、has:attachment は付けない。
    defaultQuery: 'from:(no-reply@ads.amazon.com OR ads.amazon.com OR amazon.co.jp OR amazon.com) レポート',
    folderKey: 'AMAZON_ADS_FOLDER_ID',
    linkImport: true, // 添付が無ければ本文のDLリンクから取得する
    linkFilePrefix: 'Amazon広告',
  },
];

/**
 * Gmailからレポートを取得してDriveフォルダへ保存
 * 週次パイプラインの先頭（importAllCSVの前）で実行されます。
 */
function importFromGmail() {
  const config = getConfig();
  const label = getOrCreateLabel_(GMAIL_IMPORT_LABEL);
  const msgs = [];

  GMAIL_SOURCES.forEach(src => {
    const folderId = config[src.folderKey];
    if (!folderId) {
      msgs.push('⚠️ ' + src.name + ': ' + src.folderKey + ' 未設定');
      return;
    }
    const folder = DriveApp.getFolderById(folderId);
    const query = (config[src.queryKey] || src.defaultQuery) +
      ' -label:' + GMAIL_IMPORT_LABEL + ' newer_than:60d';

    const threads = GmailApp.search(query, 0, 20);
    let saved = 0;

    threads.forEach(thread => {
      let linkFailed = false; // DLリンクは見つかったが取得に失敗（→ラベルを付けず再試行）

      thread.getMessages().forEach(message => {
        // (A) 添付方式
        let attSaved = 0;
        message.getAttachments().forEach(att => {
          const name = att.getName();
          if (!/\.(csv|tsv|txt|xlsx)$/i.test(name)) return;
          if (/\.xlsx$/i.test(name)) {
            saveXlsxAsSheet_(att, name.replace(/\.xlsx$/i, ''), folderId);
          } else {
            folder.createFile(att.copyBlob().setName(name));
          }
          attSaved++;
        });
        if (attSaved > 0) { saved += attSaved; return; }

        // (B) ダウンロードリンク方式
        if (src.linkImport) {
          const url = extractReportUrl_(message.getBody());
          if (url) {
            try {
              const csv = fetchReportCsv_(url);
              const fname = (src.linkFilePrefix || 'report') + '_' +
                Utilities.formatDate(message.getDate(), 'Asia/Tokyo', 'yyyyMMdd_HHmm') + '.csv';
              folder.createFile(Utilities.newBlob(csv, 'text/csv', fname));
              saved++;
            } catch (e) {
              linkFailed = true;
              msgs.push('  ⚠️ ' + src.name + ' リンクDL失敗: ' + e.message);
            }
          }
        }
      });

      // 取得に失敗したリンクがある場合のみラベルを付けず、次回再試行できるようにする
      if (!linkFailed) thread.addLabel(label);
    });

    msgs.push('[' + src.name + '] ' + threads.length + 'スレッド / ' + saved + '件保存');
  });

  const summary = msgs.join('\n');
  Logger.log('Gmail取込完了:\n' + summary);
  return summary;
}

/**
 * メール本文（HTML）からレポートCSVのダウンロードURLを抽出。
 * Amazon Adsのメールは fe.r.ads.amazon.com/CL0/<URLエンコードされたS3署名付きURL>/... という
 * クリック追跡リンク。デコード後のターゲットが .csv かつ S3/amazonaws を指すものを返す。
 * 見つからなければ null。
 */
function extractReportUrl_(html) {
  if (!html) return null;
  const hrefs = html.match(/https?:\/\/[^"'\s<>]+/g) || [];
  for (let i = 0; i < hrefs.length; i++) {
    const target = decodeTrackerTarget_(hrefs[i]);
    if (/\.csv(\?|%3F|$)/i.test(target) && /(s3|amazonaws|decorated-reports)/i.test(target)) {
      return hrefs[i]; // 追跡リンクごと返す（fetchReportCsv_ 側でデコード/フォールバック）
    }
  }
  return null;
}

/**
 * Amazonクリック追跡リンク（/CL0/<encoded>/...）から実ターゲットURLをデコード。
 * 追跡リンクでなければそのまま返す。
 */
function decodeTrackerTarget_(href) {
  const m = href.match(/\/CL0\/([^\/]+)\//);
  if (!m) return href;
  try { return decodeURIComponent(m[1]); } catch (e) { return href; }
}

/**
 * ダウンロードURLからCSV本文を取得。
 * 1) 追跡リンクをデコードしたS3署名付きURLを直接取得
 * 2) 失敗/HTMLが返る場合は追跡リンクをそのままリダイレクト追従で取得
 */
function fetchReportCsv_(href) {
  const direct = decodeTrackerTarget_(href);
  let res = UrlFetchApp.fetch(direct, { followRedirects: true, muteHttpExceptions: true });
  let code = res.getResponseCode();
  let txt = code < 300 ? res.getContentText('UTF-8') : '';

  if (code >= 300 || /^\s*</.test(txt)) {
    // フォールバック：追跡リンクをそのまま
    res = UrlFetchApp.fetch(href, { followRedirects: true, muteHttpExceptions: true });
    code = res.getResponseCode();
    txt = res.getContentText('UTF-8');
  }

  if (code >= 300) throw new Error('HTTP ' + code);
  if (/^\s*</.test(txt)) throw new Error('CSVでなくHTMLが返却された（リンク失効の可能性）');
  return txt;
}

/**
 * xlsx添付をGoogleスプレッドシートに変換して指定フォルダへ保存
 * （Drive REST APIを使用。importAllCSVはGOOGLE_SHEETS形式を取込可能）
 */
function saveXlsxAsSheet_(blob, title, folderId) {
  const metadata = {
    name: title,
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [folderId],
  };
  const boundary = 'coss_boundary_' + Date.now();
  const payload = Utilities.newBlob(
    '--' + boundary + '\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) + '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'
  ).getBytes()
    .concat(blob.getBytes())
    .concat(Utilities.newBlob('\r\n--' + boundary + '--').getBytes());

  const res = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      payload: payload,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    }
  );
  if (res.getResponseCode() >= 300) {
    throw new Error('xlsx変換失敗 (' + title + '): ' + res.getContentText().slice(0, 200));
  }
}

/** ラベルを取得（なければ作成） */
function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
