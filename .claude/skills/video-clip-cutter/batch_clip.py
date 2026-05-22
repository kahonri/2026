#!/usr/bin/env python3
"""
batch_clip.py - 長編動画から9:16ショート動画を一括生成

テキスト配置:
  - 上テキスト: 上ゾーン(0-420px) の底辺揃え  ← サムネイルで切れない
  - 下テキスト: 下ゾーン(1500-1920px) の上端揃え ← 映像に近い位置

使い方:
  python3 batch_clip.py \
    --input clips/input.mp4 \
    --csv clips/clips.csv \
    --opening clips/opening.png \
    --endcard clips/endcard.png \
    --outdir clips/output \
    --font "C:/Windows/Fonts/YuGothB.ttc"
"""

import argparse
import csv
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# ===== カスタマイズ定数 =====
FONTSIZE = 88               # テキストサイズ
FONTCOLOR = "white"         # テキスト色（白）
FONT_BORDER_W = 3           # 縁取り太さ（視認性UP）
FONT_BORDER_COLOR = "black" # 縁取り色（黒）
LINE_SPACING = 108          # 行間（ベースライン間）
FADE_DURATION = 0.5         # フェード秒数
OPENING_DURATION = 3        # オープニング秒数
ENDCARD_DURATION = 5        # エンドカード秒数

# ===== レイアウト定数（変更不要）=====
OUTPUT_W = 1080
OUTPUT_H = 1920
VIDEO_SIZE = 1080           # 映像の正方形サイズ
TOP_PAD = (OUTPUT_H - VIDEO_SIZE) // 2   # = 420: 上白ゾーンの高さ
BOTTOM_AREA_TOP = TOP_PAD + VIDEO_SIZE   # = 1500: 下白ゾーンのy開始
TEXT_MARGIN = 24            # テキストエリア端からの余白

# ===== 字幕（元動画テロップ）設定 =====
SUB_FONTSIZE = 14           # 字幕フォントサイズ（ASS座標系: 14→約52px@1080p）
SUB_MARGIN_V = 30           # 字幕の下端からの余白（px）
# 字幕スタイル（white文字 + black縁取り）
SUB_STYLE = (
    f"FontSize={SUB_FONTSIZE},"
    "PrimaryColour=&H00FFFFFF,"   # 白文字
    "OutlineColour=&H00000000,"   # 黒縁取り
    "Outline=2,"
    "Shadow=0,"
    f"MarginV={SUB_MARGIN_V}"
)


# ===== Whisper文字起こし =====

ASTRO_PROMPT = (
    "牡羊座、牡牛座、双子座、蟹座、獅子座、乙女座、天秤座、蠍座、射手座、山羊座、水瓶座、魚座、"
    "太陽、月、火星、金星、水星、木星、土星、天王星、海王星、冥王星、"
    "新月、満月、上弦、下弦、アスペクト、ハウス、トランジット、"
    "コンジャンクション、スクエア、トライン、オポジション、セクスタイル、"
    "タロット、ソード、ワンド、ペンタクル、カップ、大アルカナ、小アルカナ、"
    "逆位置、正位置、スプレッド、リーディング"
)


def transcribe_to_srt(input_path: Path, start_sec: float, end_sec: float,
                      whisper_model, out_srt: Path) -> bool:
    """指定区間の音声をWhisperで文字起こしし、SRTファイルに書き出す。"""
    audio_tmp = out_srt.with_suffix(".wav")
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec), "-to", str(end_sec),
        "-i", str(input_path),
        "-vn", "-ar", "16000", "-ac", "1",
        str(audio_tmp),
    ]
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0 or not audio_tmp.exists():
        return False

    try:
        segments, _ = whisper_model.transcribe(
            str(audio_tmp), language="ja", beam_size=5,
            initial_prompt=ASTRO_PROMPT, vad_filter=True,
        )
        entries = []
        duration = end_sec - start_sec
        for seg in segments:
            s = max(0.0, seg.start)
            e = min(duration, seg.end)
            if e > s and seg.text.strip():
                entries.append((s, e, seg.text.strip()))

        if not entries:
            return False

        with open(out_srt, "w", encoding="utf-8") as f:
            for i, (s, e, text) in enumerate(entries, 1):
                f.write(f"{i}\n{sec_to_srt_time(s)} --> {sec_to_srt_time(e)}\n{text}\n\n")
        return True
    finally:
        audio_tmp.unlink(missing_ok=True)


# ===== SRTヘルパー =====

def srt_time_to_sec(t: str) -> float:
    """SRT時刻 HH:MM:SS,mmm → 秒"""
    t = t.strip().replace(",", ".")
    parts = t.split(":")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])


