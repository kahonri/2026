// ================================================================
// 15_AnnualTrend.gs
// 「📈 年間推移」シートと「📝 出来事メモ」シートを作る（2026-10-19追加）
// ================================================================
// setupAnnualTrendSheet() をエディタから1回実行するだけ。
// 中身はすべて数式で「📋 月次履歴」を参照するので、以後は月次履歴が
// 更新されるたびに自動で最新になる（トリガー追加・パイプライン変更なし）。
// 再実行すると「📈 年間推移」は作り直す。「📝 出来事メモ」は既存なら触らない。
// ※エディタ実行時に getUi().alert() はハングするので Logger.log のみ使う。

const TREND_SHEET = '📈 年間推移';
const MEMO_SHEET = '📝 出来事メモ';
const MONTHLY_SHEET = '📋 月次履歴';
const TREND_FIRST = 10;  // 月別表の1行目（データ）
const TREND_LAST = 70;   // 月別表の最終行（約5年分）

function setupAnnualTrendSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(MONTHLY_SHEET)) throw new Error(MONTHLY_SHEET + ' がありません');

  setupMemoSheet_(ss);

  let sh = ss.getSheetByName(TREND_SHEET);
  if (sh) {
    sh.getCharts().forEach(c => sh.removeChart(c));
    sh.clear();
  } else {
    sh = ss.insertSheet(TREND_SHEET, 0);
  }

  const H = "'" + MONTHLY_SHEET + "'!";
  const M = "'" + MEMO_SHEET + "'!";
  const f = TREND_FIRST, l = TREND_LAST;
  const col = c => c + f + ':' + c + l; // 例: A10:A70
  // 月次履歴の列: A年月 B自社サイト売上 J Amazon売上 L Amazon広告費 N 楽天売上 P 楽天RPP広告費
  const pick = srcCol => '=MAP(' + col('A') + ',LAMBDA(m,IF(m="",,SUMPRODUCT((TEXT(' + H + '$A$2:$A$300,"yyyy-mm")=m)*IFERROR(VALUE(' + H + '$' + srcCol + '$2:$' + srcCol + '$300),0)))))';

  // ── 見出し ──
  sh.getRange('A1').setValue('📈 COSS 年間推移（3チャネル合算）').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('元データ：📋 月次履歴（毎月3日に自動更新）。出来事は「📝 出来事メモ」に書くと月別表に出ます。データは2025年6月から。')
    .setFontColor('#666666');

  // ── KPIカード（4行目=ラベル, 5行目=数値）──
  const A = col('A'), E = col('E'), G = col('G'), J = col('J');
  const cards = [
    ['最新月（確定分）', '=IFERROR(LET(a,FILTER(' + A + ',' + A + '<>""),INDEX(a,ROWS(a))),"")'],
    ['その月の売上', '=IFERROR(XLOOKUP(A5,' + A + ',' + E + '),"")'],
    ['前年同月比', '=IFERROR(IF(XLOOKUP(A5,' + A + ',' + G + ')="","—",XLOOKUP(A5,' + A + ',' + G + ')),"—")'],
    ['=IFERROR(LEFT(A5,4)&"年の累計（1〜"&VALUE(RIGHT(A5,2))&"月）","今年の累計")',
      '=IFERROR(SUM(FILTER(' + E + ',LEFT(' + A + ',4)=LEFT(A5,4))),"")'],
    ['=IFERROR((LEFT(A5,4)-1)&"年の同じ期間","前年の同じ期間")',
      '=IFERROR(LET(y,TEXT(LEFT(A5,4)-1,"0"),r,FILTER(' + E + ',LEFT(' + A + ',4)=y,RIGHT(' + A + ',2)<=RIGHT(A5,2)),IF(ROWS(r)<VALUE(RIGHT(A5,2)),"データ不足",SUM(r))),"データ不足")'],
    ['前年同期比', '=IF(ISNUMBER(E5),D5/E5-1,"—")'],
    ['直近12か月の合計', '=IFERROR(IF(XLOOKUP(A5,' + A + ',' + J + ')="","12か月未満",XLOOKUP(A5,' + A + ',' + J + ')),"")'],
  ];
  cards.forEach((c, i) => {
    const lab = sh.getRange(4, i + 1), val = sh.getRange(5, i + 1);
    if (String(c[0]).startsWith('=')) lab.setFormula(c[0]); else lab.setValue(c[0]);
    val.setFormula(c[1]);
  });
  sh.getRange(4, 1, 1, cards.length).setFontColor('#555555').setFontSize(9).setWrap(true)
    .setBackground('#f3f0fa');
  sh.getRange(5, 1, 1, cards.length).setFontSize(18).setFontWeight('bold').setBackground('#f3f0fa')
    .setHorizontalAlignment('left');
  sh.getRange('B5').setNumberFormat('¥#,##0');
  sh.getRange('C5').setNumberFormat('+0.0%;-0.0%;0.0%');
  sh.getRange('D5:E5').setNumberFormat('¥#,##0');
  sh.getRange('F5').setNumberFormat('+0.0%;-0.0%;0.0%');
  sh.getRange('G5').setNumberFormat('¥#,##0');
  sh.getRange('A7').setValue('※前年同期比は、前年の同じ月がそろっている場合だけ出ます（2025年は6月から）。')
    .setFontColor('#888888').setFontSize(9);

  // ── 月別表 ──
  const headers = ['年月', '自社サイト', 'Amazon', '楽天', '合計売上', '前年同月の売上', '前年同月比',
    '広告費（Amazon＋楽天RPP）', 'ROAS（売上÷広告費）', '直近12か月の合計', '出来事'];
  sh.getRange(f - 1, 1, 1, headers.length).setValues([headers])
    .setBackground('#0f3460').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);

  sh.getRange('A' + f).setFormula('=IFERROR(SORT(UNIQUE(FILTER(TEXT(' + H + 'A2:A300,"yyyy-mm"),' + H + 'A2:A300<>""))),"")');
  sh.getRange('B' + f).setFormula(pick('B'));
  sh.getRange('C' + f).setFormula(pick('J'));
  sh.getRange('D' + f).setFormula(pick('N'));
  sh.getRange('E' + f).setFormula('=MAP(' + col('A') + ',' + col('B') + ',' + col('C') + ',' + col('D') + ',LAMBDA(m,b,c,d,IF(m="",,b+c+d)))');
  sh.getRange('F' + f).setFormula('=MAP(' + col('A') + ',LAMBDA(m,IF(m="",,LET(p,TEXT(EDATE(DATEVALUE(m&"-01"),-12),"yyyy-mm"),XLOOKUP(p,' + col('A') + ',' + col('E') + ',"")))))');
  sh.getRange('G' + f).setFormula('=MAP(' + col('E') + ',' + col('F') + ',LAMBDA(e,p,IF(OR(p="",p=0),,e/p-1)))');
  sh.getRange('H' + f).setFormula('=MAP(' + col('A') + ',LAMBDA(m,IF(m="",,SUMPRODUCT((TEXT(' + H + '$A$2:$A$300,"yyyy-mm")=m)*(IFERROR(VALUE(' + H + '$L$2:$L$300),0)+IFERROR(VALUE(' + H + '$P$2:$P$300),0))))))');
  sh.getRange('I' + f).setFormula('=MAP(' + col('E') + ',' + col('H') + ',LAMBDA(e,h,IF(OR(h="",h=0),,e/h)))');
  sh.getRange('J' + f).setFormula('=MAP(' + col('A') + ',LAMBDA(m,IF(m="",,LET(s,TEXT(EDATE(DATEVALUE(m&"-01"),-11),"yyyy-mm"),k,ARRAYFORMULA((' + col('A') + '>=s)*(' + col('A') + '<=m)*(' + col('A') + '<>"")),IF(SUM(k)<12,,SUMPRODUCT(k,' + col('E') + '))))))');
  sh.getRange('K' + f).setFormula('=MAP(' + col('A') + ',LAMBDA(m,IF(m="",,IFERROR(TEXTJOIN("／",TRUE,FILTER(' + M + 'B2:B500,TEXT(' + M + 'A2:A500,"yyyy-mm")=m)),""))))');

  const n = l - f + 1;
  sh.getRange(f, 2, n, 5).setNumberFormat('¥#,##0');
  sh.getRange(f, 7, n, 1).setNumberFormat('+0%;-0%;0%');
  sh.getRange(f, 8, n, 1).setNumberFormat('¥#,##0');
  sh.getRange(f, 9, n, 1).setNumberFormat('0%');
  sh.getRange(f, 10, n, 1).setNumberFormat('¥#,##0');
  sh.getRange(f, 11, n, 1).setWrap(true);

  sh.setFrozenRows(f - 1);
  sh.setColumnWidth(1, 90);
  for (let c = 2; c <= 10; c++) sh.setColumnWidth(c, 120);
  sh.setColumnWidth(11, 320);
  sh.setRowHeight(5, 40);

  // ── グラフ（表の右側に2つ）──
  const stacked = sh.newChart().asColumnChart()
    .addRange(sh.getRange('A' + (f - 1) + ':A' + l))
    .addRange(sh.getRange('B' + (f - 1) + ':D' + l))
    .setStacked()
    .setNumHeaders(1)
    .setOption('title', '月別売上（チャネル別）')
    .setOption('colors', ['#4f6bed', '#f29d38', '#d6455d'])
    .setOption('legend', { position: 'top' })
    .setPosition(4, 13, 0, 0)
    .setOption('width', 640).setOption('height', 320)
    .build();
  sh.insertChart(stacked);

  const rolling = sh.newChart().asLineChart()
    .addRange(sh.getRange('A' + (f - 1) + ':A' + l))
    .addRange(sh.getRange('J' + (f - 1) + ':J' + l))
    .setNumHeaders(1)
    .setOption('title', '直近12か月の売上合計（伸びているか・縮んでいるか）')
    .setOption('colors', ['#0f3460'])
    .setOption('legend', { position: 'none' })
    .setOption('pointSize', 5)
    .setPosition(22, 13, 0, 0)
    .setOption('width', 640).setOption('height', 300)
    .build();
  sh.insertChart(rolling);

  ss.setActiveSheet(sh);
  Logger.log(TREND_SHEET + ' を作成しました');
}

/** 「📝 出来事メモ」シート（無ければ作る。あれば何もしない＝書いたメモを消さない） */
function setupMemoSheet_(ss) {
  if (ss.getSheetByName(MEMO_SHEET)) return;
  const sh = ss.insertSheet(MEMO_SHEET);
  sh.getRange(1, 1, 1, 3).setValues([['日付', '出来事（月別表に表示されます）', 'チャネル（任意）']])
    .setBackground('#0f3460').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(2, 1, 3, 3).setValues([
    [new Date(2026, 7, 20), 'Amazon広告が表示0回に（出品SKU 4600→4605の変更で広告が旧SKUのまま）', 'Amazon'],
    [new Date(2026, 8, 1), 'COSS THE GEL リニューアル', '全体'],
    [new Date(2026, 9, 19), 'Amazon広告をSKU 4605へ付け替え／販売終了のセット商品の広告を停止', 'Amazon'],
  ]);
  sh.getRange('A2:A500').setNumberFormat('yyyy/mm/dd');
  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 480);
  sh.setColumnWidth(3, 120);
  sh.setFrozenRows(1);
}
