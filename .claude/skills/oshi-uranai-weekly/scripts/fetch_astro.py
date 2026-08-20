#!/usr/bin/env python3
"""
fetch_astro.py - 週間占い用の天体データをローカル計算で取得する

Skyfield + NASA JPL天文暦（de421.bsp）を使用。APIキー・通信不要（初回のみde421.bspを自動DL）。
トロピカル（西洋占星術）方式・日本時間（JST）基準。

出力内容:
  - 全惑星のサイン位置（週初め・週末）＋逆行フラグ
  - 週内の逆行開始・終了
  - 月の星座入り（イングレス）時刻とボイドタイム
  - 月相（新月・上弦・満月・下弦）
  - 主要5アスペクト（合・衝・スクエア・トライン・セクスタイル、オーブ6度以内）

使い方:
  python fetch_astro.py                  # 今週（月曜〜日曜）
  python fetch_astro.py --next           # 来週
  python fetch_astro.py --week 2026-W29  # ISO週番号指定
  python fetch_astro.py --json           # JSON出力
"""

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from skyfield.api import Loader
from skyfield.framelib import ecliptic_frame

JST = timezone(timedelta(hours=9))
SIGNS = ["牡羊座", "牡牛座", "双子座", "蟹座", "獅子座", "乙女座",
         "天秤座", "蠍座", "射手座", "山羊座", "水瓶座", "魚座"]
BODIES = [
    ("sun", "太陽"), ("moon", "月"), ("mercury", "水星"), ("venus", "金星"),
    ("mars", "火星"), ("jupiter barycenter", "木星"), ("saturn barycenter", "土星"),
    ("uranus barycenter", "天王星"), ("neptune barycenter", "海王星"),
    ("pluto barycenter", "冥王星"),
]
ASPECTS = [(0, "コンジャンクション（合）"), (60, "セクスタイル"), (90, "スクエア"),
           (120, "トライン"), (180, "オポジション（衝）")]
ASPECT_ORB = 6.0        # 天体間アスペクトの許容オーブ
VOC_ASPECT_ORB = 0.0    # ボイド判定は「正確なアスペクト成立時刻」を求める

_loader = Loader(str(Path(__file__).parent))
_ts = _loader.timescale()
_eph = _loader("de421.bsp")
_earth = _eph["earth"]


def lon(body_key: str, dt_utc: datetime) -> float:
    """黄経（トロピカル・度）"""
    t = _ts.from_datetime(dt_utc)
    _, l, _ = _earth.at(t).observe(_eph[body_key]).apparent().frame_latlon(ecliptic_frame)
    return l.degrees % 360


def wrap180(x: float) -> float:
    return (x + 180) % 360 - 180


def separation(a: float, b: float) -> float:
    """2天体の離角 0〜180度"""
    d = abs(a - b) % 360
    return min(d, 360 - d)