def sec_to_srt_time(sec: float) -> str:
    """秒 → SRT時刻 HH:MM:SS,mmm"""
    sec = max(0.0, sec)
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec % 1) * 1000))
    if ms >= 1000:
        ms = 999
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def make_clip_srt(srt_path: Path, start_sec: float, end_sec: float, out_path: Path) -> bool:
    """
    元SRTからクリップ時間範囲のエントリを抽出し、タイムスタンプを0基準にシフトして書き出す。
    1件でも書き出せたら True を返す。
    """
    text = srt_path.read_text(encoding="utf-8-sig", errors="replace")
    blocks = re.split(r"\n\s*\n", text.strip())

    entries = []
    for block in blocks:
        lines = block.strip().splitlines()
        for i, line in enumerate(lines):
            if "-->" not in line:
                continue
            m = re.match(r"(.+?)\s*-->\s*(.+)", line)
            if not m:
                continue
            s = srt_time_to_sec(m.group(1))
            e = srt_time_to_sec(m.group(2))
            caption = "\n".join(lines[i + 1:]).strip()
            # クリップ範囲と重なる字幕だけ抽出
            if e > start_sec and s < end_sec:
                new_s = max(0.0, s - start_sec)
                new_e = min(end_sec - start_sec, e - start_sec)
                entries.append((new_s, new_e, caption))
            break

    if not entries:
        return False

    with open(out_path, "w", encoding="utf-8") as f:
        for idx, (s, e, caption) in enumerate(entries, 1):
            f.write(f"{idx}\n{sec_to_srt_time(s)} --> {sec_to_srt_time(e)}\n{caption}\n\n")
    return True


def escape_text(text: str) -> str:
    """FFmpeg drawtext text= 用エスケープ"""
    return (text
            .replace("\\", "\\\\")
            .replace("'", "\u2019")   # シングルクォートを全角に置換
            .replace(":", "\\:")
            )


def escape_font_path(path: str) -> str:
    """
    FFmpeg drawtext fontfile= 用パスエスケープ
    Windows の C:\\path や C:/path → バックスラッシュを/に統一し、
    ドライブ文字のコロンを \\: にエスケープ（FFmpegフィルター解析対策）
    """
    import re
    path = path.replace("\\", "/")                  # バックスラッシュ → スラッシュ
    path = re.sub(r"^([A-Za-z]):", r"\1\\:", path)  # C: → C\:
    return path


def build_top_drawtext(lines: list, font_path: str) -> list:
    """上テキスト: 上ゾーン(0〜TOP_PAD)の底辺揃え"""
    n = len(lines)
    last_y = TOP_PAD - TEXT_MARGIN - FONTSIZE
    start_y = last_y - (n - 1) * LINE_SPACING
    fp = escape_font_path(font_path)

    filters = []
    for i, line in enumerate(lines):
        y = start_y + i * LINE_SPACING
        f = (
            f"drawtext=fontfile='{fp}'"
            f":text='{escape_text(line)}'"
            f":fontsize={FONTSIZE}"
            f":fontcolor={FONTCOLOR}"
            f":borderw={FONT_BORDER_W}"
            f":bordercolor={FONT_BORDER_COLOR}"
            f":x=(w-text_w)/2"
            f":y={y}"
        )
        filters.append(f)
    return filters


def build_bottom_drawtext(lines: list, font_path: str) -> list:
    """下テキスト: 下ゾーン(BOTTOM_AREA_TOP〜1920)の上端揃え"""
    start_y = BOTTOM_AREA_TOP + TEXT_MARGIN
    fp = escape_font_path(font_path)

    filters = []
    for i, line in enumerate(lines):
        y = start_y + i * LINE_SPACING
        f = (
            f"drawtext=fontfile='{fp}'"
            f":text='{escape_text(line)}'"
            f":fontsize={FONTSIZE}"
            f":fontcolor={FONTCOLOR}"
            f":borderw={FONT_BORDER_W}"
            f":bordercolor={FONT_BORDER_COLOR}"
            f":x=(w-text_w)/2"
            f":y={y}"
        )
        filters.append(f)
    return filters


def time_to_sec(t: str) -> float:
    """HH:MM:SS または MM:SS → 秒数"""
    parts = t.strip().split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def run(cmd: list, label: str = ""):
    """コマンド実行（失敗時は終了）"""
    display = label or " ".join(str(c) for c in cmd[:5]) + "..."
    print(f"  → {display}")
    result = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if result.returncode != 0:
        print("STDERR:", result.stderr[-3000:] if result.stderr else "(なし)")
        sys.exit(f"[Error] コマンド失敗 (code={result.returncode}): {display}")


