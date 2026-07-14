import { useEffect, useRef, useState } from "preact/hooks";
import geo from "../data/geo.json";
import ChartWheel from "./ChartWheel";
import { composeText } from "../lib/compose-text";
import { computeNatal, type BirthData } from "../lib/natal";
import { selectReading, type Reading, type ScoredEvent } from "../lib/scoring";
import { weeklyTransits, monthlyTransits, type Period } from "../lib/transits";
import { cardTitle, cardMeta, keyPoint, basisText } from "../lib/themes";
import { dailyConditions, pickDaysByType, DAY_TYPE_LABELS, type DayCondition } from "../lib/daily";
import { SIGNS, type NatalChart } from "../lib/types";

const STORAGE_KEY = "oshi-uranai-birth";

interface SavedBirth {
  birthdate: string;
  birthtime: string;
  timeUnknown: boolean;
  place: string;
}

function loadSaved(): SavedBirth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const YEARS: number[] = [];
for (let y = new Date().getFullYear(); y >= 1900; y--) YEARS.push(y);

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function BirthdatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const now = new Date();
  const [y0, m0, d0] = value ? value.split("-").map(Number) : [null, null, null];
  const [year, setYear] = useState(y0 ?? now.getFullYear() - 30);
  const [month, setMonth] = useState(m0 ?? 1);

  useEffect(() => {
    if (!value) return;
    const [y, m] = value.split("-").map(Number);
    setYear(y);
    setMonth(m);
  }, [value]);

  const total = daysInMonth(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  const selectedDay = y0 === year && m0 === month ? d0 : null;

  function pick(day: number) {
    onChange(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  return (
    <div class="birthdate-picker">
      <div class="ym-row">
        <select aria-label="年" value={year} onChange={(e) => setYear(Number((e.currentTarget as HTMLSelectElement).value))}>
          {YEARS.map((y) => <option value={y} key={y}>{y}年</option>)}
        </select>
        <select aria-label="月" value={month} onChange={(e) => setMonth(Number((e.currentTarget as HTMLSelectElement).value))}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option value={m} key={m}>{m}月</option>
          ))}
        </select>
        <span class="picked-date">{value ? `${y0}/${String(m0).padStart(2, "0")}/${String(d0).padStart(2, "0")}` : "日付を選んでください"}</span>
      </div>
      <div class="cal-grid" role="grid">
        {WEEKDAYS.map((w) => <span class="dow" key={w}>{w}</span>)}
        {cells.map((d, i) =>
          d === null
            ? <span key={`e${i}`} />
            : (
              <button type="button" key={d} class={d === selectedDay ? "day selected" : "day"}
                onClick={() => pick(d)}>{d}</button>
            ),
        )}
      </div>
    </div>
  );
}

function EventCard({ ev, kind, periodLabel, kicker }: {
  ev: ScoredEvent; kind: "main" | "sub"; periodLabel: string; kicker?: string;
}) {
  const composed = composeText(ev, periodLabel);
  const meta = cardMeta(ev);
  return (
    <div class={`card ${kind}`}>
      {kicker && <p class="card-kicker">{kicker}</p>}
      {meta && <p class="card-meta">{meta}</p>}
      <h4>{cardTitle(ev)}</h4>
      {kind === "main" ? (
        composed.available
          ? composed.paragraphs.map((p, i) => <p class="fortune" key={i}>{p}</p>)
          : <p class="placeholder">（この配置の鑑定テキストは準備中です）</p>
      ) : (
        composed.available && composed.sub
          ? <p class="fortune sub-text">{composed.sub}</p>
          : <p class="placeholder">（準備中）</p>
      )}
    </div>
  );
}

function fmtDay(d: DayCondition): string {
  return `${d.month}/${d.day}（${WEEKDAYS[d.weekday]}）`;
}

const DAY_TYPE_COLORS = { attack: "#7c5cbf", arrange: "#a58fd0", rest: "#c9c2da" } as const;

