from pathlib import Path
from math import sin, pi

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "animations"
OUT_DIR.mkdir(parents=True, exist_ok=True)

WIDTH = 720
HEIGHT = 400
FPS = 12
SECONDS = 4
FRAMES = FPS * SECONDS

STEPS = [
    ("pending_approval", ("Pending", "Approval"), "Waiting for approval"),
    ("approved", ("Approved",), "Approved by owner"),
    ("merchant_received", ("Merchant", "Received"), "Merchant has item"),
    ("delivery", ("Delivery",), "On the way"),
]

COLORS = {
    "bg": (246, 248, 252),
    "card": (255, 255, 255),
    "ink": (31, 41, 55),
    "muted": (103, 113, 130),
    "line": (216, 224, 235),
    "green": (32, 166, 106),
    "blue": (40, 120, 255),
    "amber": (246, 169, 45),
    "purple": (124, 92, 255),
    "teal": (20, 167, 168),
    "white": (255, 255, 255),
}

ACTIVE_COLORS = {
    "pending_approval": COLORS["blue"],
    "approved": COLORS["amber"],
    "merchant_received": COLORS["purple"],
    "delivery": COLORS["teal"],
}

FILE_NAMES = {
    "pending_approval": "stock-status-pending-approval.gif",
    "approved": "stock-status-approved.gif",
    "merchant_received": "stock-status-merchant-received.gif",
    "delivery": "stock-status-delivery.gif",
}


def font(size, bold=False):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


FONT_TITLE = font(30, bold=True)
FONT_LABEL = font(20, bold=True)
FONT_SMALL = font(15)
FONT_BADGE = font(17, bold=True)


def rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text_center(draw, xy, text, fill, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    tw = box[2] - box[0]
    th = box[3] - box[1]
    x, y = xy
    draw.text((x - tw / 2, y - th / 2), text, font=fnt, fill=fill)


def multiline_center(draw, x, y, lines, fill, fnt, line_gap=2):
    widths = []
    heights = []
    for line in lines:
        box = draw.textbbox((0, 0), line, font=fnt)
        widths.append(box[2] - box[0])
        heights.append(box[3] - box[1])

    total_h = sum(heights) + line_gap * max(0, len(lines) - 1)
    cursor = y - total_h / 2
    for idx, line in enumerate(lines):
        draw.text((x - widths[idx] / 2, cursor), line, font=fnt, fill=fill)
        cursor += heights[idx] + line_gap


def draw_check(draw, cx, cy, size, fill):
    draw.line(
        [(cx - size * 0.34, cy), (cx - size * 0.08, cy + size * 0.25), (cx + size * 0.38, cy - size * 0.30)],
        fill=fill,
        width=max(3, int(size * 0.12)),
        joint="curve",
    )


def draw_arrow(draw, cx, cy, fill):
    draw.polygon(
        [
            (cx - 9, cy - 13),
            (cx + 11, cy),
            (cx - 9, cy + 13),
            (cx - 4, cy),
        ],
        fill=fill,
    )


def frame_image(target_status, frame):
    img = Image.new("RGB", (WIDTH, HEIGHT), COLORS["bg"])
    draw = ImageDraw.Draw(img)

    target_index = next(i for i, step in enumerate(STEPS) if step[0] == target_status)
    active_color = ACTIVE_COLORS[target_status]
    progress = target_index / (len(STEPS) - 1)
    pulse = 1 + 0.08 * sin(frame / FPS * pi * 2)
    stage_name = " ".join(STEPS[target_index][1])

    draw.ellipse((-120, -140, 240, 220), fill=(227, 237, 255))
    draw.ellipse((520, -120, 860, 210), fill=(224, 247, 247))

    card = (34, 34, WIDTH - 34, HEIGHT - 34)
    rounded_rect(draw, card, 18, COLORS["card"], outline=(224, 230, 240), width=2)

    draw.text((62, 58), "Stock Status", font=FONT_TITLE, fill=COLORS["ink"])
    draw.text((64, 94), "Telegram item approval update", font=FONT_SMALL, fill=COLORS["muted"])

    badge = (WIDTH - 260, 58, WIDTH - 62, 98)
    rounded_rect(draw, badge, 10, (238, 246, 255), outline=(213, 228, 255), width=1)
    text_center(draw, ((badge[0] + badge[2]) / 2, (badge[1] + badge[3]) / 2), stage_name, (23, 79, 189), FONT_BADGE)

    left = 100
    right = WIDTH - 100
    track_y = 190
    step_gap = (right - left) / (len(STEPS) - 1)
    positions = [(left + step_gap * i, track_y) for i in range(len(STEPS))]

    rounded_rect(draw, (left, track_y - 5, right, track_y + 5), 5, COLORS["line"])
    fill_x = left + (right - left) * progress
    if fill_x > left:
      rounded_rect(draw, (left, track_y - 5, fill_x, track_y + 5), 5, COLORS["green"])

    arrow_y = track_y - 40 + sin(frame / FPS * pi * 2) * 4
    draw.ellipse((fill_x - 23, arrow_y - 23, fill_x + 23, arrow_y + 23), fill=COLORS["white"], outline=(195, 213, 255), width=2)
    draw_arrow(draw, fill_x, arrow_y, active_color)

    for idx, (x, y) in enumerate(positions):
        status_key, label_lines, sub = STEPS[idx]
        done = idx < target_index
        active = idx == target_index
        radius = int(28 * (pulse if active else 1))
        node_color = COLORS["green"] if done else (active_color if active else (172, 182, 196))

        if active:
            glow = tuple(min(255, c + 35) for c in active_color)
            draw.ellipse((x - radius - 9, y - radius - 9, x + radius + 9, y + radius + 9), fill=glow)

        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=node_color, outline=COLORS["white"], width=7)

        if done:
            draw_check(draw, x, y, 28, COLORS["white"])
        else:
            text_center(draw, (x, y), str(idx + 1), COLORS["white"], FONT_LABEL)

        label_color = COLORS["green"] if done else (active_color if active else COLORS["ink"])
        multiline_center(draw, x, y + 63, label_lines, label_color, FONT_LABEL)
        sub_box = draw.textbbox((0, 0), sub, font=FONT_SMALL)
        draw.text((x - (sub_box[2] - sub_box[0]) / 2, y + 99), sub, font=FONT_SMALL, fill=COLORS["muted"])

    rounded_rect(draw, (62, 315, WIDTH - 62, 350), 9, (245, 247, 251), outline=(228, 233, 241), width=1)
    draw.text((80, 323), f"Current status: {stage_name}", font=FONT_SMALL, fill=(51, 65, 85))

    return img


def save_gif(status):
    frames = [frame_image(status, i) for i in range(FRAMES)]
    out_file = OUT_DIR / FILE_NAMES[status]
    frames[0].save(
        out_file,
        save_all=True,
        append_images=frames[1:],
        optimize=True,
        duration=int(1000 / FPS),
        loop=0,
    )
    print(out_file)


def main():
    for status, _, _ in STEPS:
        save_gif(status)


if __name__ == "__main__":
    main()
