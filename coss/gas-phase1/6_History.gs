// ================================================================
// 6_History.gs
// ================================================================

/**
 * 週次履歴への蓄積
 */
function saveWeeklyHistory_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('📋 週次履歴');

  // ヘッダーがなければ作成
  if (sheet.getLastRow() === 0) {
    const headers = [
      '週開始日', '週終了日',
      '自社サイト売上', '自社注文数', '定期便注文数',
      'GA4セッション', 'GA4ユーザー', 'GA4新規', 'CVR(%)', 'AOV',
      'Amazon売上', 'Amazon注文数', 'Amazon広告費', 'Amazon ROAS',
      '楽天売上', '楽天注文数', '楽天RPP広告費', '楽天RPP ROAS',
      '記録日時',
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#0f3460').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const { period, ga4, amzSales, amzAds, rakSales, rakRPP } = data;

  // 重複チェック（同じ週開始日があれば上書き、なければ追記）
    const lastRow = sheet.getLastRow();
    let targetRow = lastRow + 1;
    if (lastRow > 1) {
      const existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const startStr = fmtDate_(period.start);
      const existingIdx = existing.findIndex(r => String(r[0]).substring(0, 10) === startStr);
      if (existingIdx !== -1) {
        targetRow = existingIdx + 2;
        Logger.log('週次履歴: 既存行を上書き (' + startStr + ')');
      }
    }

  const row = [
    fmtDate_(period.start),
    fmtDate_(period.end),
    ga4 ? ga4.revenue : 0,
    ga4 ? (ga4.shopifyOrders || ga4.transactions || 0) : 0,
    ga4 ? (ga4.subscriptionOrders || 0) : 0,
    ga4 ? ga4.sessions : 0,
    ga4 ? ga4.users : 0,
    ga4 ? ga4.newUsers : 0,
    ga4 ? Math.round(ga4.cvr * 100) / 100 : 0,
    ga4 ? Math.round(ga4.aov) : 0,
    amzSales.revenue,
    amzSales.orders,
    amzAds.cost,
    Math.round(amzAds.roas * 100) / 100,
    rakSales.revenue,
    rakSales.orders,
    rakRPP.cost,
    Math.round(rakRPP.roas * 100) / 100,
    new Date(),
    // 3CH合算売上 / 合算広告費（2026-10-19追加。4/27週以降この2列が空欄だった）
    (ga4 ? ga4.revenue : 0) + amzSales.revenue + rakSales.revenue,
    amzAds.cost + rakRPP.cost,
  ];

  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    Logger.log('週次履歴に記録しました: ' + fmtDate_(period.start));
}

/**
 * 月次履歴への蓄積
 */
function saveMonthlyHistory_(year, month, ga4, amzSales, amzAds, rakSales, rakRPP) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('📋 月次履歴');

  if (sheet.getLastRow() === 0) {
    const headers = [
      '年月',
      '自社サイト売上', '自社注文数', '定期便注文数',
      'GA4セッション', 'GA4ユーザー', 'GA4新規', 'CVR(%)', 'AOV',
      'Amazon売上', 'Amazon注文数', 'Amazon広告費', 'Amazon ROAS',
      '楽天売上', '楽天注文数', '楽天RPP広告費', '楽天RPP ROAS',
      '記録日時',
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#0f3460').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // 重複チェック（同じ年月があれば上書き、なければ追記）
  // ※あとから取込（バックフィル）で過去月を再生成したとき数値を反映するため
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  const lastRow = sheet.getLastRow();
  let targetRow = lastRow + 1;
  if (lastRow > 1) {
    const norm = v => (v instanceof Date)
      ? Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM')
      : String(v).substring(0, 7);
    const existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const existingIdx = existing.findIndex(r => norm(r[0]) === yearMonth);
    if (existingIdx !== -1) {
      targetRow = existingIdx + 2;
      Logger.log('月次履歴: 既存行を上書き (' + yearMonth + ')');
    }
  }

  const totalRevenue = (ga4 ? ga4.revenue : 0) + amzSales.revenue + rakSales.revenue;
  const totalCost = amzAds.cost + rakRPP.cost;

  const row = [
    yearMonth,
    ga4 ? ga4.revenue : 0,
    ga4 ? (ga4.shopifyOrders || ga4.transactions || 0) : 0,
    ga4 ? (ga4.subscriptionOrders || 0) : 0,
    ga4 ? ga4.sessions : 0,
    ga4 ? ga4.users : 0,
    ga4 ? ga4.newUsers : 0,
    ga4 ? Math.round(ga4.cvr * 100) / 100 : 0,
    ga4 ? Math.round(ga4.aov) : 0,
    amzSales.revenue, amzSales.orders, amzAds.cost,
    Math.round(amzAds.roas * 100) / 100,
    rakSales.revenue, rakSales.orders, rakRPP.cost,
    Math.round(rakRPP.roas * 100) / 100,
    new Date(),
    // 3CH合算売上 / 合算広告費 / 全体ROAS（2026-10-19追加。2026-04以降この3列が空欄だった）
    totalRevenue,
    totalCost,
    totalCost > 0 ? totalRevenue / totalCost : '',
  ];

  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
}

/**
 * 月次レポートを生成（先月分）
 * GA4は「📥 GA4_日別」シート、Shopifyは「Shopify_注文明細」シートから集計。
 * 週次レポートと同じ集計関数を使うため、数値は必ず一致する。
 */
function generateMonthlyReport() {
  const today = new Date();
  const year  = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
  const month = today.getMonth() === 0 ? 12 : today.getMonth();
  _runMonthlyReportFor(year, month);
}

/**
 * 指定年月の月次レポートを生成（バックフィルからも呼ばれる）
 * @param {number} year - 対象年
 * @param {number} month - 対象月（1-12）
 */
function _runMonthlyReportFor(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate   = new Date(year, month, 0);
  endDate.setHours(23, 59, 59, 999);

  const prevMonth     = month === 1 ? 12 : month - 1;
  const prevMonthYear = month === 1 ? year - 1 : year;
  const prevYear      = year - 1;

  const prevStartDate     = new Date(prevMonthYear, prevMonth - 1, 1);
  const prevEndDate       = new Date(prevMonthYear, prevMonth, 0);
  const prevYearStartDate = new Date(prevYear, month - 1, 1);
  const prevYearEndDate   = new Date(prevYear, month, 0);

  // GA4日別シートを最新化してから集計
  updateGA4Daily();
  const ga4         = aggregateGA4Daily_(startDate, endDate);
  const ga4Prev     = aggregateGA4Daily_(prevStartDate, prevEndDate);
  const ga4PrevYear = aggregateGA4Daily_(prevYearStartDate, prevYearEndDate);

  // Shopify売上は注文明細シートから集計
  const shopify         = aggregateShopifySales_(startDate, endDate);
  const shopifyPrev     = aggregateShopifySales_(prevStartDate, prevEndDate);
  const shopifyPrevYear = aggregateShopifySales_(prevYearStartDate, prevYearEndDate);

  // GA4の売上関連をShopifyデータで上書き
  if (ga4) { ga4.revenue = shopify.revenue; ga4.aov = shopify.aov; ga4.transactions = shopify.orders; ga4.shopifyOrders = shopify.orders; ga4.subscriptionOrders = shopify.subscriptionOrders; ga4.cvr = ga4.sessions > 0 ? (shopify.orders / ga4.sessions) * 100 : 0; }
  if (ga4Prev) { ga4Prev.revenue = shopifyPrev.revenue; ga4Prev.aov = shopifyPrev.aov; ga4Prev.transactions = shopifyPrev.orders; ga4Prev.shopifyOrders = shopifyPrev.orders; ga4Prev.subscriptionOrders = shopifyPrev.subscriptionOrders; ga4Prev.cvr = ga4Prev.sessions > 0 ? (shopifyPrev.orders / ga4Prev.sessions) * 100 : 0; }
  if (ga4PrevYear) { ga4PrevYear.revenue = shopifyPrevYear.revenue; ga4PrevYear.aov = shopifyPrevYear.aov; ga4PrevYear.transactions = shopifyPrevYear.orders; ga4PrevYear.shopifyOrders = shopifyPrevYear.orders; ga4PrevYear.subscriptionOrders = shopifyPrevYear.subscriptionOrders; ga4PrevYear.cvr = ga4PrevYear.sessions > 0 ? (shopifyPrevYear.orders / ga4PrevYear.sessions) * 100 : 0; }

  Logger.log('Shopify月次売上: ¥' + shopify.revenue + ' (' + shopify.orders + '件)');

  const amzSales         = aggregateAmazonSales_(startDate, endDate);
  const amzAds           = aggregateAmazonAds_(startDate, endDate);
  const amzSalesPrev     = aggregateAmazonSales_(prevStartDate, prevEndDate);
  const amzAdsPrev       = aggregateAmazonAds_(prevStartDate, prevEndDate);
  const amzSalesPrevYear = aggregateAmazonSales_(prevYearStartDate, prevYearEndDate);
  const amzAdsPrevYear   = aggregateAmazonAds_(prevYearStartDate, prevYearEndDate);

  const rakSales         = aggregateRakutenSales_(startDate, endDate);
  const rakRPP           = aggregateRakutenRPP_(startDate, endDate);
  const rakSalesPrev     = aggregateRakutenSales_(prevStartDate, prevEndDate);
  const rakRPPPrev       = aggregateRakutenRPP_(prevStartDate, prevEndDate);
  const rakSalesPrevYear = aggregateRakutenSales_(prevYearStartDate, prevYearEndDate);
  const rakRPPPrevYear   = aggregateRakutenRPP_(prevYearStartDate, prevYearEndDate);

  const sheet = writeMonthlyToSheet_({
    year, month, ga4, ga4Prev, ga4PrevYear,
    amzSales, amzAds, amzSalesPrev, amzAdsPrev, amzSalesPrevYear, amzAdsPrevYear,
    rakSales, rakRPP, rakSalesPrev, rakRPPPrev, rakSalesPrevYear, rakRPPPrevYear,
  });

  saveMonthlyHistory_(year, month, ga4, amzSales, amzAds, rakSales, rakRPP);
  addMonthlyCharts_(sheet);

  Logger.log(`月次レポート生成完了: ${year}-${month}`);
}

/**
 * 月次レポートシートへの書き込み
 */
function writeMonthlyToSheet_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('📊 月次レポート');
  sheet.clearContents();
  sheet.clearFormats();
  sheet.getCharts().forEach(c => sheet.removeChart(c));
  // 書式を「書式なしテキスト」に固定（"1"や"3.25"が隣の¥セルに引きずられ通貨表示になるのを防ぐ）
  sheet.getRange(1, 1, sheet.getMaxRows(), 6).setNumberFormat('@');

  const {
    year, month, ga4, ga4Prev, ga4PrevYear,
    amzSales, amzAds, amzSalesPrev, amzAdsPrev, amzSalesPrevYear, amzAdsPrevYear,
    rakSales, rakRPP, rakSalesPrev, rakRPPPrev, rakSalesPrevYear, rakRPPPrevYear,
  } = data;
  const config = getConfig();
  const yearMonth = `${year}年${month}月`;

  let row = 1;

  sheet.getRange(row, 1, 1, 6).merge()
    .setValue(`📊 ${config.BRAND_NAME || 'COSS'} 月次レポート｜${yearMonth}`)
    .setBackground('#0f3460').setFontColor('#ffffff').setFontSize(14).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sheet.setRowHeight(row, 40);
  row++;

  // ヘッダー行（タイトル直下）
  const colHeaders = ['指標', yearMonth, '前月', '前月比', '前年同月', '前年比'];
  sheet.getRange(row, 1, 1, 6).setValues([colHeaders])
    .setBackground('#1a3a5c').setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center');
  row++;

  // ── 合算サマリーセクション ──
  const totalRevenue         = (ga4 ? ga4.revenue : 0) + (amzSales.revenue || 0) + (rakSales.revenue || 0);
  const totalRevenuePrev     = (ga4Prev ? ga4Prev.revenue : 0) + (amzSalesPrev ? amzSalesPrev.revenue : 0) + (rakSalesPrev ? rakSalesPrev.revenue : 0);
  const totalRevenuePrevYear = (ga4PrevYear ? ga4PrevYear.revenue : 0) + (amzSalesPrevYear ? amzSalesPrevYear.revenue : 0) + (rakSalesPrevYear ? rakSalesPrevYear.revenue : 0);
  const totalCost         = (amzAds.cost || 0) + (rakRPP.cost || 0);
  const totalCostPrev     = (amzAdsPrev ? amzAdsPrev.cost : 0) + (rakRPPPrev ? rakRPPPrev.cost : 0);
  const totalCostPrevYear = (amzAdsPrevYear ? amzAdsPrevYear.cost || 0 : 0) + (rakRPPPrevYear ? rakRPPPrevYear.cost || 0 : 0);
  const roasOf_ = (rev, cost) => cost > 0 ? rev / cost : null;

  writeSection_(sheet, row, '📊 3チャンネル合算', '#e8e0f8', 6);
  row++;

  const summaryRows = [
    ['合算売上',   totalRevenue, totalRevenuePrev, totalRevenuePrevYear || null, 'currency'],
    ['合算広告費', totalCost,    totalCostPrev,    totalCostPrevYear || null,    'currency'],
    ['合算ROAS（売上÷広告費）', roasOf_(totalRevenue, totalCost), roasOf_(totalRevenuePrev, totalCostPrev), roasOf_(totalRevenuePrevYear, totalCostPrevYear), 'roas'],
  ];

  summaryRows.forEach(r => {
    const vals = [
      r[0],
      formatVal_(r[1], r[4]),
      formatVal_(r[2], r[4]),
      pct_(r[1], r[2]),
      r[3] != null ? formatVal_(r[3], r[4]) : '-',
      r[3] != null ? pct_(r[1], r[3]) : '-',
    ];
    sheet.getRange(row, 1, 1, 6).setValues([vals]);
    colorizePctCells_(sheet, row, [4, 6]);
    row++;
  });
  row++;

  // GA4
  writeSection_(sheet, row, '🌐 自社EC（Shopify売上 + GA4トラフィック）', '#e8f4fd', 6);
  row++;

  const ga4Rows = [
    ['売上',           ga4.revenue,        ga4Prev ? ga4Prev.revenue        : 0, ga4PrevYear ? ga4PrevYear.revenue        : null, 'currency'],
    ['注文数',         ga4.shopifyOrders || ga4.transactions || 0, ga4Prev ? (ga4Prev.shopifyOrders || ga4Prev.transactions || 0) : 0, ga4PrevYear ? (ga4PrevYear.shopifyOrders || ga4PrevYear.transactions || 0) : null, 'number'],
    ['  うち定期便',   ga4.subscriptionOrders || 0, ga4Prev ? (ga4Prev.subscriptionOrders || 0) : 0, ga4PrevYear ? (ga4PrevYear.subscriptionOrders || 0) : null, 'number'],
    ['セッション数',   ga4.sessions,       ga4Prev ? ga4Prev.sessions       : 0, ga4PrevYear ? ga4PrevYear.sessions       : null, 'number'],
    ['ユーザー数',     ga4.users,          ga4Prev ? ga4Prev.users          : 0, ga4PrevYear ? ga4PrevYear.users          : null, 'number'],
    ['CVR(%)',         ga4.cvr,            ga4Prev ? ga4Prev.cvr            : 0, ga4PrevYear ? ga4PrevYear.cvr            : null, 'pct'],
    ['エンゲージメント率(%)', ga4.engagementRate, ga4Prev ? ga4Prev.engagementRate : 0, ga4PrevYear ? ga4PrevYear.engagementRate : null, 'pct'],
  ];

  ga4Rows.forEach(r => {
    const vals = [
      r[0],
      formatVal_(r[1], r[4]),
      formatVal_(r[2], r[4]),
      pct_(r[1], r[2]),
      r[3] != null ? formatVal_(r[3], r[4]) : '-',
      r[3] != null ? pct_(r[1], r[3]) : '-',
    ];
    sheet.getRange(row, 1, 1, 6).setValues([vals]);
    colorizePctCells_(sheet, row, [4, 6]);
    row++;
  });
  row++;

  // Amazon
  writeSection_(sheet, row, '📦 Amazon', '#fff8e6', 6);
  row++;

  const amzRows = [
    ['売上',     amzSales.revenue,  amzSalesPrev ? amzSalesPrev.revenue  : 0, amzSalesPrevYear ? amzSalesPrevYear.revenue  : null, 'currency'],
    ['注文数',   amzSales.orders,   amzSalesPrev ? amzSalesPrev.orders   : 0, amzSalesPrevYear ? amzSalesPrevYear.orders   : null, 'number'],
    ['セッション数', amzSales.sessions, amzSalesPrev ? amzSalesPrev.sessions : 0, amzSalesPrevYear ? amzSalesPrevYear.sessions : null, 'number'],
    ['CVR(%)',  amzSales.cvr,      amzSalesPrev ? amzSalesPrev.cvr      : 0, amzSalesPrevYear ? amzSalesPrevYear.cvr      : null, 'pct'],
    ['広告費',  amzAds.cost,       amzAdsPrev ? amzAdsPrev.cost         : 0, amzAdsPrevYear ? amzAdsPrevYear.cost         : null, 'currency'],
    ['広告ROAS', amzAds.roas,      amzAdsPrev ? amzAdsPrev.roas         : 0, amzAdsPrevYear ? amzAdsPrevYear.roas         : null, 'roas'],
  ];

  amzRows.forEach(r => {
    const vals = [
      r[0],
      formatVal_(r[1], r[4]),
      formatVal_(r[2], r[4]),
      pct_(r[1], r[2]),
      r[3] != null ? formatVal_(r[3], r[4]) : '-',
      r[3] != null ? pct_(r[1], r[3]) : '-',
    ];
    sheet.getRange(row, 1, 1, 6).setValues([vals]);
    colorizePctCells_(sheet, row, [4, 6]);
    row++;
  });
  row++;

  // 楽天
  writeSection_(sheet, row, '🛒 楽天', '#f0fff4', 6);
  row++;

  const rakRows = [
    ['売上',       rakSales.revenue,   rakSalesPrev ? rakSalesPrev.revenue   : 0, rakSalesPrevYear ? rakSalesPrevYear.revenue   : null, 'currency'],
    ['注文数',     rakSales.orders,    rakSalesPrev ? rakSalesPrev.orders    : 0, rakSalesPrevYear ? rakSalesPrevYear.orders    : null, 'number'],
    ['アクセス人数', rakSales.uv,      rakSalesPrev ? rakSalesPrev.uv        : 0, rakSalesPrevYear ? rakSalesPrevYear.uv        : null, 'number'],
    ['CVR(%)',    rakSales.cvr,       rakSalesPrev ? rakSalesPrev.cvr       : 0, rakSalesPrevYear ? rakSalesPrevYear.cvr       : null, 'pct'],
    ['RPP広告費',  rakRPP.cost,        rakRPPPrev ? rakRPPPrev.cost          : 0, rakRPPPrevYear ? rakRPPPrevYear.cost          : null, 'currency'],
    ['RPP ROAS', rakRPP.roas,        rakRPPPrev ? rakRPPPrev.roas          : 0, rakRPPPrevYear ? rakRPPPrevYear.roas          : null, 'roas'],
  ];

  rakRows.forEach(r => {
    const vals = [
      r[0],
      formatVal_(r[1], r[4]),
      formatVal_(r[2], r[4]),
      pct_(r[1], r[2]),
      r[3] != null ? formatVal_(r[3], r[4]) : '-',
      r[3] != null ? pct_(r[1], r[3]) : '-',
    ];
    sheet.getRange(row, 1, 1, 6).setValues([vals]);
    colorizePctCells_(sheet, row, [4, 6]);
    row++;
  });

  sheet.setColumnWidth(1, 200);
  [2, 3, 5].forEach(c => sheet.setColumnWidth(c, 130));
  [4, 6].forEach(c => sheet.setColumnWidth(c, 80));
  sheet.getRange(4, 2, row - 3, 5).setHorizontalAlignment('right');
  sheet.setFrozenRows(3);
  return sheet;
}
