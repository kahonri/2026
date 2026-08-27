#!/usr/bin/env python3
"""
daily_astro.py - 誕生日投稿（毎日投稿）用の天体データを1週間分まとめて計算する

oshi-uranai-weekly の fetch_astro.py（Skyfield + de421.bsp）を流用。APIキー・通信不要。
設計書：oshi-uranai/birthday-reading-design.md

出力内容（各日・正午JST基準）:
  - 太陽のサイン・度数・デーカン（前半/真ん中/後半）→ 性格の軸ストックのキー
  - 年の骨格：遅い天体（木星〜冥王星）が太陽に作るアスペクト（オーブ6度以内）
  - 滑り出しの色：速い天体（水星・金星・火星）が太陽に作るアスペクト（オーブ6度以内）
  - その日の月のサイン（移動があれば時刻つき）
  - イベント：月相・逆行の開始/終了・遅い天体の星座入り（★リール候補マーク）
  - 週の冒頭に「今週、木星・土星が効いている誕生日」一覧（オーブ3度以内・木曜正午基準）

使い方:
  python daily_astro.py                  # 今週（月曜〜日曜）
  python daily_astro.py --next           # 来週
  python daily_astro.py --week 2026-W36  # ISO週番号指定
"""

import argparse
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# 週間スキルの計算モジュールを流用（de421.bspもそちらのフォルダのものを使う）
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "oshi-uranai-weekly" / "scripts"))
import fetch_astro as fa

JST = fa.JST
SLOW = [("jupiter barycenter", "木星"), ("saturn barycenter", "土星"),
        ("uranus barycenter", "天王星"), ("neptune barycenter", "海王星"),
        ("pluto barycenter", "冥王星")]
FAST = [("mercury", "水星"), ("venus", "金星"), ("mars", "火星")]
BACKBONE = SLOW[:2]  # 「効いている誕生日」一覧は木星・土星のみ
DECANS = ["前半", "真ん中", "後半"]
SUN_ORB = 6.0   # 日次の太陽アスペクト
YEAR_ORB = 3.0  # 「効いている誕生日」一覧


