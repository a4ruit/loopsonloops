/* --------------------------------------------------------------------
   THE MASSING
   Five models exported from one scene: four neighbours and the venue.
   They share an export origin, so their positions relative to each other
   are already in the geometry — nothing is placed by hand here. The whole
   group is then shifted so that KALEIDE sits at the origin, which is what
   makes every other building's position relative to it.

   The sequence is scrolled rather than played: it advances with the page,
   so a visitor assembles the site themselves instead of watching a clip
   that may have finished before they looked. The four neighbours fall into
   place one after another, and only once they have settled does the venue
   appear among them.
   -------------------------------------------------------------------- */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
/* WebGL ignores line widths above a single pixel, so the edges are drawn
   as camera-facing strips instead — which is what makes a weight settable
   at all */
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
/* the street names are real HTML standing on the ground plane: that keeps
   them out of the canvas, and so out of reach of the fog that blurs it,
   while still taking the same perspective the buildings do */
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

/* ======================================================================
   SETTINGS — everything meant to be tuned lives here.
   ====================================================================== */

const VIEW = {
  /* THE CAMERA ANGLE.
     Think of walking around the block and then climbing: ORBIT swings
     around it, PITCH rises above it. Both in degrees. */
  ORBIT: -16,   // around the block: 0 looks along +Z, negative swings left
  PITCH: 22,    // above it: 0 is eye level on the ground, 90 is straight down

  /* THE FRAMING.
     FILL is how much of the frame the block takes up — .9 leaves a tenth
     of the shorter side as margin. Raise it to crop in, lower it to pull
     back. FOV is the lens: small is long and flat, large is wide and more
     dramatically perspectival. */
  FILL: .8,
  FOV: 34
};

/* THE STREETS.
   Painted on the ground along the block's two outer edges, lying flat so
   they take the same perspective the buildings do — the long edge is
   Swanston, the short one La Trobe. */
const STREET = {
  OPACITY: .6,

  /* SIZE is the length of the name as a share of the edge it runs along:
     1 spans that whole edge, .5 is half of it. ANGLE turns the name on the
     ground, in degrees, away from running parallel to its edge — positive
     swings it one way, negative the other. OFFSET pushes it away from the
     block, across its edge; SHIFT slides it along that edge, which is how
     a name is moved up or down the street it belongs to. Both are in the
     same world units the models are built in. */
  LONG:  { TEXT: 'Swanston St', SIZE: .35, ANGLE: 22, OFFSET: -30, SHIFT: 40 },
  SHORT: { TEXT: 'La Trobe St', SIZE: .42, ANGLE: 21, OFFSET: -2, SHIFT: 40 }
};

/* THE FOG.
   Patches of haze gathered around the outside of the complex, thinning
   toward its middle, so the block's edges dissolve into the page while the
   venue at its centre stays clear. They are scattered rather than placed,
   but from a fixed seed — the same arrangement every visit, so it reads as
   a property of the site rather than as something flickering about. How
   heavy the blur itself gets is --fog-max in the stylesheet. */
const FOG = {
  COUNT: 16,     // how many patches ring the complex
  REACH: 1,      // where they sit, as a share of the block's extent on screen
  DRIFT: .34,    // how far in from that ring they are allowed to wander
  SIZE: .3,      // a patch's radius, as a share of the block's
  VARY: .5       // how much the patches differ in size
};

/* HOW THE BUILDINGS ARE DRAWN.
   The venue is the subject; the neighbours are context, so they settle
   back to a lower opacity and let it read as solid among them. Every
   building keeps its edges at full strength, which is what holds the
   massing legible once the faces go translucent. */
const STYLE = {
  VENUE_FACE: 1,        // the venue's faces, once settled
  OTHER_FACE: .19,      // the surrounding buildings' faces
  VENUE_EDGE: 1,        // the venue's outline
  OTHER_EDGE: .62,      // the surrounding buildings' outlines

  /* An edge that lies behind a face is drawn far weaker than one on the
     near side. Without this every edge in the model arrives at the same
     strength and the massing reads as a wireframe tangle rather than as
     solids; this is what gives it a front and a back. */
  INNER_EDGE: .1,       // hidden edges, as a share of that building's outline

  EDGE_WIDTH: 1.5,      // in screen pixels, at any zoom
  EDGE_ANGLE: 24        // degrees — only creases sharper than this get a line,
                        // so flat panels stay clean and corners are drawn
};

