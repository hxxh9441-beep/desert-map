#!/usr/bin/env python3
"""توليد أيقونات خارطة البر — Full-Bleed بدون إطارات أو زوايا مطبوخة.

التصميم: خلفية داكنة #0b1120 (تطابق background_color في manifest لسبلاش
سلس) + جبل متدرج #1B3152 → #7699AF + سلسلة جبال خلفية داكنة + نجوم +
هلال. المحتوى المهم ضمن الدائرة الآمنة (قطر 80% من القماش) فيصلح
لـ "any maskable" معاً. لا توجد زوايا دائرية أو ظلال أو إطارات مطبوخة —
نظام التشغيل يتولى التقريب تلقائياً.

الاستخدام: python3 tools/gen-icons.py
"""
from PIL import Image, ImageDraw, ImageFilter
import os, random, math

S = 512          # الحجم الأساسي
F = 4            # مضاعف التنعيم (supersampling)
W = S * F        # لوحة الرسم 2048

# ---------- الألوان (هوية خارطة البر) ----------
BG = (11, 17, 32)            # #0b1120 — خلفية القماش = خلفية المانيفست
BACK_MTN = (13, 25, 50)      # #0D1932 — الجبال الخلفية
FRONT_TOP = (123, 160, 187)  # #7BA0BB — قمم الجبل الأمامي (فاتحة تبرز على السماء)
FRONT_BOTTOM = (46, 79, 120) # #2E4F78 — قاعدة الجبل (تتدرج للظلام)
STAR = (232, 240, 246)       # #E8F0F6
MOON = (241, 245, 249)       # #F1F5F9
GLOW_CYAN = (6, 182, 212)    # #06B6D4
GLOW_VIOLET = (139, 92, 246) # #8B5CF6

CENTER = (S / 2, S / 2)
SAFE_R = S * 0.40            # نصف قطر الدائرة الآمنة (maskable)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def vertical_gradient(w, h, top, bottom):
    """تدرج رأسي RGB بسرعة (putdata)."""
    rows = []
    denom = max(h - 1, 1)
    for y in range(h):
        t = y / denom
        rows.extend([lerp(top, bottom, t)] * w)
    img = Image.new('RGB', (w, h))
    img.putdata(rows)
    return img

def draw_gradient_polygon(canvas, pts, top, bottom):
    """ملء مضلع بتدرج رأسي عبر قناع المضلع."""
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    grad = vertical_gradient(canvas.size[0], canvas.size[1], top, bottom)
    canvas.paste(grad, (0, 0), mask)

def scale(pts):
    return [(x * F, y * F) for (x, y) in pts]

def main():
    canvas = Image.new('RGB', (W, W), BG)

    # ---------- توهج خلفي خافت (أزرق/بنفسجي) خلف الجبال ----------
    glow = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy = W // 2, int(W * 0.62)
    gd.ellipse([cx - int(W * 0.42), cy - int(W * 0.30),
                cx + int(W * 0.42), cy + int(W * 0.30)],
               fill=GLOW_CYAN + (26,))
    gd.ellipse([cx - int(W * 0.26), cy - int(W * 0.18),
                cx + int(W * 0.26), cy + int(W * 0.18)],
               fill=GLOW_VIOLET + (22,))
    glow = glow.filter(ImageFilter.GaussianBlur(int(W * 0.16)))
    canvas.paste(Image.alpha_composite(canvas.convert('RGBA'), glow).convert('RGB'), (0, 0))

    # ---------- النجوم (ضمن الدائرة الآمنة) ----------
    rnd = random.Random(7)
    star_layer = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    sd = ImageDraw.Draw(star_layer)
    for _ in range(14):
        # نقطة عشوائية داخل دائرة آمنة (نصف قطر 175 من المركز)
        ang = rnd.uniform(0, math.tau)
        rad = rnd.uniform(0, 172)
        x = CENTER[0] + rad * math.cos(ang)
        y = CENTER[1] + rad * math.sin(ang)
        if y < 45 or y > 250 or x < 65 or x > 447:
            continue
        r = rnd.choice([3, 4, 4, 5, 6, 7])
        a = rnd.choice([180, 205, 230, 250])
        sd.ellipse([(x - r) * F, (y - r) * F, (x + r) * F, (y + r) * F],
                   fill=STAR + (a,))
    # نجمة كبيرة ساطعة (نجمة الشمال) لتوازن التكوين — ضمن الدائرة الآمنة
    sd.ellipse([(372 - 8) * F, (96 - 8) * F, (372 + 8) * F, (96 + 8) * F],
               fill=STAR + (255,))
    canvas.paste(Image.alpha_composite(canvas.convert('RGBA'), star_layer).convert('RGB'), (0, 0))

    # ---------- هلال (أعلى اليسار — ضمن الدائرة الآمنة) ----------
    moon = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    md = ImageDraw.Draw(moon)
    mx, my, mr = 118 * F, 112 * F, 27 * F
    md.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=MOON + (255,))
    # قطع الدائرة لإنتاج الهلال (إزاحة لأسفل-يمين)
    cut = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(cut).ellipse(
        [mx - mr + 13 * F, my - mr + 9 * F, mx + mr + 13 * F, my + mr + 9 * F],
        fill=BG + (255,))
    moon = Image.alpha_composite(moon, cut)
    canvas.paste(Image.alpha_composite(canvas.convert('RGBA'), moon).convert('RGB'), (0, 0))

    # ---------- الجبال الخلفية (داكنة، قمم حادة — تلامس الحواف) ----------
    back = [(0, 512), (40, 358), (95, 424), (150, 328), (205, 412),
            (260, 342), (315, 426), (370, 338), (425, 416), (470, 352), (512, 392), (512, 512)]
    ImageDraw.Draw(canvas).polygon(scale(back), fill=BACK_MTN)

    # ---------- الجبل الأمامي (تدرج فاتح→داكن) — يمتد للحافة كاملاً ----------
    front = [(0, 512), (55, 432), (110, 372), (170, 422), (225, 348),
             (280, 410), (340, 362), (400, 418), (455, 378), (512, 422), (512, 512)]
    draw_gradient_polygon(canvas, scale(front), FRONT_TOP, FRONT_BOTTOM)

    # ---------- تصغير إلى 512 (تنعيم LANCZOS) ----------
    master = canvas.resize((S, S), Image.LANCZOS)

    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    out_dir = os.path.normpath(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    sizes = {
        'icon-512.png': 512,
        'icon-512-maskable.png': 512,
        'icon-192.png': 192,
        'apple-touch-icon.png': 180,
        'favicon-64.png': 64,
        'favicon-32.png': 32,
    }
    for name, size in sizes.items():
        img = master.resize((size, size), Image.LANCZOS)
        img.save(os.path.join(out_dir, name), 'PNG', optimize=True)
        print(f'  {name}: {size}x{size}  {os.path.getsize(os.path.join(out_dir, name))} bytes')

    print('تم توليد كل الأيقونات ✓')

if __name__ == '__main__':
    main()
