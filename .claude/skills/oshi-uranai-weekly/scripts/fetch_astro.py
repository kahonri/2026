#!/usr/bin/env python3
"""
fetch_astro.py
Prokerala Astrology API（または設定したAPI）から今週の天体データを取得する。

使用API候補:
  - Prokerala API: https://api.prokerala.com/v2/astrology/
  - AstrologyAPI.com: https://json.astrologyapi.com/v1/

使用方法:
  python fetch_astro.py --week 2025-W14
  python fetch_astro.py  # 今週を自動検出

出力: JSON（標準出力） → SKILL.mdのステップ2で使用
"""

import json
import sys
import argparse
import os
import requests
from datetime import datetime, timedelta


# ============================================================
# 設定：環境変数から取得
# ============================================================
API_PROVIDER = os.environ.get("ASTRO_API_PROVIDER", "prokerala")  # prokerala or astrologyapi
API_CLIENT_ID = os.environ.get("ASTRO_API_CLIENT_ID", "")
API_CLIENT_SECRET = os.environ.get("ASTRO_API_CLIENT_SECRET", "")
ASTROLOGYAPI_USER_ID = os.environ.get("ASTROLOGYAPI_USER_ID", "")
ASTROLOGYAPI_API_KEY = os.environ.get("ASTROLOGYAPI_API_KEY", "")

# 観測地点（デフォルト：東京）
DEFAULT_LAT = 35.6762
DEFAULT_LON = 139.6503
DEFAULT_TZ = "Asia/Tokyo"


def get_week_range(week_str=None):
    """ISO週番号から週の開始日・終了日を取得"""
    if week_str:
        year, week = map(int, week_str.split("-W"))
        start = datetime.strptime(f"{year}-W{week:02d}-1", "%Y-W%W-%w")
    else:
        today = datetime.now()
        start = today - timedelta(days=today.weekday())  # 月曜始まり
    end = start + timedelta(days=6)
    return start, end


def get_prokerala_token():
    """Prokerala OAuthトークン取得"""
    url = "https://api.prokerala.com/token"
    resp = requests.post(url, data={
        "grant_type": "client_credentials",
        "client_id": API_CLIENT_ID,
        "client_secret": API_CLIENT_SECRET,
    })
    resp.raise_for_status()
    return resp.json()["access_token"]


def fetch_planet_positions_prokerala(date, token):
    """Prokerala: 惑星位置取得"""
    url = "https://api.prokerala.com/v2/astrology/planet-position"
    params = {
        "ayanamsa": 0,  # 0=Tropical（西洋占星術）
        "coordinates": f"{DEFAULT_LAT},{DEFAULT_LON}",
        "datetime": date.strftime("%Y-%m-%dT%H:%M:%S+09:00"),
    }
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(url, params=params, headers=headers)
    resp.raise_for_status()
    return resp.json()


def fetch_planet_positions_astrologyapi(date):
    """AstrologyAPI.com: 惑星位置取得"""
    from requests.auth import HTTPBasicAuth
    url = "https://json.astrologyapi.com/v1/planets/tropical"
    payload = {
        "day": date.day,
        "month": date.month,
        "year": date.year,
        "hour": 12,
        "min": 0,
        "lat": DEFAULT_LAT,
        "lon": DEFAULT_LON,
        "tzone": 9.0,
    }
    resp = requests.post(
        url,
        json=payload,
        auth=HTTPBasicAuth(ASTROLOGYAPI_USER_ID, ASTROLOGYAPI_API_KEY)
    )
    resp.raise_for_status()
    return resp.json()


def build_weekly_summary(start, end):
    """週の天体データをまとめてJSON化"""
    results = {
        "week_start": start.strftime("%Y-%m-%d"),
        "week_end": end.strftime("%Y-%m-%d"),
        "week_label": f"{start.strftime('%m/%d')}〜{end.strftime('%m/%d')}",
        "planet_positions": {},
        "key_events": [],  # 手動入力 or 別APIで補完
        "error": None,
    }

    try:
        if API_PROVIDER == "prokerala":
            if not API_CLIENT_ID:
                results["error"] = "ASTRO_API_CLIENT_ID が未設定です"
                return results
            token = get_prokerala_token()
            # 週の中間（木曜）のデータを基準に取得
            mid_week = start + timedelta(days=3)
            data = fetch_planet_positions_prokerala(mid_week, token)
            results["planet_positions"] = data.get("data", {})

        elif API_PROVIDER == "astrologyapi":
            if not ASTROLOGYAPI_USER_ID:
                results["error"] = "ASTROLOGYAPI_USER_ID が未設定です"
                return results
            mid_week = start + timedelta(days=3)
            data = fetch_planet_positions_astrologyapi(mid_week)
            results["planet_positions"] = data

        else:
            results["error"] = f"未知のAPI provider: {API_PROVIDER}"

    except requests.RequestException as e:
        results["error"] = f"API呼び出しエラー: {str(e)}"

    return results


def main():
    parser = argparse.ArgumentParser(description="週の天体データを取得")
    parser.add_argument("--week", help="ISO週番号（例: 2025-W14）。省略時は今週。")
    parser.add_argument("--pretty", action="store_true", help="整形JSONで出力")
    args = parser.parse_args()

    start, end = get_week_range(args.week)
    summary = build_weekly_summary(start, end)

    indent = 2 if args.pretty else None
    print(json.dumps(summary, ensure_ascii=False, indent=indent))


if __name__ == "__main__":
    main()
