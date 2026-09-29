#!/usr/bin/env python3
"""
month_astro.py - 1か月分の天体イベントを投稿カレンダー用に一覧化する

fetch_astro.py（週次）と同じ Skyfield + de421.bsp を使う。通信不要・JST基準。
出力は「その月に何日があるか」を俯瞰するための素材。文面は書かない。

  月相 / 太陽・惑星のサイン移動 / 逆行ステーション /
  惑星間アスペクトの正確日（3度圏の滞在日数つき＝速度フィルタ判定）/ 月曜日の一覧

使い方:
  python month_astro.py                # 今月
  python month_astro.py --month 2026-10
  python month_astro.py --month 2026-09 --md   # Markdown表で出す（カレンダーに貼る用）
"""

import argparse
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "skills" / "oshi-uranai-weekly" / "scripts"))

from fetch_astro import (  # noqa: E402
    ASPECTS, BODIES, JST, SIGNS,
    bisect_time, jst, lon, retro_flag, scan_moon_phases, separation, sign_of, wrap180,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

WD = ["月", "火", "水", "木", "金", "土", "日"]
# 速度フィルタの判定（instagram-operation-design.md 2-2）
DWELL_ORB = 3.0


def fmt(dt_utc: datetime) -> str:
    d = jst(dt_utc)
    return f"{d.month}/{d.day}（{WD[d.weekday()]}）{d:%H:%M}"


def rate(days: float) -> str:
    if days <= 3:
        return "◎ その週だけの主役"
    if days <= 8:
        return "○ 主役可（正確日が投稿週の中にあること）"
    if days <= 15:
        return "△ 背景に置く"
    return "✕ 週テーマ禁止"


def month_range(y: int, m: int):
    start = datetime(y, m, 1, tzinfo=JST)
    end = datetime(y + (m == 12), (m % 12) + 1, 1, tzinfo=JST)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def moon_phases(s, e):
    names = {"新月": "NEW MOON", "上弦の月": "FIRST QUARTER",
             "満月": "FULL MOON", "下弦の月": "LAST QUARTER"}
    out = []
    for t, name in scan_moon_phases(s, e):
        sign = SIGNS[sign_of(lon("moon", t))]
        out.append((t, name, sign, names[name]))
    return out


def ingresses(s, e):
    """月以外の天体のサイン移動"""
    out = []
    step = timedelta(hours=6)
    for key, name in BODIES:
        if key == "moon":
            continue
        t = s
        prev = sign_of(lon(key, t))
        while t < e:
            t2 = min(t + step, e)
            cur = sign_of(lon(key, t2))
            if cur != prev:
                boundary = (cur * 30.0) if (cur - prev) % 12 == 1 else (prev * 30.0)
                exact = bisect_time(
                    lambda x, b=boundary: ((lon(key, x) - b + 180) % 360) - 180, t, t2)
                out.append((exact, name, SIGNS[cur]))
                prev = cur
            t = t2
    return sorted(out)


def stations(s, e):
    out = []
    step = timedelta(hours=6)
    for key, name in BODIES:
        if key in ("sun", "moon"):
            continue
        t = s
        prev = retro_flag(key, t)
        while t < e:
            t2 = min(t + step, e)
            cur = retro_flag(key, t2)
            if cur != prev:
                out.append((t2, name, "逆行開始" if cur else "順行へ"))
                prev = cur
            t = t2
    return sorted(out)


def dwell_days(k1, k2, angle, exact):
    """オーブ3度圏に居座る日数（速度フィルタ）"""
    def g(x):
        return separation(lon(k1, x), lon(k2, x)) - angle

    edges = []
    for direction in (-1, 1):
        t = exact
        step = timedelta(hours=12)
        limit = exact + direction * timedelta(days=400)
        while (t < limit) if direction > 0 else (t > limit):
            t2 = t + direction * step
            if abs(g(t2)) >= DWELL_ORB:
                edges.append(bisect_time(
                    lambda x: abs(g(x)) - DWELL_ORB,
                    *(sorted([t, t2]))))
                break
            t = t2
        else:
            edges.append(limit)
    return abs((edges[1] - edges[0]).total_seconds()) / 86400


def aspects_exact(s, e):
    """月以外の天体間アスペクトが正確になる日時

    離角（separation）は0〜180度に折り返すため、合・衝では符号が変わらず
    ゼロ交差で拾えない。符号つきの黄経差 wrap180(l1-l2) が ±angle を
    またぐ瞬間を探す。
    """
    keys = [(k, n) for k, n in BODIES if k != "moon"]
    out = []
    step = timedelta(hours=12)
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            k1, n1 = keys[i]
            k2, n2 = keys[j]
            for angle, aname in ASPECTS:
                targets = [angle] if angle in (0, 180) else [angle, -angle]
                for v in targets:
                    def h(x, vv=v):
                        return wrap180(wrap180(lon(k1, x) - lon(k2, x)) - vv)
                    t = s
                    prev = h(t)
                    while t < e:
                        t2 = min(t + step, e)
                        cur = h(t2)
                        # ±180度の折り返しをまたいだだけの見かけの交差は捨てる
                        if (prev < 0) != (cur < 0) and abs(cur - prev) < 90:
                            exact = bisect_time(h, t, t2)
                            out.append({
                                "t": exact, "pair": f"{n1} × {n2}", "aspect": aname,
                                "days": dwell_days(k1, k2, angle, exact),
                            })
                        prev = cur
                        t = t2
    return sorted(out, key=lambda x: x["t"])


def mondays(y, m):
    d = date(y, m, 1)
    out = []
    while d.month == m:
        if d.weekday() == 0:
            out.append(d)
        d += timedelta(days=1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", help="YYYY-MM（既定：今月）")
    ap.add_argument("--md", action="store_true", help="Markdown表で出す")
    a = ap.parse_args()

    if a.month:
        y, m = (int(v) for v in a.month.split("-"))
    else:
        today = datetime.now(JST)
        y, m = today.year, today.month
    s, e = month_range(y, m)

    ph, ing, st, asp = moon_phases(s, e), ingresses(s, e), stations(s, e), aspects_exact(s, e)

    print(f"# {y}年{m}月の天体イベント（month_astro.py 実測・JST）\n")

    print("## 月相（週テーマの第一候補）")
    for t, name, sign, en in ph:
        print(f"- {fmt(t)} **{sign}{name}**　{en} IN {sign}")

    print("\n## サイン移動")
    print("- なし" if not ing else "")
    for t, name, sign in ing:
        print(f"- {fmt(t)} {name} → {sign}")

    print("\n## 逆行のステーション")
    print("- なし" if not st else "")
    for t, name, kind in st:
        print(f"- {fmt(t)} {name} {kind}")

    print("\n## 惑星間アスペクトの正確日（速度フィルタつき）")
    if a.md:
        print("\n| 正確日 | 配置 | 3度圏 | 判定 |")
        print("|---|---|---|---|")
        for x in asp:
            print(f"| {fmt(x['t'])} | {x['pair']} {x['aspect']} | {x['days']:.1f}日 | {rate(x['days'])} |")
    else:
        for x in asp:
            print(f"- {fmt(x['t'])} {x['pair']} {x['aspect']}"
                  f"／3度圏 {x['days']:.1f}日 → {rate(x['days'])}")

    print("\n## 定例枠（月曜）")
    for d in mondays(y, m):
        print(f"- {d.month}/{d.day}（月）")


if __name__ == "__main__":
    main()
