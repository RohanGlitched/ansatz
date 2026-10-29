#!/usr/bin/env python
"""Ansatz synthetic physics benchmark: renders clips with exactly known ground truth.

Usage:  python render.py [--jobs N] [--only id1,id2] [--no-sheets] [--list]

Every phenomenon is integrated numerically (RK4, step 1e-4 s, bisection event handling
for bounces / landings / collisions); nothing is taken from a closed form.  Frames are
rendered with sub-frame motion blur (shutter = half the frame interval, centred on the
frame time), mild sensor noise and H.264 compression.

World frame: x to the right, y up, metres.  Image frame: continuous coordinates, pixel i
spans [i, i+1), origin top-left, y down.  Static orthographic camera onto the motion plane.
"""
import argparse, colorsys, json, math, os, subprocess, sys, time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
CLIPS = HERE / "clips"
SHEETS = HERE / "sheets"
SHUTTER = 0.5            # fraction of the (capture) frame interval
H_STEP = 1e-4            # physics step, s
CAMERA_NOTE = ("Static camera, orthographic projection onto the motion plane (no perspective, "
               "no lens distortion, no camera shake). Scale is uniform: metres_per_pixel.")
IMG_NOTE = ("Image coordinates are continuous: pixel i spans [i, i+1), origin top-left, y down. "
            "A mask centroid computed from pixel indices is 0.5 px smaller than these values.")

# ----------------------------------------------------------------------------- numerics


def rk4(f, y, h):
    k1 = f(y)
    k2 = f([a + 0.5 * h * b for a, b in zip(y, k1)])
    k3 = f([a + 0.5 * h * b for a, b in zip(y, k2)])
    k4 = f([a + h * b for a, b in zip(y, k3)])
    return [a + h / 6.0 * (b + 2 * c + 2 * d + e) for a, b, c, d, e in zip(y, k1, k2, k3, k4)]


def integrate(f, y0, t_end, h=H_STEP, event=None, on_event=None):
    """RK4 for an autonomous system.  event(y) > 0 -> <= 0 crossing triggers on_event(y_e) ->
    (y_new, stop).  The crossing time is located by bisection to ~1e-15 s.
    Returns (T, Y, event_times)."""
    y = [float(v) for v in y0]
    t = 0.0
    T = [0.0]
    Y = [y[:]]
    evs = []
    ev_prev = event(y) if event else None
    while t < t_end - 1e-12:
        hh = min(h, t_end - t)
        yn = rk4(f, y, hh)
        if event is not None:
            e1 = event(yn)
            if ev_prev > 0 and e1 <= 0:
                lo, hi = 0.0, hh
                for _ in range(60):
                    mid = 0.5 * (lo + hi)
                    if event(rk4(f, y, mid)) > 0:
                        lo = mid
                    else:
                        hi = mid
                ye = rk4(f, y, hi)
                te = t + hi
                ynew, stop = on_event(ye)
                evs.append(te)
                T.append(te)
                if stop:
                    Y.append([float(v) for v in ynew])
                    break
                Y.append(ye)
                T.append(te + 1e-12)
                Y.append([float(v) for v in ynew])
                t = te
                y = [float(v) for v in ynew]
                ev_prev = event(y)
                continue
            ev_prev = e1
        t += hh
        y = yn
        T.append(t)
        Y.append(y)
    return np.array(T), np.array(Y), evs


class Traj:
    def __init__(self, T, Y, t0=0.0):
        self.T, self.Y, self.t0 = np.asarray(T), np.asarray(Y), t0

    def at(self, t):
        tt = np.asarray(t, float) - self.t0
        return np.stack([np.interp(tt, self.T, self.Y[:, j]) for j in range(self.Y.shape[1])], -1)


@dataclass
class Cam:
    ox: float
    oy: float
    mpp: float

    def px(self, x, y):
        return (self.ox + x / self.mpp, self.oy - y / self.mpp)

    def L(self, m):
        return m / self.mpp


def fit_cam(xmin, xmax, ymin, ymax, W, H, pad=0.05, mpp=None, bottom=False):
    """Choose a scale so the world box fits with margin; bottom=True pins ymin near the bottom edge
    (spare vertical room goes above, so floors keep a constant depth)."""
    if mpp is None:
        mpp = max((xmax - xmin) / (W * (1 - 2 * pad)), (ymax - ymin) / (H * (1 - 2 * pad)))
        mpp = math.ceil(mpp * 1e5) / 1e5
    ox = W / 2 - (xmin + xmax) / 2 / mpp
    oy = H / 2 + (ymin + ymax) / 2 / mpp
    if bottom:
        oy = H * (1 - pad) + ymin / mpp
    return Cam(ox, oy, mpp)


# ----------------------------------------------------------------------------- drawing

COL = {
    "orange": (235, 110, 30), "blue": (35, 105, 215), "red": (215, 35, 45), "green": (40, 165, 75),
    "yellow": (245, 205, 40), "white": (245, 245, 242), "purple": (135, 65, 175), "teal": (20, 165, 170),
    "cream": (238, 232, 205),
}


def shade(c, f):
    return tuple(int(max(0, min(255, v * f))) for v in c)


def light(c, f=0.55):
    return tuple(int(v + (255 - v) * f) for v in c)


def ball_prims(cx, cy, r, col, seam=None):
    pr = [("c", cx, cy, r, shade(col, 0.5)), ("c", cx - 0.04 * r, cy - 0.04 * r, r * 0.93, col)]
    if seam is not None:
        dx, dy = math.cos(seam) * r * 0.9, math.sin(seam) * r * 0.9
        pr.append(("l", [(cx - dx, cy - dy), (cx + dx, cy + dy)], shade(col, 0.42), max(2.0, 0.17 * r)))
        pr.append(("c", cx + 0.62 * dx, cy + 0.62 * dy, max(1.5, 0.13 * r), (250, 250, 245)))
    pr.append(("c", cx - 0.33 * r, cy - 0.37 * r, r * 0.25, light(col, 0.6)))
    return pr


def block_prims(cx, cy, w, h, col):
    hw, hh, b = w / 2, h / 2, max(2.0, 0.07 * min(w, h))
    return [("p", [(cx - hw, cy - hh), (cx + hw, cy - hh), (cx + hw, cy + hh), (cx - hw, cy + hh)], shade(col, 0.5)),
            ("p", [(cx - hw + b, cy - hh + b), (cx + hw - b, cy - hh + b), (cx + hw - b, cy + hh - b), (cx - hw + b, cy + hh - b)], col),
            ("p", [(cx - hw + b, cy - hh + b), (cx + hw - b, cy - hh + b), (cx + hw - b, cy - hh + 0.28 * h), (cx - hw + b, cy - hh + 0.28 * h)], light(col, 0.3))]


def puck_prims(cx, cy, r, col):
    return [("c", cx, cy, r, shade(col, 0.45)), ("c", cx, cy, r * 0.93, col),
            ("c", cx, cy, r * 0.62, shade(col, 0.82)), ("c", cx, cy, r * 0.5, light(col, 0.12))]


def prim_bounds(p):
    k = p[0]
    if k == "c":
        return p[1] - p[3], p[2] - p[3], p[1] + p[3], p[2] + p[3]
    pts = np.array(p[1])
    pad = p[3] / 2 if k == "l" else 0
    return pts[:, 0].min() - pad, pts[:, 1].min() - pad, pts[:, 0].max() + pad, pts[:, 1].max() + pad