/** Catmull-Rom スプラインで滑らかな曲線パスを作る（yはチャート領域内にクランプ） */
function smoothPath(pts: { x: number; y: number }[], yMin: number, yMax: number): string {
  if (pts.length < 3) return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const clamp = (y: number) => Math.min(Math.max(y, yMin), yMax);
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6);
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function RhythmChart({ days, dense }: { days: DayCondition[]; dense?: boolean }) {
  const W = 560;
  const H = 150;
  const padL = 20;
  const padR = dense ? 20 : 34;
  const padT = 18;
  const padB = 30;
  const levelY = { attack: padT, arrange: (padT + H - padB) / 2, rest: H - padB } as const;
  const step = (W - padL - padR) / Math.max(days.length - 1, 1);
  const pts = days.map((d, i) => ({ x: padL + i * step, y: levelY[d.type], d }));
  const path = smoothPath(pts, padT, H - padB);
  return (
    <svg class="rhythm-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label="日ごとのバイオリズム（上にあるほど運勢がいい日、下にあるほど低迷の日）">
      <defs>
        <linearGradient id="rhythm-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#7c5cbf" stop-opacity="0.14" />
          <stop offset="0.55" stop-color="#7c5cbf" stop-opacity="0.03" />
          <stop offset="1" stop-color="#8a8496" stop-opacity="0.1" />
        </linearGradient>
      </defs>
      <rect x={padL - 12} y={padT - 10} width={W - padL - padR + 24} height={H - padT - padB + 20}
        rx="10" fill="url(#rhythm-bg)" />
      <path d={path} fill="none" stroke="#9d84cc" stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round" />
      {pts.map((p) => (
        <circle key={`${p.d.month}-${p.d.day}`} cx={p.x} cy={p.y}
          r={dense ? 3 : 4.5} fill={DAY_TYPE_COLORS[p.d.type]} />
      ))}
      {pts.map((p, i) => {
        if (dense && p.d.day % 5 !== 0 && i !== 0) return null;
        return (
          <text key={`l${p.d.month}-${p.d.day}`} x={p.x} y={H - padB + 18}
            text-anchor="middle" font-size="10" fill="#a99cc4">
            {dense ? `${p.d.month}/${p.d.day}` : `${p.d.month}/${p.d.day}(${WEEKDAYS[p.d.weekday]})`}
          </text>
        );
      })}
    </svg>
  );
}

const RHYTHM_NOTE =
  "攻める日＝動く・話す・決めるのに向く日／整える日＝段取り・見直し・判断の保留に向く日／休む日＝無理をしない日";

function WeeklyRhythm({ days }: { days: DayCondition[] }) {
  return (
    <div class="rhythm">
      <p class="block-label">今週のバイオリズム</p>
      <RhythmChart days={days} />
    </div>
  );
}

function MonthlyRhythm({ days }: { days: DayCondition[] }) {
  const types = ["attack", "arrange", "rest"] as const;
  return (
    <div class="rhythm">
      <p class="block-label">今月のバイオリズム</p>
      <RhythmChart days={days} dense />
      <ul class="rhythm-rows">
        {types.map((type) => {
          const picked = pickDaysByType(days, type, 4);
          return (
            <li key={type}>
              <span class={`day-chip ${type}`}><span class="chip-type">{DAY_TYPE_LABELS[type]}</span></span>
              <span class="rhythm-dates">
                {picked.length > 0 ? picked.map(fmtDay).join("・") : "今月は特になし"}
              </span>
            </li>
          );
        })}
      </ul>
      <p class="rhythm-note">{RHYTHM_NOTE}</p>
    </div>
  );
}

