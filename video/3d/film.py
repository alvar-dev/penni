"""The Penni film as one continuous 3D shot in a bright studio (Blender 5.2, EEVEE).

blender -b --factory-startup -P film.py -- <out_dir> [stills|anim] [start end]
Times are in seconds on the film's clock (30 fps); the HTML overlay uses the same clock.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib  # noqa: E402
from lib import lin  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/penni"
MODE = ARGS[1] if len(ARGS) > 1 else "stills"
FPS, END = 30, 57.0


def F(t):
    return int(round(t * FPS)) + 1


def key(target, prop, t, value, index=-1):
    setattr(target, prop, value)
    target.keyframe_insert(prop, frame=F(t), index=index)


def pop(obj, t, dur=0.7, to=1.0):
    """Scale in with a little overshoot."""
    key(obj, "scale", t - 0.001, (0, 0, 0))
    key(obj, "scale", t + dur * 0.65, (to * 1.1,) * 3)
    key(obj, "scale", t + dur, (to,) * 3)


def vanish(obj, t, dur=0.5, frm=1.0):
    key(obj, "scale", t, (frm,) * 3)
    key(obj, "scale", t + dur, (0, 0, 0))


# --------------------------------------------------------------------- stage
s = lib.reset(fps=FPS, frames=F(END) - 1)
s.eevee.taa_render_samples = 48
lib.world(lin("#eef3ef"), 0.4)


def cyclorama():
    """Floor curving up into the back wall, no horizon."""
    import bmesh

    me = bpy.data.meshes.new("Cyc")
    bm = bmesh.new()
    prof = [(y, 0.0) for y in (-14, -6, 0, 2.0)]
    R = 3.0
    for i in range(1, 13):
        a = math.radians(90 * i / 12)
        prof.append((2.0 + R * math.sin(a), R - R * math.cos(a)))
    prof += [(5.0, 6.0), (5.0, 14.0)]
    rows = []
    for x in (-20, 20):
        rows.append([bm.verts.new((x, y, z)) for y, z in prof])
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("Cyc", me)
    s.collection.objects.link(o)
    for p in me.polygons:
        p.use_smooth = True
    o.data.materials.append(lib.principled("CycMat", lin("#eef3ef"), rough=0.62))
    return o


cyclorama()
lib.light("AREA", "Key", (-3.2, -3.4, 5.2), 420, size=7, rot=(math.radians(42), 0, math.radians(-42)))
lib.light("AREA", "Fill", (4.5, -3.0, 2.6), 120, size=6, rot=(math.radians(68), 0, math.radians(56)))
lib.light("AREA", "Top", (0.5, 2.0, 6.0), 140, color=(0.92, 1.0, 0.95), size=5, rot=(0, 0, 0))

# --------------------------------------------------------------------- the orb (metaballs, so it can divide and melt back)
ORB_COLORS = ("#007841", "#00AA46", "#00EB5A", "#91FA9B")
mb = bpy.data.metaballs.new("OrbMeta")
mb.resolution = 0.06
mb.render_resolution = 0.012
mb.threshold = 0.6
orb = bpy.data.objects.new("Orb", mb)
s.collection.objects.link(orb)
mb.materials.append(lib.orb_material(0.55, radius=0.5, name="OrbMat", colors=ORB_COLORS))
els = [mb.elements.new() for _ in range(3)]
for e in els:
    e.stiffness = 2.0

# Calibrate: how big a ball of element radius 1 comes out.
dg = bpy.context.evaluated_depsgraph_get()
for e in els:
    e.radius = 0.0
els[0].radius, els[0].co = 1.0, (0, 0, 0)
dg.update()
me = orb.evaluated_get(dg).to_mesh()
K = max(v.co.length for v in me.vertices) if len(me.vertices) else 0.8
orb.evaluated_get(dg).to_mesh_clear()
print("METABALL_K", K)


def ball(i, t, pos, visible_r):
    e = els[i]
    e.co = pos
    e.keyframe_insert("co", frame=F(t))
    e.radius = visible_r / K
    e.keyframe_insert("radius", frame=F(t))


# A gentle bob for everything the orb is.
fc = orb.driver_add("location", 2)
fc.driver.expression = "0.028 * sin(frame / 30 * 1.15)"

CENTER = (0, 0.3, 0.95)

# 1. Macro to whole sphere.
ball(0, 0, (0, 0, 0.9), 0.5)
ball(1, 0, (0, 0, 0.9), 0.0)
ball(2, 0, (0, 0, 0.9), 0.0)
ball(0, 6.4, (0, 0, 0.9), 0.5)

# 2. The trail: the orb glides across, a shoe print and a purchase card appear as it passes.
TRAIL_T0, TRAIL_T1, X0, X1 = 7.6, 13.4, -2.8, 2.8
ball(0, 7.4, (X0, 0.2, 0.45), 0.3)
ball(0, TRAIL_T0, (X0, 0.2, 0.45), 0.3)
ball(0, TRAIL_T1, (X1, 0.2, 0.45), 0.3)
for fcurve in mb.animation_data.action.fcurves if mb.animation_data and mb.animation_data.action and hasattr(mb.animation_data.action, "fcurves") else []:
    pass

PRINT_MAT = lib.principled("PrintMat", lin("#3fc57a"), rough=0.42, coat=0.4)
CARD_FILES = [os.path.join(lib.HERE, "cards", f"card{i}.png") for i in range(7)]
BASKET_OF = [0, 2, 0, 2, 1, 2, 0]
BASKETS = [(-1.45, 0.3, 0.62), (0.55, 0.3, 0.3), (1.6, 0.3, 0.28)]  # x, y, visible radius
cam_obj = None  # set below; cards track it
prints, cards = [], []
for i in range(7):
    x = -2.4 + 0.8 * i
    y = 0.2 + (0.13 if i % 2 else -0.13)
    t_pass = TRAIL_T0 + (x - X0) / (X1 - X0) * (TRAIL_T1 - TRAIL_T0)
    pr = lib.outline_mesh(f"Print{i}", lib.shoe_loops(0.62, mirror=i % 2 == 1), 0.014, PRINT_MAT, bevel=0.007)
    pr.location = (x - 0.3, y, 0.001)
    pr.rotation_euler = (0, 0, -math.pi / 2)
    pop(pr, t_pass + 0.05, 0.45)
    vanish(pr, 14.5 + 0.04 * i, 0.5)
    prints.append(pr)
    # The card: the rendered pill on a white backing.
    import bpy as _b

    img = _b.data.images.load(CARD_FILES[i], check_existing=True)
    h = 0.2
    w = h * img.size[0] / img.size[1]
    root = _b.data.objects.new(f"Card{i}", None)
    s.collection.objects.link(root)
    face = lib.plane(f"Card{i}.face", w, h, (0, 0, 0.0125), (0, 0, 0), lib.image_material(f"Card{i}.img", CARD_FILES[i], emit=0.97, gloss=False))
    back = lib.slab(f"Card{i}.back", w * 0.985, h * 0.94, h * 0.47, 0.012, lib.principled(f"Card{i}.white", lin("#ffffff"), rough=0.3), 0.004)
    face.parent = root
    back.parent = root
    cards.append((root, t_pass + 0.2, (x, y + 0.05, 0.62 if i % 2 else 0.98), BASKET_OF[i]))

# 3. Three baskets: divide, sized by share; each becomes its object; extras in focus; melt back.
ball(0, 14.6, CENTER, 0.5)
ball(1, 14.6, CENTER, 0.0)
ball(2, 14.6, CENTER, 0.0)
ball(1, 14.85, CENTER, 0.22)
ball(2, 14.85, CENTER, 0.22)
for i, (bx, by, br) in enumerate(BASKETS):
    ball(i, 16.6, (bx, by, br + 0.04), br)
for i, (bx, by, br) in enumerate(BASKETS):
    tm = 18.4 + 0.4 * i
    ball(i, tm, (bx, by, br + 0.04), br)
    ball(i, tm + 0.55, (bx, by, br * 0.6), 0.0)
    ball(i, 26.2, (bx, by, br * 0.6), 0.0)
    ball(i, 26.8, (bx, by, br + 0.04), br)
    ball(i, 28.0, CENTER, 0.5 if i == 0 else 0.22)
ball(1, 28.35, CENTER, 0.0)
ball(2, 28.35, CENTER, 0.0)
ball(0, 28.35, CENTER, 0.5)

BASKET_COLORS = [
    ("#003a20", "#005c33", "#00894a", "#4fc27f"),
    ORB_COLORS,
    ("#00a64a", "#3fd877", "#9ff2ad", "#e0fbe4"),
]
RING_COLORS = ["#004628", "#00AA46", "#5fd889"]
SHARES = [0.72, 0.14, 0.13]


def icon_house(mat, size):
    loop = [(-0.5, 0), (0.5, 0), (0.5, 0.52), (0.64, 0.52), (0, 1.04), (-0.64, 0.52), (-0.5, 0.52)]
    o = lib.outline_mesh("House", [[(x * size, y * size) for x, y in loop]], 0.32 * size, mat, bevel=0.07 * size)
    o.modifiers["Bevel"].segments = 10
    for v in o.data.vertices:
        v.co.z -= 0.16 * size
    door = lib.slab("House.door", 0.2 * size, 0.36 * size, 0.07 * size, 0.04 * size, lib.principled("Door", lin("#00351d"), rough=0.4), 0.012 * size)
    door.location = (0, 0.18 * size, 0.16 * size)
    door.parent = o
    return o


def icon_machine(mat, size):
    o = lib.slab("Machine", 0.8 * size, 0.92 * size, 0.14 * size, 0.62 * size, mat, 0.05 * size)
    for v in o.data.vertices:
        v.co.y += 0.46 * size
    bpy.ops.mesh.primitive_torus_add(major_radius=0.24 * size, minor_radius=0.045 * size, location=(0, 0.42 * size, 0.31 * size))
    ring = bpy.context.object
    ring.data.materials.append(lib.principled("Ring", lin("#e9f6ec"), rough=0.2, metal=0.3, coat=1.0))
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2 * size, depth=0.02 * size, location=(0, 0.42 * size, 0.305 * size), vertices=64)
    glass = bpy.context.object
    glass.data.materials.append(lib.principled("Glass", lin("#0c3d27"), rough=0.05, coat=1.0))
    for k, xk in enumerate((-0.24, -0.12)):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.035 * size, depth=0.03 * size, location=(xk * size, 0.8 * size, 0.315 * size), vertices=32)
        knob = bpy.context.object
        knob.data.materials.append(lib.principled(f"Knob{k}", lin("#e9f6ec"), rough=0.3))
        knob.parent = o
    ring.parent = o
    glass.parent = o
    return o


def icon_cup(mat, size):
    bpy.ops.mesh.primitive_cone_add(vertices=96, radius1=0.25 * size, radius2=0.33 * size, depth=0.5 * size, location=(0, 0, 0.3 * size))
    cup = bpy.context.object
    cup.name = "Cup"
    b = cup.modifiers.new("Bevel", "BEVEL")
    b.width = 0.03 * size
    b.segments = 6
    b.limit_method = "ANGLE"
    bpy.ops.object.shade_smooth()
    cup.data.materials.append(mat)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.3 * size, depth=0.01 * size, location=(0, 0, 0.53 * size), vertices=96)
    top = bpy.context.object
    top.data.materials.append(lib.principled("Coffee", lin("#2f5a3f"), rough=0.15, coat=1.0))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.13 * size, minor_radius=0.04 * size, location=(0.33 * size, 0, 0.32 * size), rotation=(math.radians(90), 0, 0))
    handle = bpy.context.object
    bpy.ops.object.shade_smooth()
    handle.data.materials.append(mat)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.46 * size, depth=0.05 * size, location=(0, 0, 0.025 * size), vertices=96)
    saucer = bpy.context.object
    sb = saucer.modifiers.new("Bevel", "BEVEL")
    sb.width = 0.02 * size
    sb.segments = 4
    bpy.ops.object.shade_smooth()
    saucer.data.materials.append(lib.principled("Saucer", lin("#f4faf5"), rough=0.25, coat=0.8))
    root = bpy.data.objects.new("CupRoot", None)
    s.collection.objects.link(root)
    for o in (cup, top, handle, saucer):
        o.parent = root
    return root


icons = []
for i, (bx, by, br) in enumerate(BASKETS):
    mat = lib.orb_material(0.55, radius=br, name=f"Basket{i}", colors=BASKET_COLORS[i])
    if i == 0:
        o = icon_house(mat, 1.15)
        o.rotation_euler = (math.radians(90), 0, 0)
    elif i == 1:
        o = icon_machine(mat, 0.7)
        o.rotation_euler = (math.radians(90), 0, 0)
    else:
        o = icon_cup(mat, 0.75)
    o.location = (bx, by, 0)
    tm = 18.4 + 0.4 * i
    pop(o, tm + 0.15, 0.8)
    vanish(o, 26.0, 0.5)
    icons.append(o)
    # The share ring on the floor, drawn to the basket's share.
    bpy.ops.curve.primitive_bezier_circle_add(radius=br + 0.32, location=(bx, by, 0.012))
    ring = bpy.context.object
    ring.name = f"ShareRing{i}"
    ring.data.bevel_depth = 0.016
    ring.data.bevel_resolution = 4
    ring.data.materials.append(lib.principled(f"RingMat{i}", lin(RING_COLORS[i]), rough=0.3, emit=lin(RING_COLORS[i]), emit_strength=0.35))
    ring.rotation_euler = (0, 0, math.radians(90))
    key(ring, "scale", 16.05 + 0.15 * i, (0, 0, 0))
    key(ring, "scale", 16.1 + 0.15 * i, (1, 1, 1))
    key(ring, "scale", 26.6, (1, 1, 1))
    key(ring, "scale", 26.65, (0, 0, 0))
    key(ring.data, "bevel_factor_end", 16.1 + 0.15 * i, 0.001)
    key(ring.data, "bevel_factor_end", 17.7 + 0.15 * i, SHARES[i])
    key(ring.data, "bevel_factor_end", 26.0, SHARES[i])
    key(ring.data, "bevel_factor_end", 26.6, 0.0)
    bpy.ops.curve.primitive_bezier_circle_add(radius=br + 0.32, location=(bx, by, 0.006))
    track = bpy.context.object
    track.data.bevel_depth = 0.009
    track.data.materials.append(lib.principled(f"Track{i}", lin("#dfe8e2"), rough=0.5))
    key(track, "scale", 15.9, (0, 0, 0))
    key(track, "scale", 16.6, (1, 1, 1))
    key(track, "scale", 26.0, (1, 1, 1))
    key(track, "scale", 26.6, (0, 0, 0))

# 4. Benchmarks: the orb to the right third.
ball(0, 28.9, CENTER, 0.5)
ball(0, 30.0, (1.3, 0.3, 0.95), 0.46)
ball(0, 34.3, (1.3, 0.3, 0.95), 0.46)

# 5. The phone slides in; the orb listens beside it, then the answer appears.
ORB_PHONE = (-1.05, 0.2, 1.1)
ball(0, 35.4, ORB_PHONE, 0.34)
for k, t in enumerate([37.4, 37.8, 38.2, 38.6, 39.0, 39.4]):
    ball(0, t, ORB_PHONE, 0.34 * (1.06 if k % 2 == 0 else 0.98))
ball(0, 39.8, ORB_PHONE, 0.34)
ball(0, 44.6, ORB_PHONE, 0.34)

screen_home = os.path.join(lib.TEX, "screen-home.png")
screen_answer = os.path.join(lib.TEX, "screen-answer.png")
ph_root, ph_screen = lib.phone("Phone", (3.8, 0.2, 1.05), (math.radians(90), 0, math.radians(-40)), screen_home, body="#2a2c2f")
# Second screen on top, faded in for the answer.
ans = lib.plane("Phone.answer", 0.695, 0.695 * 2622 / 1206, (0, 0, 0.0436), (0, 0, 0), lib.image_material("Phone.ans", screen_answer, emit=0.92))
ans.parent = ph_root
ans_mat = ans.data.materials[0]
mix_alpha = ans_mat.node_tree.nodes.new("ShaderNodeMath")
mix_alpha.operation = "MULTIPLY"
nt = ans_mat.node_tree
img_node = [n for n in nt.nodes if n.type == "TEX_IMAGE"][0]
cut = [n for n in nt.nodes if n.type == "MIX_SHADER" and n.inputs["Fac"].is_linked and n.inputs["Fac"].links[0].from_node == img_node][0]
nt.links.new(img_node.outputs["Alpha"], mix_alpha.inputs[0])
nt.links.new(mix_alpha.outputs["Value"], cut.inputs["Fac"])
mix_alpha.inputs[1].default_value = 0.0
mix_alpha.inputs[1].keyframe_insert("default_value", frame=F(40.6))
mix_alpha.inputs[1].default_value = 1.0
mix_alpha.inputs[1].keyframe_insert("default_value", frame=F(41.1))
key(ph_root, "location", 34.8, (3.8, 0.2, 1.05))
key(ph_root, "rotation_euler", 34.8, (math.radians(90), 0, math.radians(-40)))
key(ph_root, "location", 36.4, (0.72, 0.2, 1.05))
key(ph_root, "rotation_euler", 36.4, (math.radians(90), 0, math.radians(-16)))
key(ph_root, "rotation_euler", 41.0, (math.radians(90), 0, math.radians(-8)))
key(ph_root, "location", 44.2, (0.72, 0.2, 1.05))
key(ph_root, "location", 45.1, (4.2, 0.4, 1.05))
key(ph_root, "rotation_euler", 45.1, (math.radians(90), 0, math.radians(-38)))

# 6. Every bank: ten tiles on a tilted ring around the orb.
ORB_BANKS = (0, 0.3, 1.0)
ball(0, 45.4, ORB_BANKS, 0.4)
ball(0, 50.6, ORB_BANKS, 0.4)
ring_empty = bpy.data.objects.new("BankRing", None)
s.collection.objects.link(ring_empty)
ring_empty.location = ORB_BANKS
ring_empty.rotation_euler = (math.radians(14), 0, 0)
ring_empty.keyframe_insert("rotation_euler", frame=F(45.0))
ring_empty.rotation_euler = (math.radians(14), 0, math.radians(110))
ring_empty.keyframe_insert("rotation_euler", frame=F(51.0))
BANKS = ["op", "nordea", "danske", "revolut", "handelsbanken", "aktia", "saastopankki", "pop", "omasp", "alandsbanken"]
tiles = []
for i, b in enumerate(BANKS):
    a = 2 * math.pi * i / len(BANKS)
    t = lib.logo_tile(f"Bank{i}", os.path.join(lib.TEX, f"logo-{b}.png"), (1.9 * math.cos(a), 1.9 * math.sin(a), 0), size=0.3)
    t.parent = ring_empty
    pop(t, 45.5 + 0.08 * i, 0.7)
    vanish(t, 49.9 + 0.03 * i, 0.5)
    tiles.append(t)

# 7. End: the orb above the title.
ball(0, 51.6, (0, 0.3, 1.32), 0.42)
ball(0, END, (0, 0.3, 1.32), 0.42)

# --------------------------------------------------------------------- camera
cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
s.collection.objects.link(cam)
s.camera = cam
aim = bpy.data.objects.new("Aim", None)
focus = bpy.data.objects.new("Focus", None)
s.collection.objects.link(aim)
s.collection.objects.link(focus)
tr = cam.constraints.new("TRACK_TO")
tr.target = aim
tr.track_axis = "TRACK_NEGATIVE_Z"
tr.up_axis = "UP_Y"
cam_data.dof.use_dof = True
cam_data.dof.focus_object = focus
cam_data.clip_start = 0.01

SHOTS = [
    # t, camera, aim, lens, focus point, f-stop
    (0.0, (0.05, -1.02, 0.98), (0, 0, 0.9), 50, (0, -0.5, 0.92), 2.8),
    (3.9, (0, -4.9, 1.0), (0, 0, 0.5), 50, (0, -0.45, 0.9), 2.8),
    (6.3, (0.2, -4.7, 1.02), (0, 0, 0.5), 50, (0, -0.45, 0.9), 2.8),
    (7.5, (-1.1, -4.0, 3.3), (-0.8, 0.4, 0.25), 32, (-2.6, 0.2, 0.3), 5.6),
    (13.4, (1.1, -4.0, 3.3), (0.8, 0.4, 0.25), 32, (2.6, 0.2, 0.3), 5.6),
    (14.7, (0, -6.5, 1.75), (0, 0.3, 0.68), 40, (0, 0.3, 0.6), 4.5),
    (22.4, (0, -6.2, 1.7), (0, 0.3, 0.68), 40, (0, 0.3, 0.6), 4.5),
    (23.3, (0.5, -5.2, 1.5), (0.9, 0.3, 0.5), 50, (1.6, 0.3, 0.35), 0.9),
    (25.8, (0.55, -5.05, 1.48), (0.9, 0.3, 0.5), 50, (1.6, 0.3, 0.35), 0.9),
    (26.6, (0, -6.0, 1.67), (0, 0.3, 0.68), 40, (0, 0.3, 0.6), 4.5),
    (28.5, (0, -5.9, 1.65), (0, 0.3, 0.75), 40, (0, 0.3, 0.9), 4.5),
    (29.8, (-0.5, -5.0, 1.25), (0.35, 0.3, 0.95), 40, (1.3, 0.3, 0.95), 2.8),
    (34.3, (-0.4, -4.85, 1.25), (0.35, 0.3, 0.95), 40, (1.3, 0.3, 0.95), 2.8),
    (35.6, (0, -4.15, 1.2), (0, 0.2, 1.05), 42, (0.7, 0.2, 1.05), 3.2),
    (40.9, (-0.12, -3.95, 1.2), (0, 0.2, 1.05), 42, (0.7, 0.2, 1.05), 3.2),
    (42.7, (0.3, -3.3, 1.12), (0.6, 0.2, 1.1), 42, (0.7, 0.2, 1.05), 3.2),
    (44.3, (0.33, -3.22, 1.12), (0.6, 0.2, 1.1), 42, (0.7, 0.2, 1.05), 3.2),
    (45.5, (0, -4.9, 1.5), (0, 0.3, 0.98), 40, (0, 0.3, 1.0), 3.5),
    (50.8, (0, -4.45, 1.42), (0, 0.3, 0.98), 40, (0, 0.3, 1.0), 3.5),
    (51.8, (0, -5.0, 0.98), (0, 0.3, 0.82), 40, (0, 0.3, 1.3), 3.5),
    (END, (0, -4.72, 0.98), (0, 0.3, 0.82), 40, (0, 0.3, 1.3), 3.5),
]
for t, c, a, lens, fp, fs in SHOTS:
    key(cam, "location", t, c)
    key(aim, "location", t, a)
    key(focus, "location", t, fp)
    key(cam_data, "lens", t, lens)
    key(cam_data.dof, "aperture_fstop", t, fs)

# Cards: face the camera, pop up over their print, then fly into their basket.
for i, (root, t_in, pos, b) in enumerate(cards):
    c = root.constraints.new("TRACK_TO")
    c.target = cam
    c.track_axis = "TRACK_Z"
    c.up_axis = "UP_Y"
    key(root, "location", t_in, pos)
    pop(root, t_in, 0.6)
    key(root, "location", 14.9 + 0.06 * i, (pos[0], pos[1], pos[2] + 0.06))
    bx, by, br = BASKETS[b]
    key(root, "location", 16.1 + 0.06 * i, (bx, by, br + 0.1))
    key(root, "scale", 14.9 + 0.06 * i, (1, 1, 1))
    key(root, "scale", 16.1 + 0.06 * i, (0, 0, 0))
for t in tiles:
    c = t.constraints.new("TRACK_TO")
    c.target = cam
    c.track_axis = "TRACK_Z"
    c.up_axis = "UP_Y"

lib.glow(1.0, 0.35, 0.6)

# Where things land on screen, for the HTML overlay.
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402


def screen_at(t, world):
    s.frame_set(F(t))
    v = world_to_camera_view(s, cam, Vector(world))
    return [round(v.x * 1920), round((1 - v.y) * 1080)]


marks = {
    "baskets": [screen_at(20.0, (bx, by, 0)) for bx, by, _ in BASKETS],
    "orb_bench": screen_at(31.0, (1.3, 0.3, 0.95)),
    "orb_phone_top": screen_at(38.0, (ORB_PHONE[0], ORB_PHONE[1], ORB_PHONE[2] + 0.34)),
    "orb_banks": screen_at(48.0, ORB_BANKS),
    "orb_end_bottom": screen_at(54.0, (0, 0.3, 1.32 - 0.42)),
    "orb_open_bottom": screen_at(5.0, (0, 0, 0.9 - 0.5)),
    "trail_cards": [screen_at(c[1] + 1.0, c[2]) for c in cards],
}
print("MARKS", json.dumps(marks))
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "marks.json"), "w") as f:
    json.dump(marks, f)

if MODE == "stills":
    for t in (json.loads(os.environ["STILLS"]) if os.environ.get("STILLS") else [0.8, 4.6, 10.5, 15.8, 17.6, 20.6, 24.0, 27.4, 31.5, 38.0, 42.9, 47.6, 54.0]):
        lib.render_still(os.path.join(OUT, f"still-{t:05.1f}.png"), frame=F(t))
elif MODE == "anim":
    a = float(ARGS[2]) if len(ARGS) > 2 else 0
    b = float(ARGS[3]) if len(ARGS) > 3 else END
    s.frame_start, s.frame_end = F(a), min(F(b), F(END) - 1)
    s.eevee.taa_render_samples = 32
    # Several processes can share the work: each skips frames another has claimed.
    s.render.use_overwrite = False
    s.render.use_placeholder = True
    s.render.image_settings.file_format = "PNG"
    if os.environ.get("PREVIEW"):
        # A quick animatic: half size, few samples, its own folder.
        s.render.resolution_percentage = 50
        s.eevee.taa_render_samples = 8
        s.render.filepath = os.path.join(OUT, "pframes", "p_")
    else:
        s.render.filepath = os.path.join(OUT, "frames", "f_")
    bpy.ops.render.render(animation=True)
