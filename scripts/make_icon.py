"""
Generates SmartReader app icons (monochrome e-ink aesthetic).

Outputs:
  assets/icon.png          - 1024x1024, full-bleed design
  assets/adaptive-icon.png - 1024x1024, foreground sized for Android safe zone
"""

from PIL import Image, ImageDraw, ImageFilter
import math
import os

SIZE = 1024
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")


def draw_book(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: float = 1.0) -> None:
    """Draws an open-book glyph with a 'smart' spark, centered at (cx, cy)."""
    # Overall book footprint (open book, viewed from front).
    # The book sits centered horizontally; we shift it up so the spark cluster
    # above it doesn't push the overall composition off-center.
    book_w = int(740 * scale)
    book_h = int(560 * scale)

    left = cx - book_w // 2
    right = cx + book_w // 2
    top = cy - book_h // 2 + int(90 * scale)      # leaves headroom for sparks
    bottom = cy + book_h // 2 + int(90 * scale)

    spine_x = cx
    page_curve = int(40 * scale)  # how much pages dip in the middle
    stroke = max(4, int(18 * scale))

    # Outer book outline: two pages meeting at the spine.
    # Left page outline points
    left_page = [
        (left, top + page_curve),                  # top-left corner
        (spine_x - int(20 * scale), top),          # near spine top (page rises)
        (spine_x - int(20 * scale), bottom),       # near spine bottom
        (left, bottom - page_curve),               # bottom-left corner
    ]
    right_page = [
        (spine_x + int(20 * scale), top),
        (right, top + page_curve),
        (right, bottom - page_curve),
        (spine_x + int(20 * scale), bottom),
    ]

    # Filled pages (black) — bold silhouette
    draw.polygon(left_page, fill=BLACK)
    draw.polygon(right_page, fill=BLACK)

    # Spine (subtle white gap between pages)
    spine_gap = max(2, int(10 * scale))
    draw.rectangle(
        [spine_x - spine_gap // 2, top + int(8 * scale),
         spine_x + spine_gap // 2, bottom - int(8 * scale)],
        fill=WHITE,
    )

    # Horizontal "text" lines on each page, in white
    line_count = 5
    line_thickness = max(3, int(14 * scale))
    line_gap = int(70 * scale)
    line_inset_x = int(60 * scale)
    line_top = top + int(120 * scale)

    for i in range(line_count):
        y = line_top + i * line_gap
        # Left page line — varies in length for organic feel
        lengths_left = [0.78, 0.85, 0.70, 0.82, 0.55]
        l_len = lengths_left[i % len(lengths_left)]
        l_start = left + line_inset_x
        l_end = int(l_start + (spine_x - int(30 * scale) - l_start) * l_len)
        draw.rounded_rectangle(
            [l_start, y, l_end, y + line_thickness],
            radius=line_thickness // 2,
            fill=WHITE,
        )
        # Right page line
        lengths_right = [0.72, 0.88, 0.62, 0.80, 0.50]
        r_len = lengths_right[i % len(lengths_right)]
        r_start = spine_x + int(30 * scale)
        r_end = int(r_start + (right - int(line_inset_x) - r_start) * r_len)
        draw.rounded_rectangle(
            [r_start, y, r_end, y + line_thickness],
            radius=line_thickness // 2,
            fill=WHITE,
        )

    def four_point_star(scx: int, scy: int, sr: int, sw: int) -> list[tuple[int, int]]:
        return [
            (scx, scy - sr),
            (scx + sw, scy - sw),
            (scx + sr, scy),
            (scx + sw, scy + sw),
            (scx, scy + sr),
            (scx - sw, scy + sw),
            (scx - sr, scy),
            (scx - sw, scy - sw),
        ]

    # "Smart" sparks: a tight cluster above the book, slightly right of center,
    # implying AI/intelligence. Bigger primary star + two smaller satellites.
    primary_cx = cx + int(180 * scale)
    primary_cy = top - int(110 * scale)
    primary_r = int(95 * scale)
    primary_w = int(22 * scale)
    draw.polygon(four_point_star(primary_cx, primary_cy, primary_r, primary_w), fill=BLACK)

    sat1_cx = primary_cx - int(150 * scale)
    sat1_cy = primary_cy - int(40 * scale)
    sat1_r = int(38 * scale)
    sat1_w = int(9 * scale)
    draw.polygon(four_point_star(sat1_cx, sat1_cy, sat1_r, sat1_w), fill=BLACK)

    sat2_cx = primary_cx + int(110 * scale)
    sat2_cy = primary_cy + int(80 * scale)
    sat2_r = int(28 * scale)
    sat2_w = int(7 * scale)
    draw.polygon(four_point_star(sat2_cx, sat2_cy, sat2_r, sat2_w), fill=BLACK)


def render_icon(adaptive: bool) -> Image.Image:
    """
    adaptive=False: full-bleed 1024 icon on white bg, design fills ~80% of canvas.
    adaptive=True:  same design but scaled to fit Android adaptive safe zone (~66%).
    """
    img = Image.new("RGBA", (SIZE, SIZE), WHITE)
    # Render the book onto a higher-res working canvas for crisper antialiasing,
    # then downsample. PIL's polygon edges look better this way.
    work_size = SIZE * 2
    work = Image.new("RGBA", (work_size, work_size), WHITE)
    draw = ImageDraw.Draw(work)

    if adaptive:
        # Adaptive icon: design must live inside center ~66% so launcher masks
        # don't crop it. Scale book + spark down accordingly.
        draw_book(draw, work_size // 2, work_size // 2, scale=2.0 * 0.62)
    else:
        draw_book(draw, work_size // 2, work_size // 2, scale=2.0 * 0.85)

    img = work.resize((SIZE, SIZE), Image.LANCZOS)
    return img


def main() -> None:
    out_dir = os.path.normpath(OUT_DIR)
    os.makedirs(out_dir, exist_ok=True)

    icon = render_icon(adaptive=False)
    icon.save(os.path.join(out_dir, "icon.png"), "PNG", optimize=True)
    print(f"wrote {os.path.join(out_dir, 'icon.png')}")

    adaptive = render_icon(adaptive=True)
    adaptive.save(os.path.join(out_dir, "adaptive-icon.png"), "PNG", optimize=True)
    print(f"wrote {os.path.join(out_dir, 'adaptive-icon.png')}")


if __name__ == "__main__":
    main()