function ReadingResult({ reading, period, kind, days }: {
  reading: Reading; period: Period; kind: "weekly" | "monthly"; days: DayCondition[];
}) {
  return (
    <div>
      <p class="period-label">{period.label}</p>
      <EventCard ev={reading.main} kind="main" periodLabel={period.label}
        kicker={kind === "weekly" ? "今週の運勢" : "今月の運勢"} />
      <div class="keypoint">
        <p class="block-label">{kind === "weekly" ? "今週" : "今月"}いちばん大切にしてほしいこと</p>
        <p class="kp-text">{keyPoint(reading.main)}</p>
      </div>
      {kind === "weekly" ? <WeeklyRhythm days={days} /> : <MonthlyRhythm days={days} />}
      {reading.subs.map((ev) => (
        <EventCard ev={ev} kind="sub" key={ev.patternId} periodLabel={period.label} />
      ))}
      <details class="basis-details">
        <summary>この運勢の星の根拠を見る</summary>
        <ul>
          {reading.all.map((ev) => (
            <li key={ev.patternId}>{basisText(ev)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

type Result = {
  chart: NatalChart;
  weekly: { reading: Reading; period: Period; days: DayCondition[] };
  monthly: { reading: Reading; period: Period; days: DayCondition[] };
};

export default function ReadingApp() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");
  const [birthdate, setBirthdate] = useState("");

  // localStorageからの復元はマウント後に行う。SSR時はlocalStorageが無く、
  // Preactのハイドレーションはサーバ描画済みのvalueを上書きしないため。
  useEffect(() => {
    const saved = loadSaved();
    const form = formRef.current;
    if (!saved || !form) return;
    const time = form.elements.namedItem("birthtime") as HTMLInputElement | null;
    const unknown = form.elements.namedItem("timeUnknown") as HTMLInputElement | null;
    const place = form.elements.namedItem("place") as HTMLSelectElement | null;
    setBirthdate(saved.birthdate ?? "");
    if (time) time.value = saved.birthtime ?? "";
    if (unknown) unknown.checked = saved.timeUnknown ?? false;
    if (place) place.value = saved.place ?? "";
  }, []);

  function computeFrom(input: SavedBirth): Result | null {
    const place = geo.find((g) => g.id === input.place);
    if (!input.birthdate || !place) return null;
    const [y, m, d] = input.birthdate.split("-").map(Number);
    const [hh, mm] = !input.timeUnknown && input.birthtime
      ? input.birthtime.split(":").map(Number) : [null, null];
    const birth: BirthData = {
      year: y, month: m, day: d, hour: hh, minute: mm,
      lat: place.lat, lon: place.lon, tzOffsetMinutes: place.tzOffsetMinutes,
    };
    const chart = computeNatal(birth);
    const now = new Date();
    const w = weeklyTransits(chart, now);
    const mo = monthlyTransits(chart, now);
    return {
      chart,
      weekly: {
        reading: selectReading(w.events, chart, "weekly", w.period.label),
        period: w.period,
        days: dailyConditions(chart, w.period),
      },
      monthly: {
        reading: selectReading(mo.events, chart, "monthly", mo.period.label),
        period: mo.period,
        days: dailyConditions(chart, mo.period),
      },
    };
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    if (!birthdate) return;
    const input: SavedBirth = {
      birthdate,
      birthtime: (fd.get("birthtime") as string) ?? "",
      timeUnknown: fd.get("timeUnknown") === "on",
      place: (fd.get("place") as string) ?? "",
    };
    const r = computeFrom(input);
    if (!r) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input)); } catch { /* ignore */ }
    setResult(r);
  }

  return (
    <div class="reading-app">
      <form ref={formRef} onSubmit={onSubmit}>
        <div class="field">
          <span class="field-label">生年月日</span>
          <BirthdatePicker value={birthdate} onChange={setBirthdate} />
        </div>
        <label>出生時刻
          <input type="time" name="birthtime" />
        </label>
        <label class="inline">
          <input type="checkbox" name="timeUnknown" /> 時刻がわからない
        </label>
        <label>出生地
          <select name="place" required>
            <option value="">選択してください</option>
            <optgroup label="日本">
              {geo.filter((g) => !("region" in g)).map((g) => (
                <option value={g.id} key={g.id}>{g.label}</option>
              ))}
            </optgroup>
            <optgroup label="海外">
              {geo.filter((g) => "region" in g).map((g) => (
                <option value={g.id} key={g.id}>{g.label}</option>
              ))}
            </optgroup>
          </select>
          <span class="note">※海外はサマータイム（夏時間）を考慮しない標準時で計算します</span>
        </label>
        <button type="submit">占う</button>
      </form>

      {result && (
        <div class="result">
          <section class="chart-section">
            <ChartWheel chart={result.chart} />
            <p class="chart-summary">
              太陽は{SIGNS[result.chart.points.sun!.sign]}、
              月は{SIGNS[result.chart.points.moon!.sign]}
              {result.chart.moonUncertain && "（時刻により前後の星座かも）"}
              {result.chart.birthTimeKnown && result.chart.points.asc
                ? `、アセンダントは${SIGNS[result.chart.points.asc.sign]}`
                : "。"}
            </p>
            {!result.chart.birthTimeKnown && (
              <p class="note">出生時刻が未入力のため、アセンダントとハウスを使わない範囲で占っています。</p>
            )}
          </section>

          <div class="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "weekly"} class={tab === "weekly" ? "active" : ""}
              onClick={() => setTab("weekly")}>今週の運勢</button>
            <button role="tab" aria-selected={tab === "monthly"} class={tab === "monthly" ? "active" : ""}
              onClick={() => setTab("monthly")}>今月の運勢</button>
          </div>

          {tab === "weekly"
            ? <ReadingResult {...result.weekly} kind="weekly" />
            : <ReadingResult {...result.monthly} kind="monthly" />}
        </div>
      )}
    </div>
  );
}
