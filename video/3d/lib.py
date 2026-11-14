"""Building blocks for the Penni film in Blender 5.2 (run headless: blender -b -P shot.py)."""

import math
import os

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "draft", "assets")
TEX = os.path.join(HERE, "tex")
FONT = "/System/Library/Fonts/SFNS.ttf"


def lin(hexstr, a=1.0):
    """sRGB hex -> linear RGBA (node colours are scene-linear)."""
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i : i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, a)


# The app's greens.
DEEP, MID, BRIGHT, MINT = "#007841", "#00AA46", "#00EB5A", "#91FA9B"


def reset(fps=30, frames=1, res=(1920, 1080)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    s.render.resolution_x, s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.render.fps = fps
    s.frame_start, s.frame_end = 1, frames
    e = s.eevee
    e.taa_render_samples = 96
    e.use_raytracing = True
    e.ray_tracing_method = "SCREEN"
    e.use_fast_gi = True
    e.use_shadows = True
    e.shadow_ray_count = 2
    e.shadow_step_count = 8
    # Standard keeps the brand greens true; highlights are kept below clipping by hand.
    s.view_settings.view_transform = "Standard"
    s.view_settings.look = "None"
    s.render.film_transparent = False
    return s


def world(color, strength=1.0):
    w = bpy.data.worlds.new("World")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = color
    bg.inputs["Strength"].default_value = strength
    return w


def material(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m, m.node_tree.nodes, m.node_tree.links


def principled(name, color, rough=0.4, metal=0.0, coat=0.0, emit=None, emit_strength=0.0, alpha=1.0):
    m, n, l = material(name)
    p = n["Principled BSDF"]
    p.inputs["Base Color"].default_value = color
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = 0.04
    if emit is not None:
        p.inputs["Emission Color"].default_value = emit
        p.inputs["Emission Strength"].default_value = emit_strength
    p.inputs["Alpha"].default_value = alpha
    return m


def orb_material(emit_strength=1.5, speed=0.35, name="Orb", radius=1.0):
    """The app's orb in 3D: domain-warped noise mapped onto the four greens, a glossy coat,
    a bright rim, and its own light."""
    m, n, l = material(name)
    p = n["Principled BSDF"]
    tc = n.new("ShaderNodeTexCoord")
    mp = n.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / radius, 1 / radius, 1 / radius)
    l.new(tc.outputs["Object"], mp.inputs["Vector"])
    warp = n.new("ShaderNodeTexNoise")
    warp.noise_dimensions = "4D"
    warp.inputs["Scale"].default_value = 1.4
    warp.inputs["Detail"].default_value = 3.0
    warp.inputs["Distortion"].default_value = 0.4
    mix = n.new("ShaderNodeMix")
    mix.data_type = "VECTOR"
    mix.inputs["Factor"].default_value = 0.55
    noise = n.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 1.9
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.55
    ramp = n.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.36, lin(DEEP)
    els[1].position, els[1].color = 0.8, lin(MINT)
    e2 = els.new(0.5)
    e2.color = lin(MID)
    e3 = els.new(0.64)
    e3.color = lin(BRIGHT)
    lw = n.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.22
    rim = n.new("ShaderNodeMix")
    rim.data_type = "RGBA"
    rim.inputs["B"].default_value = lin(BRIGHT)
    l.new(mp.outputs["Vector"], warp.inputs["Vector"])
    l.new(mp.outputs["Vector"], mix.inputs["A"])
    l.new(warp.outputs["Color"], mix.inputs["B"])
    l.new(mix.outputs["Result"], noise.inputs["Vector"])
    l.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    l.new(ramp.outputs["Color"], rim.inputs["A"])
    l.new(lw.outputs["Facing"], rim.inputs["Factor"])
    l.new(rim.outputs["Result"], p.inputs["Base Color"])
    l.new(rim.outputs["Result"], p.inputs["Emission Color"])
    p.inputs["Emission Strength"].default_value = emit_strength
    p.inputs["Roughness"].default_value = 0.3
    p.inputs["Coat Weight"].default_value = 1.0
    p.inputs["Coat Roughness"].default_value = 0.03
    # The surface flows: W follows the frame.
    for node in (warp, noise):
        fc = node.inputs["W"].driver_add("default_value")
        fc.driver.expression = f"frame / 30 * {speed}"
    return m


def sphere(name, radius, loc, mat=None, segments=96, emit=1.1):
    mat = mat or orb_material(emit, radius=radius, name=name + ".mat")
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=segments, ring_count=segments // 2)
    o = bpy.context.object
    o.name = name
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


def rounded_box(name, size, bevel, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, segments=10):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    b = o.modifiers.new("Bevel", "BEVEL")
    b.width = bevel
    b.segments = segments
    b.limit_method = "NONE"
    b.harden_normals = False
    bpy.ops.object.shade_smooth()
    if mat:
        o.data.materials.append(mat)
    return o


def image_material(name, path, emit=0.95, gloss=True):
    """An image shown as a screen: unlit emission (true colours), a faint glass reflection
    towards grazing angles, transparent where the image is."""
    m, n, l = material(name)
    n.remove(n["Principled BSDF"])
    out = n["Material Output"]
    img = n.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(path, check_existing=True)
    img.interpolation = "Cubic"
    em = n.new("ShaderNodeEmission")
    em.inputs["Strength"].default_value = emit
    l.new(img.outputs["Color"], em.inputs["Color"])
    glossy = n.new("ShaderNodeBsdfGlossy")
    glossy.inputs["Roughness"].default_value = 0.05
    lw = n.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.08 if gloss else 0.0
    face = n.new("ShaderNodeMixShader")
    l.new(lw.outputs["Fresnel"], face.inputs["Fac"])
    l.new(em.outputs["Emission"], face.inputs[1])
    l.new(glossy.outputs["BSDF"], face.inputs[2])
    tr = n.new("ShaderNodeBsdfTransparent")
    cut = n.new("ShaderNodeMixShader")
    l.new(img.outputs["Alpha"], cut.inputs["Fac"])
    l.new(tr.outputs["BSDF"], cut.inputs[1])
    l.new(face.outputs["Shader"], cut.inputs[2])
    l.new(cut.outputs["Shader"], out.inputs["Surface"])
    try:
        m.surface_render_method = "BLENDED"
    except Exception:
        pass
    return m


def plane(name, w, h, loc, rot, mat):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (w, h, 1)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    return o


def rrect_loop(w, h, r, n=12):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def slab(name, w, h, r, depth, mat, bevel):
    o = outline_mesh(name, [rrect_loop(w, h, r)], depth, mat, bevel=bevel)
    o.modifiers["Bevel"].segments = 8
    for v in o.data.vertices:
        v.co.z -= depth / 2
    return o


def phone(name, loc, rot, screen_path, body="#1b1c1e", scale=1.0):
    """An iPhone-like slab: titanium-dark body with rounded edges, black glass, the app on screen."""
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    root.location = loc
    root.rotation_euler = rot
    root.scale = (scale, scale, scale)
    w, h, d = 0.74, 1.6, 0.08
    frame = slab(f"{name}.body", w, h, 0.125, d, principled(f"{name}.ti", lin(body), rough=0.3, metal=1.0, coat=0.3), 0.022)
    glass = slab(f"{name}.glass", w - 0.016, h - 0.016, 0.118, 0.004, principled(f"{name}.black", lin("#030303"), rough=0.05, coat=1.0), 0.0015)
    glass.location.z = d / 2
    scr = plane(f"{name}.screen", w - 0.045, (w - 0.045) * 2622 / 1206, (0, 0, d / 2 + 0.0035), (0, 0, 0), image_material(f"{name}.scr", screen_path, emit=0.92))
    for o in (frame, glass, scr):
        o.parent = root
    return root, scr


def logo_tile(name, logo_path, loc, size=0.5):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    root.location = loc
    card = slab(f"{name}.card", size, size, size * 0.24, size * 0.1, principled(f"{name}.white", lin("#f4f6f4"), rough=0.22, coat=0.8), size * 0.03)
    face = plane(f"{name}.logo", size * 0.74, size * 0.74, (0, 0, size * 0.052), (0, 0, 0), image_material(f"{name}.img", logo_path, emit=0.95, gloss=False))
    card.parent = root
    face.parent = root
    return root


def outline_mesh(name, loops, depth, mat, bevel=0.01):
    """Flat shapes from point loops (x, y), extruded and softly bevelled."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for pts in loops:
        verts = [bm.verts.new((x, y, 0)) for x, y in pts]
        bm.faces.new(verts)
    geom = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for v in [g for g in geom["geom"] if isinstance(g, bmesh.types.BMVert)]:
        v.co.z += depth
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    b = o.modifiers.new("Bevel", "BEVEL")
    b.width = bevel
    b.segments = 6
    b.limit_method = "ANGLE"
    o.data.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = True
    return o


def shoe_loops(length=0.32, mirror=False, n=64):
    """A shoe print: an egg-shaped sole (wider at the toe) and an oval heel."""
    s = length / 0.95
    sole, heel = [], []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 0.17 * math.cos(t) * (0.8 + 0.2 * math.sin(t))
        y = 0.12 + 0.33 * math.sin(t)
        sole.append((x * s * (-1 if mirror else 1), y * s))
    for i in range(n // 2):
        t = 2 * math.pi * i / (n // 2)
        heel.append((0.115 * math.cos(t) * s * (-1 if mirror else 1), (-0.36 + 0.11 * math.sin(t)) * s))
    if mirror:
        sole.reverse()
        heel.reverse()
    return [sole, heel]


def text(name, body, size, loc, rot=(math.radians(90), 0, 0), mat=None, align="LEFT", extrude=0.0):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.extrude = extrude
    try:
        cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    except Exception:
        pass
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    if mat:
        o.data.materials.append(mat)
    return o


def light(kind, name, loc, energy, color=(1, 1, 1), size=1.0, rot=(0, 0, 0), shadow=True):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy
    d.color = color
    if kind == "AREA":
        d.size = size
        d.shape = "DISK"
    elif kind in ("POINT", "SPOT"):
        d.shadow_soft_size = size
    d.use_shadow = shadow
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    return o


def camera(loc, target, lens=50, fstop=None, focus=None):
    d = bpy.data.cameras.new("Cam")
    d.lens = lens
    o = bpy.data.objects.new("Cam", d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    direction = Vector(target) - Vector(loc)
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    if fstop:
        d.dof.use_dof = True
        d.dof.aperture_fstop = fstop
        d.dof.focus_distance = focus if focus else direction.length
    bpy.context.scene.camera = o
    return o


def glow(threshold=0.9, strength=0.45, size=0.6, kind="Fog Glow"):
    """Soft bloom in the compositor (Blender 5 node-group compositor)."""
    s = bpy.context.scene
    ng = bpy.data.node_groups.new("Comp", "CompositorNodeTree")
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    s.compositing_node_group = ng
    rl = ng.nodes.new("CompositorNodeRLayers")
    g = ng.nodes.new("CompositorNodeGlare")
    g.inputs["Type"].default_value = kind
    g.inputs["Quality"].default_value = "High"
    g.inputs["Threshold"].default_value = threshold
    g.inputs["Strength"].default_value = strength
    g.inputs["Size"].default_value = size
    out = ng.nodes.new("NodeGroupOutput")
    ng.links.new(rl.outputs["Image"], g.inputs["Image"])
    ng.links.new(g.outputs["Image"], out.inputs[0])


def render_still(path, frame=1):
    s = bpy.context.scene
    s.frame_set(frame)
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