def bisect_time(f, lo: datetime, hi: datetime, tol_sec: int = 30) -> datetime:
    """f(lo)とf(hi)の符号が異なる前提で、f=0 の時刻を二分探索"""
    flo = f(lo)
    while (hi - lo).total_seconds() > tol_sec:
        mid = lo + (hi - lo) / 2
        fm = f(mid)
        if (flo < 0) == (fm < 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return lo + (hi - lo) / 2


def sign_of(l: float) -> int:
    return int(l // 30)


def scan_moon_ingresses(start_utc: datetime, end_utc: datetime) -> list:
    """[start, end] 内の月の星座入り時刻（UTC）を返す"""
    step = timedelta(minutes=30)
    out = []
    t = start_utc
    prev_sign = sign_of(lon("moon", t))
    while t < end_utc:
        t2 = min(t + step, end_utc)
        s2 = sign_of(lon("moon", t2))
        if s2 != prev_sign:
            boundary = (prev_sign + 1) % 12 * 30.0

            def f(x, b=boundary):
                return wrap180(lon("moon", x) - b)

            exact = bisect_time(f, t, t2)
            out.append((exact, s2))
            prev_sign = s2
        t = t2
    return out


def scan_moon_phases(start_utc: datetime, end_utc: datetime) -> list:
    """新月・上弦・満月・下弦の時刻（UTC）"""
    names = {0: "新月", 90: "上弦の月", 180: "満月", 270: "下弦の月"}
    step = timedelta(hours=1)
    out = []
    t = start_utc

    def phase(x):
        return (lon("moon", x) - lon("sun", x)) % 360

    prev = phase(t)
    while t < end_utc:
        t2 = min(t + step, end_utc)
        cur = phase(t2)
        for angle, name in names.items():
            d1, d2 = wrap180(prev - angle), wrap180(cur - angle)
            if d1 < 0 <= d2:
                exact = bisect_time(lambda x, a=angle: wrap180(phase(x) - a), t, t2)
                out.append((exact, name))
        prev = cur
        t = t2
    return out


def last_aspect_before(ingress_utc: datetime, prev_ingress_utc: datetime) -> datetime | None:
    """月が現在のサイン滞在中に成立した最後の正確なメジャーアスペクト時刻（=ボイド開始）"""
    step = timedelta(minutes=30)
    others = [k for k, _ in BODIES if k != "moon"]
    latest = None
    t = prev_ingress_utc
    prev_sep = {k: separation(lon("moon", t), lon(k, t)) for k in others}
    while t < ingress_utc:
        t2 = min(t + step, ingress_utc)
        for k in others:
            cur = separation(lon("moon", t2), lon(k, t2))
            for angle, _ in ASPECTS:
                d1, d2 = prev_sep[k] - angle, cur - angle
                if d1 == 0 or (d1 < 0) != (d2 < 0):
                    exact = bisect_time(
                        lambda x, kk=k, a=angle: separation(lon("moon", x), lon(kk, x)) - a,
                        t, t2)
                    if latest is None or exact > latest:
                        latest = exact
            prev_sep[k] = cur
        t = t2
    return latest


def retro_flag(key: str, dt_utc: datetime) -> bool:
    return wrap180(lon(key, dt_utc + timedelta(hours=1)) - lon(key, dt_utc)) < 0


def scan_retro_changes(start_utc: datetime, end_utc: datetime) -> list:
    """週内の逆行開始・終了（月・太陽以外）"""
    out = []
    for key, name in BODIES:
        if key in ("sun", "moon"):
            continue
        prev = retro_flag(key, start_utc)
        t = start_utc
        step = timedelta(hours=6)
        while t < end_utc:
            t2 = min(t + step, end_utc)
            cur = retro_flag(key, t2)
            if cur != prev:
                out.append((t2, name, "逆行開始" if cur else "逆行終了（順行へ）"))
                prev = cur
            t = t2
    return out


def planet_aspects(dt_utc: datetime) -> list:
    """月以外の天体間の主要アスペクト（オーブ6度以内）"""
    keys = [(k, n) for k, n in BODIES if k != "moon"]
    lons = {k: lon(k, dt_utc) for k, _ in keys}
    out = []
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            k1, n1 = keys[i]
            k2, n2 = keys[j]
            sep = separation(lons[k1], lons[k2])
            for angle, aname in ASPECTS:
                orb = abs(sep - angle)
                if orb <= ASPECT_ORB:
                    out.append({"pair": f"{n1}-{n2}", "aspect": aname, "orb": round(orb, 2)})
    return sorted(out, key=lambda x: x["orb"])


def jst(dt_utc: datetime) -> datetime:
    return dt_utc.astimezone(JST)


def fmt(dt_utc: datetime) -> str:
    d = jst(dt_utc)
    wd = "月火水木金土日"[d.weekday()]
    return f"{d.month}/{d.day}（{wd}）{d:%H:%M}"


def main():
    ap = argparse.ArgumentParser(description="週間占い用の天体データを計算")
    ap.add_argument("--week", help="ISO週番号（例: 2026-W29）。省略時は今週")
    ap.add_argument("--next", action="store_true", help="来週を対象にする")
    ap.add_argument("--json", action="store_true", help="JSONで出力")
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

    start_utc = datetime(monday.year, monday.month, monday.day, tzinfo=JST).astimezone(timezone.utc)
    end_utc = start_utc + timedelta(days=7)

    # 惑星位置（週初め・週末）
    positions = []
    for key, name in BODIES:
        l1, l2 = lon(key, start_utc), lon(key, end_utc)
        positions.append({
            "name": name,
            "start_sign": SIGNS[sign_of(l1)], "start_deg": round(l1 % 30, 1),
            "end_sign": SIGNS[sign_of(l2)], "end_deg": round(l2 % 30, 1),
            "retro": retro_flag(key, start_utc),
        })

    # 月イングレス（ボイド計算のため前後に余裕を持って走査）
    all_ing = scan_moon_ingresses(start_utc - timedelta(days=3), end_utc + timedelta(days=1))
    moon_events = []
    for idx, (ing, new_sign) in enumerate(all_ing):
        if not (start_utc <= ing < end_utc):
            continue
        prev_ing = all_ing[idx - 1][0] if idx > 0 else ing - timedelta(days=3)
        voc = last_aspect_before(ing, prev_ing)
        moon_events.append({
            "ingress_utc": ing, "sign": SIGNS[new_sign],
            "voc_start_utc": voc,
        })

    phases = scan_moon_phases(start_utc, end_utc)
    retro_changes = scan_retro_changes(start_utc, end_utc)
    asp_start = planet_aspects(start_utc)
    asp_end = planet_aspects(end_utc)
    keys_s = {(a["pair"], a["aspect"]) for a in asp_start}
    keys_e = {(a["pair"], a["aspect"]) for a in asp_end}

    if args.json:
        def enc(o):
            return fmt(o) if isinstance(o, datetime) else o
        print(json.dumps({
            "week": f"{monday}〜{sunday}",
            "positions": positions,
            "moon": [{**m, "ingress_utc": fmt(m["ingress_utc"]),
                      "voc_start_utc": fmt(m["voc_start_utc"]) if m["voc_start_utc"] else None}
                     for m in moon_events],
            "phases": [{"time": fmt(t), "name": n} for t, n in phases],
            "retro_changes": [{"time": fmt(t), "planet": p, "event": e} for t, p, e in retro_changes],
            "aspects_week_start": asp_start,
            "aspects_week_end": asp_end,
        }, ensure_ascii=False, indent=2, default=enc))
        return

    print(f"# 週間天体データ：{monday.month}/{monday.day}（月）〜{sunday.month}/{sunday.day}（日）\n")

    print("## 惑星位置（週初め→週末）")
    for p in positions:
        move = f"{p['start_sign']} {p['start_deg']}度"
        if p["start_sign"] != p["end_sign"]:
            move += f" → {p['end_sign']} {p['end_deg']}度 ★サイン移動"
        else:
            move += f" → {p['end_deg']}度"
        r = "（逆行中）" if p["retro"] else ""
        print(f"- {p['name']}：{move}{r}")

    print("\n## 月の動き（ボイド→星座入り）")
    for m in moon_events:
        voc = f"ボイド {fmt(m['voc_start_utc'])}〜" if m["voc_start_utc"] else ""
        print(f"- {voc}{fmt(m['ingress_utc'])} {m['sign']}入り")

    print("\n## 月相")
    if phases:
        for t, n in phases:
            print(f"- {fmt(t)} {n}")
    else:
        print("- 週内の新月・上弦・満月・下弦なし")

    print("\n## 逆行の変化")
    if retro_changes:
        for t, p, e in retro_changes:
            print(f"- {fmt(t)}頃 {p} {e}")
    else:
        print("- 週内の逆行開始・終了なし")

    print(f"\n## 主要アスペクト（オーブ{ASPECT_ORB}度以内・月以外）")
    for a in asp_start:
        tag = "【週を通じて持続】" if (a["pair"], a["aspect"]) in keys_e else "【週前半のみ】"
        print(f"- {a['pair']} {a['aspect']}（オーブ{a['orb']}度）{tag}")
    for a in asp_end:
        if (a["pair"], a["aspect"]) not in keys_s:
            print(f"- {a['pair']} {a['aspect']}（オーブ{a['orb']}度）【週後半に形成】")


if __name__ == "__main__":
    main()
