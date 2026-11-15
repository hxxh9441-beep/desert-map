#!/usr/bin/env python3
"""توليد أيقونات خارطة البر من الصورة المصدر tools/source/icon-source.jpg

- الأيقونة العادية (any): قص كامل للوحة الخريطة (مدينة + بر + بوصلة)
- maskable / apple / favicon: قص مقرّب حول الدبوس — المحتوى ضمن الدائرة
  الآمنة (80%) وأوضح بالأحجام الصغيرة
- og-image: 1200×630 لمعاينة الروابط
الصورة المصدر لوحة بزوايا دائرية وظل، فنقص من داخلها ليخرج Full-Bleed.

الاستخدام: python3 tools/gen-icons.py   (يتطلب Pillow)
"""
from PIL import Image
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'icons')
src = Image.open(os.path.join(HERE, 'source', 'icon-source.jpg')).convert('RGB')

# إحداثيات داخل لوحة المصدر (2400×1792): داخل الإطار بعيداً عن الزوايا المدورة
FULL = (540, 255, 1865, 1580)      # 1325×1325 — لوحة كاملة
PIN = (1191, 807)                  # موضع الدبوس
TIGHT_HALF = 440                   # نصف ضلع القص المقرّب
TIGHT = (PIN[0] - TIGHT_HALF, PIN[1] - TIGHT_HALF, PIN[0] + TIGHT_HALF, PIN[1] + TIGHT_HALF)
OG_W, OG_H = 1325, 696             # نسبة 1200:630 داخل اللوحة
OG = (540, PIN[1] - OG_H // 2, 540 + OG_W, PIN[1] - OG_H // 2 + OG_H)

def save(box, size, name):
    img = src.crop(box).resize(size, Image.LANCZOS)
    if name.endswith('.png'):
        img = img.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG).convert('RGB') if size[0] >= 128 else img
        img = img.quantize(colors=256, dither=Image.FLOYDSTEINBERG) if size[0] >= 128 else img
        img.save(os.path.join(OUT, name), optimize=True)
    else:
        img.save(os.path.join(OUT, name), quality=82, optimize=True, progressive=True)
    print('✓', name, size)

save(FULL, (512, 512), 'icon-512.png')
save(FULL, (192, 192), 'icon-192.png')
save(TIGHT, (512, 512), 'icon-512-maskable.png')
save(TIGHT, (180, 180), 'apple-touch-icon.png')
save(TIGHT, (64, 64), 'favicon-64.png')
save(TIGHT, (32, 32), 'favicon-32.png')
save(OG, (1200, 630), 'og-image.jpg')
