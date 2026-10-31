#!/usr/bin/env python3
"""A 16:9 slide: five pain points of onboarding today, each with the fix. python3 docs/pain_points_slide.py [outdir]"""
import math
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyBboxPatch, Polygon, Rectangle, FancyArrowPatch
from matplotlib.transforms import Affine2D

PAPER, CARD, INK, MUTE, ACC, GREEN, GREEN_BG, RED = "#f4efe3", "#fffdf7", "#1f1b16", "#6b6252", "#c8552b", "#2f8f5b", "#dbeadf", "#c0392b"
W, H = 100, 56.25

ROWS = [
    ("Scattered across teams", "HR, IT, payroll and facilities each chase their own list", "One live tracker", "#c8552b"),
    ("Wrong paperwork, found late", "Expired or mismatched IDs surface days after upload", "Checked on upload", "#a8620f"),
    ("Day one, nothing ready", "Email, access, desk and payroll set up by hand", "10 services run for you", "#7a4a8a"),
    ("A change means rework", "New date or role? Access is fixed by hand, or forgotten", "Auto-updates, auto-revokes", "#2d6a9f"),
    ("Questions and approvals stall", "The same questions to HR, approvals buried in inboxes", "Answered on WhatsApp", "#2f8f5b"),
]


# ── icons, drawn in a 10x10 box centred at (cx, cy) ─────────────────────────
def icon_tangle(ax, cx, cy, c):
    pts = [(-3.2, 2.6), (2.8, 3.2), (-2.4, -2.8), (3.4, -2.2), (0.2, 0.2)]
    for a, b in [(0, 1), (0, 2), (1, 3), (2, 3), (0, 3), (1, 2), (4, 0), (4, 3)]:
        ax.plot([cx + pts[a][0], cx + pts[b][0]], [cy + pts[a][1], cy + pts[b][1]], color=c, lw=1.6, alpha=.75, solid_capstyle="round")
    for i, (x, y) in enumerate(pts):
        ax.add_patch(Circle((cx + x, cy + y), 1.05, fc=CARD, ec=INK, lw=1.6, zorder=3))
    ax.text(cx + pts[4][0], cy + pts[4][1] - .05, "?", ha="center", va="center", fontsize=11, fontweight="bold", color=c, zorder=4)


def icon_doc(ax, cx, cy, c):
    x, y, w, h, f = cx - 2.6, cy - 3.6, 5.2, 7.2, 1.5
    ax.add_patch(Polygon([(x, y), (x + w, y), (x + w, y + h - f), (x + w - f, y + h), (x, y + h)], closed=True, fc=CARD, ec=INK, lw=1.8, joinstyle="round"))
    ax.add_patch(Polygon([(x + w - f, y + h), (x + w - f, y + h - f), (x + w, y + h - f)], closed=True, fc="#e8dfc8", ec=INK, lw=1.4))
    for k in range(3):
        ax.plot([x + .9, x + w - .9 - (1.1 if k == 2 else 0)], [y + h - 2.6 - k * 1.3, y + h - 2.6 - k * 1.3], color=MUTE, lw=1.4, alpha=.6)
    ax.add_patch(Circle((x + w - .3, y + .6), 1.55, fc=RED, ec=CARD, lw=1.6, zorder=4))
    ax.text(x + w - .3, y + .55, "✕", ha="center", va="center", fontsize=9.5, fontweight="bold", color="white", zorder=5)


def icon_laptop(ax, cx, cy, c):
    ax.add_patch(FancyBboxPatch((cx - 3.5, cy - 1.8), 7, 4.7, boxstyle="round,pad=0,rounding_size=.5", fc=CARD, ec=INK, lw=1.8))
    ax.add_patch(Polygon([(cx - 4.6, cy - 1.8), (cx + 4.6, cy - 1.8), (cx + 3.9, cy - 3.0), (cx - 3.9, cy - 3.0)], closed=True, fc="#e8dfc8", ec=INK, lw=1.6))
    ax.text(cx, cy + .55, "?", ha="center", va="center", fontsize=17, fontweight="bold", color=c)


def icon_change(ax, cx, cy, c):
    ax.add_patch(FancyBboxPatch((cx - 3.2, cy - 3.0), 6.4, 6.0, boxstyle="round,pad=0,rounding_size=.5", fc=CARD, ec=INK, lw=1.8))
    ax.add_patch(Rectangle((cx - 3.2, cy + 1.3), 6.4, 1.7, fc=c, ec=INK, lw=1.8))
    for k in range(2):
        ax.add_patch(Rectangle((cx - 2.2 + k * 2.6, cy + 2.7), .7, 1.4, fc=INK, ec="none"))
    ax.text(cx - .2, cy - .55, "↻", ha="center", va="center", fontsize=19, fontweight="bold", color=c)


