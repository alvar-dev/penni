"""Three style frames for the Penni film: two dark and cinematic, one bright studio."""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import lin  # noqa: E402

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp"
BANKS = ["op", "nordea", "danske", "revolut", "handelsbanken", "aktia", "saastopankki", "pop", "omasp", "alandsbanken"]


def dark_stage():
    lib.world(lin("#020906"), 1.0)
    lib.plane("Floor", 80, 80, (0, 0, 0), (0, 0, 0), lib.principled("FloorMat", lin("#05140c"), rough=0.32, coat=0.25))


def bright_stage():
    lib.world(lin("#eef4ef"), 1.0)
    lib.plane("Floor", 80, 80, (0, 0, 0), (0, 0, 0), lib.principled("FloorMat", lin("#e8eee9"), rough=0.5))
    lib.light("AREA", "Key", (-3, -3, 5), 900, size=6, rot=(math.radians(40), 0, math.radians(-40)))
    lib.light("AREA", "Fill", (4, -2, 3), 300, size=5, rot=(math.radians(60), 0, math.radians(60)))


def card(name, label, amount, loc, face_to):
    """A floating purchase card: white rounded panel, label and amount."""
    import bpy
    from mathutils import Vector

    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    root.location = loc
    d = Vector(face_to) - Vector(loc)
    root.rotation_euler = (math.radians(90), 0, math.atan2(d.x, -d.y) * -1 + 0)
    root.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    panel = lib.rounded_box(f"{name}.panel", (0.62, 0.17, 0.02), 0.08, mat=lib.principled(f"{name}.w", lin("#ffffff"), rough=0.3, emit=lin("#ffffff"), emit_strength=0.25))
    ink = lib.principled(f"{name}.ink", lin("#101411"), rough=0.6)
    grey = lib.principled(f"{name}.grey", lin("#5f6661"), rough=0.6)
    dot = lib.principled(f"{name}.dot", lin("#1d7a4a"), rough=0.4, emit=lin("#1d7a4a"), emit_strength=0.3)
    import bpy as _b

    _b.ops.mesh.primitive_cylinder_add(radius=0.052, depth=0.01, location=(-0.235, 0, 0.012))
    ic = _b.context.object
    ic.data.materials.append(dot)
    t1 = lib.text(f"{name}.l", label, 0.062, (-0.16, -0.022, 0.012), rot=(0, 0, 0), mat=grey)
    t2 = lib.text(f"{name}.a", amount, 0.066, (0.27, -0.024, 0.012), rot=(0, 0, 0), mat=ink, align="RIGHT")
    for o in (panel, ic, t1, t2):
        o.parent = root
    return root


def frame_a1():
    lib.reset()
    dark_stage()
    orb_loc = (0.55, 2.4, 0.85)
    lib.sphere("Orb", 0.5, orb_loc, emit=1.2)
    lib.light("POINT", "OrbGlow", (0.55, 2.4, 0.45), 40, color=(0.2, 1.0, 0.4), size=0.9, shadow=False)
    lib.light("AREA", "Rim", (1.5, 5.0, 3.5), 900, color=(0.8, 1.0, 0.88), size=4, rot=(math.radians(-50), 0, math.radians(160)))
    # The trail: shoe prints walking towards the orb, older ones fading.
    import bpy

    pts = [(-1.5 + 0.33 * i, -2.2 + 0.72 * i) for i in range(7)]
    for i, (x, y) in enumerate(pts):
        nx, ny = (pts[i + 1] if i + 1 < len(pts) else (x + 0.3, y + 0.62))
        ang = math.atan2(ny - y, nx - x) - math.pi / 2
        side = 0.09 if i % 2 else -0.09
        ox, oy = side * math.cos(ang), side * math.sin(ang)
        k = i / 6
        mat = lib.principled(f"Print{i}", lin("#0a3a22"), rough=0.4, emit=lin("#00EB5A"), emit_strength=0.15 + 1.1 * k)
        o = lib.outline_mesh(f"Print{i}", lib.shoe_loops(0.42, mirror=i % 2 == 1), 0.012, mat, bevel=0.005)
        o.location = (x + ox, y + oy, 0.002)
        o.rotation_euler = (0, 0, ang)
    cam = (-1.55, -3.4, 0.62)
    lib.camera(cam, (0.1, 1.2, 0.55), lens=40, fstop=2.0, focus=4.9)
    lib.glow(1.0, 0.7, 0.75)
    lib.render_still(os.path.join(OUT, "style-a1.png"), frame=40)


def phone_scene(bright):
    lib.reset()
    (bright_stage if bright else dark_stage)()
    import bpy

    lib.phone("Phone", (0.55, 0.15, 0.98), (math.radians(90), 0, math.radians(-18)), os.path.join(lib.TEX, "screen-answer.png"), scale=1.0)
    lib.sphere("Orb", 0.33, (-0.72, 0.35, 1.1), emit=0.95 if bright else 1.2)
    lib.light("POINT", "OrbGlow", (-0.72, 0.35, 0.75), 12 if bright else 25, color=(0.2, 1.0, 0.4), size=0.6, shadow=False)
    if not bright:
        lib.light("AREA", "Rim", (1.8, 3.0, 3.2), 700, color=(0.8, 1.0, 0.88), size=4, rot=(math.radians(-45), 0, math.radians(150)))
        lib.light("AREA", "Front", (-1.0, -3.0, 2.2), 120, size=3, rot=(math.radians(65), 0, math.radians(-18)))
    # All the banks on a ring around the scene, some passing close to the lens.
    for i, b in enumerate(BANKS):
        a = 2 * math.pi * i / len(BANKS) + 0.4
        x, y, z = 2.0 * math.cos(a), 0.6 + 1.0 * math.sin(a), 1.0 + 0.32 * math.sin(a * 2)
        t = lib.logo_tile(f"Bank{i}", os.path.join(lib.TEX, f"logo-{b}.png"), (x, y, z), size=0.34)
        t.rotation_euler = (math.radians(90), 0, math.radians(-8 * math.cos(a)))
    lib.camera((0.0, -3.7, 1.15), (0.0, 0.3, 1.0), lens=45, fstop=2.4, focus=3.75)
    lib.glow(1.0, 0.45 if bright else 0.7, 0.65)
    lib.render_still(os.path.join(OUT, "style-b1.png" if bright else "style-a2.png"), frame=40)


which = sys.argv[sys.argv.index("--") + 2] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 2 else "all"
if which in ("all", "a1"):
    frame_a1()
if which in ("all", "a2"):
    phone_scene(False)
if which in ("all", "b1"):
    phone_scene(True)
