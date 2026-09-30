import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC = r"C:\Users\bau85\OneDrive - 한울초등학교 (1)\code\deokgu-lab\stickers\_ref\받은그림\큐버튼.png"
APP = r"C:\Users\bau85\OneDrive - 한울초등학교 (1)\code\duckq-board\app"
PV = r"C:\Users\bau85\AppData\Local\Temp\claude\C--Users-bau85-OneDrive-----------1--code-duckq-board\43bf2940-c08b-4bf3-aea9-14f6016897e9\scratchpad\preview2.png"
BG = (13, 17, 24)

src = Image.open(SRC).convert("RGB")
for n, s in (("icon-kkyu-512.png", 512), ("icon-kkyu-192.png", 192), ("apple-touch-icon-kkyu.png", 180)):
    src.resize((s, s), Image.LANCZOS).save(os.path.join(APP, n), optimize=True)

# maskable: shrink so the whole scene sits inside the launcher's safe circle
m = Image.new("RGB", (1024, 1024), BG)
k = 0.80
sm = src.resize((int(1024 * k), int(1024 * k)), Image.LANCZOS)
mask = Image.new("L", sm.size, 0)
ImageDraw.Draw(mask).rectangle([40, 40, sm.width - 40, sm.height - 40], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(28))
m.paste(sm, ((1024 - sm.width) // 2, (1024 - sm.height) // 2 + 20), mask)
m.resize((512, 512), Image.LANCZOS).save(os.path.join(APP, "icon-kkyu-maskable.png"), optimize=True)

# share card 1200x630: picture left, words right; fade the picture's right edge into the background
og = Image.new("RGB", (1200, 630), BG)
pic = src.resize((630, 630), Image.LANCZOS)
fade = Image.new("L", (630, 630), 255)
fd = ImageDraw.Draw(fade)
for x in range(560, 630):
    fd.line([x, 0, x, 630], fill=int(255 * (630 - x) / 70))
og.paste(pic, (30, 0), fade)
d = ImageDraw.Draw(og)
d.text((690, 170), "DuckQ", font=ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 110), fill=(236, 236, 238))
d.text((694, 310), "무료 공연 사운드보드", font=ImageFont.truetype(r"C:\Windows\Fonts\malgunbd.ttf", 46), fill=(236, 236, 238))
f = ImageFont.truetype(r"C:\Windows\Fonts\malgun.ttf", 32)
d.text((694, 392), "설치 없이", font=f, fill=(139, 144, 152))
d.text((694, 438), "폰 · 태블릿 · 노트북", font=f, fill=(139, 144, 152))
og.save(os.path.join(APP, "og-kkyu.png"), optimize=True)

# preview sheet
pv = Image.new("RGB", (1240, 960), (40, 44, 52))
pv.paste(og, (20, 20))
x = 20
full = src
mk = Image.open(os.path.join(APP, "icon-kkyu-maskable.png"))
for s in (256, 120, 60):
    ic = full.resize((s, s), Image.LANCZOS)
    r = Image.new("L", (s, s), 0); ImageDraw.Draw(r).rounded_rectangle([0, 0, s, s], radius=s * .22, fill=255)
    pv.paste(ic, (x, 670), r); x += s + 30
    ic2 = mk.resize((s, s), Image.LANCZOS)
    c = Image.new("L", (s, s), 0); ImageDraw.Draw(c).ellipse([0, 0, s, s], fill=255)
    pv.paste(ic2, (x, 670), c); x += s + 50
pv.save(PV)
