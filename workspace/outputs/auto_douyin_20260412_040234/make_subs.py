from PIL import Image, ImageDraw, ImageFont

W, H = 720, 1280
font_cn = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', 40)
font_en = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Unicode.ttf', 22)

cards = [
    ('sub1.png', '风还是冷的，冬天也没真正走远。', 'The wind is still cold, and winter has not truly gone.'),
    ('sub2.png', '她站在山谷里，看着雾散开，看着山脊一点点变绿。', 'She stands in the valley, watching the mist clear and the mountain ridges slowly turn green.'),
    ('sub3.png', '原来，春天不是突然来了，是山先醒了。', 'It turns out spring does not arrive all at once. The mountains wake first.')
]

for name, cn, en in cards:
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    y = H - 184
    draw.rounded_rectangle((42, y - 32, W - 42, y + 108), radius=24, fill=(0, 0, 0, 94))

    def wrap(text, font, max_width, stroke_width):
        lines = []
        current = ''
        for ch in text:
            test = current + ch
            box = draw.textbbox((0, 0), test, font=font, stroke_width=stroke_width)
            if box[2] - box[0] <= max_width:
                current = test
            else:
                lines.append(current)
                current = ch
        if current:
            lines.append(current)
        return lines

    cn_lines = wrap(cn, font_cn, 600, 4)
    y_cn = y
    for line in cn_lines:
        box = draw.textbbox((0, 0), line, font=font_cn, stroke_width=4)
        x = (W - (box[2] - box[0])) // 2
        draw.text((x, y_cn), line, font=font_cn, fill=(255, 255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0, 230))
        y_cn += 46

    en_lines = wrap(en, font_en, 620, 3)
    y_en = y + 56 if len(cn_lines) == 1 else y + 92
    for line in en_lines:
        box = draw.textbbox((0, 0), line, font=font_en, stroke_width=3)
        x = (W - (box[2] - box[0])) // 2
        draw.text((x, y_en), line, font=font_en, fill=(255, 255, 255, 235), stroke_width=3, stroke_fill=(0, 0, 0, 230))
        y_en += 28

    img.save(name)

print('subtitle overlays ready')
