#!/usr/bin/env python3
"""fetch_astro.py の lon() を流用して golden 黄経データを生成する（Vitest 突合用）"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SKILL_SCRIPTS = Path(__file__).resolve().parents[3] / ".claude" / "skills" / "oshi-uranai-weekly" / "scripts"
sys.path.insert(0, str(SKILL_SCRIPTS))

from fetch_astro import lon, BODIES  # noqa: E402

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

out = []
for iso in DATES:
    dt = datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)
    positions = {key.split()[0]: round(lon(key, dt), 6) for key, _label in BODIES}
    out.append({"utc": iso + "Z", "positions": positions})

dest = Path(__file__).resolve().parents[1] / "tests" / "golden" / "golden-positions.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, indent=2), encoding="utf-8")
print(f"wrote {dest} ({len(out)} dates x {len(BODIES)} bodies)")