/* THE BREATH.
   The surrounding buildings' near edges rise and fall slowly, so the block
   sits there alive rather than frozen — the same ambient drift the title's
   letters have. The venue does not breathe: it stays steady, which is part
   of what separates it from its context. */
const BREATHE = {
  DEPTH: .45,     // how far the outline dips: 0 is off, 1 fades out entirely
  PERIOD: 6,      // seconds for one full rise and fall
  SPREAD: .55     // how far apart the buildings are in their cycle
};

/* THE SHAPE OF THE SEQUENCE, in abstract beats. The scroll band below is
   what these are stretched across, so changing one changes the proportion
   of the sequence it occupies, not how long the whole thing takes. */
const BEATS = {
  FALL: 1.15,     // beats for one building to land
  STAGGER: .26,   // the gap between one building starting and the next
  SETTLE: .35,    // the pause after the last one, before the venue
  VENUE: 1.3,     // the venue's own arrival
  DROP: .34       // how far a building falls, as a share of its height
};

/* THE MASSING'S SHARE OF THE JOURNEY, in page progress (0 is the top of
   the page, 1 the bottom). Widening FROM→TO is what slows the assembly
   down: it is the same sequence spread over more scrolling. It must end
   before the statement's first word, which index.html sets at .28. */
const BAND = {
  FROM: .012,   // the first building starts to fall
  TO:   .205,   // the venue has arrived; the block is complete
  HOLD: .235,   // it is held complete, to be looked at
  OUT:  .268    // and has gone
};

/* ===================================================================== */

