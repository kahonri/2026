"""推しの占い子 リール生成：JSONの設定1枚 → 1080x1920 無音mp4（BGMなし・最後は必ずエンドカード）

使い方:
  python oshi-uranai/reel/make_reel.py oshi-uranai/reel/examples/moon.json
  python oshi-uranai/reel/make_reel.py spec.json --still 2.0   # 2秒目の1コマだけPNGで確認

設定の書き方は oshi-uranai/reel/README.md。テンプレートは6系統：
  moon（新月・満月）／sky（今の星）／tarot（タロット）／know（自分を知る）／decide（自分で決める）／essay（自分を推す）
"""
import json
import math
import random
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
ROOT = HERE.parent                      # oshi-uranai/
ENDCARD = ROOT / "assets" / "reel-endcard.png"
W, H, FPS = 1080, 1920, 30
FONT = "C:/Windows/Fonts/BIZ-UDMinchoM.ttc"

# ブランド色（ベージュ・白・グレー・黒）
PAPER = (239, 232, 220)
INK = (40, 36, 32)
GRAY = (140, 134, 126)
LIGHT = (250, 246, 238)

FADE_IN, RISE, FADE_OUT = 0.5, 24, 0.35
DEFAULT_CLOSING_TAROT = "答えを決めるためじゃなく、\n今の自分を知るために。"


# ───────────────────────── 描画の部品 ─────────────────────────