def make_image_clip(image_path: Path, duration: float, output_path: Path, fps: int = 30):
    """静止画 → 動画（無音オーディオ付き：concat時の音声ストリーム不揃い防止）"""
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", image_path,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",  # 無音オーディオソース
        "-t", str(duration),
        "-vf", f"scale={OUTPUT_W}:{OUTPUT_H}:force_original_aspect_ratio=decrease,"
               f"pad={OUTPUT_W}:{OUTPUT_H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
        "-r", str(fps),
        "-c:v", "libx264", "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-shortest",
        output_path,
    ]
    run(cmd, f"静止画変換: {image_path.name}")


def make_part_clip(
    input_path: Path,
    start: str,
    end: str,
    top_text: str,
    bottom_text: str,
    font_path: str,
    output_path: Path,
    srt_path: Path = None,   # ← 追加：クリップ用に調整済みSRT（省略可）
    fps: int = 30,
):
    """1パート: 切り出し → クロップ → [字幕] → パッド → テキスト → フェード"""
    duration = time_to_sec(end) - time_to_sec(start)
    fd = FADE_DURATION

    top_lines = [l for l in top_text.split("|") if l.strip()] if top_text else []
    bottom_lines = [l for l in bottom_text.split("|") if l.strip()] if bottom_text else []

    # ビデオフィルターチェーン
    vf_parts = [
        # ① 中央クロップ → 1080×1080
        f"crop={VIDEO_SIZE}:{VIDEO_SIZE}:(iw-{VIDEO_SIZE})/2:(ih-{VIDEO_SIZE})/2",
    ]

    # ② 字幕焼き込み（1080×1080 空間で適用 → 位置計算がシンプル）
    if srt_path and srt_path.exists():
        escaped_srt = escape_font_path(str(srt_path))
        # force_style内のカンマは \, にエスケープ（カンマはFFmpegフィルター区切り文字のため）
        sub_style_escaped = SUB_STYLE.replace(",", "\\,")
        vf_parts.append(
            f"subtitles='{escaped_srt}':force_style='{sub_style_escaped}'"
        )

    vf_parts += [
        # ③ 上下黒パッド → 1080×1920
        f"pad={OUTPUT_W}:{OUTPUT_H}:0:{TOP_PAD}:black",
        "setsar=1",
    ]

    # ④ 上下キャプション（drawtext）
    if top_lines:
        vf_parts.extend(build_top_drawtext(top_lines, font_path))
    if bottom_lines:
        vf_parts.extend(build_bottom_drawtext(bottom_lines, font_path))

    # ⑤ フェードイン/アウト（黒）
    vf_parts.append(f"fade=t=in:st=0:d={fd}:color=black")
    vf_parts.append(f"fade=t=out:st={duration - fd:.3f}:d={fd}:color=black")

    vf = ",".join(vf_parts)

    cmd = [
        "ffmpeg", "-y",
        "-ss", start,
        "-to", end,
        "-i", input_path,
        "-vf", vf,
        "-r", str(fps),
        "-c:v", "libx264", "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        output_path,
    ]
    run(cmd, f"パート切り出し: {start} → {end}")


def concat_clips(clip_paths: list, output_path: Path):
    """複数クリップをconcat（再エンコード）"""
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        for p in clip_paths:
            # ⚠️ 絶対パス化 + バックスラッシュをスラッシュに統一（Windows対応・消さないこと）
            abs_p = str(Path(p).resolve()).replace("\\", "/")
            f.write(f"file '{abs_p}'\n")
        concat_list = f.name

    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_list,
            "-c:v", "libx264", "-preset", "fast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k",
            output_path,
        ]
        run(cmd, f"結合 → {output_path.name}")
    finally:
        os.unlink(concat_list)


