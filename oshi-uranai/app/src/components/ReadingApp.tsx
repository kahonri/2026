import { useEffect, useRef, useState } from "preact/hooks";
import geo from "../data/geo.json";
import ChartWheel from "./ChartWheel";
import { composeText } from "../lib/compose-text";
import { computeNatal, type BirthData } from "../lib/natal";
import { selectReading, type Reading, type ScoredEvent } from "../lib/scoring";
import { weeklyTransits, monthlyTransits, type Period } from "../lib/transits";
import { cardTitle, basisText } from "../lib/themes";
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

function EventCard({ ev, kind, periodLabel }: { ev: ScoredEvent; kind: "main" | "sub"; periodLabel: string }) {
  const composed = composeText(ev, periodLabel);
  return (
    <div class={`card ${kind}`}>
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

function ReadingResult({ reading, period }: { reading: Reading; period: Period }) {
  return (
    <div>
      <p class="period-label">{period.label}</p>
      <EventCard ev={reading.main} kind="main" periodLabel={period.label} />
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
  weekly: { reading: Reading; period: Period };
  monthly: { reading: Reading; period: Period };
};

export default function ReadingApp() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [tab, setTab] = useState<"weekly" | "monthly">("weekly");

  // localStorageからの復元はマウント後に行う。SSR時はlocalStorageが無く、
  // Preactのハイドレーションはサーバ描画済みのvalueを上書きしないため。
  useEffect(() => {
    const saved = loadSaved();
    const form = formRef.current;
    if (!saved || !form) return;
    const date = form.elements.namedItem("birthdate") as HTMLInputElement | null;
    const time = form.elements.namedItem("birthtime") as HTMLInputElement | null;
    const unknown = form.elements.namedItem("timeUnknown") as HTMLInputElement | null;
    const place = form.elements.namedItem("place") as HTMLSelectElement | null;
    if (date) date.value = saved.birthdate ?? "";
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
      weekly: { reading: selectReading(w.events, chart, "weekly", w.period.label), period: w.period },
      monthly: { reading: selectReading(mo.events, chart, "monthly", mo.period.label), period: mo.period },
    };
  }

  function onSubmit(e: Event) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const input: SavedBirth = {
      birthdate: (fd.get("birthdate") as string) ?? "",
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
        <label>生年月日
          <input type="date" name="birthdate" required min="1900-01-01" max="2026-12-31" />
        </label>
        <label>出生時刻
          <input type="time" name="birthtime" />
        </label>
        <label class="inline">
          <input type="checkbox" name="timeUnknown" /> 時刻がわからない
        </label>
        <label>出生地
          <select name="place" required>
            <option value="">選択してください</option>
            {geo.map((g) => (
              <option value={g.id} key={g.id}>{g.label}</option>
            ))}
          </select>
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
            ? <ReadingResult {...result.weekly} />
            : <ReadingResult {...result.monthly} />}
        </div>
      )}
    </div>
  );
}