def font(size):
    return ImageFont.truetype(FONT, size)


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def paper_bg(seed=7):
    """生成りの紙＋ごく薄いノイズ"""
    rnd = random.Random(seed)
    img = Image.new("RGB", (W, H), PAPER)
    noise = Image.effect_noise((W // 4, H // 4), 10).resize((W, H)).convert("L")
    img = Image.composite(img, Image.new("RGB", (W, H), (226, 218, 204)), noise.point(lambda v: 255 - v // 6))
    return img.convert("RGBA"), rnd


def sparkle(d, cx, cy, r, fill):
    """4点の星（きらめき）"""
    k = r * 0.22
    d.polygon([(cx, cy - r), (cx + k, cy - k), (cx + r, cy), (cx + k, cy + k),
               (cx, cy + r), (cx - k, cy + k), (cx - r, cy), (cx - k, cy - k)], fill=fill)


class Stars:
    """背景の星。場面ごとに位置は固定、明るさだけゆっくり揺らす"""

    def __init__(self, n=16, seed=3, area=(0, 0, W, int(H * 0.72))):
        rnd = random.Random(seed)
        self.items = [(rnd.uniform(area[0] + 40, area[2] - 40), rnd.uniform(area[1] + 60, area[3]),
                       rnd.choice([5, 7, 9, 12]), rnd.uniform(0, 6.28)) for _ in range(n)]

    def draw(self, canvas, t, alpha=1.0):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for x, y, r, ph in self.items:
            a = int(alpha * (50 + 70 * (0.5 + 0.5 * math.sin(t * 1.6 + ph))))
            sparkle(d, x, y, r, INK + (a,))
        canvas.alpha_composite(layer)


def moon_layer(phase, cx=W // 2, cy=int(H * 0.36), r=170):
    """月相を線画で描く。phase: new / full / waxing / waning / crescent"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    box = [cx - r, cy - r, cx + r, cy + r]
    if phase == "new":
        d.ellipse(box, outline=INK + (255,), width=4)
        d.ellipse([cx - r + 14, cy - r + 14, cx + r - 14, cy + r - 14], outline=GRAY + (160,), width=2)
    else:
        d.ellipse(box, fill=LIGHT + (255,), outline=INK + (255,), width=4)
        if phase in ("waxing", "waning", "crescent"):
            # 影の形＝月の円から、ずらした円を引いた残り（waxing＝右が明るい／waning＝左が明るい）
            moon = Image.new("L", (W, H), 0)
            ImageDraw.Draw(moon).ellipse(box, fill=255)
            other = Image.new("L", (W, H), 0)
            od = ImageDraw.Draw(other)
            if phase == "crescent":          # 右に細い光だけ残る
                od.ellipse([cx - r - r * 0.35, cy - r, cx + r - r * 0.35, cy + r], fill=255)
                shade = ImageChops.multiply(moon, other)
            else:
                dx = r * 0.55 if phase == "waxing" else -r * 0.55
                od.ellipse([cx - r + dx, cy - r, cx + r + dx, cy + r], fill=255)
                shade = ImageChops.subtract(moon, other)
            layer.paste(Image.new("RGBA", (W, H), (205, 197, 185, 255)), (0, 0), shade)
            d.ellipse(box, outline=INK + (255,), width=4)
    return layer


def rounded(img, r=24):
    """カードの角を丸め、墨の縁取りをつける"""
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=r, fill=255)
    img = img.convert("RGBA")
    img.putalpha(mask)
    ImageDraw.Draw(img).rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=r, outline=INK, width=4)
    return img


def card_back(cw, ch):
    """カードの裏面：黒地に生成りの星（初リールのカードと同じ意匠）"""
    img = Image.new("RGB", (cw, ch), LIGHT)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([20, 20, cw - 21, ch - 21], radius=14, fill=(26, 24, 22))
    step = cw / 4.6
    for row in range(int((ch - 60) / step)):
        for col in range(4):
            cx = 58 + col * step + (step / 2 if row % 2 else 0)
            cy = 70 + row * step
            if cx < cw - 45:
                sparkle(d, cx, cy, 14, LIGHT)
    return rounded(img)


def text_block(text, size=64, color=INK, tracking=0.12, line_gap=1.7):
    """字間を少し開けた、中央揃えの複数行テキストを1枚ずつの行画像にして返す"""
    f = font(size)
    lines = []
    for line in text.split("\n"):
        widths = [f.getlength(ch) for ch in line]
        total = sum(widths) + size * tracking * max(len(line) - 1, 0)
        img = Image.new("RGBA", (int(total) + 8, int(size * 1.4)), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        x = 4
        for ch, w in zip(line, widths):
            d.text((x, 0), ch, font=f, fill=color + (255,))
            x += w + size * tracking
        lines.append(img)
    return lines, int(size * line_gap)


def fit_size(text, size, max_w=W - 150, tracking=0.12):
    """一番長い行が画面幅に収まるまで文字を小さくする"""
    longest = max(text.split("\n"), key=len)
    while size > 30:
        f = font(size)
        if f.getlength(longest) + size * tracking * (len(longest) - 1) <= max_w:
            return size
        size -= 2
    return size


def with_alpha(img, a):
    if a >= 0.999:
        return img
    out = img.copy()
    out.putalpha(img.getchannel("A").point(lambda v: int(v * a)))
    return out


def draw_text(canvas, text, t, cy, size=64, color=INK, start=0.0, stagger=0.35):
    """行ごとに少し遅れて、下からふわっと出す"""
    if not text:
        return
    size = fit_size(text, size)
    lines, gap = text_block(text, size, color)
    top = cy - (gap * (len(lines) - 1) + lines[0].height) // 2
    for i, img in enumerate(lines):
        p = ease((t - start - i * stagger) / FADE_IN)
        if p <= 0:
            continue
        x = (W - img.width) // 2
        y = top + i * gap + int(RISE * (1 - p))
        canvas.alpha_composite(with_alpha(img, p), (x, y))


# ───────────────────────── 場面 ─────────────────────────
# 各場面は render(canvas, t) で1コマ描く。sec は秒数。

class Scene:
    sec = 3.0
    stars = True

    def render(self, canvas, t):
        raise NotImplementedError


class TitleScene(Scene):
    """日付＋出来事の名前＋月（新月・満月・今の星の表紙）"""

    def __init__(self, text, kicker="", sub="", moon=None, sec=3.2, image=None, kicker_style=None, hold=None):
        self.text, self.kicker, self.sub, self.moon, self.sec = text, kicker, sub, moon, sec
        # 任意：文字が出そろってから hold 秒止める（尺合わせの伸び縮みからも外す）
        if hold is not None:
            shown = max(0.25 + 0.35 * text.count("\n"),
                        0.6 + 0.35 * sub.count("\n") if sub else 0) + FADE_IN
            self.sec, self.fixed = shown + hold + FADE_OUT, True
        # 任意：上の小見出し（日付＋出来事）を目立たせたいとき {"size", "color", "gap"}
        ks = kicker_style or {}
        self.k_size, self.k_gap = ks.get("size", 44), ks.get("gap", 70)
        self.k_color = tuple(ks["color"]) if "color" in ks else GRAY
        self.moon_img = moon_layer(moon) if moon else None
        # 任意：表紙にイラストを敷く（文字は真ん中に載るので、絵の中央は空けておく）
        self.bg = ImageScene(image, sec=sec) if image else None
        if self.bg:
            self.stars = False

    def render(self, canvas, t):
        if self.bg:
            self.bg.render(canvas, t)
        if self.moon_img:
            p = ease(t / 1.0)
            canvas.alpha_composite(with_alpha(self.moon_img, p))
        base = int(H * 0.60) if self.moon_img else int(H * 0.42)
        # 表紙の言葉が複数行（冒頭の問いなど）でも、上の小見出し・下の補足が重ならないよう高さを測る
        half = (int(92 * 1.7) * self.text.count("\n") + 92) // 2
        draw_text(canvas, self.kicker, t, base - half - self.k_gap, size=self.k_size, color=self.k_color)
        draw_text(canvas, self.text, t, base, size=92, start=0.25)
        draw_text(canvas, self.sub, t, base + half + 60, size=44, color=GRAY, start=0.6)


class TextScene(Scene):
    def __init__(self, text, size=70, sec=None, cy=None):
        self.text, self.size, self.cy = text, size, cy or int(H * 0.44)
        chars = len(text.replace("\n", ""))
        self.sec = sec or min(max(1.4 + chars * 0.11, 2.4), 5.5)

    def render(self, canvas, t):
        draw_text(canvas, self.text, t, self.cy, self.size)


class CtaScene(TextScene):
    """案内の場面：言葉の下に、絵から切り抜いた小さなもの（黒猫など）を添える。
    pet＝{"image": 絵, "box": [x0, y0, x1, y1] 切り抜く四角, "y": 置く高さ（下端・割合）, "scale": 倍率}"""

    def __init__(self, text, pet, size=56):
        super().__init__(text, size=size)
        src = Image.open(resolve(pet["image"])).convert("RGB")
        x0, y0, x1, y1 = pet["box"]
        crop = src.crop((x0, y0, x1, y1))
        lum = np.asarray(crop.convert("L"), dtype=np.float32)
        paper = np.percentile(lum, 95)                       # 紙の明るさ。これより暗いぶんだけ残す
        alpha = np.clip((paper - lum - 12) / 60, 0, 1)
        img = Image.fromarray(np.dstack([np.asarray(crop), (alpha * 255).astype(np.uint8)]), "RGBA")
        k = pet.get("scale", 1.0)
        self.pet = img.resize((int(img.width * k), int(img.height * k)), Image.LANCZOS)
        self.pet_y = int(H * pet.get("y", 0.78))
        self.pet_scale = k
        # 任意：鳴き声 {"text": "にゃー", "at": [x, y]（切り抜いた絵の中の口元・px）, "size": 52}
        say = pet.get("say") or {}
        self.say, self.say_at, self.say_size = say.get("text"), say.get("at", (0, 0)), say.get("size", 52)

    def render(self, canvas, t):
        super().render(canvas, t)
        p = ease((t - 0.9) / FADE_IN)                         # 言葉のあとに、ふわっと
        if p > 0:
            x = (W - self.pet.width) // 2
            y = self.pet_y - self.pet.height + int(RISE * (1 - p))
            canvas.alpha_composite(with_alpha(self.pet, p), (x, y))
            if self.say:
                self._say(canvas, t - 1.6, x, y)

    def _say(self, canvas, t, px, py):
        """鳴き声（「にゃー」）を頭のそばに、ぽんっと出す（少し傾けて、一瞬ふくらむ）"""
        if t <= 0:
            return
        q = ease(t / 0.35)
        k = 1 + 0.25 * math.sin(min(t / 0.35, 1) * math.pi)
        img = text_block(self.say, int(self.say_size * k), INK)[0][0].rotate(8, expand=True, resample=Image.BICUBIC)
        hx, hy = px + int(self.say_at[0] * self.pet_scale), py + int(self.say_at[1] * self.pet_scale)
        canvas.alpha_composite(with_alpha(img, q), (hx - img.width, hy - img.height))


class SwapScene(Scene):
    """文字が消えて、別の言葉に置き換わる（「人にどう思われる？」→「私は、どうしたい？」）"""

    def __init__(self, a, b, sec=4.2):
        self.a, self.b, self.sec = a, b, sec

    def render(self, canvas, t):
        cy = int(H * 0.44)
        cut = self.sec * 0.45
        if t < cut:
            fade = 1 - ease((t - (cut - 0.5)) / 0.5)
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            draw_text(layer, self.a, t, cy, 64, GRAY)
            canvas.alpha_composite(with_alpha(layer.filter(ImageFilter.GaussianBlur(3 * (1 - fade))), fade))
        else:
            draw_text(canvas, self.b, t - cut, cy, 76)


class ListScene(Scene):
    """問いや項目を1つずつ出す（①②③）"""

    def __init__(self, items, title="", sec=None, numbered=True):
        self.items, self.title, self.numbered = items, title, numbered
        self.sec = sec or 1.4 + 1.9 * len(items)

    def render(self, canvas, t):
        marks = "①②③④⑤⑥"
        size, line_gap, item_gap = 60, int(60 * 1.7), 170
        labels = [f"{marks[i]} {item}" if self.numbered else item for i, item in enumerate(self.items)]
        # 項目の行数に合わせて高さを測り、項目と項目の間を item_gap ずつ空ける（2行の問いでも詰まらない）
        heights = [line_gap * label.count("\n") + size for label in labels]
        total = sum(heights) + item_gap * (len(labels) - 1)
        y = int(H * 0.42) - total // 2
        if self.title:
            draw_text(canvas, self.title, t, y - 110, 46, GRAY)
        step = 1.9
        for i, (label, h) in enumerate(zip(labels, heights)):
            draw_text(canvas, label, t, y + h // 2, size, start=0.4 + i * step, stagger=0.2)
            y += h + item_gap


class VersusScene(Scene):
    """昔の私（グレー）→ 今の私（墨）"""

    def __init__(self, before, after, sec=None):
        self.before, self.after = before, after
        self.sec = sec or 2.0 + 0.9 * (len(before) + len(after))

    def render(self, canvas, t):
        half = self.sec * 0.48
        if t < half:
            draw_text(canvas, "昔の私", t, int(H * 0.22), 42, GRAY)
            for i, s in enumerate(self.before):
                draw_text(canvas, f"「{s}」", t, int(H * 0.33) + i * 150, 52, GRAY, start=0.3 + i * 0.7)
        else:
            u = t - half
            draw_text(canvas, "今の私", u, int(H * 0.22), 42, INK)
            for i, s in enumerate(self.after):
                draw_text(canvas, f"「{s}」", u, int(H * 0.33) + i * 150, 56, INK, start=0.3 + i * 0.7)


class CardScene(Scene):
    """伏せたカード → 問い → ゆっくり返る → カード名（タロット1枚引き）"""
    stars = False

    def __init__(self, face, name="", question="", reversed_=False, sec=6.0):
        cw, ch = 440, 720
        self.back = card_back(cw, ch)
        img = Image.open(face).convert("RGB").resize((cw, ch), Image.LANCZOS)
        if reversed_:
            img = img.rotate(180)
        self.face = rounded(img)
        self.name, self.question, self.sec = name, question, sec
        self.cw, self.ch = cw, ch
        self.flip_at = 1.8 if question else 0.8

    def render(self, canvas, t):
        draw_text(canvas, self.question, t, int(H * 0.17), 56)
        p = min(max((t - self.flip_at) / 0.7, 0), 1)
        card, sx = (self.back, math.cos(p * math.pi)) if p < 0.5 else (self.face, -math.cos(p * math.pi))
        w = max(1, int(self.cw * sx))
        c = card.resize((w, self.ch), Image.LANCZOS)
        x, y = (W - w) // 2, int(H * 0.52) - self.ch // 2
        sh = Image.new("RGBA", (w + 40, self.ch + 40), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([20, 26, w + 20, self.ch + 26], radius=24, fill=(60, 50, 40, 70))
        canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)), (x - 20, y - 20))
        canvas.alpha_composite(c, (x, y))
        if p >= 1:
            draw_text(canvas, self.name, t - self.flip_at - 0.7, int(H * 0.52) + self.ch // 2 + 90, 52)


class GrowingLines:
    """絵の中の暗い線（地中の根など）だけを抜き出し、根元から線に沿った距離の順に描き足していく。
    線を消した下地は、明るい側に寄せるフィルタで線だけ消して作る（土の色・点々の質感は残る）"""

    def __init__(self, img, opt):
        opt = opt if isinstance(opt, dict) else {}
        rgb = img.convert("RGB")
        lum = np.asarray(rgb.convert("L"), dtype=np.float32)
        # 線を探す範囲の上端：指定がなければ、行の明るさがいちばん大きく落ちるところ（地面の線）を探す
        if "top" in opt:
            top = int(H * opt["top"])
        else:
            rows = lum.mean(axis=1)
            sm = np.convolve(rows, np.ones(9) / 9, mode="same")
            drop = sm[:-20] - sm[20:]
            top = int(np.argmax(drop[int(H * 0.3):int(H * 0.9)]) + H * 0.3 + 20)
        plate = rgb.filter(ImageFilter.MaxFilter(9))          # 細い暗い線を消した下地
        base_lum = np.asarray(plate.convert("L"), dtype=np.float32)
        alpha = np.clip((base_lum - lum - 18) / 50, 0, 1)     # 下地より暗いぶんだけ線とみなす
        alpha[:top] = 0
        mask = alpha > 0.35
        # 根元＝範囲の上端のすぐ下にある線。そこから8方向にたどって、線に沿った距離を測る
        dist = np.full(mask.shape, np.inf, dtype=np.float32)
        front = np.zeros_like(mask)
        front[top:top + 14] = mask[top:top + 14]
        visited = front.copy()
        dist[front] = 0
        step = 0
        while front.any() and step < 4000:
            step += 1
            grown = front.copy()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy or dx:
                        grown |= np.roll(np.roll(front, dy, 0), dx, 1)
            front = grown & mask & ~visited
            visited |= front
            dist[front] = step
        far = dist[np.isfinite(dist)].max() if np.isfinite(dist).any() else 1
        # つながっていない細かい線は、上からの深さで出す
        lost = alpha > 0
        lost &= ~np.isfinite(dist)
        ys = np.arange(H, dtype=np.float32)[:, None].repeat(W, 1)
        dist[lost] = (ys[lost] - top) / max(H - top, 1) * far
        self.dist, self.far, self.alpha = dist / max(far, 1), far, alpha
        # 下地は線の範囲（top より下）だけ差し替える。上の人物や猫の線はそのまま残す
        # 線のまわり（少し太らせた範囲）だけ下地に差し替え、それ以外は元の絵（土の点々など）をそのまま使う
        near = Image.fromarray((alpha > 0.05).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
        near = np.asarray(near) > 0
        # 線の上は、線を除いたまわりの平均色で埋める（明るい点を拾って白く浮かないように）
        src = np.asarray(rgb, dtype=np.float32)
        w = (~near).astype(np.float32)
        blur = lambda a: np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(8)), dtype=np.float32)
        den = blur(w * 255) / 255
        fill = np.dstack([blur(src[..., c] * w) / np.maximum(den, 1e-3) for c in range(3)])
        keep = np.where(near[..., None], np.clip(fill, 0, 255).astype(np.uint8), np.asarray(rgb, dtype=np.uint8))
        self.plate = Image.fromarray(keep).convert("RGBA")
        self.lines = np.asarray(rgb, dtype=np.uint8)
        self.span = (opt.get("start", 0.05), opt.get("end", 0.9))   # 場面の何割目から何割目で伸びきるか

    def frame(self, p):
        a, b = self.span
        x = min(max((p - a) / (b - a), 0), 1)
        g = x * x * (3 - 2 * x) * 1.06                      # ゆっくり始まり、場面のあいだずっと伸び続ける
        reveal = np.clip((g - self.dist) / 0.05, 0, 1)       # 伸びる先端は少しぼかす
        layer = np.dstack([self.lines, (self.alpha * reveal * 255).astype(np.uint8)])
        out = self.plate.copy()
        out.alpha_composite(Image.fromarray(layer, "RGBA"))
        return out


class Sprout:
    """絵の中の小さなもの（芽・花など）を、地面を支点に小さい状態から伸び上がらせる。
    box＝そのものを囲む四角（画像の px。下辺が地面）。四角の中は左隣の紙の色で埋めてから、拡大しながら重ねる"""

    def __init__(self, img, opt):
        x0, y0, x1, y1 = opt["box"]
        self.box = (x0, y0, x1, y1)
        rgb = np.asarray(img.convert("RGB"), dtype=np.uint8)
        self.patch = Image.fromarray(rgb[y0:y1, x0:x1].copy())
        fill = rgb[y0:y1, x0 - 6:x0 - 2].mean(axis=1, keepdims=True).astype(np.uint8)  # 行ごとの紙の色
        self.blank = Image.fromarray(np.repeat(fill, x1 - x0, axis=1))
        self.span = (opt.get("start", 0.1), opt.get("end", 0.7))

    def apply(self, frame, p):
        a, b = self.span
        x = min(max((p - a) / (b - a), 0), 1)
        k = 1 + 0.08 * math.sin(x * math.pi) if x < 1 else 1      # 伸びきる手前で少しだけ行き過ぎて戻る
        s = max(x * x * (3 - 2 * x) * k, 0.001)
        x0, y0, x1, y1 = self.box
        out = frame.copy()
        out.paste(self.blank, (x0, y0))
        w, h = max(int((x1 - x0) * s), 1), max(int((y1 - y0) * s), 1)
        sp = self.patch.resize((w, h), Image.LANCZOS)
        out.paste(sp, ((x0 + x1 - w) // 2, y1 - h))
        return out


class Plant:
    """絵に描かれた根・芽を消して、単純な線で描き直し、にょきにょき伸ばす。
    roots＝{"origin": [x, y], "depth": px, "branches": 本数, "spread": 横根の長さ倍率, "width": 太さ}
    sprout＝{"origin": [x, y], "height": px, "leaf": 葉の長さ, "box": 元の芽を消す四角}
    erase_top＝この高さ（割合）より下の暗い線（元の根）を消す"""
    COLOR = (52, 46, 40, 255)
    LEAF = (198, 188, 174, 255)

    def __init__(self, img, opt):
        plate = GrowingLines(img, {"top": opt["erase_top"]} if "erase_top" in opt else {}).plate.convert("RGB")
        sp = opt.get("sprout")
        if sp and sp.get("box"):
            x0, y0, x1, y1 = sp["box"]
            rgb = np.asarray(plate, dtype=np.uint8)
            fill = rgb[y0:y1, x0 - 6:x0 - 2].mean(axis=1, keepdims=True).astype(np.uint8)
            plate.paste(Image.fromarray(np.repeat(fill, x1 - x0, axis=1)), (x0, y0))
        self.plate = plate.convert("RGBA")
        self.paths = []                                     # (点列, 太さ, 伸び始め, 伸びきり)
        r = opt.get("roots")
        if r:
            self._roots(r, opt.get("roots_span", (0.05, 0.85)))
        self.sprout = sp
        self.sprout_span = opt.get("sprout_span", (0.1, 0.5))

    def _roots(self, r, span):
        ox, oy = r["origin"]
        depth, n = r["depth"], r.get("branches", 6)
        wmain = r.get("width", 7)
        spread = r.get("spread", 1.0)
        ys = np.linspace(0, depth, 80)
        main = [(ox + 8 * math.sin(y / 140), oy + y) for y in ys]   # 少しだけ揺れる主根
        a, b = span
        speed = (b - a) / depth                                  # 1px あたりの時間（主根と横根で同じ速さ）
        self.paths.append((main, wmain, a, b))
        for i in range(n):
            f = 0.1 + 0.7 * i / max(n - 1, 1)                    # 主根のどこから出るか
            side = -1 if i % 2 == 0 else 1
            length = depth * spread * (0.40 - 0.12 * i / max(n - 1, 1))
            th = math.radians(58 - 18 * i / max(n - 1, 1))       # 下ほど垂直に近い
            x, y = main[int(f * (len(main) - 1))]
            pts = [(x, y)]
            steps = 30
            for k in range(steps):
                u = k / steps
                ang = th * (1 - 0.55 * u)                        # 先へいくほど下へ曲がる
                x += side * math.sin(ang) * length / steps
                y += math.cos(ang) * length / steps
                pts.append((x, y))
            t0 = a + f * (b - a) * 0.9
            wb = max(wmain - 2, 3)
            self.paths.append((pts, wb, t0, t0 + length * speed))
            for g in r.get("twigs", ()):                         # 横根の途中から、さらに小枝を出す
                j = int(g * (len(pts) - 1))
                x, y = pts[j]
                tl = length * 0.45
                tw = [(x, y)]
                for k in range(16):
                    ang = math.radians(20 - 10 * k / 16)
                    x -= side * math.sin(ang) * tl / 16             # 横根と反対側へ、ほぼ真下に
                    y += math.cos(ang) * tl / 16
                    tw.append((x, y))
                t1 = t0 + g * length * speed
                self.paths.append((tw, max(wb - 1, 2), t1, t1 + tl * speed))

    @staticmethod
    def _partial(pts, frac):
        pts = np.asarray(pts, dtype=np.float32)
        seg = np.hypot(*np.diff(pts, axis=0).T)
        cum = np.concatenate([[0], np.cumsum(seg)])
        L = frac * cum[-1]
        k = int(np.searchsorted(cum, L))
        out = [tuple(q) for q in pts[:k]]
        if 0 < k < len(pts):
            u = (L - cum[k - 1]) / max(seg[k - 1], 1e-6)
            out.append(tuple(pts[k - 1] + (pts[k] - pts[k - 1]) * u))
        return out

    @staticmethod
    def _grow(p, a, b):
        x = min(max((p - a) / (b - a), 0), 1)
        # にょきにょき：ぐっ、ぐっと伸びる（速さに波をつける。止まらず、戻らない）
        return min(max(x + 0.022 * math.sin(x * math.pi * 12), 0), 1) if 0 < x < 1 else x

    def _stroke(self, d, pts, w, S):
        if len(pts) < 2:
            return
        q = [(x * S, y * S) for x, y in pts]
        d.line(q, fill=self.COLOR, width=int(w * S), joint="curve")
        for x, y in (q[0], q[-1]):
            rr = w * S / 2
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=self.COLOR)

    def _leaf(self, d, base, ang, length, S):
        if length < 2:
            return
        bx, by = base
        ca, sa = math.cos(ang), math.sin(ang)
        pts = []
        for k in range(21):
            u = k / 20
            pts.append((u * length, 0.28 * length * math.sin(u * math.pi)))
        for k in range(20, -1, -1):
            u = k / 20
            pts.append((u * length, -0.28 * length * math.sin(u * math.pi)))
        q = [((bx + x * ca - y * sa) * S, (by + x * sa + y * ca) * S) for x, y in pts]
        d.polygon(q, fill=self.LEAF, outline=self.COLOR, width=int(3 * S))

    def frame(self, p):
        S = 2
        layer = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        for pts, w, a, b in self.paths:
            g = self._grow(p, a, b)
            if g > 0:
                self._stroke(d, self._partial(pts, g), w, S)
        sp = self.sprout
        if sp:
            a, b = self.sprout_span
            ox, oy = sp["origin"]
            h = sp.get("height", 110)
            g = self._grow(p, a, a + (b - a) * 0.65)             # 茎が伸びて
            stem = [(ox + 5 * math.sin(u * math.pi), oy - u * h) for u in np.linspace(0, 1, 30)]
            part = self._partial(stem, g)
            self._stroke(d, part, sp.get("width", 5), S)
            x = min(max((p - (a + (b - a) * 0.6)) / ((b - a) * 0.4), 0), 1)   # 双葉がひらく
            if x > 0 and part:
                k = 1 + 0.18 * math.sin(x * math.pi) if x < 1 else 1
                L = sp.get("leaf", 48) * x * k
                top = part[-1]
                tilt = (1 - x) * 0.9                             # 閉じた状態から左右へ
                self._leaf(d, top, math.radians(-155) + tilt, L, S)
                self._leaf(d, top, math.radians(-25) - tilt, L, S)
        out = self.plate.copy()
        out.alpha_composite(layer.resize((W, H), Image.LANCZOS))
        return out


class ImageScene(Scene):
    """イラスト・写真を全面に敷き、札に字幕を載せる（初リールと同じ見せ方）"""
    stars = False

    def __init__(self, image, text="", ypos=0.2, sec=None, grow=None, sprout=None, plant=None):
        img = Image.open(image).convert("RGB")
        scale = max(W / img.width, H / img.height)
        img = img.resize((int(img.width * scale) + 1, int(img.height * scale) + 1), Image.LANCZOS)
        self.img = img.crop(((img.width - W) // 2, (img.height - H) // 2,
                             (img.width - W) // 2 + W, (img.height - H) // 2 + H)).convert("RGBA")
        self.text, self.ypos = text, ypos
        self.sec = sec or (min(max(1.6 + len(text) * 0.1, 2.5), 5.5) if text else 3.0)
        # 任意：線画（根っこ・枝・つたなど）を、根元から線に沿って伸ばす（"grow": true か {"top": 0.54}）
        self.grow = GrowingLines(self.img, grow) if grow else None
        # 任意：芽などを地面から伸び上がらせる（"sprout": {"box": [x0, y0, x1, y1]}）
        self.sprout = Sprout(self.img, sprout) if sprout else None
        # 任意：元の根・芽を消して、単純な線で描き直して伸ばす（"plant": {...}）
        self.plant = Plant(self.img, plant) if plant else None

    def render(self, canvas, t):
        z = 1 + 0.04 * t / self.sec
        frame = self.grow.frame(t / self.sec) if self.grow else self.img
        if self.plant:
            frame = self.plant.frame(t / self.sec)
        if self.sprout:
            frame = self.sprout.apply(frame.convert("RGB"), t / self.sec).convert("RGBA")
        big = frame.resize((int(W * z), int(H * z)), Image.BILINEAR)
        canvas.alpha_composite(big.crop(((big.width - W) // 2, (big.height - H) // 2,
                                         (big.width - W) // 2 + W, (big.height - H) // 2 + H)))
        if not self.text:
            return
        size = fit_size(self.text, 50, W - 220, 0.06)
        lines, gap = text_block(self.text, size, INK, tracking=0.06, line_gap=1.6)
        bw = max(l.width for l in lines) + 96
        bh = gap * (len(lines) - 1) + lines[0].height + 70
        top = int(H * self.ypos) - bh // 2
        box = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(box).rounded_rectangle([(W - bw) // 2, top, (W + bw) // 2, top + bh],
                                              radius=28, fill=(250, 245, 232, 235), outline=INK + (255,), width=3)
        for i, l in enumerate(lines):
            box.alpha_composite(l, ((W - l.width) // 2, top + 38 + i * gap))
        canvas.alpha_composite(with_alpha(box, ease(t / FADE_IN)))


class EndScene(Scene):
    """ブランドのエンドカード（リールの最後は必ずこれ・字幕なし）"""
    stars = False
    sec = 3.0

    def __init__(self):
        self.img = Image.open(ENDCARD).convert("RGBA").resize((W, H))

    def render(self, canvas, t):
        z = 1 + 0.03 * t / self.sec
        big = self.img.resize((int(W * z), int(H * z)), Image.BILINEAR)
        canvas.alpha_composite(big.crop(((big.width - W) // 2, (big.height - H) // 2,
                                         (big.width - W) // 2 + W, (big.height - H) // 2 + H)))


# ───────────────────────── テンプレート（6系統） ─────────────────────────

def t_moon(s):
    """新月・満月：表紙（月相）→ メッセージ → 3つの問い → 締め"""
    out = [TitleScene(s["theme"], s.get("date", ""), s.get("sub", ""), s.get("phase", "full"),
                      image=s.get("cover_image") and resolve(s["cover_image"]),
                      kicker_style=s.get("date_style"), hold=s.get("cover_hold"))]
    # message は文字列なら1場面、リストなら1要素1場面（オリジナルのひとことを数場面で語るとき）
    msg = s.get("message")
    for line in (msg if isinstance(msg, list) else [msg] if msg else []):
        out.append(scene_from(line))
    if s.get("questions"):
        out.append(ListScene(s["questions"], s.get("questions_title", "")))
    if s.get("closing"):
        c = s["closing"]
        out.append(scene_from(c) if isinstance(c, dict) else TextScene(c, size=72))
    return out


def t_sky(s):
    """今の星：表紙 →「人にどう思われる？」が消えて「私は、どうしたい？」→ メッセージ"""
    out = [TitleScene(s["theme"], s.get("date", ""), s.get("sub", ""), s.get("phase"),
                      image=s.get("cover_image") and resolve(s["cover_image"]),
                      kicker_style=s.get("date_style"), hold=s.get("cover_hold"))]
    if s.get("swap"):
        out.append(SwapScene(*s["swap"]))
    if s.get("message"):
        out.append(TextScene(s["message"]))
    if s.get("closing"):
        out.append(TextScene(s["closing"], size=72))
    return out


def t_tarot(s):
    """タロット1枚引き：伏せたカード＋問い → 返る → 意味 → 締め（カードは実際に引いたものだけ）"""
    c = s["card"]
    face = c["face"] if Path(c["face"]).is_absolute() else str(ROOT / c["face"])
    out = [CardScene(face, c.get("name", ""), s.get("question", ""), c.get("reversed", False))]
    for line in s.get("meaning", []):
        out.append(scene_from(line))
    closing = s.get("closing", DEFAULT_CLOSING_TAROT)
    out.append(scene_from(closing) if isinstance(closing, dict) else TextScene(closing, size=70))
    return out


def resolve(path):
    return path if Path(path).is_absolute() else str(ROOT / path)


def scene_from(item):
    """文字列は文字だけの場面、{"text","image","ypos"} はイラストを敷いて札に字幕を載せる場面"""
    if not isinstance(item, dict):
        return TextScene(item)
    path = item["image"] if Path(item["image"]).is_absolute() else str(ROOT / item["image"])
    return ImageScene(path, item.get("text", ""), item.get("ypos", 0.2), item.get("sec"), item.get("grow"), item.get("sprout"), item.get("plant"))


def t_know(s):
    """自分を知る：表紙 → 項目を1つずつ → 問い"""
    out = [TitleScene(s["theme"], s.get("kicker", ""), s.get("sub", ""))]
    if s.get("items"):
        out.append(ListScene(s["items"], s.get("items_title", ""), numbered=s.get("numbered", False)))
    if s.get("question"):
        out.append(TextScene(s["question"], size=72))
    return out


def t_lines(s):
    """自分で決める／自分を推す：短い言葉を1場面ずつ（「今は決めなくていい」シリーズなど）"""
    out = []
    if s.get("versus"):
        out.append(VersusScene(s["versus"]["before"], s["versus"]["after"]))
    out += [TextScene(line) for line in s.get("lines", [])]
    if s.get("closing"):
        out.append(TextScene(s["closing"], size=72))
    return out


TEMPLATES = {"moon": t_moon, "sky": t_sky, "tarot": t_tarot, "know": t_know,
             "decide": t_lines, "essay": t_lines}


def build_scenes(spec):
    scenes = TEMPLATES[spec["template"]](spec)
    # 任意：締めのあと・エンドカードの前に案内の場面（エンドカード自体には文字を載せない）
    if spec.get("cta"):
        scenes.append(CtaScene(spec["cta"], spec["cta_pet"]) if spec.get("cta_pet")
                      else TextScene(spec["cta"], size=56))
    # 任意：場面ごとにイラストを差し込む（{"at": 1, "image": "...", "text": "...", "ypos": 0.2}）
    # 同じ at が複数あっても、JSONに書いた順で並ぶよう後ろから差し込む
    images = list(enumerate(spec.get("images", [])))
    for _, ins in sorted(images, key=lambda p: (p[1]["at"], p[0]), reverse=True):
        path = ins["image"] if Path(ins["image"]).is_absolute() else str(ROOT / ins["image"])
        scenes.insert(ins["at"], ImageScene(path, ins.get("text", ""), ins.get("ypos", 0.2), ins.get("sec"), ins.get("grow"), ins.get("sprout"), ins.get("plant")))
    # 尺の指定があれば、エンドカード以外を等倍で伸び縮みさせる
    if spec.get("duration"):
        fixed = sum(sc.sec for sc in scenes if getattr(sc, "fixed", False))
        body = sum(sc.sec for sc in scenes if not getattr(sc, "fixed", False))
        k = (spec["duration"] - EndScene.sec - fixed) / body
        for sc in scenes:
            if not getattr(sc, "fixed", False):
                sc.sec = max(sc.sec * k, 1.5)
    scenes.append(EndScene())
    return scenes


# ───────────────────────── 書き出し ─────────────────────────

def render_frame(scene, t, bg, stars):
    canvas = bg.copy()
    if scene.stars:
        stars.draw(canvas, t)
    scene.render(canvas, t)
    # 場面の頭と終わりを短くフェード（紙色へ）
    a = min(ease(t / 0.25), 1 - ease((t - (scene.sec - FADE_OUT)) / FADE_OUT))
    if a < 1:
        canvas = Image.blend(bg, canvas, max(a, 0))
    return canvas.convert("RGB")


def main():
    spec_path = Path(sys.argv[1])
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    scenes = build_scenes(spec)
    bg, _ = paper_bg()
    stars = Stars()

    if "--still" in sys.argv:
        at = float(sys.argv[sys.argv.index("--still") + 1])
        for sc in scenes:
            if at < sc.sec:
                out = spec_path.with_suffix(f".still_{at:.1f}.png")
                render_frame(sc, at, bg, stars).save(out)
                print(out)
                return
            at -= sc.sec
        return

    out = Path(spec["out"]) if spec.get("out") else spec_path.with_suffix(".mp4")
    if spec.get("out") and not out.is_absolute():
        out = spec_path.parent / out
    total = sum(sc.sec for sc in scenes)
    proc = subprocess.Popen([
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-f", "lavfi", "-t", f"{total:.2f}", "-i", "anullsrc=r=48000:cl=stereo",
        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest",
        "-movflags", "+faststart", str(out),
    ], stdin=subprocess.PIPE)
    for sc in scenes:
        for f in range(int(round(sc.sec * FPS))):
            proc.stdin.write(render_frame(sc, f / FPS, bg, stars).tobytes())
    proc.stdin.close()
    proc.wait()
    print(f"{out}  ({total:.1f}秒・{len(scenes)}場面)")


if __name__ == "__main__":
    main()