(function () {
  const holder = document.getElementById('scene');
  const canvas = document.getElementById('scene-c');
  if (!holder || !canvas) return;

  // the fog now lives inside the scene, so the scene alone carries the fade
  const layers = [holder];

  const { FALL, STAGGER, SETTLE, VENUE, DROP } = BEATS;
  const { FROM: SCENE_FROM, TO: SCENE_TO, HOLD: SCENE_HOLD, OUT: SCENE_OUT } = BAND;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VIEW.FOV, 1, .1, 100000);

  /* flat ambient plus one raking key: enough to read the massing as solid
     volumes without pretending to be an architectural render */
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(-1, 2.2, 1.4);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);

  const loader = new GLTFLoader();
  const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));

  const FILES = [
    'media/glb/building1.glb',
    'media/glb/building2.glb',
    'media/glb/building3.glb',
    'media/glb/building4.glb',
    'media/glb/kaleide.glb'
  ];

  /* Each building is named from its own file, so the annotations cannot
     drift out of step with the models they point at — adding building5.glb
     to the list above is all it would take to have it labelled. */
  const nameOf = url => {
    const stem = url.split('/').pop().replace(/\.glb$/i, '');
    if (stem === 'kaleide') return 'Kaleide Theatre';
    const n = stem.match(/(\d+)$/);
    return n ? 'Building ' + n[1] : stem;
  };

  let parts = [];        // one entry per model: its root, its fall, its materials
  const lineMats = [];   // every outline, which needs the pixel size to draw
  let bounds = null;     // the whole block's box, for framing

  function edgeMaterial(occluded) {
    const m = new LineMaterial({
      color: 0xffffff,
      linewidth: STYLE.EDGE_WIDTH,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: occluded
    });
    if (occluded) {
      // pulled a hair toward the camera so an edge is not lost in the face
      // it sits on
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
    }
    lineMats.push(m);
    return m;
  }
  let ready = false;

  Promise.all(FILES.map(load)).then(gltfs => {
    const roots = gltfs.map(g => g.scene);

    // the venue is the last file, and the one everything else is measured from
    const venue = roots[roots.length - 1];
    const venueMid = new THREE.Box3().setFromObject(venue).getCenter(new THREE.Vector3());

    roots.forEach(r => group.add(r));
    // every building's position is now expressed relative to the venue
    group.position.sub(venueMid);

    const union = new THREE.Box3().setFromObject(group);
    const size = union.getSize(new THREE.Vector3());
    const mid = union.getCenter(new THREE.Vector3());

    parts = roots.map((root, i) => {
      const isVenue = i === roots.length - 1;
      const box = new THREE.Box3().setFromObject(root);
      const mats = [];
      const edges = [];

      /* Collected first, then processed. Outlines are added as children of
         the meshes they belong to, and an outline is itself a kind of mesh
         — so adding them during the walk would have the walk find its own
         output and never finish. */
      const meshes = [];
      root.traverse(o => { if (o.isMesh) meshes.push(o); });

      const level = isVenue ? STYLE.VENUE_FACE : STYLE.OTHER_FACE;

      meshes.forEach(o => {
        // a shared material would fade every building at once
        o.material = o.material.clone();

        /* The exported materials are near-black, which on an ink ground is
           invisible. The massing is read here as form, not as surface, so
           the volumes are given the page's own paper and left to the key
           light for their modelling.

           A building sits back by being DARKER rather than more see-through.
           Over this ground the two look the same, but they behave entirely
           differently where the model has surfaces lying on top of one
           another: translucent ones blend twice and come out patchy, while
           a solid one simply draws whichever surface is in front. */
        o.material.color = new THREE.Color().setScalar(level);
        if ('roughness' in o.material) o.material.roughness = .85;
        if ('metalness' in o.material) o.material.metalness = 0;
        o.material.transparent = true;    // only while it is arriving
        o.material.opacity = 0;
        o.material.depthWrite = true;

        /* Strictly nearer, not nearer-or-equal: where the modeller has left
           two faces in the same place, the first one drawn keeps the pixel
           and the second is rejected outright. Nearer-or-equal would let
           them trade the pixel back and forth on sub-unit depth differences,
           which is the speckling those overlaps produce. */
        o.material.depthFunc = THREE.LessDepth;
        mats.push(o.material);

        const outline = new LineSegmentsGeometry().fromEdgesGeometry(
          new THREE.EdgesGeometry(o.geometry, STYLE.EDGE_ANGLE));

        /* The same outline is drawn twice: once ignoring depth, which
           reaches the edges buried inside and behind the block, and once
           respecting it, which can only reach the edges facing us. The
           first is held far back, the second carries the drawing. */
        const back = edgeMaterial(false);
        const front = edgeMaterial(true);

        [[back, 0], [front, 1]].forEach(([m, order]) => {
          const seg = new LineSegments2(outline, m);
          seg.renderOrder = order;
          seg.frustumCulled = false;  // its bounds are not the strips' bounds
          o.add(seg);
        });

        edges.push({ back, front });
      });

      return {
        root, mats, edges, isVenue, box,
        tag: makeTag(nameOf(FILES[i]), isVenue),
        edge: isVenue ? STYLE.VENUE_EDGE : STYLE.OTHER_EDGE,
        phase: i * BREATHE.SPREAD,
        rest: root.position.y,
        fall: Math.max(size.y * DROP, box.getSize(new THREE.Vector3()).y * DROP)
      };
    });

    // nothing is visible until its own moment in the sequence
    parts.forEach(p => { p.root.visible = false; });

    /* Framing by bounding sphere badly overshoots here: the block is long
       on Z, and from this angle that length runs into the screen, so most
       of the sphere is depth the camera never has to fit. Instead the eight
       corners of the box are projected and the distance is pulled in until
       the widest of them reaches the edge of the frame. */
    bounds = { box: union, mid };
    // laid after the block is measured, so the street names cannot enlarge
    // the box the camera and the fog are both framed against
    layStreets(union, size, mid);
    reframe();

    ready = true;
    resize();
    sync(window.__progress ? window.__progress() : 0);
  }).catch(err => {
    // a failed load leaves the stage as it was rather than a broken frame
    console.warn('massing: could not load', err);
    holder.style.display = 'none';
  });

  /* the direction the camera sits in, from the block's own centre, built
     from the two angles in VIEW rather than from a hand-tuned vector */
  const az = VIEW.ORBIT * Math.PI / 180;
  const el = VIEW.PITCH * Math.PI / 180;
  const aim = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el)
  ).normalize();

  const FILL = VIEW.FILL;

  function frameDist(box, mid, start) {
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z));

    let d = start;
    // a few passes, because moving the camera changes the projection it is
    // being measured against
    for (let pass = 0; pass < 6; pass++) {
      camera.position.copy(aim.clone().multiplyScalar(d).add(mid));
      camera.lookAt(mid);
      camera.near = d / 100;
      camera.far = d * 10;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);

      let worst = 0;
      for (const c of corners) {
        const n = c.clone().project(camera);
        worst = Math.max(worst, Math.abs(n.x), Math.abs(n.y));
      }
      if (!worst) break;
      d *= worst / FILL;
    }
    return d;
  }

  // the frame depends on the shape of the viewport, so it is recomputed
  // whenever that changes rather than fixed at load
  function reframe() {
    if (!bounds) return;
    const d = frameDist(bounds.box, bounds.mid, 480);
    camera.position.copy(aim.clone().multiplyScalar(d).add(bounds.mid));
    camera.lookAt(bounds.mid);
    measureFog();
  }

  /* THE STREETS
     Set in type on a canvas and laid on the ground as a flat plane, rather
     than drawn over the scene. That is the whole point of them: a street
     name belongs to the ground, so it has to recede with it — a label in
     screen space would sit flat against the viewer and read as a caption
     instead of as a street. */
  const streets = [];
  const ground = document.getElementById('ground');
  const css = ground ? new CSS3DRenderer() : null;
  if (css) ground.append(css.domElement);

  // the element is authored at a readable pixel size and then scaled down
  // into world units, which is what keeps the type sharp at any zoom
  const STREET_PX = 640;

  function streetName(cfg, span, lie, at) {
    const el = document.createElement('div');
    el.className = 'street';
    el.textContent = cfg.TEXT;
    el.style.width = STREET_PX + 'px';
    el.style.opacity = '0';

    const obj = new CSS3DObject(el);
    const s = span * cfg.SIZE / STREET_PX;
    obj.scale.set(s, s, s);

    at(obj, cfg.OFFSET, cfg.SHIFT);
    /* Rotations read right to left: the name is first turned within its own
       plane — by the angle its edge needs, plus whatever ANGLE asks for on
       top — and that plane is then laid down onto the ground. */
    obj.rotation.set(-Math.PI / 2, 0, lie + cfg.ANGLE * Math.PI / 180);
    /* added to the scene, not to the group: these are placed in world
       coordinates, and the group carries the shift that put the venue at
       the origin — parenting them to it would apply that shift twice */
    scene.add(obj);
    streets.push(el);
    return obj;
  }

  function layStreets(union, size, mid) {
    // just under the block, so the type never pokes through a floor slab
    const floor = union.min.y - 1;
    if (!css) return;

    /* OFFSET crosses the edge, SHIFT runs along it: for the long street
       that means out in X and along in Z, and the other way round for the
       short one. */
    streetName(STREET.LONG, size.z, -Math.PI / 2, (o, out, along) => {
      o.position.set(union.min.x - out, floor, mid.z + along);
    });

    streetName(STREET.SHORT, size.x, 0, (o, out, along) => {
      o.position.set(mid.x + along, floor, union.max.z + out);
    });
  }

  /* THE ANNOTATIONS
     A leader off the top of each building, rising away from the block and
     running out to its name. Drawn in SVG over the canvas rather than in
     the scene, so the type is the page's own and stays crisp at any zoom
     instead of being rasterised with the model. */
  const annot = document.getElementById('annot');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const allTags = [];

  const TAG = {
    RISE: 26,   // px the leader climbs straight up from the building
    RUN: 42,    // px it then runs flat, out to the text
    GAP: 7,     // px between the end of the leader and the first letter
    EDGE: 6,    // px of the canvas a label must always stay clear of
    STEP: 9,    // px a label moves each time it looks for clear air
    REACH: 12   // how many of those steps it may try before settling
  };

  function makeTag(label, isVenue) {
    if (!annot) return null;
    const g = document.createElementNS(SVGNS, 'g');
    if (isVenue) g.setAttribute('class', 'here');
    const line = document.createElementNS(SVGNS, 'polyline');
    const text = document.createElementNS(SVGNS, 'text');
    text.textContent = label;
    g.append(line, text);
    annot.append(g);
    // w and h are filled in on first layout and kept until the type could
    // have changed size — measuring text forces a reflow, and this runs on
    // every frame the massing breathes
    const t = { g, line, text, w: null, h: null };
    allTags.push(t);
    return t;
  }

  // a label's anchor, collected during the pose and laid out afterwards
  const pending = [];

  function placeTag(p, anchor, alpha) {
    const t = p.tag;
    if (!t) return;
    if (alpha <= .01) { t.g.style.display = 'none'; return; }
    t.g.style.display = '';
    t.g.style.opacity = alpha.toFixed(2);

    const n = anchor.clone().project(camera);
    pending.push({
      t,
      x: (n.x * .5 + .5) * canvas.clientWidth,
      y: (1 - (n.y * .5 + .5)) * canvas.clientHeight
    });
  }

  // how much of two rectangles share the same ground, in square pixels
  const overlap = (a, b) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
    Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

  /* Laid out together rather than one at a time, because a label's position
     is not its own business: it has to clear the frame, the buildings, and
     every label already placed. Flipping a leader inward to escape the edge
     was the earlier fix and it was the wrong one — it bought room by laying
     the name across the model it was pointing at.

     So the side is kept, always turning outward from the block, and the
     label is moved UP or DOWN instead until it finds clear air. Vertical
     room is the one thing a tall narrow screen has plenty of. */
  function layoutTags() {
    if (!pending.length || !bounds) { pending.length = 0; return; }
    const W = canvas.clientWidth, H = canvas.clientHeight;

    const px = (b) => {
      const s = onScreen(b);
      return {
        x0: (s.cx - s.rx) / 100 * W, x1: (s.cx + s.rx) / 100 * W,
        y0: (s.cy - s.ry) / 100 * H, y1: (s.cy + s.ry) / 100 * H
      };
    };

    /* The buildings are avoided one by one, not as a single block. The
       complex is a diagonal band, so a box drawn round the whole of it is
       mostly empty air — treating that as solid left almost nowhere near a
       building free, and labels were being thrown to the far edges of the
       canvas looking for room that was beside them all along. */
    const solid = parts.filter(p => p.root.visible).map(p => px(p.box));

    const whole = px(bounds.box);
    const blockMidX = (whole.x0 + whole.x1) / 2;
    const blockMidY = (whole.y0 + whole.y1) / 2;

    // highest first, so the stack resolves in a stable reading order
    pending.sort((a, b) => a.y - b.y);
    const taken = [];

    for (const item of pending) {
      const { t, x, y } = item;
      if (t.w == null) {
        const b = t.text.getBBox();
        t.w = b.width;
        // the real line box, not an assumed one: guessing it short is what
        // lets two labels end up touching
        t.h = b.height;
      }
      const wide = t.w, half = t.h / 2 + 2;
      const side = x < blockMidX ? -1 : 1;

      /* One candidate placement at a given height.

         The leader is squared off: it rises straight up from the building,
         turns once, and runs flat to the name. No diagonals — which also
         makes a reversal impossible by construction, since a single
         horizontal segment cannot double back on itself however far the
         frame clamps it.

         The label's position is settled FIRST, pushed out from the building
         and then clamped into the frame, and the leader is drawn to wherever
         it ended up. */
      const at = (by) => {
        const lo = TAG.EDGE + (side > 0 ? 0 : wide);
        const hi = W - TAG.EDGE - (side > 0 ? wide : 0);
        const tx = Math.max(lo, Math.min(hi, x + side * (TAG.RUN + TAG.GAP)));

        const ex = tx - side * TAG.GAP;
        const flat = Math.abs(by - y) < .5;   // already level: no turn to make

        const points = flat
          ? `${x.toFixed(1)},${y.toFixed(1)} ${ex.toFixed(1)},${by.toFixed(1)}`
          : `${x.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${by.toFixed(1)} ${ex.toFixed(1)},${by.toFixed(1)}`;

        return {
          by, tx, points,
          box: {
            x0: (side > 0 ? tx : tx - wide) - 3,
            x1: (side > 0 ? tx + wide : tx) + 3,
            y0: by - half,
            y1: by + half
          }
        };
      };

      /* Rather than taking the first position that happens to be clear, each
         candidate is scored and the best one wins. A label that cannot be
         perfectly clear should sit slightly over a building near the one it
         names, not travel half the canvas to find empty space — so distance
         from home is part of the cost. */
      let best = null, bestCost = Infinity;

      for (let step = 0; step <= TAG.REACH; step++) {
        const away = Math.ceil(step / 2) * TAG.STEP * (step % 2 ? -1 : 1);
        const by = y - TAG.RISE + away;
        if (by < TAG.EDGE + half || by > H - TAG.EDGE - half) continue;

        const c = at(by);
        let cost = Math.abs(away) * .6;                 // how far it strayed
        for (const r of solid) cost += overlap(c.box, r) * .02;
        for (const r of taken) cost += overlap(c.box, r) * .35;  // worse

        if (cost < bestCost) { bestCost = cost; best = c; }
        if (!cost) break;                               // nothing beats clear
      }

      // every height was off the canvas: stay home and let the frame clamp
      if (!best) {
        best = at(Math.max(TAG.EDGE + half,
          Math.min(H - TAG.EDGE - half, y - TAG.RISE)));
      }

      taken.push(best.box);
      t.line.setAttribute('points', best.points);
      t.text.setAttribute('x', best.tx.toFixed(1));
      t.text.setAttribute('y', best.by.toFixed(1));
      t.text.setAttribute('text-anchor', side < 0 ? 'end' : 'start');
    }

    pending.length = 0;
  }

  // where a box lands on the canvas, in per-cent of it
  function onScreen(b) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) {
      const n = new THREE.Vector3(
        i & 1 ? b.max.x : b.min.x,
        i & 2 ? b.max.y : b.min.y,
        i & 4 ? b.max.z : b.min.z).project(camera);
      const x = (n.x * .5 + .5) * 100;
      const y = (1 - (n.y * .5 + .5)) * 100;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
  }

  /* a small fixed-seed generator, so the scatter is irregular but identical
     on every visit and on every re-measure */
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* The fog is not one wash over the block but many small patches ringing
     it, each measured against where the complex actually falls on the
     canvas. Ringing it is the point: the haze is dense around the outside,
     thins as it works inward, and never reaches the venue at the centre —
     the block dissolves at its edges and resolves at its subject.

     CSS composites a list of mask layers by addition, so overlapping
     patches simply build up into a heavier bank of fog. */
  function measureFog() {
    if (!bounds) return;
    camera.updateMatrixWorld(true);

    const s = onScreen(bounds.box);
    const rnd = seeded(20261028);
    const wide = [], core = [];

    for (let i = 0; i < FOG.COUNT; i++) {
      // stepped around the ring rather than placed at random, so no stretch
      // of the perimeter is left bare, then nudged off that step
      const a = (i + (rnd() - .5) * .8) / FOG.COUNT * Math.PI * 2;
      const out = FOG.REACH * (1 - FOG.DRIFT * rnd());

      const cx = s.cx + s.rx * out * Math.cos(a);
      const cy = s.cy + s.ry * out * Math.sin(a);
      const size = FOG.SIZE * (1 + FOG.VARY * (rnd() - .5) * 2);

      const at = (k) => 'radial-gradient(ellipse ' +
        (s.rx * size * k).toFixed(2) + '% ' + (s.ry * size * k).toFixed(2) + '% at ' +
        cx.toFixed(2) + '% ' + cy.toFixed(2) + '%, ' +
        '#000 0%, rgba(0,0,0,.5) 50%, transparent 100%)';

      wide.push(at(1));
      core.push(at(.6));
    }

    holder.style.setProperty('--fog-wide', wide.join(', '));
    holder.style.setProperty('--fog-core', core.join(', '));
  }

  /* easing: fast arrival, soft landing, no overshoot */
  const outCubic = t => 1 - Math.pow(1 - t, 3);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  // the whole sequence, in beats — derived rather than written down, so
  // changing any one of the constants above cannot put it out of step
  // the last neighbour starts at (n-1) staggers in; the venue follows it
  const SPAN = (n) => (n - 1) * STAGGER + FALL + SETTLE + VENUE;

  const TWO_PI = Math.PI * 2;

  /* pose the whole group at a given moment of the sequence and draw it */
  function draw(t) {
    const now = performance.now() / 1000;

    /* The ground is there before anything is built on it: the streets come
       up over the first building's fall, so the block lands on a site
       rather than into empty space. */
    const site = clamp01(t / FALL);
    const siteEased = site * site * (3 - 2 * site);
    streets.forEach(el => { el.style.opacity = (siteEased * STREET.OPACITY).toFixed(3); });
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const start = last ? (parts.length - 1) * STAGGER + FALL + SETTLE : i * STAGGER;
      const dur = last ? VENUE : FALL;

      const k = clamp01((t - start) / dur);
      if (t < start) { p.root.visible = false; placeTag(p, null, 0); return; }

      const e = outCubic(k);
      p.root.visible = true;
      p.root.position.y = p.rest + p.fall * (1 - e);
      // opacity arrives ahead of the movement, so a building is readable
      // while it is still settling rather than appearing only once it lands
      const o = clamp01(k * 1.6);
      const eased = o * o * (3 - 2 * o);

      // each building arrives at its own settled strength rather than at
      // full opacity: the venue solid, its neighbours held back
      /* The arrival is the only thing opacity is used for. Once a building
         has landed it turns fully solid — its settled strength is already
         in its colour — so no two of its surfaces can blend together. */
      p.mats.forEach(m => {
        m.opacity = eased;
        m.transparent = eased < .999;
      });

      /* The outline comes up with it and stays stronger than the face — it
         is what keeps a translucent building's form readable. The near
         edges of the neighbours breathe; the venue's hold steady. */
      const breath = p.isVenue ? 1
        : 1 - BREATHE.DEPTH * (.5 - .5 * Math.cos(now * TWO_PI / BREATHE.PERIOD + p.phase));

      p.edges.forEach(pair => {
        pair.front.opacity = eased * p.edge * breath;
        pair.back.opacity = eased * p.edge * STYLE.INNER_EDGE;
      });

      /* the label rides the building down: its anchor is the top of that
         building's box, carried by however far it still has to fall */
      const lift = p.root.position.y - p.rest;
      placeTag(p, new THREE.Vector3(
        (p.box.min.x + p.box.max.x) / 2,
        p.box.max.y + lift,
        (p.box.min.z + p.box.max.z) / 2), eased);
    });

    // every label now knows where it points; they settle against each other
    layoutTags();

    renderer.render(scene, camera);
    if (css) css.render(scene, camera);
  }

  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // a screen-space line weight has to be told what the screen is
    lineMats.forEach(m => m.resolution.set(w, h));
    // the interface type resizes with the viewport, so its metrics go stale
    allTags.forEach(t => { t.w = null; });
    if (css) css.setSize(w, h);
    if (ready) { reframe(); renderer.render(scene, camera); }
  }

  addEventListener('resize', resize);
  resize();

  /* It hands the stage over to the introduction: the same handover the
     statement makes to the panels, one step earlier. The position comes
     from the page's scroll governor rather than from `scrollY`, so the
     massing clears on the same eased, speed-capped clock the patterns,
     the ground and the statement all move on. */
  let wroteO = -1;
  let beat = 0;          // where the sequence stands, in beats
  let breathing = false;

  /* The breath is the one thing here that moves without the page moving,
     so it needs frames of its own. They run only while the massing is on
     the stage — once it has handed over, the loop stops rather than
     redrawing a hidden canvas for the rest of the journey. */
  function breatheFrame() {
    if (!breathing) return;
    draw(beat);
    requestAnimationFrame(breatheFrame);
  }

  function setBreathing(on) {
    if (on === breathing) return;
    breathing = on;
    if (on) requestAnimationFrame(breatheFrame);
  }

  function sync(p) {
    // fading out is its own, later part of the band
    const v = Math.round(clamp01((SCENE_OUT - p) / (SCENE_OUT - SCENE_HOLD)) * 100) / 100;
    if (v !== wroteO) {
      layers.forEach(el => {
        el.style.setProperty('--scene-o', v);
        /* off the stage entirely once clear. This matters more for the fog
           than for the canvas: a backdrop filter at zero opacity still
           costs a blur pass over the whole region on every frame. */
        el.style.visibility = v > 0 ? '' : 'hidden';
      });
      wroteO = v;
    }

    if (!ready) return;
    setBreathing(v > 0 && !document.hidden);
    if (v === 0) return;

    // the scroll band, stretched over the sequence's beats
    beat = clamp01((p - SCENE_FROM) / (SCENE_TO - SCENE_FROM)) * SPAN(parts.length);
    // the breath redraws anyway; without it, draw on the scroll instead
    if (!breathing) draw(beat);
  }

  // a backgrounded tab should not be animating
  addEventListener('visibilitychange', () => {
    if (document.hidden) setBreathing(false);
    else if (ready && wroteO > 0) setBreathing(true);
  });

  window.__massing = {
    sync,
    at: s => ready && draw(s),
    get ready() { return ready; }
  };

  // the page may already have moved on by the time this module finishes
  sync(window.__progress ? window.__progress() : 0);
})();