def main():
    parser = argparse.ArgumentParser(description="長編動画から9:16ショート動画を一括生成")
    parser.add_argument("--input",   required=True, help="入力動画パス")
    parser.add_argument("--csv",     required=True, help="CSVファイルパス")
    parser.add_argument("--opening", default=None,  help="オープニング画像パス（省略可・なしの場合はスキップ）")
    parser.add_argument("--endcard", required=True, help="エンドカード画像パス")
    parser.add_argument("--outdir",  required=True, help="出力ディレクトリ")
    parser.add_argument("--font",    required=True, help="日本語フォントパス")
    parser.add_argument("--srt",      default=None,  help="字幕SRTファイルパス（省略可）")
    parser.add_argument("--subtitle", action="store_true", help="Whisperで自動文字起こし→字幕焼き込み")
    parser.add_argument("--whisper-model", default="large-v3",
                        choices=["tiny", "small", "medium", "large-v3"],
                        help="Whisperモデルサイズ（デフォルト: large-v3）")
    args = parser.parse_args()

    input_path   = Path(args.input)
    endcard_path = Path(args.endcard)
    outdir       = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    tmpdir = outdir / "_tmp"
    tmpdir.mkdir(exist_ok=True)

    # Whisperモデル読み込み（--subtitle 指定時）
    whisper_model = None
    if args.subtitle:
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            sys.exit("❌ faster-whisper が見つかりません。pip install faster-whisper でインストールしてください。")
        print(f"\n🎤 Whisperモデル読み込み中: {args.whisper_model} ...")
        whisper_model = WhisperModel(args.whisper_model, device="cpu", compute_type="int8")
        print("  ✅ 完了\n")

    # SRT（省略可）
    source_srt = Path(args.srt) if args.srt and Path(args.srt).exists() else None
    if args.srt and not source_srt:
        print(f"⚠️  SRTファイルが見つかりません: {args.srt}（字幕なしで続行）")

    # オープニング: 省略可
    use_opening = args.opening and Path(args.opening).exists()
    opening_path = Path(args.opening) if use_opening else None

    # CSV 読み込み・グルーピング（同じoutput名を連続行としてまとめる）
    groups: dict[str, list] = {}
    order: list[str] = []
    with open(args.csv, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row["output"].strip()
            if name not in groups:
                groups[name] = []
                order.append(name)
            groups[name].append(row)

    print(f"\n📋 {len(order)} 本の動画を生成します\n")

    # オープニング動画化（指定がある場合のみ）
    opening_vid = None
    if use_opening:
        print("=== オープニング生成 ===")
        opening_vid = tmpdir / "_opening.mp4"
        make_image_clip(opening_path, OPENING_DURATION, opening_vid)
    else:
        print("=== オープニング: スキップ ===")

    print("=== エンドカード生成 ===")
    endcard_vid = tmpdir / "_endcard.mp4"
    make_image_clip(endcard_path, ENDCARD_DURATION, endcard_vid)

    # グループごとに処理
    for idx, group_name in enumerate(order, 1):
        rows = groups[group_name]
        print(f"\n[{idx}/{len(order)}] {group_name}  ({len(rows)} パート)")

        part_clips = []
        for i, row in enumerate(rows):
            part_path = tmpdir / f"{group_name}_part{i:02d}.mp4"

            # SRT生成（--srt または --subtitle）
            clip_srt = None
            start_sec = time_to_sec(row["start"].strip())
            end_sec   = time_to_sec(row["end"].strip())
            if source_srt:
                clip_srt = tmpdir / f"{group_name}_part{i:02d}.srt"
                if not make_clip_srt(source_srt, start_sec, end_sec, clip_srt):
                    clip_srt = None
            elif whisper_model:
                clip_srt = tmpdir / f"{group_name}_part{i:02d}.srt"
                print(f"  🎤 文字起こし中: パート{i} ...")
                if not transcribe_to_srt(input_path, start_sec, end_sec, whisper_model, clip_srt):
                    clip_srt = None
                    print("     → 字幕なし（音声が取得できませんでした）")

            make_part_clip(
                input_path=input_path,
                start=row["start"].strip(),
                end=row["end"].strip(),
                top_text=row.get("top_text", ""),
                bottom_text=row.get("bottom_text", ""),
                font_path=args.font,
                output_path=part_path,
                srt_path=clip_srt,
            )
            part_clips.append(part_path)

        # [opening →] parts → endcard を結合
        prefix = [opening_vid] if opening_vid else []
        all_clips = prefix + part_clips + [endcard_vid]
        out_path = outdir / group_name
        concat_clips(all_clips, out_path)

        # 中間ファイル削除（パートクリップ + 一時SRT）
        for p in part_clips:
            try:
                p.unlink()
            except Exception:
                pass
        for srt_tmp in tmpdir.glob(f"{group_name}_part*.srt"):
            try:
                srt_tmp.unlink()
            except Exception:
                pass

        size_mb = out_path.stat().st_size / 1024 / 1024
        print(f"  ✅ {out_path.name}  ({size_mb:.1f} MB)")

    # tmpフォルダ削除
    try:
        if opening_vid:
            opening_vid.unlink()
        endcard_vid.unlink()
        tmpdir.rmdir()
    except Exception:
        pass

    print(f"\n🎉 完了！ {len(order)} 本 → {outdir}")


if __name__ == "__main__":
    main()
