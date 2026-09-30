# 뀨 그림 두 장 → 앱 아이콘·공유 그림. 실행: python docs/art/make-icons.py (duckq-board 폴더에서)
# 아이콘 = kkyu-icon-1024.png(아이콘 전용 그림), 공유 그림 = kkyu-cue-1024.png(큐버튼 장면)
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "..", "app")
BG = (13, 17, 24)

# 홈 화면 아이콘: 여백을 줄여 1.15배로 키움(버튼·헤드폰은 안 잘림)
icon = Image.open(os.path.join(HERE, "kkyu-icon-1024.png")).convert("RGB")
tight = icon.crop((70, 50, 960, 940))
for n, s in (("icon-kkyu-512.png", 512), ("icon-kkyu-192.png", 192), ("apple-touch-icon-kkyu.png", 180)):
    tight.resize((s, s), Image.LANCZOS).save(os.path.join(APP, n), optimize=True)

# 안드로이드 원 모양: 가장자리가 잘리니 원본을 조금 더 줄여 안전한 원 안에
m = Image.new("RGB", (1024, 1024), BG)
sm = icon.resize((920, 920), Image.LANCZOS)
mask = Image.new("L", sm.size, 0)
ImageDraw.Draw(mask).rectangle([30, 30, sm.width - 30, sm.height - 30], fill=255)
m.paste(sm, (52, 40), mask.filter(ImageFilter.GaussianBlur(20)))
m.resize((512, 512), Image.LANCZOS).save(os.path.join(APP, "icon-kkyu-maskable.png"), optimize=True)

# 공유 그림 1200x630: 왼쪽 큐버튼 장면, 오른쪽 글
cue = Image.open(os.path.join(HERE, "kkyu-cue-1024.png")).convert("RGB")
og = Image.new("RGB", (1200, 630), BG)
pic = cue.resize((630, 630), Image.LANCZOS)
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
print("ok")