def decan_of(l: float) -> str:
    return DECANS[int((l % 30) // 10)]


def sun_aspects_at(dt_utc: datetime, bodies) -> list:
    """指定天体群が太陽に作るアスペクト（オーブ小さい順）"""
    s = fa.lon("sun", dt_utc)
    out = []
    for key, name in bodies:
        sep = fa.separation(s, fa.lon(key, dt_utc))
        for angle, aname in fa.ASPECTS:
            orb = abs(sep - angle)
            if orb <= SUN_ORB:
                r = "（逆行中）" if fa.retro_flag(key, dt_utc) else ""
                out.append((orb, f"{name} {aname}（オーブ{orb:.1f}度）{r}"))
    return [t for _, t in sorted(out)]


def year_sun_table(year: int) -> list:
    """その年の毎日正午JSTの太陽黄経（誕生日→太陽位置の対応表）"""
    out = []
    d = date(year, 1, 1)
    while d.year == year:
        dtu = datetime(d.year, d.month, d.day, 12, tzinfo=JST).astimezone(timezone.utc)
        out.append((d, fa.lon("sun", dtu)))
        d += timedelta(days=1)
    return out


def birthday_hits(planet_lon: float, table: list) -> list:
    """トランジット天体の位置に対し、太陽がアスペクト圏内（オーブ3度）に入る誕生日の範囲"""
    per = {}
    for d, sl in table:
        for angle, aname in fa.ASPECTS:
            if abs(fa.separation(sl, planet_lon) - angle) <= YEAR_ORB:
                per.setdefault(aname, []).append((d, sl))
    lines = []
    for _, aname in fa.ASPECTS:
        if aname not in per:
            continue
        runs, cur = [], [per[aname][0]]
        for item in per[aname][1:]:
            if (item[0] - cur[-1][0]).days == 1:
                cur.append(item)
            else:
                runs.append(cur)
                cur = [item]
        runs.append(cur)
        parts = []
        for run in runs:
            d1, d2 = run[0][0], run[-1][0]
            mid_lon = run[len(run) // 2][1]
            parts.append(f"{d1.month}/{d1.day}〜{d2.month}/{d2.day}生まれ"
                         f"（{fa.SIGNS[fa.sign_of(mid_lon)]}・{decan_of(mid_lon)}）")
        lines.append(f"{aname}：" + " ／ ".join(parts))
    return lines


def hm(dt_utc: datetime) -> str:
    return dt_utc.astimezone(JST).strftime("%H:%M")


def main():
    ap = argparse.ArgumentParser(description="誕生日投稿用の天体データを1週間分計算")
    ap.add_argument("--week", help="ISO週番号（例: 2026-W36）。省略時は今週")
    ap.add_argument("--next", action="store_true", help="来週を対象にする")
    args = ap.parse_args()

    if args.week:
        y, w = args.week.upper().split("-W")
        monday = date.fromisocalendar(int(y), int(w), 1)
    else:
        today = date.today()
        monday = today - timedelta(days=today.weekday())
        if args.next:
            monday += timedelta(days=7)
    sunday = monday + timedelta(days=6)
    iso_y, iso_w, _ = monday.isocalendar()

    start_utc = datetime(monday.year, monday.month, monday.day, tzinfo=JST).astimezone(timezone.utc)
    end_utc = start_utc + timedelta(days=7)

    # 週単位で一度だけ計算するもの
    all_ing = fa.scan_moon_ingresses(start_utc - timedelta(days=1), end_utc + timedelta(days=1))
    phases = fa.scan_moon_phases(start_utc, end_utc)
    retro_changes = fa.scan_retro_changes(start_utc, end_utc)
    table = year_sun_table(monday.year)
    thursday_noon = start_utc + timedelta(days=3, hours=12)

    print(f"# 誕生日投稿用データ：{iso_y}-W{iso_w:02d}"
          f"（{monday.month}/{monday.day} 月 〜 {sunday.month}/{sunday.day} 日）\n")

    print(f"## 今週、年の骨格が効いている誕生日（木星・土星／オーブ{YEAR_ORB}度以内・木曜正午基準）")
    for key, name in BACKBONE:
        p_lon = fa.lon(key, thursday_noon)
        r = "・逆行中" if fa.retro_flag(key, thursday_noon) else ""
        print(f"\n### {name}（{fa.SIGNS[fa.sign_of(p_lon)]} {p_lon % 30:.1f}度{r}）")
        hits = birthday_hits(p_lon, table)
        if hits:
            for h in hits:
                print(f"- {h}")
        else:
            print("- 圏内の誕生日なし")

    # 各日
    for i in range(7):
        day = monday + timedelta(days=i)
        wd = "月火水木金土日"[day.weekday()]
        day_start = datetime(day.year, day.month, day.day, tzinfo=JST)
        day_start_utc = day_start.astimezone(timezone.utc)
        day_end_utc = (day_start + timedelta(days=1)).astimezone(timezone.utc)
        noon_utc = (day_start + timedelta(hours=12)).astimezone(timezone.utc)

        sun_lon = fa.lon("sun", noon_utc)
        sign = fa.SIGNS[fa.sign_of(sun_lon)]
        dec = decan_of(sun_lon)

        print(f"\n## {day.month}/{day.day}（{wd}）")
        print(f"- 太陽：{sign} {sun_lon % 30:.1f}度（{dec}）→ ストック「{sign}・{dec}」")

        slow_asp = sun_aspects_at(noon_utc, SLOW)
        fast_asp = sun_aspects_at(noon_utc, FAST)
        print("- 年の骨格（遅い天体→太陽）：" + ("／".join(slow_asp) if slow_asp else "なし"))
        print("- 滑り出しの色（速い天体→太陽）：" + ("／".join(fast_asp) if fast_asp else "なし"))

        moon_sign = fa.SIGNS[fa.sign_of(fa.lon("moon", day_start_utc))]
        moves = [(t, s) for t, s in all_ing if day_start_utc <= t < day_end_utc]
        if moves:
            moved = "、".join(f"{hm(t)}から{fa.SIGNS[s]}" for t, s in moves)
            print(f"- 月：{moon_sign}（{moved}）")
        else:
            print(f"- 月：{moon_sign}")

        events = []
        for t, n in phases:
            if day_start_utc <= t < day_end_utc:
                events.append(f"{n} {hm(t)} ★リール候補")
        for t, p, e in retro_changes:
            if day_start_utc <= t < day_end_utc:
                events.append(f"{p} {e} ★リール候補")
        for key, name in SLOW + FAST:
            s1 = fa.sign_of(fa.lon(key, day_start_utc))
            s2 = fa.sign_of(fa.lon(key, day_end_utc))
            if s1 != s2:
                star = " ★リール候補" if (key, name) in SLOW else ""
                events.append(f"{name}が{fa.SIGNS[s2]}入り{star}")
        if events:
            print("- イベント：" + "／".join(events))


if __name__ == "__main__":
    main()
