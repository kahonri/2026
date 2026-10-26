"""推しの占い子 カルーセル画像（1080×1350）を JSON 設定から書き出す。

使い方: python oshi-uranai/carousel/make_carousel.py <spec.json>
出力: spec と同じフォルダに 01.png, 02.png ...

ページの種類（"type"）:
  cover  … "image"（背景の絵）に "copy"（大コピー）・"band"（帯）・"en"（英字）を載せる。"erase" で背景の小物を消せる
  text   … ベージュ無地に "text"。"accent" であしらいを1点（moon / sparkle / tail）
  diagram… "text" の下に "opposition"（左右に並ぶ2天体）の図
  end    … ロゴとタグライン。"icon": true でプロフィール画像を丸く添える／"logo_w" でロゴの幅
"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 1080, 1350
BG = (243, 237, 225)
INK = (40, 36, 32)
SUB = (92, 86, 78)
FONT = "C:/Windows/Fonts/BIZ-UDMinchoM.ttc"
LOGO = ROOT / "app" / "public" / "logo.png"
ICON = ROOT / "assets" / "profile-icon.png"


def font(size):
    return ImageFont.truetype(FONT, size)


def text_height(lines, size, gap=1.8, para_gap=0.9):
    lh = size * gap
    return sum(para_gap * lh if ln == "" else lh for ln in lines)


def draw_lines(d, lines, cy, size, color=INK, gap=1.8, para_gap=0.9, align="center", x=None):
    """段落（空行区切り）を縦中央 cy にそろえて描く。"""
    f = font(size)
    lh = size * gap
    h = text_height(lines, size, gap, para_gap)
    y = cy - h / 2
    for ln in lines:
        if ln == "":
            y += para_gap * lh
            continue
        w = d.textlength(ln, font=f)
        lx = (W - w) / 2 if align == "center" else x
        d.text((lx, y), ln, font=f, fill=color)
        y += lh
    return y


def sparkle(d, x, y, r, color=INK, w=3):
    d.line([(x - r, y), (x + r, y)], fill=color, width=w)
    d.line([(x, y - r), (x, y + r)], fill=color, width=w)
    s = r * 0.35
    d.line([(x - s, y - s), (x + s, y + s)], fill=color, width=2)
    d.line([(x - s, y + s), (x + s, y - s)], fill=color, width=2)


def moon(d, x, y, r, full=True):
    d.ellipse([x - r, y - r, x + r, y + r], fill=(250, 247, 240) if full else None, outline=INK, width=4)


def tail(d, x, y, s=1.0):
    pts = []
    for i in range(60):
        t = i / 59
        a = math.pi * 1.6 * t
        pts.append((x + 40 * s * math.sin(a) * (1 - t * 0.4), y - 140 * s * t + 18 * s * math.cos(a)))
    d.line(pts, fill=INK, width=int(9 * s), joint="curve")


def accent(d, kind):
    if kind == "moon":
        moon(d, W - 150, H - 150, 42)
        sparkle(d, W - 230, H - 210, 12)
    elif kind == "sparkle":
        sparkle(d, W - 150, H - 160, 18)
        sparkle(d, W - 210, H - 230, 10)
    elif kind == "tail":
        tail(d, W - 170, H - 70, 0.9)


def shift_figures(img, box, dx):
    """box 内の線や塗り（紙の色と違う部分）だけを dx 動かし、元の場所は紙の上端の帯で埋める。"""
    from PIL import ImageChops, ImageFilter
    x0, y0, x1, y1 = box
    region = img.crop(box)
    paper = img.crop((0, 0, W, 120)).resize((W, 120))
    fill = Image.new("RGB", (x1 - x0, y1 - y0))
    for ty in range(0, y1 - y0, 120):
        fill.paste(paper.crop((x0, 0, x1, 120)), (0, ty))
    ref = Image.new("RGB", region.size, paper.resize((1, 1), Image.BOX).getpixel((0, 0)))
    diff = ImageChops.difference(region, ref).convert("L").point(lambda v: 255 if v > 18 else 0)
    mask = diff.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(3))
    out = img.copy()
    edge = Image.new("L", fill.size, 0)  # 埋めた四角の縁をぼかして継ぎ目を消す
    ImageDraw.Draw(edge).rectangle([24, 24, fill.width - 25, fill.height - 25], fill=255)
    out.paste(fill, (x0, y0), edge.filter(ImageFilter.GaussianBlur(12)))
    out.paste(region, (x0 + dx, y0), mask)
    return out


def page_cover(p, base):
    img = Image.open(base / p["image"]).convert("RGB").resize((W, H))
    d = ImageDraw.Draw(img)
    for ex, ey, er in p.get("erase", []):  # 文字に重なる背景の小さな星を消す
        c = img.getpixel((int(ex - er - 6), int(ey)))
        d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=c)
    # 文字はすべて、グリッドで見える中央の正方形（上下135pxずつを除いた範囲）に収める
    safe_top, safe_bottom = (H - W) / 2, (H + W) / 2
    if p.get("shift"):  # 人物だけを横に動かす（"box": 範囲, "dx": 移動量）
        img = shift_figures(img, p["shift"]["box"], p["shift"]["dx"])
        d = ImageDraw.Draw(img)
    x = p.get("x", 560)
    y = p.get("y", 560)
    size = p.get("size", 64)
    f = font(size)
    for ln in p["copy"]:
        d.text((x, y), ln, font=f, fill=INK)
        if x + d.textlength(ln, font=f) > W - 40:
            print(f"  ⚠ 表紙の「{ln}」が右端からはみ出しそう")
        y += size * 1.55
    # 帯：白ベタに黒文字。座布団の左端を大コピーの左端にそろえる
    fb = font(36)
    bw = d.textlength(p["band"], font=fb)
    by = y + 30
    d.rectangle([x, by - 10, x + bw + 28, by + 50], fill=(255, 255, 255))
    d.text((x + 14, by), p["band"], font=fb, fill=INK)
    if by + 50 > safe_bottom - 30:
        print("  ⚠ 表紙の帯がグリッドの正方形からはみ出す")
    # 英字：正方形の内側の左上に固定（"en_x" で大コピーの左はじにそろえられる）
    fe = font(28)
    for i, ln in enumerate(p["en"]):
        d.text((p.get("en_x", 70), safe_top + 40 + i * 44), ln, font=fe, fill=SUB)
    return img


def page_text(p):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    draw_lines(d, p["text"], H / 2, p.get("size", 46))
    if p.get("accent"):
        accent(d, p["accent"])
    return img


def page_diagram(p):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    size = p.get("size", 46)
    th = text_height(p["text"], size)
    group = th + 230 + 130  # 文章＋図（上の天体名から下のサイン名まで）を天地中央に
    top = (H - group) / 2
    end = draw_lines(d, p["text"], top + th / 2, size)
    a, b = p["opposition"]
    cy = end + 230
    lx, rx = 260, W - 260
    d.line([(lx + 70, cy), (rx - 70, cy)], fill=SUB, width=3)
    # 太陽：丸に点
    d.ellipse([lx - 62, cy - 62, lx + 62, cy + 62], outline=INK, width=5)
    d.ellipse([lx - 10, cy - 10, lx + 10, cy + 10], fill=INK)
    moon(d, rx, cy, 62)
    f, fs = font(44), font(34)
    for x, (name, sign) in [(lx, a), (rx, b)]:
        w = d.textlength(name, font=f)
        d.text((x - w / 2, cy - 160), name, font=f, fill=INK)
        w = d.textlength(sign, font=fs)
        d.text((x - w / 2, cy + 90), sign, font=fs, fill=SUB)
    lab = p.get("label", "")
    if lab:
        w = d.textlength(lab, font=fs)
        d.text(((W - w) / 2, cy - 56), lab, font=fs, fill=SUB)
    return img


def page_end(p):
    """ロゴとタグライン。"icon": true でプロフィール画像を丸く切って上に置く。"logo_w" でロゴの幅。"""
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    logo = Image.open(LOGO).convert("RGBA")
    lw = p.get("logo_w", 620)
    logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    alpha = logo.split()[3]
    logo = Image.new("RGBA", logo.size, INK + (255,))
    logo.putalpha(alpha)
    f = font(42)
    tag = ["星を読む。カードを読む。", "そして、自分を読む。"]
    icon_d = 320 if p.get("icon") else 0
    gap_icon, gap_tag = 60, 70
    group = (icon_d + gap_icon if icon_d else 0) + logo.height + gap_tag + 74 + 42
    y = (H - group) / 2
    if icon_d:
        ic = Image.open(ICON).convert("RGB").resize((icon_d, icon_d), Image.LANCZOS)
        mask = Image.new("L", (icon_d * 4, icon_d * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, icon_d * 4 - 1, icon_d * 4 - 1], fill=255)
        mask = mask.resize((icon_d, icon_d), Image.LANCZOS)
        x0 = (W - icon_d) // 2
        img.paste(ic, (x0, int(y)), mask)
        d.ellipse([x0 - 2, y - 2, x0 + icon_d + 2, y + icon_d + 2], outline=INK, width=4)
        y += icon_d + gap_icon
    img.paste(logo, ((W - lw) // 2, int(y)), logo)
    y += logo.height + gap_tag
    for i, t in enumerate(tag):
        w = d.textlength(t, font=f)
        d.text(((W - w) / 2, y + i * 74), t, font=f, fill=SUB)
    return img


def main(spec_path):
    spec_path = Path(spec_path)
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    out = spec_path.parent
    makers = {"cover": lambda p: page_cover(p, out), "text": page_text, "diagram": page_diagram, "end": page_end}
    for i, p in enumerate(spec["pages"], 1):
        makers[p["type"]](p).save(out / f"{i:02d}.png")
    print(f"{out}  {len(spec['pages'])}枚")


if __name__ == "__main__":
    main(sys.argv[1])