def icon_bubble(ax, cx, cy, c):
    ax.add_patch(FancyBboxPatch((cx - 4.0, cy - 2.2), 8, 5.6, boxstyle="round,pad=0,rounding_size=1.2", fc=CARD, ec=INK, lw=1.8))
    ax.add_patch(Polygon([(cx - 2.2, cy - 2.2), (cx - 3.2, cy - 4.0), (cx - .6, cy - 2.2)], closed=True, fc=CARD, ec=INK, lw=1.8))
    ax.add_patch(Rectangle((cx - 2.3, cy - 2.4), 1.8, .6, fc=CARD, ec="none", zorder=3))
    ax.add_patch(Circle((cx + .3, cy + .6), 1.9, fc="none", ec=c, lw=1.8, zorder=4))
    ax.plot([cx + .3, cx + .3], [cy + .6, cy + 1.7], color=c, lw=1.8, zorder=5, solid_capstyle="round")
    ax.plot([cx + .3, cx + 1.2], [cy + .6, cy + .2], color=c, lw=1.8, zorder=5, solid_capstyle="round")


ICONS = [icon_tangle, icon_doc, icon_laptop, icon_change, icon_bubble]
ICON_SCALE = 0.7


def draw_icon(ax, fn, cx, cy, col, s=ICON_SCALE):
    """Draw an icon, then scale what it added about its centre (patches, lines and text), so it fits inside its card."""
    np_, nl, nt = len(ax.patches), len(ax.lines), len(ax.texts)
    fn(ax, cx, cy, col)
    t = Affine2D().translate(-cx, -cy).scale(s).translate(cx, cy) + ax.transData
    for a in ax.patches[np_:] + ax.lines[nl:]:
        a.set_transform(t)
    for tx in ax.texts[nt:]:
        x, y = tx.get_position()
        tx.set_position((cx + (x - cx) * s, cy + (y - cy) * s))
        tx.set_fontsize(tx.get_fontsize() * s)


def build(path_png, path_pdf):
    fig = plt.figure(figsize=(13.333, 7.5))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, W); ax.set_ylim(0, H); ax.axis("off")
    fig.patch.set_facecolor(PAPER)

    ax.text(5, 52.6, "Onboarding today", fontsize=30, fontweight="bold", color=INK, va="center")
    ax.text(5, 49.0, "five ways it quietly breaks", fontsize=17, color=MUTE, va="center", style="italic")
    ax.text(89.6, 51, "super", fontsize=19, fontweight="bold", color=INK, ha="right", va="center")
    ax.text(89.6, 51, "join", fontsize=19, color=ACC, ha="left", va="center", style="italic", fontweight="bold")

    top, rh, gap = 46.2, 7.5, 1.45
    for i, (head, sub, fix, col) in enumerate(ROWS):
        y = top - rh - i * (rh + gap)
        # card with a soft shadow
        ax.add_patch(FancyBboxPatch((5.35, y - .3), 89.6, rh, boxstyle="round,pad=0,rounding_size=1.2", fc="#d9d1bd", ec="none", alpha=.7))
        ax.add_patch(FancyBboxPatch((5, y), 89.6, rh, boxstyle="round,pad=0,rounding_size=1.2", fc=CARD, ec="#cfc6ae", lw=1.2))
        ax.add_patch(FancyBboxPatch((5, y), 1.3, rh, boxstyle="round,pad=0,rounding_size=.6", fc=col, ec="none"))
        # number + icon
        ax.add_patch(Circle((10.6, y + rh / 2), 3.1, fc=col, ec="none", alpha=.13))
        draw_icon(ax, ICONS[i], 10.6, y + rh / 2, col)
        # words
        ax.text(15.6, y + rh / 2 + .75, head, fontsize=22, fontweight="bold", color=INK, va="center")
        ax.text(15.6, y + 1.85, sub, fontsize=12.5, color=MUTE, va="center")
        # the fix
        ax.add_patch(FancyArrowPatch((66.2, y + rh / 2), (69.4, y + rh / 2), arrowstyle="-|>", mutation_scale=16, lw=2, color=GREEN))
        ax.add_patch(FancyBboxPatch((70.3, y + 1.35), 23.2, rh - 2.7, boxstyle="round,pad=0,rounding_size=1.3", fc=GREEN_BG, ec=GREEN, lw=1.4))
        ax.text(81.9, y + rh / 2, fix, fontsize=12.5, fontweight="bold", color="#1d5234", ha="center", va="center", wrap=True)
    fig.savefig(path_png, dpi=200, facecolor=PAPER)
    fig.savefig(path_pdf, facecolor=PAPER)
    plt.close(fig)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    build(os.path.join(out, "pain-points-slide.png"), os.path.join(out, "pain-points-slide.pdf"))
    print("wrote", out)