def layer(plists, W, H):
    """Rasterise several primitive lists (the samples of one object) with supersampling and return
    (x0,y0,x1,y1), mean alpha (h,w,1), mean premultiplied colour (h,w,3)."""
    bs = [prim_bounds(p) for pl in plists for p in pl]
    if not bs:
        return None
    x0 = max(0, int(math.floor(min(b[0] for b in bs))) - 3)
    y0 = max(0, int(math.floor(min(b[1] for b in bs))) - 3)
    x1 = min(W, int(math.ceil(max(b[2] for b in bs))) + 3)
    y1 = min(H, int(math.ceil(max(b[3] for b in bs))) + 3)
    if x1 <= x0 or y1 <= y0:
        return None
    w, h = x1 - x0, y1 - y0
    area = w * h
    ss = 4 if area < 90000 else (3 if area < 300000 else 2)
    A = np.zeros((h, w, 1), np.float32)
    P = np.zeros((h, w, 3), np.float32)
    for pl in plists:
        im = Image.new("RGBA", (w * ss, h * ss), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        for p in pl:
            k = p[0]
            if k == "c":
                _, cx, cy, r, fill = p
                d.ellipse([(cx - x0 - r) * ss, (cy - y0 - r) * ss, (cx - x0 + r) * ss, (cy - y0 + r) * ss], fill=fill + (255,))
            elif k == "l":
                _, pts, fill, wd = p
                d.line([((a - x0) * ss, (b - y0) * ss) for a, b in pts], fill=fill + (255,), width=max(1, int(round(wd * ss))), joint="curve")
            else:
                _, pts, fill = p
                d.polygon([((a - x0) * ss, (b - y0) * ss) for a, b in pts], fill=fill + (255,))
        small = np.asarray(im.convert("RGBa").resize((w, h), Image.BOX), np.float32)
        A += small[..., 3:4] / 255.0
        P += small[..., :3]
    n = len(plists)
    return (x0, y0, x1, y1), A / n, P / n


def paint(frame, plists):
    H, W = frame.shape[:2]
    r = layer(plists, W, H)
    if r is None:
        return
    (x0, y0, x1, y1), A, P = r
    frame[y0:y1, x0:x1] = frame[y0:y1, x0:x1] * (1 - A) + P


# ----------------------------------------------------------------------------- backgrounds


def lowfreq(rng, H, W, cell):
    g = rng.normal(size=(H // cell + 3, W // cell + 3)).astype(np.float32)
    return np.asarray(Image.fromarray(g, mode="F").resize((W, H), Image.BICUBIC), np.float32)


def vignette(bg, s=0.22):
    H, W = bg.shape[:2]
    yy = (np.arange(H, dtype=np.float32) / H - 0.5) ** 2
    xx = (np.arange(W, dtype=np.float32) / W - 0.5) ** 2
    v = 1 - s * (yy[:, None] + xx[None, :]) * 2
    return bg * v[..., None]


def bg_wall(rng, W, H, base, amp=0.03, grain=0.015):
    n = lowfreq(rng, H, W, max(W // 10, 40)) * amp + lowfreq(rng, H, W, 5) * grain
    grad = np.linspace(1.05, 0.95, H, dtype=np.float32)[:, None]
    return np.array(base, np.float32)[None, None, :] * (1 + n + (grad - 1))[..., None]


def bg_tiles(rng, W, H, cam, base, tile_m=0.2, grout_m=0.008, jitter=0.035, grout=(150, 150, 146)):
    t = max(48, int(round(tile_m / cam.mpp)))
    gw = max(2, int(round(grout_m / cam.mpp)))
    offx = int(rng.integers(0, t))
    offy = int(round(cam.oy)) % t
    ix, iy = (np.arange(W) + offx), (np.arange(H) + offy)
    shade_t = 1 + rng.normal(0, jitter, (iy.max() // t + 1, ix.max() // t + 1)).astype(np.float32)
    bg = np.array(base, np.float32)[None, None, :] * shade_t[np.ix_(iy // t, ix // t)][..., None]
    fx = ((ix % t) / t).astype(np.float32)
    fy = ((iy % t) / t).astype(np.float32)
    bg *= (1 + 0.05 * (0.5 - (fx[None, :] * 0.5 + fy[:, None] * 0.5)))[..., None]
    bg *= (1 + lowfreq(rng, H, W, 5) * 0.012)[..., None]
    mask = ((iy % t) < gw)[:, None] | ((ix % t) < gw)[None, :]
    bg[mask] = np.array(grout, np.float32)
    return bg


def muted(rng, vlo=0.4, vhi=0.85):
    h = rng.uniform(0, 1)
    s = rng.uniform(0.08, 0.45)
    v = rng.uniform(vlo, vhi)
    return tuple(int(255 * c) for c in colorsys.hsv_to_rgb(h, s, v))


def bg_room(rng, W, H, wall=(196, 188, 170)):
    bg = bg_wall(rng, W, H, wall, amp=0.04)
    im = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    # window
    ww, wh = int(W * rng.uniform(0.13, 0.18)), int(H * rng.uniform(0.3, 0.4))
    wx, wy = int(W * rng.uniform(0.04, 0.12)), int(H * 0.1)
    d.rectangle([wx - 8, wy - 8, wx + ww + 8, wy + wh + 8], fill=(232, 232, 226))
    d.rectangle([wx, wy, wx + ww, wy + wh], fill=(186, 212, 234))
    d.line([wx + ww // 2, wy, wx + ww // 2, wy + wh], fill=(232, 232, 226), width=7)
    d.line([wx, wy + wh // 2, wx + ww, wy + wh // 2], fill=(232, 232, 226), width=7)
    # bookshelf
    sx0, sx1 = int(W * 0.62), int(W * rng.uniform(0.82, 0.9))
    sy0, sy1 = int(H * 0.08), int(H * 0.5)
    d.rectangle([sx0 - 6, sy0 - 6, sx1 + 6, sy1 + 6], fill=(112, 84, 58))
    rows = 3
    rh = (sy1 - sy0) // rows
    for r in range(rows):
        y_top, y_bot = sy0 + r * rh, sy0 + (r + 1) * rh
        d.rectangle([sx0, y_top, sx1, y_bot], fill=(86, 64, 44))
        x = sx0 + 4
        while x < sx1 - 12:
            bw = int(rng.integers(10, 26))
            bh = int(rh * rng.uniform(0.55, 0.9))
            d.rectangle([x, y_bot - 5 - bh, min(x + bw, sx1 - 3), y_bot - 5], fill=muted(rng, 0.3, 0.75))
            x += bw + int(rng.integers(0, 3))
    # door and pictures / clutter rectangles
    dx = int(W * rng.uniform(0.38, 0.46))
    d.rectangle([dx, int(H * 0.05), dx + int(W * 0.1), int(H * 0.98)], fill=(138, 108, 78))
    d.rectangle([dx + 12, int(H * 0.09), dx + int(W * 0.1) - 12, int(H * 0.4)], fill=(124, 96, 68))
    for _ in range(14):
        w, h = int(W * rng.uniform(0.03, 0.12)), int(H * rng.uniform(0.05, 0.2))
        x, y = int(rng.uniform(0, W - w)), int(rng.uniform(0, H * 0.7))
        c = muted(rng)
        d.rectangle([x - 3, y - 3, x + w + 3, y + h + 3], fill=shade(c, 0.6))
        d.rectangle([x, y, x + w, y + h], fill=c)
        if rng.random() < 0.5:
            d.rectangle([x + w // 5, y + h // 5, x + 4 * w // 5, y + 4 * h // 5], fill=muted(rng))
    # pipes / cables
    for _ in range(3):
        x = int(rng.uniform(0.02, 0.98) * W)
        d.line([x, 0, x + int(rng.integers(-10, 10)), H], fill=muted(rng, 0.45, 0.7), width=int(rng.integers(3, 8)))
    return np.asarray(im, np.float32)


def bg_board(rng, W, H, cam):
    bg = np.array((34, 60, 52), np.float32)[None, None, :] * (1 + lowfreq(rng, H, W, max(W // 8, 40))[..., None] * 0.12
                                                               + lowfreq(rng, H, W, 4)[..., None] * 0.03)
    chalk = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(chalk)
    for _ in range(60):  # smudges
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        rx, ry = rng.uniform(40, 220), rng.uniform(20, 120)
        d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=int(rng.integers(6, 22)))
    smudge = np.asarray(chalk.filter(ImageFilter.GaussianBlur(28)), np.float32) / 255
    # chalk scribbles (grid lines, faint formulas)
    ch2 = Image.new("L", (W, H), 0)
    d2 = ImageDraw.Draw(ch2)
    for _ in range(26):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        pts = [(x, y)]
        for _ in range(int(rng.integers(3, 8))):
            x += rng.uniform(-60, 60)
            y += rng.uniform(-35, 35)
            pts.append((x, y))
        d2.line(pts, fill=int(rng.integers(55, 110)), width=int(rng.integers(2, 5)), joint="curve")
    ch2 = np.asarray(ch2.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    a = np.clip(smudge * 1.6 + ch2, 0, 0.6)[..., None]
    bg = bg * (1 - a) + np.array((215, 220, 215), np.float32) * a
    # wooden frame
    fr = int(0.03 * H)
    bg[:fr] = (118, 80, 46)
    bg[-fr:] = (118, 80, 46)
    bg[:, :fr] = (118, 80, 46)
    bg[:, -fr:] = (118, 80, 46)
    return bg


def bg_space(rng, W, H):
    bg = np.zeros((H, W, 3), np.float32)
    bg += np.linspace(8, 2, H, dtype=np.float32)[:, None, None] * np.array([1, 1, 1.5], np.float32)
    n = int(W * H / 2600)
    xs, ys = rng.integers(0, W - 1, n), rng.integers(0, H - 1, n)
    br = rng.uniform(90, 255, n).astype(np.float32)
    for dx, dy, f in ((0, 0, 1.0), (1, 0, 0.45), (0, 1, 0.45)):
        bg[ys + dy, xs + dx] = np.maximum(bg[ys + dy, xs + dx], (br * f)[:, None])
    return bg


def bg_marssky(rng, W, H, cam):
    top, hor = np.array((196, 138, 100), np.float32), np.array((226, 176, 132), np.float32)
    row = int(round(cam.oy))
    t = np.clip(np.linspace(0, 1, H, dtype=np.float32) ** 1.4, 0, 1)[:, None, None]
    bg = top * (1 - t) + hor * t
    bg = np.broadcast_to(bg, (H, W, 3)).copy()
    # distant hills
    xs = np.arange(W)
    prof = row - 0.045 * H - 0.03 * H * np.sin(xs / W * 7 + 1.3) - 0.02 * H * np.sin(xs / W * 17) - lowfreq(rng, 1, W, 60)[0] * 6
    for x in range(W):
        y0 = int(prof[x])
        if y0 < H:
            bg[max(y0, 0):row, x] = (176, 108, 78)
    return bg


def add_floor(bg, cam, kind, rng):
    H, W = bg.shape[:2]
    row = int(round(cam.oy))
    if row >= H:
        return
    h = H - row
    base = {"wood": (146, 102, 62), "regolith": (104, 102, 100), "mars": (158, 84, 54), "ledge": (120, 82, 48)}[kind]
    f = np.array(base, np.float32)[None, None, :] * (1 + lowfreq(rng, h, W, 30)[..., None] * 0.04 + lowfreq(rng, h, W, 4)[..., None] * 0.03)
    if kind in ("wood", "ledge"):
        y = np.arange(h)
        bands = (1 + 0.05 * np.sin(y / max(6, h / 7.0))).astype(np.float32)[:, None, None]
        f = f * bands
        for x in range(int(rng.integers(0, 200)), W, int(rng.integers(260, 420))):
            f[:, x:x + 2] *= 0.8
    # shadow strip on the wall just above the floor and edge highlight
    s0 = max(0, row - 14)
    ramp = np.linspace(1.0, 0.82, row - s0, dtype=np.float32)[:, None, None]
    bg[s0:row] *= ramp
    bg[row:] = f
    bg[row:row + 2] = np.array(base, np.float32) * 1.25
    bg[row + 2:row + 5] *= 0.8


def bg_felt(rng, W, H, cam):
    bg = np.array((24, 98, 98), np.float32)[None, None, :] * (1 + lowfreq(rng, H, W, 90)[..., None] * 0.05 + lowfreq(rng, H, W, 2)[..., None] * 0.035)
    im = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    d.line([W // 2, 0, W // 2, H], fill=(210, 220, 215), width=5)
    r = 0.28 / cam.mpp
    d.ellipse([W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r], outline=(210, 220, 215), width=5)
    b = int(0.05 * H)
    for rect in ([0, 0, W, b], [0, H - b, W, H], [0, 0, b, H], [W - b, 0, W, H]):
        d.rectangle(rect, fill=(108, 70, 40))
    d.rectangle([b, b, W - b, b + 5], fill=(70, 45, 28))
    d.rectangle([b, H - b - 5, W - b, H - b], fill=(70, 45, 28))
    return np.asarray(im, np.float32)


# --- scale references


def metre_stick(cam, p0, ang_deg, length_m=1.0, nb=10, thick_m=0.035, noun="metre stick"):
    x0, y0 = cam.px(*p0)
    a = math.radians(ang_deg)
    p1w = (p0[0] + length_m * math.cos(a), p0[1] + length_m * math.sin(a))
    x1, y1 = cam.px(*p1w)
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux
    hw = max(7.0, thick_m / cam.mpp / 2)

    def quad(a_, b_, w_, col):
        return ("p", [(x0 + ux * a_ + nx * w_, y0 + uy * a_ + ny * w_), (x0 + ux * b_ + nx * w_, y0 + uy * b_ + ny * w_),
                      (x0 + ux * b_ - nx * w_, y0 + uy * b_ - ny * w_), (x0 + ux * a_ - nx * w_, y0 + uy * a_ - ny * w_)], col)

    prims = [quad(-1.5, L + 1.5, hw + 1.5, (120, 120, 120))]
    for j in range(nb):
        prims.append(quad(L * j / nb, L * (j + 1) / nb, hw, (22, 22, 22) if j % 2 == 0 else (246, 246, 246)))
    truth = {"noun_phrase": noun, "kind": "bar with alternating black/white bands",
             "length_m": length_m, "length_px": round(length_m / cam.mpp, 3), "band_length_m": length_m / nb,
             "endpoints_px": [[round(x0, 2), round(y0, 2)], [round(x1, 2), round(y1, 2)]],
             "thickness_px": round(2 * hw, 2), "orientation_deg_from_horizontal_ccw": ang_deg,
             "note": "first band (at endpoint 0) is black; bands alternate every length/10"}
    return prims, truth, (p0, p1w)


def a4_sheet(cam, cx, cy, portrait=True, noun="A4 sheet of paper"):
    w, h = (0.210, 0.297) if portrait else (0.297, 0.210)
    x0, y0 = cam.px(cx - w / 2, cy + h / 2)
    x1, y1 = cam.px(cx + w / 2, cy - h / 2)
    prims = [("p", [(x0 - 3, y0 - 3), (x1 + 3, y0 - 3), (x1 + 3, y1 + 3), (x0 - 3, y1 + 3)], (140, 140, 140)),
             ("p", [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], (250, 250, 245))]
    rng = np.random.default_rng(5)
    for i in range(1, 11):
        yy = y0 + (y1 - y0) * (0.08 + 0.84 * i / 11)
        xe = x1 - (x1 - x0) * rng.uniform(0.1, 0.4)
        prims.append(("l", [(x0 + 0.12 * (x1 - x0), yy), (xe, yy)], (168, 170, 178), max(1.5, 0.004 / cam.mpp)))
    truth = {"noun_phrase": noun, "kind": "white rectangular sheet lying flat in the motion plane",
             "size_m": [w, h], "length_m": 0.297, "length_px": round(0.297 / cam.mpp, 3),
             "short_side_m": 0.210, "short_side_px": round(0.210 / cam.mpp, 3),
             "size_px": [round((x1 - x0), 2), round((y1 - y0), 2)],
             "corners_px_tl_tr_br_bl": [[round(x0, 2), round(y0, 2)], [round(x1, 2), round(y0, 2)], [round(x1, 2), round(y1, 2)], [round(x0, 2), round(y1, 2)]],
             "orientation": "portrait (long side vertical)" if portrait else "landscape (long side horizontal)"}
    return prims, truth


# ----------------------------------------------------------------------------- case model


@dataclass
class Obj:
    oid: str
    noun: str
    traj: Traj
    prims: callable
    centre: callable
    info: dict


@dataclass
class Case:
    cid: str
    phen: str
    variant: str
    desc: str
    body: str
    W: int
    H: int
    fps: int
    capture_fps: int
    dur: float
    cam: Cam
    bg: np.ndarray
    objs: list
    params: dict
    ref: dict = None
    events: dict = field(default_factory=dict)
    expected: dict = field(default_factory=dict)
    notes: list = field(default_factory=list)
    release_time_s: float = None
    slow: int = 1
    seed: int = 0


def P(value, unit):
    return {"value": value, "unit": unit}


def make_bg(kind, rng, W, H, cam, floor=None, **kw):
    if kind == "wall":
        bg = bg_wall(rng, W, H, kw.get("base", (188, 200, 206)))
    elif kind == "tiles":
        bg = bg_tiles(rng, W, H, cam, kw.get("base", (206, 214, 214)), grout=kw.get("grout", (150, 150, 146)))
    elif kind == "room":
        bg = bg_room(rng, W, H, kw.get("base", (196, 188, 170)))
    elif kind == "board":
        bg = bg_board(rng, W, H, cam)
    elif kind == "space":
        bg = bg_space(rng, W, H)
    elif kind == "mars":
        bg = bg_marssky(rng, W, H, cam)
    elif kind == "felt":
        bg = bg_felt(rng, W, H, cam)
    else:
        raise ValueError(kind)
    if kind not in ("space", "mars", "felt"):
        bg = vignette(bg)
    if floor:
        add_floor(bg, cam, floor, rng)
    return bg


# ----------------------------------------------------------------------------- builders


def build_fall(cid, body, g, h0, shape, col, size, W, H, fps, dur, bgk, ref, lead, seed, desc, noun,
               floor="wood", bgkw=None, vx_none=True):
    rng = np.random.default_rng(seed)
    half = size if shape == "ball" else size[1] / 2
    f = lambda y: [y[1], -g]
    T, Y, evs = integrate(f, [h0, 0.0], dur - lead, event=lambda y: y[0] - half, on_event=lambda y: ([half, 0.0], True))
    traj = Traj(T, Y, lead)
    cam = fit_cam(-0.95, 0.95, -0.3, h0 + half, W, H, pad=0.035, bottom=True)
    bg = make_bg(bgk, rng, W, H, cam, floor, **(bgkw or {}))
    ref_t = None
    if ref == "stick_v":
        pr, ref_t, _ = metre_stick(cam, (0.62, 0.0), 90, 1.0)
        paint(bg, [pr])
    elif ref == "stick_h":
        pr, ref_t, _ = metre_stick(cam, (0.3, 0.07), 0, 1.0)
        paint(bg, [pr])
    elif ref == "a4":
        pr, ref_t = a4_sheet(cam, 0.55, 0.297 / 2, portrait=True)
        paint(bg, [pr])
    mpp = cam.mpp

    def prims(s):
        cx, cy = cam.px(0.0, s[0])
        return ball_prims(cx, cy, size / mpp, col) if shape == "ball" else block_prims(cx, cy, size[0] / mpp, size[1] / mpp, col)

    info = {"kind": shape, "colour_rgb": list(col)}
    info.update({"radius_m": size, "radius_px": round(size / mpp, 2)} if shape == "ball" else {"size_m": list(size), "size_px": [round(size[0] / mpp, 2), round(size[1] / mpp, 2)]})
    obj = Obj("body", noun, traj, prims, lambda s: cam.px(0.0, s[0]), info)
    t_imp = lead + evs[0] if evs else None
    params = {"g": P(g, "m/s^2"), "initial_height_of_centre_above_floor": P(h0, "m"), "initial_velocity": P(0.0, "m/s"),
              "air_drag": P(0.0, "1/m (none)")}
    ev = {"release_time_s": lead, "impact_time_s": t_imp}
    exp = {"fall_time_s_numeric": evs[0] if evs else None, "impact_speed_m_s_numeric": float(-traj.at(lead + evs[0] - 1e-9)[1]) if evs else None,
           "note": "Object released from rest at release_time_s; after impact it rests on the floor (soft landing), so the free-fall fit window is release_time_s..impact_time_s."}
    return Case(cid, "free_fall", f"{body}_{shape}", desc, body, W, H, fps, fps, dur, cam, bg, [obj], params, ref_t, ev, exp, [],
                lead, 1, seed)


def build_proj(cid, g, k, x0, hl, speed, ang, R, col, W, H, fps, dur, bgk, ref, ref_pos, lead, seed, desc, noun, body="earth",
               floor="wood", bgkw=None, table=True, view_pad=0.0):
    rng = np.random.default_rng(seed)
    a = math.radians(ang)

    def f(y):
        sp = math.hypot(y[2], y[3])
        return [y[2], y[3], -k * sp * y[2], -g - k * sp * y[3]]

    y0 = [x0, hl + R, speed * math.cos(a), speed * math.sin(a)]
    T, Y, evs = integrate(f, y0, dur - lead, event=lambda y: y[1] - R, on_event=lambda y: ([y[0], R, 0.0, 0.0], True))
    traj = Traj(T, Y, lead)
    xm = max(Y[:, 0]) + R + 0.2
    cam = fit_cam(x0 - 0.45, xm, -0.3, max(Y[:, 1]) + R + 0.1, W, H, pad=0.035, bottom=True)
    bg = make_bg(bgk, rng, W, H, cam, floor, **(bgkw or {}))
    if table:
        tx0, ty0 = cam.px(x0 - 0.22, hl)
        tx1, ty1 = cam.px(x0 + 0.22, 0)
        paint(bg, [[("p", [(tx0 - 2, ty0 - 2), (tx1 + 2, ty0 - 2), (tx1 + 2, ty1), (tx0 - 2, ty1)], (60, 52, 46)),
                    ("p", [(tx0, ty0), (tx1, ty0), (tx1, ty1), (tx0, ty1)], (98, 88, 78))]])
    ref_t = None
    if ref == "stick_h":
        pr, ref_t, _ = metre_stick(cam, ref_pos, 0, 1.0)
        paint(bg, [pr])
    elif ref == "a4":
        pr, ref_t = a4_sheet(cam, ref_pos[0], ref_pos[1], portrait=True)
        paint(bg, [pr])
    mpp = cam.mpp
    obj = Obj("ball", noun, traj, lambda s: ball_prims(*cam.px(s[0], s[1]), R / mpp, col), lambda s: cam.px(s[0], s[1]),
              {"kind": "ball", "colour_rgb": list(col), "radius_m": R, "radius_px": round(R / mpp, 2)})
    # numeric apex
    iap = int(np.argmax(Y[:, 1]))
    params = {"g": P(g, "m/s^2"), "quadratic_drag_k": P(k, "1/m (dv/dt = -g*yhat - k|v|v)"),
              "launch_speed": P(speed, "m/s"), "launch_angle": P(ang, "deg above horizontal"),
              "launch_position": P([x0, hl + R], "m (ball centre, world x right / y up, floor at y=0)"),
              "ball_radius": P(R, "m")}
    ev = {"launch_time_s": lead, "apex_time_s": lead + float(T[iap]), "landing_time_s": lead + evs[0] if evs else None,
          "landing_x_m": float(Y[-1, 0]) if evs else None}
    exp = {"apex_height_m_numeric": float(Y[iap, 1]), "flight_time_s_numeric": evs[0] if evs else None,
           "note": "Ball rests on a table of height launch_height until launch_time_s (impulsive launch), then flies; on landing it sticks (sand), so fit window is launch_time_s..landing_time_s."}
    var = "no_drag" if k == 0 else "quadratic_drag"
    return Case(cid, "projectile" if k == 0 else "projectile_drag", var, desc, body, W, H, fps, fps, dur, cam, bg, [obj], params, ref_t, ev, exp, [],
                lead, 1, seed)


def build_toss(cid, g, v0, yh, R, col, W, H, fps, dur, bgk, ref, seed, desc, noun, floor="wood", bgkw=None, x_cx=0.0):
    rng = np.random.default_rng(seed)
    f = lambda y: [y[1], -g]
    T, Y, evs = integrate(f, [yh, v0], dur, event=lambda y: y[0] - R, on_event=lambda y: ([R, 0.0], True))
    traj = Traj(T, Y, 0.0)
    ytop = max(Y[:, 0]) + R
    cam = fit_cam(-0.9, 0.9, -0.28, ytop, W, H, pad=0.03, bottom=True)
    bg = make_bg(bgk, rng, W, H, cam, floor, **(bgkw or {}))
    ref_t = None
    if ref == "stick_v":
        pr, ref_t, _ = metre_stick(cam, (0.55, 0.0), 90, 1.0)
        paint(bg, [pr])
    elif ref == "a4":
        pr, ref_t = a4_sheet(cam, -0.5, 0.297 / 2 + 0.03, portrait=True)
        paint(bg, [pr])
    mpp = cam.mpp
    obj = Obj("ball", noun, traj, lambda s: ball_prims(*cam.px(0.0, s[0]), R / mpp, col), lambda s: cam.px(0.0, s[0]),
              {"kind": "ball", "colour_rgb": list(col), "radius_m": R, "radius_px": round(R / mpp, 2)})
    iap = int(np.argmax(Y[:, 0]))
    params = {"g": P(g, "m/s^2"), "initial_upward_velocity": P(v0, "m/s"), "initial_height_of_centre_above_floor": P(yh, "m"),
              "air_drag": P(0.0, "none")}
    ev = {"launch_time_s": 0.0, "apex_time_s": float(T[iap]), "landing_time_s": evs[0] if evs else None}
    exp = {"apex_height_m_numeric": float(Y[iap, 0]), "note": "Clip starts with the ball already moving upward (t=0 is the release). Ball sticks to the floor on landing."}
    return Case(cid, "vertical_toss", "up_and_down", desc, "earth", W, H, fps, fps, dur, cam, bg, [obj], params, ref_t, ev, exp, [], 0.0, 1, seed)


def build_pend(cid, L, th0, c, g, R, col, W, H, fps, dur, bgk, ref, lead, seed, desc, noun, bgkw=None):
    rng = np.random.default_rng(seed)
    th0r = math.radians(th0)
    f = lambda y: [y[1], -(g / L) * math.sin(y[0]) - c * y[1]]
    T, Y, _ = integrate(f, [th0r, 0.0], dur - lead)
    traj = Traj(T, Y, lead)
    # numeric periods: damped (from zero crossings) and undamped-nonlinear (quarter period x4)
    th = Y[:, 0]
    idx = np.where(th[:-1] * th[1:] < 0)[0]
    tz = T[idx] - th[idx] * (T[idx + 1] - T[idx]) / (th[idx + 1] - th[idx])
    periods = (tz[2:] - tz[:-2]).tolist()
    T4, _, ev4 = integrate(lambda y: [y[1], -(g / L) * math.sin(y[0])], [th0r, 0.0], 5.0 * 2 * math.pi * math.sqrt(L / g),
                           event=lambda y: y[0], on_event=lambda y: (y, True))
    T_nl = 4 * ev4[0]
    T_small = 2 * math.pi * math.sqrt(L / g)
    thmax = max(abs(th))
    ymin = -(L + R + 0.1)
    if ref == "stick_h":
        ymin = -(L + R + 0.28)
    elif ref == "stick_v":
        ymin = -max(L + R + 0.1, 1.07)
    elif ref == "a4":
        ymin = -(L + R + 0.05 + 0.297 + 0.06)
    cam = fit_cam(-(L * math.sin(thmax) + R + 0.2), L * math.sin(thmax) + R + 0.2, ymin, 0.14, W, H, pad=0.04)
    bg = make_bg(bgk, rng, W, H, cam, None, **(bgkw or {}))
    px0, py0 = cam.px(0, 0)
    # ceiling bracket and pivot
    bw = 0.32 / cam.mpp
    bar = [("p", [(px0 - bw / 2, py0 - 0.05 / cam.mpp), (px0 + bw / 2, py0 - 0.05 / cam.mpp), (px0 + bw / 2, py0 - 0.012 / cam.mpp), (px0 - bw / 2, py0 - 0.012 / cam.mpp)], (70, 72, 78)),
           ("p", [(px0 - bw / 2, py0 - 0.012 / cam.mpp), (px0 + bw / 2, py0 - 0.012 / cam.mpp), (px0 + bw / 2, py0 - 0.0), (px0 - bw / 2, py0)], (110, 112, 118)),
           ("c", px0, py0, max(4, 0.009 / cam.mpp), (40, 40, 44)), ("c", px0, py0, max(2, 0.004 / cam.mpp), (170, 170, 175))]
    paint(bg, [bar])
    ref_t = None
    if ref == "stick_v":
        pr, ref_t, _ = metre_stick(cam, (-(L * math.sin(thmax) + R + 0.12), -1.0 - 0.02), 90, 1.0)
        paint(bg, [pr])
    elif ref == "stick_h":
        pr, ref_t, _ = metre_stick(cam, (-0.5, -(L + R + 0.17)), 0, 1.0)
        paint(bg, [pr])
    elif ref == "a4":
        pr, ref_t = a4_sheet(cam, -(0.4 * L * math.sin(thmax) + 0.15), -(L + R + 0.05 + 0.1485), portrait=True)
        paint(bg, [pr])
    mpp = cam.mpp
    lw = max(2.0, 0.005 / mpp)

    def prims(s):
        bx, by = cam.px(L * math.sin(s[0]), -L * math.cos(s[0]))
        return [("l", [(px0, py0), (bx, by)], (28, 28, 30), lw)] + ball_prims(bx, by, R / mpp, col)

    obj = Obj("bob", noun, traj, prims, lambda s: cam.px(L * math.sin(s[0]), -L * math.cos(s[0])),
              {"kind": "ball on string", "colour_rgb": list(col), "radius_m": R, "radius_px": round(R / mpp, 2),
               "centroid_definition": "centre of the bob (string excluded)"})
    big = th0 > 30
    params = {"g": P(g, "m/s^2"), "L": P(L, "m (pivot to bob centre)"), "linear_damping_c": P(c, "1/s (theta'' = -(g/L) sin(theta) - c theta')"),
              "initial_amplitude": P(th0, "deg (released from rest)"), "bob_radius": P(R, "m"), "pivot_position_world": P([0.0, 0.0], "m")}
    ev = {"release_time_s": lead, "zero_crossing_times_s": [round(lead + float(x), 5) for x in tz[:40]]}
    exp = {"period_damped_numeric_s": periods[:12], "period_mean_damped_numeric_s": float(np.mean(periods)) if periods else None,
           "period_undamped_same_amplitude_numeric_s": T_nl, "period_small_angle_formula_s": T_small,
           "nonlinear_period_ratio": T_nl / T_small,
           "note": "theta measured from the downward vertical. Release from rest at release_time_s."}
    return Case(cid, "pendulum", "large_amplitude" if big else "small_amplitude", desc, "earth", W, H, fps, fps, dur, cam, bg, [obj], params,
                ref_t, ev, exp, [], lead, 1, seed)


def build_spring(cid, k, m, b, l0, A, g, bw_m, bh_m, col, W, H, fps, dur, bgk, ref, lead, seed, desc, noun, bgkw=None, ncoil=11, k3=0.0, mu=0.0, k2=0.0, fade=0.0):
    rng = np.random.default_rng(seed)
    # ell = distance of block centre below the fixed anchor (down positive):  ell'' = g - (k/m)(ell - l0) - b ell'
    # a hardening spring adds - (k3/m)(ell - ell_eq)^3 about the equilibrium (Duffing)
    ell_eq = l0 + g * m / k
    # dry (Coulomb) friction of constant size mu (m/s²) against the motion: the swing shrinks by a fixed amount each
    # half cycle, a straight-line decay no exponential damping reproduces (smoothed over 2 mm/s to keep RK4 honest)
    # a lopsided spring adds - (k2/m)(ell - ell_eq)^2: stiffer stretched than squashed, so the swing sits off centre
    # a tiring spring loses stiffness as it works: k(t) = k (1 - fade t), so the period lengthens through the clip; time
    # rides along as a third state so RK4 sees it
    if fade:
        f3 = lambda y: [y[1], g - (k * (1 - fade * y[2]) / m) * (y[0] - l0) - b * y[1], 1.0]
        T, Y, _ = integrate(f3, [ell_eq + A, 0.0, 0.0], dur - lead)
    else:
        f = lambda y: [y[1], g - (k / m) * (y[0] - l0) - (k3 / m) * (y[0] - ell_eq) ** 3 - (k2 / m) * (y[0] - ell_eq) ** 2 - b * y[1] - mu * math.tanh(y[1] / 0.002)]
        T, Y, _ = integrate(f, [ell_eq + A, 0.0], dur - lead)
    traj = Traj(T, Y, lead)
    ymax_ell = max(Y[:, 0]) + bh_m / 2
    cam = fit_cam(-0.4, 0.4, -(ymax_ell + (0.12 if ref == 'stick_h' else 0.06)), 0.14, W, H, pad=0.035)
    bg = make_bg(bgk, rng, W, H, cam, None, **(bgkw or {}))
    px0, py0 = cam.px(0, 0)
    bw = 0.34 / cam.mpp
    bar = [("p", [(px0 - bw / 2, py0 - 0.06 / cam.mpp), (px0 + bw / 2, py0 - 0.06 / cam.mpp), (px0 + bw / 2, py0), (px0 - bw / 2, py0)], (74, 76, 82)),
           ("p", [(px0 - bw / 2, py0 - 0.006 / cam.mpp), (px0 + bw / 2, py0 - 0.006 / cam.mpp), (px0 + bw / 2, py0), (px0 - bw / 2, py0)], (122, 124, 130))]
    paint(bg, [bar])
    ref_t = None
    if ref == "stick_h":
        pr, ref_t, _ = metre_stick(cam, (-0.5, -(ymax_ell + 0.06)), 0, 1.0)
        paint(bg, [pr])
    elif ref == "a4":
        pr, ref_t = a4_sheet(cam, 0.3, -0.297 / 2 - 0.12, portrait=True)
        paint(bg, [pr])
    mpp = cam.mpp
    zw = 0.05 / mpp
    wire = max(2.5, 0.0045 / mpp)

    def prims(s):
        cx, cy = cam.px(0.0, -s[0])
        top = cy - bh_m / 2 / mpp
        pts = [(px0, py0)]
        y_a, y_b = py0 + 0.012 / mpp, top
        n = 2 * ncoil
        lead_len = 0.06 * (y_b - y_a)
        ya2, yb2 = y_a + lead_len, y_b - lead_len
        pts.append((px0, y_a))
        for j in range(n):
            pts.append((px0 + (zw if j % 2 == 0 else -zw), ya2 + (yb2 - ya2) * (j + 0.5) / n))
        pts += [(px0, yb2), (px0, y_b)]
        return [("l", pts, (50, 52, 58), wire + 2.2), ("l", pts, (185, 188, 196), wire)] + block_prims(cx, cy, bw_m / mpp, bh_m / mpp, col)

    obj = Obj("weight", noun, traj, prims, lambda s: cam.px(0.0, -s[0]),
              {"kind": "block on spring", "colour_rgb": list(col), "size_m": [bw_m, bh_m], "size_px": [round(bw_m / mpp, 2), round(bh_m / mpp, 2)],
               "centroid_definition": "centre of the block (spring excluded)"})
    w0 = math.sqrt(k / m)
    th = Y[:, 0] - ell_eq
    idx = np.where(th[:-1] * th[1:] < 0)[0]
    tz = T[idx] - th[idx] * (T[idx + 1] - T[idx]) / (th[idx + 1] - th[idx])
    per = (tz[2:] - tz[:-2]).tolist()
    ppx_eq = cam.px(0, -ell_eq)[1]
    params = {"k": P(k, "N/m"), "m": P(m, "kg"), "k_over_m": P(k / m, "1/s^2"), "omega0": P(w0, "rad/s"),
              "damping_b": P(b, "1/s (y'' = -(k/m)(y - y_eq) - b y')"), "g": P(g, "m/s^2"),
              "natural_length_to_block_centre": P(l0, "m"), "equilibrium_extension_below_anchor_y_eq": P(ell_eq, "m (= l0 + g m / k)"),
              "initial_displacement_below_equilibrium": P(A, "m (released from rest)"), "equilibrium_pixel_row": P(round(ppx_eq, 3), "px")}
    if mu:
        params["coulomb_mu"] = P(mu, "m/s^2 (y'' = -(k/m)(y - y_eq) - mu sign(y'))")
    if k2:
        params["k2"] = P(k2, "N/m^2 (lopsided: y'' = -(k/m)(y - y_eq) - (k2/m)(y - y_eq)^2 - b y', y down)")
        params["k2_over_m"] = P(k2 / m, "1/(m s^2)")
    if fade:
        params["fade"] = P(fade, "1/s (tiring: k(t) = k (1 - fade t), t from release)")
    if k3:
        params["k3"] = P(k3, "N/m^3 (hardening: y'' = -(k/m)(y - y_eq) - (k3/m)(y - y_eq)^3 - b y')")
        params["k3_over_m"] = P(k3 / m, "1/(m^2 s^2)")
    ev = {"release_time_s": lead, "equilibrium_crossing_times_s": [round(lead + float(x), 5) for x in tz[:40]]}
    exp = {"period_damped_numeric_s": per[:12], "period_mean_damped_numeric_s": float(np.mean(per)) if per else None,
           "note": "Vertical position y_down (m, positive downward from the fixed anchor) obeys y'' = g - (k/m)(y - l0) - b y'. Equivalent form with y_eq = l0 + g m/k."}
    return Case(cid, "spring_mass", "hardening_vertical" if k3 else "coulomb_vertical" if mu else "lopsided_vertical" if k2 else "tiring_vertical" if fade else "damped_vertical", desc, "earth", W, H, fps, fps, dur, cam, bg, [obj], params, ref_t, ev, exp, [], lead, 1, seed)


def build_bounce(cid, g, e, h0, vx, R, col, W, H, fps, dur, bgk, ref, lead, seed, desc, noun, capture_fps=None, floor="wood", bgkw=None,
                 ref_len=1.0, ref_nb=10, ref_noun="metre stick", slow=1):
    rng = np.random.default_rng(seed)
    capture_fps = capture_fps or fps
    phys_dur = dur * fps / capture_fps
    f = lambda y: [y[2], y[3], 0.0, -g]
    T, Y, evs = integrate(f, [0.0, h0, vx, 0.0], phys_dur - lead, event=lambda y: y[1] - R,
                          on_event=lambda y: ([y[0], R, y[2], -e * y[3]], False))
    traj = Traj(T, Y, lead)
    xmax = max(Y[:, 0]) + R + 0.1
    sc = ref_len
    ytop = h0 + R + (0.12 * sc if ref == "stick_h" else (0.4 if ref == "a4" else 0.0))
    cam = fit_cam(-R - 0.1 - 0.12 * sc, xmax, -0.16 * h0 - 0.06 * sc, ytop, W, H, pad=0.04, bottom=True)
    bg = make_bg(bgk, rng, W, H, cam, floor, **(bgkw or {}))
    ref_t = None
    xmid = (-R - 0.1 + xmax) / 2
    if ref == "stick_h":
        pr, ref_t, _ = metre_stick(cam, (xmid - ref_len / 2, h0 + R + 0.06 * sc), 0, ref_len, ref_nb, thick_m=0.035 * sc, noun=ref_noun)
        paint(bg, [pr])
    elif ref == "a4":
        pr, ref_t = a4_sheet(cam, xmid, h0 + R + 0.06 + 0.1485, portrait=True)
        paint(bg, [pr])
    mpp = cam.mpp
    obj = Obj("ball", noun, traj, lambda s: ball_prims(*cam.px(s[0], s[1]), R / mpp, col), lambda s: cam.px(s[0], s[1]),
              {"kind": "ball", "colour_rgb": list(col), "radius_m": R, "radius_px": round(R / mpp, 2)})
    params = {"g": P(g, "m/s^2"), "coefficient_of_restitution_e": P(e, "dimensionless (v_after = -e v_before at the floor)"),
              "initial_height_of_centre_above_floor": P(h0, "m"), "horizontal_velocity": P(vx, "m/s (unchanged by bounces, frictionless floor)"),
              "ball_radius": P(R, "m"), "air_drag": P(0.0, "none")}
    bt = [lead + float(x) for x in evs]
    ev = {"release_time_s": lead, "bounce_times_physics_s": [round(x, 5) for x in bt]}
    if slow > 1:
        ev["bounce_times_video_s"] = [round(x * capture_fps / fps, 5) for x in bt]
    # speeds just before each bounce
    spd = []
    for te in evs:
        spd.append(float(-traj.at(lead + te - 1e-9)[3]))
    seg = [0.0] + list(evs) + [T[-1]]
    apex = [float(Y[(T >= seg[i]) & (T <= seg[i + 1]), 1].max()) for i in range(len(seg) - 1)]
    exp = {"n_bounces_in_clip": len(evs), "impact_speeds_m_s_numeric": spd, "apex_heights_of_centre_m_numeric": apex,
           "note": "Floor contact when ball centre is at y=R. Ball released from rest at release_time_s. All times are on the PHYSICS clock (frame i = i/capture_fps)."}
    c = Case(cid, "bouncing_ball", f"e={e}", desc, "earth", W, H, fps, capture_fps, dur, cam, bg, [obj], params, ref_t, ev, exp, [], lead, slow, seed)
    return c


def build_incline(cid, alpha_deg, beta, kind_name, g, R, col, W, H, fps, dur, bgk, ref, lead, seed, desc, noun, bgkw=None, Ld=1.5, s0=0.1, s_b=1.40):
    rng = np.random.default_rng(seed)
    al = math.radians(alpha_deg)
    a_s = g * math.sin(al) / (1 + beta)
    s_stop = s_b - R
    f = lambda y: [y[1], a_s, y[1] / R]
    T, Y, evs = integrate(f, [s0, 0.0, 0.0], dur - lead, event=lambda y: s_stop - y[0], on_event=lambda y: ([s_stop, 0.0, y[2]], True))
    traj = Traj(T, Y, lead)
    A_w = (0.0, Ld * math.sin(al))                         # top corner (world)
    d = (math.cos(al), -math.sin(al))                      # down-slope
    n = (math.sin(al), math.cos(al))                       # outward normal
    B_w = (A_w[0] + Ld * d[0], A_w[1] + Ld * d[1])
    cam = fit_cam(-0.12, B_w[0] + 0.12, -0.28, A_w[1] + 0.5, W, H, pad=0.035, bottom=True)
    bg = make_bg(bgk, rng, W, H, cam, "wood", **(bgkw or {}))
    A_p, B_p, C_p = cam.px(*A_w), cam.px(*B_w), cam.px(0, 0)
    shade_c = (176, 136, 90)
    wedge = [("p", [A_p, B_p, (B_p[0], C_p[1]), C_p], shade(shade_c, 0.55)),
             ("p", [(A_p[0] + 4, A_p[1] + 10), (B_p[0] - 6, B_p[1] - 1), (B_p[0] - 6, C_p[1] - 3), (C_p[0] + 4, C_p[1] - 3)], shade_c),
             ("l", [A_p, B_p], (70, 48, 28), 5)]

    def sw(s, nn):
        x = A_w[0] + s * d[0] + nn * n[0]
        y = A_w[1] + s * d[1] + nn * n[1]
        return cam.px(x, y)

    stopper = [("p", [sw(s_b, 0), sw(s_b + 0.035, 0), sw(s_b + 0.035, 3 * R), sw(s_b, 3 * R)], (72, 72, 80))]
    paint(bg, [wedge + stopper])
    ref_t = None
    if ref == "stick_h":
        pr, ref_t, _ = metre_stick(cam, (0.1, A_w[1] + 0.3), 0, 1.0)
        paint(bg, [pr])
    elif ref == "a4":
        pr, ref_t = a4_sheet(cam, 0.55, A_w[1] + 0.3 + 0.0, portrait=False)
        paint(bg, [pr])
    mpp = cam.mpp

    def centre_w(s):
        return A_w[0] + s * d[0] + R * n[0], A_w[1] + s * d[1] + R * n[1]

    obj = Obj("ball", noun, traj, lambda s: ball_prims(*cam.px(*centre_w(s[0])), R / mpp, col, seam=s[2]),
              lambda s: cam.px(*centre_w(s[0])),
              {"kind": "rolling ball (rotating marker on its surface)", "colour_rgb": list(col), "radius_m": R, "radius_px": round(R / mpp, 2)})
    params = {"g": P(g, "m/s^2"), "incline_angle_alpha": P(alpha_deg, "deg"), "beta_moment_of_inertia_factor": P(beta, "I/(m R^2); 2/5 solid sphere, 2/3 thin hollow sphere"),
              "ball_type": P(kind_name, "-"), "ball_radius": P(R, "m"), "rolling": P("no slipping", "-"),
              "slope_acceleration_a": P(a_s, "m/s^2 along the slope = g sin(alpha)/(1+beta)  [truth value used by the integrator]"),
              "ramp_length_along_slope": P(Ld, "m"), "start_distance_s0_along_slope": P(s0, "m (ball centre path, from top)"),
              "stopper_face_distance_along_slope": P(s_b, "m")}
    ev = {"release_time_s": lead, "stopper_hit_time_s": lead + evs[0] if evs else None}
    exp = {"time_to_travel_numeric_s": evs[0] if evs else None,
           "acceleration_numeric_m_s2": float(np.polyfit(T[:-1], Y[:-1, 1], 1)[0]),
           "note": "World slope direction = (cos alpha, -sin alpha). Ball rests until release_time_s, rolls without slipping, stops at the stopper."}
    return Case(cid, "incline_rolling", kind_name, desc, "earth", W, H, fps, fps, dur, cam, bg, [obj], params, ref_t, ev, exp, [], lead, 1, seed)


def build_collision(cid, r1, r2, col1, col2, p1, v1, p2, v2, e, sigma, mpp, W, H, fps, dur, seed, desc, n1, n2):
    rng = np.random.default_rng(seed)
    m1, m2 = sigma * math.pi * r1 * r1, sigma * math.pi * r2 * r2
    cam = Cam(W / 2, H / 2, mpp)
    bg = make_bg("felt", rng, W, H, cam)
    info = {}

    def f(y):
        return [y[4], y[5], y[6], y[7], 0, 0, 0, 0]

    def event(y):
        return math.hypot(y[2] - y[0], y[3] - y[1]) - (r1 + r2)

    def on_event(y):
        nx, ny = y[2] - y[0], y[3] - y[1]
        dd = math.hypot(nx, ny)
        nx, ny = nx / dd, ny / dd
        vrel = (y[4] - y[6]) * nx + (y[5] - y[7]) * ny
        j = (1 + e) * vrel / (1 / m1 + 1 / m2)
        info["before"] = [y[4], y[5], y[6], y[7]]
        yn = list(y)
        yn[4], yn[5] = y[4] - j * nx / m1, y[5] - j * ny / m1
        yn[6], yn[7] = y[6] + j * nx / m2, y[7] + j * ny / m2
        info["after"] = yn[4:8]
        info["normal"] = [nx, ny]
        info["pos"] = [y[0], y[1], y[2], y[3]]
        return yn, False

    T, Y, evs = integrate(f, [p1[0], p1[1], p2[0], p2[1], v1[0], v1[1], v2[0], v2[1]], dur, event=event, on_event=on_event)
    assert evs, 'no collision happened'
    traj = Traj(T, Y, 0.0)
    obj1 = Obj("puck_a", n1, traj, lambda s: puck_prims(*cam.px(s[0], s[1]), r1 / mpp, col1), lambda s: cam.px(s[0], s[1]),
               {"kind": "puck (top view)", "colour_rgb": list(col1), "radius_m": r1, "radius_px": round(r1 / mpp, 2), "mass_kg": m1})
    obj2 = Obj("puck_b", n2, traj, lambda s: puck_prims(*cam.px(s[2], s[3]), r2 / mpp, col2), lambda s: cam.px(s[2], s[3]),
               {"kind": "puck (top view)", "colour_rgb": list(col2), "radius_m": r2, "radius_px": round(r2 / mpp, 2), "mass_kg": m2})
    ref = None
    pb, pa = info.get("before"), info.get("after")
    params = {"mass_a": P(m1, "kg (" + n1 + ")"), "mass_b": P(m2, "kg (" + n2 + ")"), "mass_ratio_a_over_b": P(m1 / m2, "-"),
              "coefficient_of_restitution_e": P(e, "dimensionless (normal relative speed after = e x before)"),
              "radius_a": P(r1, "m"), "radius_b": P(r2, "m"), "surface": P("frictionless horizontal (air-hockey table), top view; gravity acts out of the image plane", "-"),
              "initial_velocity_a": P(list(v1), "m/s"), "initial_velocity_b": P(list(v2), "m/s"),
              "areal_density_assumption": P(sigma, "kg/m^2 (same material and height, so mass ~ radius^2)")}
    ev = {"collision_time_s": evs[0] if evs else None}
    exp = {}
    if pb:
        pmom0 = [m1 * pb[0] + m2 * pb[2], m1 * pb[1] + m2 * pb[3]]
        ke0 = 0.5 * m1 * (pb[0] ** 2 + pb[1] ** 2) + 0.5 * m2 * (pb[2] ** 2 + pb[3] ** 2)
        ke1 = 0.5 * m1 * (pa[0] ** 2 + pa[1] ** 2) + 0.5 * m2 * (pa[2] ** 2 + pa[3] ** 2)
        exp = {"velocities_before_a_b_m_s": pb, "velocities_after_a_b_m_s": pa, "line_of_centres_unit_vector": info["normal"],
               "momentum_before_kg_m_s": pmom0, "kinetic_energy_ratio_after_over_before": ke1 / ke0,
               "note": "Impulse acts along the line of centres; tangential velocity components are unchanged. World frame: x right, y up (table centre = image centre)."}
    return Case(cid, "collision_2d", f"e={e}", desc, "earth", W, H, fps, fps, dur, cam, bg, [obj1, obj2], params, ref, ev, exp,
                ["Top view; the 'metres_per_pixel' scale is the table plane. No separate scale reference object in frame; table markings: centre circle radius 0.28 m."], None, 1, seed)


# ----------------------------------------------------------------------------- case list

B = {  # background tuning
    "tiles_dark": dict(base=(76, 96, 130), grout=(190, 195, 200)),
    "tiles_cream": dict(base=(222, 218, 200), grout=(150, 148, 140)),
    "wall_blue": dict(base=(168, 192, 206)),
    "wall_sand": dict(base=(212, 198, 170)),
    "wall_green": dict(base=(160, 192, 168)),
    "wall_grey": dict(base=(178, 180, 184)),
}

CASES = [
    # ---- free fall
    ("ff01_earth_orange_ball", build_fall, dict(body="earth", g=9.81, h0=2.1, shape="ball", col=COL["orange"], size=0.09, W=1280, H=720, fps=60, dur=1.8,
        bgk="wall", bgkw=B["wall_blue"], ref="stick_v", lead=0.5, seed=101, noun="orange ball", desc="Orange ball released from rest and dropped 2 m onto a floor; metre stick standing upright beside the path.")),
    ("ff02_earth_blue_block_tiles", build_fall, dict(body="earth", g=9.81, h0=1.6, shape="block", col=COL["blue"], size=(0.13, 0.085), W=1920, H=1080, fps=120, dur=1.5,
        bgk="tiles", bgkw=B["tiles_cream"], ref=None, lead=0.3, seed=102, noun="blue block", desc="Blue block dropped from rest in front of a tiled wall, 1080p at 120 fps; no scale reference in frame (tile pitch is not given).")),
    ("ff03_moon_yellow_ball", build_fall, dict(body="moon", g=1.62, h0=1.8, shape="ball", col=COL["yellow"], size=0.08, W=1280, H=720, fps=30, dur=3.0,
        bgk="space", floor="regolith", ref="a4", lead=0.6, seed=103, noun="yellow ball", desc="Yellow ball dropped on the Moon (g = 1.62 m/s^2) over lunar regolith, black sky; A4 card standing in the motion plane.")),
    ("ff04_mars_white_ball", build_fall, dict(body="mars", g=3.71, h0=2.4, shape="ball", col=COL["white"], size=0.08, W=1280, H=720, fps=60, dur=2.5,
        bgk="mars", floor="mars", ref="stick_h", lead=0.4, seed=104, noun="white ball", desc="White ball dropped on Mars (g = 3.71 m/s^2) over rust-coloured ground; metre stick lying beside the landing spot.")),
    # ---- projectile, no drag
    ("pr01_earth_green_ball_tiles", build_proj, dict(g=9.81, k=0.0, x0=0.0, hl=0.4, speed=6.0, ang=55, R=0.07, col=COL["green"], W=1280, H=720, fps=60, dur=2.4,
        bgk="tiles", bgkw=B["tiles_dark"], ref="stick_h", ref_pos=(1.0, 0.12), lead=0.4, seed=201, noun="green ball",
        desc="Green ball launched from a small table at 6 m/s, 55 deg; tiled wall; metre stick on the wall near the floor.")),
    ("pr02_earth_red_ball_room", build_proj, dict(g=9.81, k=0.0, x0=0.0, hl=0.5, speed=8.0, ang=38, R=0.09, col=COL["red"], W=1920, H=1080, fps=120, dur=2.0,
        bgk="room", ref="a4", ref_pos=(3.9, 0.55), lead=0.2, seed=202, noun="red ball",
        desc="Red ball launched at 8 m/s, 38 deg in a cluttered room (window, shelf, door, pictures), 1080p at 120 fps; A4 sheet taped to the wall.")),
    # ---- projectile with strong quadratic drag
    ("pd01_earth_yellow_beachball_k0.25", build_proj, dict(g=9.81, k=0.25, x0=0.0, hl=0.4, speed=11.0, ang=50, R=0.11, col=COL["yellow"], W=1280, H=720, fps=60, dur=3.0,
        bgk="board", ref="stick_h", ref_pos=(1.3, 0.12), lead=0.3, seed=301, noun="yellow ball", floor="ledge",
        desc="Light yellow beach ball thrown at 11 m/s, 50 deg with strong quadratic drag k = 0.25 1/m, in front of a blackboard.")),
    ("pd02_earth_paper_ball_k0.45", build_proj, dict(g=9.81, k=0.45, x0=0.0, hl=0.4, speed=12.0, ang=40, R=0.075, col=COL["cream"], W=1920, H=1080, fps=60, dur=2.6,
        bgk="tiles", bgkw=B["tiles_dark"], ref="stick_h", ref_pos=(1.4, 0.12), lead=0.3, seed=302, noun="white paper ball",
        desc="Crumpled off-white paper ball thrown at 12 m/s, 40 deg with very strong quadratic drag k = 0.45 1/m; dark blue tiled wall; 1080p.")),
    ("pd03_earth_orange_balloon_k0.15", build_proj, dict(g=9.81, k=0.15, x0=0.0, hl=0.5, speed=9.0, ang=60, R=0.1, col=COL["orange"], W=1280, H=720, fps=30, dur=3.5,
        bgk="room", ref="a4", ref_pos=(1.0, 0.55), lead=0.3, seed=303, noun="orange ball",
        desc="Orange foam ball (large radius) lobbed at 9 m/s, 60 deg with quadratic drag k = 0.15 1/m in a cluttered room, 30 fps.")),
    # ---- vertical toss
    ("tt01_earth_blue_ball_portrait", build_toss, dict(g=9.81, v0=6.2, yh=1.0, R=0.05, col=COL["blue"], W=1080, H=1920, fps=60, dur=2.0,
        bgk="wall", bgkw=B["wall_sand"], ref="stick_v", seed=401, noun="blue ball",
        desc="Phone-style portrait clip: blue ball tossed straight up at 6.2 m/s from 1 m, falls back to the floor; metre stick standing against the wall.")),
    ("tt02_earth_yellow_ball_board", build_toss, dict(g=9.81, v0=4.4, yh=0.9, R=0.055, col=COL["yellow"], W=1280, H=720, fps=30, dur=2.5,
        bgk="board", floor="ledge", ref="a4", seed=402, noun="yellow ball",
        desc="Yellow ball tossed up at 4.4 m/s in front of a blackboard, 30 fps (heavy blur); A4 sheet pinned to the board.")),
    # ---- pendulum
    ("pe01_small_8deg_L0.60", build_pend, dict(L=0.60, th0=8.0, c=0.05, g=9.81, R=0.035, col=COL["red"], W=1920, H=1080, fps=60, dur=7.0,
        bgk="wall", bgkw=B["wall_green"], ref="stick_v", lead=0.5, seed=501, noun="pendulum bob",
        desc="Small-amplitude (8 deg) 0.60 m pendulum, red bob on a string, light damping; metre stick hung beside it; 1080p.")),
    ("pe02_large_70deg_L0.80", build_pend, dict(L=0.80, th0=70.0, c=0.06, g=9.81, R=0.05, col=COL["blue"], W=1280, H=720, fps=60, dur=7.0,
        bgk="tiles", bgkw=B["tiles_cream"], ref="stick_h", lead=0.5, seed=502, noun="pendulum bob",
        desc="Large-amplitude (70 deg) 0.80 m pendulum: period ~20% longer than small-angle; tiled wall; metre stick under the swing.")),
    ("pe03_small_9deg_L0.35_room", build_pend, dict(L=0.35, th0=9.0, c=0.08, g=9.81, R=0.03, col=COL["green"], W=1280, H=720, fps=120, dur=5.0,
        bgk="room", ref="a4", lead=0.4, seed=503, noun="pendulum bob",
        desc="Short (0.35 m) low-amplitude (9 deg) pendulum in a cluttered room at 120 fps; A4 sheet on the wall.")),
    ("pe04_large_60deg_L1.20_24fps", build_pend, dict(L=1.20, th0=60.0, c=0.03, g=9.81, R=0.06, col=COL["yellow"], W=1920, H=1080, fps=24, dur=8.0,
        bgk="board", ref="a4", lead=0.5, seed=504, noun="pendulum bob",
        desc="Long (1.20 m) 60 deg pendulum at cinematic 24 fps with a yellow bob in front of a blackboard; A4 sheet on the board.")),
    # ---- spring-mass
    ("sp01_k25_m0.20_b0.35", build_spring, dict(k=25.0, m=0.20, b=0.35, l0=0.35, A=0.12, g=9.81, bw_m=0.09, bh_m=0.06, col=COL["green"], W=1280, H=720, fps=60, dur=5.0,
        bgk="wall", bgkw=B["wall_sand"], ref="stick_h", lead=0.5, seed=601, noun="green weight",
        desc="Green block hanging from a zig-zag spring, k = 25 N/m, m = 0.20 kg, light damping; pulled down 12 cm and released.")),
    ("sp02_k60_m0.15_b1.0_fast", build_spring, dict(k=60.0, m=0.15, b=1.0, l0=0.30, A=0.05, g=9.81, bw_m=0.075, bh_m=0.05, col=COL["orange"], W=1920, H=1080, fps=120, dur=3.0,
        bgk="tiles", bgkw=B["tiles_dark"], ref="stick_h", lead=0.4, seed=602, noun="orange weight",
        desc="Stiff spring (k = 60 N/m, m = 0.15 kg, 3.2 Hz) with moderate damping, 1080p at 120 fps.")),
    ("sp03_k8_m0.50_b0.12_soft", build_spring, dict(k=8.0, m=0.50, b=0.12, l0=0.40, A=0.25, g=9.81, bw_m=0.11, bh_m=0.075, col=COL["red"], W=1280, H=720, fps=30, dur=8.0,
        bgk="board", ref="a4", lead=0.6, seed=603, noun="red weight",
        desc="Soft spring (k = 8 N/m, m = 0.50 kg, 0.64 Hz), 25 cm release, at 30 fps in front of a blackboard; A4 sheet on the board.")),
    # a hardening spring: its swing speeds up the further it is stretched, so the rhythm drifts as the swing dies away
    ("sx01_hardening_k12_k3_800", build_spring, dict(k=12.0, m=0.20, b=0.45, l0=0.30, A=0.13, g=9.81, bw_m=0.09, bh_m=0.06, col=COL["orange"], W=1280, H=720, fps=60, dur=7.0,
        bgk="wall", bgkw=B["wall_sand"], ref="stick_h", lead=0.5, seed=611, noun="orange weight", k3=800.0,
        desc="Orange block on a hardening spring (k = 12 N/m, k3 = 800 N/m^3, m = 0.20 kg, b = 0.45 1/s); pulled down 13 cm and released; metre stick below.")),
    # ---- bouncing ball
    ("bb01_e0.72_orange", build_bounce, dict(g=9.81, e=0.72, h0=1.5, vx=0.30, R=0.06, col=COL["orange"], W=1280, H=720, fps=60, dur=4.0,
        bgk="wall", bgkw=B["wall_blue"], ref="stick_h", lead=0.4, seed=701, noun="orange ball",
        desc="Orange ball dropped from 1.5 m onto a wooden floor, e = 0.72, drifting slowly sideways; 5+ bounces visible; metre stick on the wall.")),
    ("bb02_e0.88_blue_120fps", build_bounce, dict(g=9.81, e=0.88, h0=1.0, vx=0.45, R=0.05, col=COL["blue"], W=1920, H=1080, fps=120, dur=4.0,
        bgk="tiles", bgkw=B["tiles_cream"], ref="stick_h", lead=0.3, seed=702, noun="blue ball",
        desc="Very bouncy blue ball (e = 0.88) dropped from 1.0 m, 1080p at 120 fps, tiled wall.")),
    ("bb03_e0.60_purple_240fps", build_bounce, dict(g=9.81, e=0.60, h0=0.9, vx=0.35, R=0.05, col=COL["purple"], W=1280, H=720, fps=240, dur=2.5,
        bgk="wall", bgkw=B["wall_grey"], ref="a4", lead=0.2, seed=703, noun="purple ball",
        desc="Dead-ish purple ball (e = 0.60) dropped from 0.9 m, captured at 240 fps real time (no slow motion).")),
    # ---- incline
    ("in01_solid_beta0.4_20deg", build_incline, dict(alpha_deg=20.0, beta=0.4, kind_name="solid sphere", g=9.81, R=0.04, col=COL["blue"], W=1280, H=720, fps=60, dur=2.4,
        bgk="wall", bgkw=B["wall_sand"], ref="stick_h", lead=0.5, seed=801, noun="blue ball",
        desc="SOLID sphere (beta = 2/5) rolling without slipping down a 20 deg wooden ramp from rest, with a rotation marker; compare in02.")),
    ("in02_hollow_beta0.667_20deg", build_incline, dict(alpha_deg=20.0, beta=2 / 3, kind_name="hollow sphere", g=9.81, R=0.04, col=COL["red"], W=1280, H=720, fps=60, dur=2.6,
        bgk="tiles", bgkw=B["tiles_cream"], ref="a4", lead=0.5, seed=802, noun="red ball",
        desc="HOLLOW thin-shelled sphere (beta = 2/3) rolling down the same 20 deg ramp from rest; it accelerates ~14% less than the solid sphere.")),
    # ---- collisions
    ("co01_e0.90_unequal_mass", build_collision, dict(r1=0.04, r2=0.055, col1=COL["red"], col2=COL["yellow"], p1=(-0.55, -0.04), v1=(1.0, 0.07), p2=(0.12, 0.02), v2=(-0.15, 0.0),
        e=0.9, sigma=18.0, mpp=0.0012, W=1920, H=1080, fps=60, dur=1.6, seed=901, n1="red puck", n2="yellow puck",
        desc="Top view air-hockey table: light red puck hits a heavier yellow puck (mass ratio ~0.53), near-elastic e = 0.90, off-centre impact.")),
    ("co02_e0.50_equal_mass_120fps", build_collision, dict(r1=0.05, r2=0.05, col1=COL["orange"], col2=COL["white"], p1=(-0.6, 0.15), v1=(0.9, -0.12), p2=(0.45, -0.04), v2=(-0.7, 0.10),
        e=0.5, sigma=18.0, mpp=0.0016, W=1280, H=720, fps=120, dur=1.6, seed=902, n1="orange puck", n2="white puck",
        desc="Top view, two equal pucks approaching each other, quite inelastic (e = 0.50), 120 fps.")),
    # ---- slow motion
    ("sm01_bounce_240fps_x8", build_bounce, dict(g=9.81, e=0.85, h0=0.14, vx=0.30, R=0.02, col=COL["orange"], W=1280, H=720, fps=30, capture_fps=240, slow=8, dur=7.5,
        bgk="wall", bgkw=B["wall_blue"], ref="stick_h", ref_len=0.15, ref_nb=10, ref_noun="15 cm ruler", lead=0.12, seed=1001, noun="orange ball",
        desc="Macro shot of a small orange ball (r = 2 cm) bouncing, e = 0.85; physics captured at 240 fps and encoded at 30 fps (8x slow motion); 15 cm ruler with 1.5 cm bands.")),
    # phone-style slow motion with a plain ruler in view: the clock check should name the factor
    ("sm02_bounce_120fps_x4_a4", build_bounce, dict(g=9.81, e=0.78, h0=0.6, vx=0.25, R=0.035, col=COL["red"], W=1280, H=720, fps=30, capture_fps=120, slow=4, dur=6.0,
        bgk="wall", bgkw=B["wall_sand"], ref="a4", lead=0.2, seed=1002, noun="red ball",
        desc="Red ball (r = 3.5 cm) dropped from 0.6 m, e = 0.78, filmed at 120 fps and played at 30 fps (4x slow motion); A4 sheet on the wall.")),
    ("sm03_bounce_60fps_x2_stick", build_bounce, dict(g=9.81, e=0.7, h0=1.0, vx=0.2, R=0.04, col=COL["blue"], W=1280, H=720, fps=30, capture_fps=60, slow=2, dur=5.0,
        bgk="tiles", bgkw=B["tiles_dark"], ref="stick_h", lead=0.2, seed=1003, noun="blue ball",
        desc="Blue ball (r = 4 cm) dropped from 1.0 m, e = 0.70, filmed at 60 fps and played at 30 fps (2x slow motion); metre stick on the floor.")),
]
# a school practical: the same pendulum at four lengths, each with an A4 sheet as the ruler (series mode: L against T²)
SERIES = [
    (f"se0{i + 1}_series_L{L:.2f}", build_pend, dict(L=L, th0=10.0, c=0.03, g=9.81, R=0.035, col=COL["orange"], W=1280, H=720, fps=60, dur=8.0,
        bgk="wall", bgkw=B["wall_sand"], ref="a4", lead=0.5, seed=1100 + i, noun="orange bob",
        desc=f"School practical: pendulum of length {L:.2f} m, 10 deg swing, light damping, A4 sheet on the wall."))
    for i, L in enumerate([0.40, 0.60, 0.80, 1.00])
]
CASES += SERIES
# a spring that slows by dry friction: amplitude falls in a straight line, which no textbook law in the library has
CASES += [("sx02_coulomb_k20_mu0.45", build_spring, dict(k=20.0, m=0.20, b=0.0, l0=0.30, A=0.12, g=9.81, bw_m=0.09, bh_m=0.06, col=COL["blue"], W=1280, H=720, fps=60, dur=7.0,
        bgk="wall", bgkw=B["wall_sand"], ref="stick_h", lead=0.5, seed=612, noun="blue weight", mu=0.45,
        desc="Blue block on a spring sliding against a guide with dry friction mu = 0.45 m/s^2 (k = 20 N/m, m = 0.20 kg); pulled down 12 cm; metre stick below."))]
# two springs whose law is not in the textbook list, for Muse Wonder (Oct 29): a lopsided spring, stiffer stretched
# than squashed, and a spring that tires as it works
CASES += [("sx03_lopsided_k15_k2_40", build_spring, dict(k=15.0, m=0.20, b=0.30, l0=0.30, A=0.12, g=9.81, bw_m=0.09, bh_m=0.06, col=COL["green"] if "green" in COL else COL["blue"], W=1280, H=720, fps=60, dur=7.0,
        bgk="wall", bgkw=B["wall_sand"], ref="stick_h", lead=0.5, seed=613, noun="block", k2=40.0,
        desc="Block on a spring that is stiffer stretched than squashed (k = 15 N/m, k2 = 40 N/m^2, m = 0.20 kg, b = 0.30 1/s); pulled down 12 cm; metre stick below.")),
          ("sx04_tiring_k16_fade0.06", build_spring, dict(k=16.0, m=0.20, b=0.20, l0=0.30, A=0.12, g=9.81, bw_m=0.09, bh_m=0.06, col=COL["orange"], W=1280, H=720, fps=60, dur=7.0,
        bgk="wall", bgkw=B["wall_sand"], ref="stick_h", lead=0.5, seed=614, noun="block", fade=0.06,
        desc="Block on a spring that tires as it works: k(t) = 16 N/m (1 - 0.06 t), m = 0.20 kg, b = 0.20 1/s; pulled down 12 cm; metre stick below."))]
CASE_IDS = [c[0] for c in CASES]


# ----------------------------------------------------------------------------- rendering


def render_case(cid):
    t_start = time.time()
    _, fn, kw = next(c for c in CASES if c[0] == cid)
    case = fn(cid, **kw)
    W, H, fps, cfps = case.W, case.H, case.fps, case.capture_fps
    n = int(round(case.dur * fps))
    rng = np.random.default_rng(case.seed + 7)
    out = CLIPS / f"{cid}.mp4"
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
           "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", str(fps), "-movflags", "+faststart", str(out)]
    pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    shutter = SHUTTER / cfps
    rec = {o.oid: {"centroid": [], "pos": [], "world": []} for o in case.objs}
    base = case.bg.astype(np.float32)
    for i in range(n):
        tc = i / cfps
        disp = 0.0
        for o in case.objs:
            a = np.array(o.centre(o.traj.at(tc - shutter / 2)))
            b = np.array(o.centre(o.traj.at(tc + shutter / 2)))
            disp = max(disp, float(np.hypot(*(b - a))))
        S = int(np.clip(math.ceil(disp / 2.0) + 1, 3, 48))
        ts = tc + (np.arange(S) + 0.5) / S * shutter - shutter / 2
        frame = base.copy()
        for o in case.objs:
            st = o.traj.at(ts)
            cs = np.array([o.centre(s) for s in st])
            rec[o.oid]["centroid"].append(cs.mean(0))
            rec[o.oid]["pos"].append(np.array(o.centre(o.traj.at(tc))))
            res = layer([o.prims(s) for s in st], W, H)
            if res is not None:
                (x0, y0, x1, y1), A, Pm = res
                frame[y0:y1, x0:x1] = frame[y0:y1, x0:x1] * (1 - A) + Pm
        noise = rng.standard_normal((H, W, 1), dtype=np.float32) * 2.2 + rng.standard_normal((H, W, 3), dtype=np.float32) * 0.9
        pr.stdin.write(np.clip(frame + noise, 0, 255).astype(np.uint8).tobytes())
    pr.stdin.close()
    pr.wait()
    if pr.returncode != 0:
        raise RuntimeError("ffmpeg failed for " + cid)
    # truth
    cam = case.cam
    mpp = cam.mpp
    objs = []
    warns = []
    for o in case.objs:
        cen = np.array(rec[o.oid]["centroid"])
        pos = np.array(rec[o.oid]["pos"])
        world = np.stack([(pos[:, 0] - cam.ox) * mpp, (cam.oy - pos[:, 1]) * mpp], 1)
        rad = o.info.get("radius_px", 10)
        if cen[:, 0].min() < rad or cen[:, 0].max() > W - rad or cen[:, 1].min() < rad or cen[:, 1].max() > H - rad:
            warns.append(f"{cid}:{o.oid} leaves/touches the frame edge")
        d = {"id": o.oid, "noun_phrase": o.noun}
        d.update(o.info)
        d["centroid_px"] = np.round(cen, 3).tolist()
        d["position_px_at_frame_time"] = np.round(pos, 3).tolist()
        d["position_m_at_frame_time"] = np.round(world, 6).tolist()
        d["centroid_note"] = ("centroid_px = mean true object-centre over the exposure (what a perfect mask centroid of the motion-blurred object "
                              "would give); position_px_at_frame_time = true centre at the exact frame timestamp.")
        objs.append(d)
    frame_idx = np.arange(n)
    truth = {
        "case_id": cid, "phenomenon": case.phen, "variant": case.variant, "description": case.desc, "body": case.body,
        "params": case.params, "fps": fps, "capture_fps": cfps, "slow_motion_factor": case.slow,
        "width": W, "height": H, "n_frames": n, "duration_s": n / fps, "physics_duration_s": n / cfps,
        "metres_per_pixel": mpp, "pixels_per_metre": 1 / mpp,
        "camera": CAMERA_NOTE, "image_coordinates": IMG_NOTE,
        "world_frame": {"origin_px": [round(cam.ox, 3), round(cam.oy, 3)], "x": "right", "y": "up", "unit": "m"},
        "shutter_fraction_of_capture_frame_interval": SHUTTER,
        "release_or_launch_time_s": case.release_time_s,
        "time_note": ("Frame i has video timestamp i/fps and physics timestamp i/capture_fps; for slow-motion clips the physics time "
                      "is slow_motion_factor times shorter than the video time. All event times in this file are PHYSICS times."),
        "moving_objects": objs, "reference": case.ref, "events": case.events, "expected_numeric": case.expected, "notes": case.notes,
        "frame_video_time_s": np.round(frame_idx / fps, 6).tolist(), "frame_physics_time_s": np.round(frame_idx / cfps, 6).tolist(),
        "video_file": f"clips/{cid}.mp4", "encoding": "H.264, yuv420p, CRF 20, +faststart", "integration": f"RK4, step {H_STEP:g} s, bisection events",
    }
    with open(CLIPS / f"{cid}.json", "w") as fh:
        json.dump(truth, fh, indent=1)
    return cid, time.time() - t_start, warns, os.path.getsize(out)


def make_sheet(cid):
    mp4 = CLIPS / f"{cid}.mp4"
    with open(CLIPS / f"{cid}.json") as fh:
        t = json.load(fh)
    n = t["n_frames"]
    k = max(1, n // 12)
    if t["height"] > t["width"]:
        cw, ch, tile = 203, 360, "6x2"
    else:
        cw, ch, tile = 480, 270, "4x3"
    vf = rf"select='not(mod(n\,{k}))',scale={cw}:{ch},tile={tile}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp4), "-vf", vf, "-frames:v", "1", "-fps_mode", "vfr", "-q:v", "3", str(SHEETS / f"{cid}.jpg")], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=5)
    ap.add_argument("--only", default="")
    ap.add_argument("--no-sheets", action="store_true")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        print("\n".join(CASE_IDS))
        return
    CLIPS.mkdir(exist_ok=True)
    SHEETS.mkdir(exist_ok=True)
    ids = [s for s in CASE_IDS if not a.only or any(tok in s for tok in a.only.split(","))]
    import multiprocessing as mp
    t0 = time.time()
    with mp.get_context("spawn").Pool(a.jobs) as pool:
        for cid, dt, warns, size in pool.imap_unordered(render_case, ids):
            print(f"{cid}: {dt:5.1f}s {size / 1e6:6.2f} MB {'; '.join(warns)}", flush=True)
            if not a.no_sheets:
                make_sheet(cid)
    # combined summary
    summary = []
    for cid in CASE_IDS:
        p = CLIPS / f"{cid}.json"
        if not p.exists():
            continue
        t = json.load(open(p))
        for o in t["moving_objects"]:
            for key in ("centroid_px", "position_px_at_frame_time", "position_m_at_frame_time", "centroid_note"):
                o.pop(key, None)
        for key in ("frame_video_time_s", "frame_physics_time_s", "image_coordinates"):
            t.pop(key, None)
        t["truth_file"] = f"clips/{cid}.json"
        summary.append(t)
    json.dump({"description": "Ansatz synthetic physics benchmark. Per-frame truth (centroids, timestamps) is in each case's truth_file.",
               "camera": CAMERA_NOTE, "n_cases": len(summary), "cases": summary}, open(HERE / "cases.json", "w"), indent=1)
    total = sum(f.stat().st_size for f in CLIPS.glob("*.mp4"))
    print(f"done in {time.time() - t0:.0f}s, {len(summary)} cases, mp4 total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
