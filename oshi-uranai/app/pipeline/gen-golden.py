#!/usr/bin/env python3
"""fetch_astro.py の計算を流用して golden データを生成する（Vitest 突合用）

- golden-positions.json: 黄経（10日時 x 10天体）
- golden-events.json:    週単位イベント（月イングレス・ボイド・月相・逆行変化・天体間アスペクト）
"""
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SKILL_SCRIPTS = Path(__file__).resolve().parents[3] / ".claude" / "skills" / "oshi-uranai-weekly" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from fetch_astro import (  # noqa: E402
    ASPECTS, BODIES, last_aspect_before, lon, planet_aspects,
    scan_moon_ingresses, scan_moon_phases, scan_retro_changes,
)

JST = timezone(timedelta(hours=9))
GOLDEN_DIR = Path(__file__).resolve().parents[1] / "tests" / "golden"

# 1970〜2026年に分散、逆行期・境界を含む10日時（UTC）
DATES = [
    "1970-03-15T03:00:00",
    "1978-11-02T12:30:00",
    "1985-07-21T21:15:00",
    "1990-01-01T00:00:00",
    "1996-04-10T06:45:00",
    "2001-09-09T09:09:00",
    "2008-12-31T23:59:00",
    "2016-02-29T15:00:00",
    "2024-08-08T08:08:00",
    "2026-07-14T09:43:00",  # 蟹座新月（W29週報の基準）
]

# イベント突合用の対象週（水星の逆行ステーションを含む週＋W29基準週）
EVENT_WEEKS = ["2024-W14", "2025-W02", "2026-W29"]

JA2EN = {name: key.split()[0] for key, name in BODIES}
ANGLE_BY_LABEL = {label: angle for angle, label in ASPECTS}
PHASE_ANGLE = {"新月": 0, "上弦の月": 90, "満月": 180, "下弦の月": 270}


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def week_range(iso_week: str):
    """ISO週 → JST月曜0:00始まり7日間のUTC区間（fetch_astro.main と同定義）"""
    y, w = iso_week.split("-W")
    monday = date.fromisocalendar(int(y), int(w), 1)
    start = datetime(monday.year, monday.month, monday.day, tzinfo=JST).astimezone(timezone.utc)
    return start, start + timedelta(days=7)


def aspects_en(dt: datetime) -> list:
    out = []
    for a in planet_aspects(dt):
        n1, n2 = a["pair"].split("-")
        out.append({"a": JA2EN[n1], "b": JA2EN[n2],
                    "angle": ANGLE_BY_LABEL[a["aspect"]], "orb": a["orb"]})
    return out


def gen_positions():
    out = []
    for s in DATES:
        dt = datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
        positions = {key.split()[0]: round(lon(key, dt), 6) for key, _label in BODIES}
        out.append({"utc": s + "Z", "positions": positions})
    dest = GOLDEN_DIR / "golden-positions.json"
    dest.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"wrote {dest} ({len(out)} dates x {len(BODIES)} bodies)")


def gen_events():
    weeks = []
    for wk in EVENT_WEEKS:
        start, end = week_range(wk)

        # fetch_astro.main と同じ手順（ボイド計算のため前後に余裕を持って走査）
        all_ing = scan_moon_ingresses(start - timedelta(days=3), end + timedelta(days=1))
        ingresses = []
        for idx, (ing, new_sign) in enumerate(all_ing):
            if not (start <= ing < end):
                continue
            prev_ing = all_ing[idx - 1][0] if idx > 0 else ing - timedelta(days=3)
            voc = last_aspect_before(ing, prev_ing)
            ingresses.append({"utc": iso(ing), "sign": new_sign,
                              "voc_start_utc": iso(voc) if voc else None})

        weeks.append({
            "week": wk,
            "start_utc": iso(start),
            "end_utc": iso(end),
            "ingresses": ingresses,
            "phases": [{"utc": iso(t), "angle": PHASE_ANGLE[n]}
                       for t, n in scan_moon_phases(start, end)],
            "retro_changes": [{"utc": iso(t), "planet": JA2EN[p],
                               "startsRetro": e.startswith("逆行開始")}
                              for t, p, e in scan_retro_changes(start, end)],
            "aspects_start": aspects_en(start),
            "aspects_end": aspects_en(end),
        })
    dest = GOLDEN_DIR / "golden-events.json"
    dest.write_text(json.dumps({"weeks": weeks}, indent=2), encoding="utf-8")
    print(f"wrote {dest} ({len(weeks)} weeks)")


if __name__ == "__main__":
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
    gen_positions()
    gen_events()
