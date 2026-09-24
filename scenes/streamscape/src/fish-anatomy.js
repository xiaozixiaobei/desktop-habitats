import * as THREE from "three";
import { waterLitShader } from "../../riverscape/src/water.js";

// Red mahseer anatomy. Shares Riverscape's indexed skin, articulated fin rays and
// tissue-light transport, with a broader cyprinid head, smaller eyes, thick lips,
// barbels, a short anal fin and no adipose fin. Dimensions are artistic proportions
// informed by the references in ../assets/README.md; they are not measured taxonomy.

const TAU = Math.PI * 2;
// Exported because behaviour needs them: a fish eats with its snout, not its centre, and
// every feeding distance in fish.js is quoted in body lengths.
export const SNOUT_X = 0.35;
export const STANDARD_LENGTH = 0.645;
const HYPURAL_X = SNOUT_X - STANDARD_LENGTH;

// Cross-sections: x, dorsal y, ventral y, half width, then the fullness exponents of
// the upper and lower half. Fullness 2 is an ellipse; below 2 the section comes to a
// ridge, which is how the dorsum and the caudal peduncle are actually shaped, and
// above 2 it rounds out, as the skull and the belly do.
const STATIONS = [
  [.35,-.015,-.026,.006,2.3,2.4], [.3425,-.004,-.031,.014,2.3,2.4],
  [.332,.010,-.038,.022,2.3,2.4], [.315,.030,-.047,.030,2.3,2.4],
  [.295,.046,-.057,.039,2.3,2.4], [.272,.060,-.066,.045,2.3,2.4],
  [.248,.073,-.077,.050,2.25,2.4], [.22,.082,-.087,.053,2.15,2.4],
  [.19,.091,-.096,.055,2.05,2.35], [.166,.098,-.102,.055,2,2.3],
  [.13,.106,-.108,.054,2.1,2.25], [.09,.110,-.112,.052,2.05,2.2],
  [.045,.113,-.112,.049,2,2.15], [.01,.112,-.109,.046,1.95,2.1],
  [-.04,.105,-.100,.042,1.88,1.9],[-.09,.094,-.088,.037,1.78,1.78],
  [-.14,.079,-.070,.031,1.66,1.66],[-.19,.060,-.052,.025,1.52,1.54],
  [-.235,.045,-.038,.018,1.46,1.48],[-.27,.037,-.031,.012,1.42,1.42],
  [HYPURAL_X,.034,-.029,.007,1.4,1.4],
];
const SECTION_WAIST = 2.15;

// Rows are spaced by the integral of this density, so the snout, the orbit, the
// opercular margin and the peduncle — where the profile turns hardest — get the mesh.
const ROW_DENSITY = [
  [0.35, 2.4],
  [0.315, 2.1],
  [0.288, 3.0],
  [0.256, 3.0],
  [0.228, 2.1],
  [0.19, 1.7],
  [0.16, 1.5],
  [0.06, 1.0],
  [-0.12, 1.0],
  [-0.21, 1.4],
  [-0.265, 2.0],
  [HYPURAL_X, 2.4],
];
// The body shell's resolution. It sets how smooth the profile is between the station
// knots above and how finely the swimming bend in fish.js resolves along the body, which
// is what the eye reads on a fish that is small on screen and constantly turning.
const BODY_ROWS = 124;
const BODY_COLUMNS = 86;

// Smaller eyes sit within the broad mahseer skull.
const EYE = {
  x: 0.285,
  y: 0.016,
  radiusX: 0.0175,
  radiusY: 0.017,
  bulge: 0.006,
  inset: 0.043,
  pupil: 0.60,
  iris: 0.93,
  rim: 0.985,
};

// Posterior margin of the gill cover: bowed back at mid-height, sloping forward at the
// nape and the isthmus. The opercle's free edge overlaps the shoulder, so the surface
// carries a raised bony edge and then a groove.
const OPERCLE = { x: 0.196, bow: 0.03, y: -0.004, span: 0.078 };

// Subterminal mouth: the opening lies below the rounded snout.
const MOUTH = { cornerX: 0.322, cornerY: -0.025, tipX: 0.3495, tipY: -0.024 };

// Ray fans for the short-based dorsal/anal fins and broad paired fins.
const FIN_RAYS = { 1: 19, 2: 12, 3: 8, 4: 14, 5: 14, 6: 9 };
const MEMBRANE_STEPS = 8;
// Subdivisions along each ray. A fin is the thinnest thing on the animal and the first
// place a coarse mesh shows, so it gets one more than the membrane alone would need.
const RAY_SUBDIVISIONS = 5;

// Large, overlapping scales matching the supplied ornamental-fish reference.
const SCALE_ROWS = [23, 8];

// Keep light transport from Riverscape; these coefficients are tuned for the red
// ornamental appearance in this scene and are not species measurements.
const MUSCLE_ABSORPTION = [34, 84, 109];
// Scattering returns a small share of light through thin tissue and fins.
const TISSUE_SCATTER = 160;
// Skin, scales and the muscle immediately under them: the shortest path anywhere on the
// body, and what keeps the ridges from reading as a white rim rather than warm tissue.
const MUSCLE_FLOOR = 0.012;
// The membranes remain thin and translucent; their ray structure darkens at grazing angles.
const MEMBRANE_THICKNESS = 0.004;
const FIN_RAY_DENSITY = 0.5;
// Myomeres, roughly one per vertebra, their septa swept forward at mid-depth into the
// chevron that shows when the caudal muscle is lit through. Cycles per model unit.
const MYOMERE_PITCH = 52;
// Tissue a millimetre thick scatters light out broadly rather than as a forward beam, so
// the view-dependent lobe sits on a wrap-around floor and the distortion bends it toward
// the surface normal (Barré-Brisebois). The ambient share is the same transport applied
// to the light that arrives from every direction at once.
const THROUGH = {
  gain: 2.0,
  wrap: 0.35,
  sharpness: 2.0,
  distortion: 0.22,
  ambient: 0.55,
};

const glsl = (value) => value.toFixed(5);
const vec3 = (rgb) => `vec3(${rgb.map(glsl).join(", ")})`;

// Match the user's red/pink ornamental reference, including dark scale margins.
const LIVERY = {
  backDark: [.61,.08,.17], back: [.85,.18,.33],
  flank: [.94,.20,.36], belly: [.49,.07,.09], bellyLow: [.45,.085,.10],
  band: { colour: [.43,.075,.12], centre: .40, width: .025, front: -.285, rear: .245, strength: .04 },
  lowerBand: null, warm: [.64,.07,.08], warmGain: .12,
  sheath: [.49,.025,.035], sheathGain: .3,
  gill: [.52,.038,.038], gillGain: .22, gillThrough: [.44,.015,.035],
  cheekDark: [.41,.018,.05], cheekPale: [.63,.07,.11],
  snout: [.55,.04,.09], snoutTip: [.49,.025,.065], cleft: [.095,.008,.015],
  orbit: [.54,.38,.46], membrane: [.76,.16,.31],
  finPigment: [1,.025,.10], finPigmentGain: .92,
  finTip: [.93,.085,.18], finTipGain: .45, rayTint: [.20,.024,.055],
  pigmentAbsorption: [.18,2.1,1.7], caudalBars: null,
  irisInner: [.59,.53,.65], irisOuter: [.28,.22,.31],
  pupil: [.006,.008,.014], oralSlit: [.055,.008,.017],
  corneaRim: [.38,.31,.42], upperLip: [.50,.055,.10],
};

// Smooth interpolation through the station knots. Slopes are the neighbours' secant,
// which keeps the profile C1 without the overshoot a uniform parameterisation adds
// where the knots crowd together at the snout.
function splineThrough(knots) {
  const xs = knots.map((knot) => knot[0]);
  const ys = knots.map((knot) => knot[1]);
  const last = xs.length - 1;
  const slopes = ys.map((_, i) => {
    if (i === 0) return (ys[1] - ys[0]) / (xs[1] - xs[0]);
    if (i === last) return (ys[last] - ys[last - 1]) / (xs[last] - xs[last - 1]);
    return (ys[i + 1] - ys[i - 1]) / (xs[i + 1] - xs[i - 1]);
  });
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[last]) return ys[last];
    let low = 0;
    let high = last;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (xs[middle] <= x) low = middle;
      else high = middle;
    }
    const span = xs[low + 1] - xs[low];
    const u = (x - xs[low]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * ys[low] +
      (u3 - 2 * u2 + u) * span * slopes[low] +
      (-2 * u3 + 3 * u2) * ys[low + 1] +
      (u3 - u2) * span * slopes[low + 1]
    );
  };
}

const CHANNELS = ["top", "bottom", "width", "fullUp", "fullDown"];
const PROFILE = CHANNELS.map((_, channel) =>
  splineThrough(
    STATIONS.map((station) => [station[0], station[channel + 1]]).reverse(),
  ),
);

function profile(x) {
  const clamped = THREE.MathUtils.clamp(x, HYPURAL_X, SNOUT_X);
  return {
    top: PROFILE[0](clamped),
    bottom: PROFILE[1](clamped),
    width: PROFILE[2](clamped),
    fullUp: PROFILE[3](clamped),
    fullDown: PROFILE[4](clamped),
  };
}

function opercleX(y) {
  const t = THREE.MathUtils.clamp((y - OPERCLE.y) / OPERCLE.span, -1, 1);
  return OPERCLE.x - OPERCLE.bow * (1 - t * t);
}

function mouthCleftY(x) {
  const k = THREE.MathUtils.clamp(
    (x - MOUTH.cornerX) / (MOUTH.tipX - MOUTH.cornerX),
    0,
    1,
  );
  return THREE.MathUtils.lerp(
    MOUTH.cornerY,
    MOUTH.tipY,
    k * k * (3 - 2 * k),
  );
}

// Depth coordinate v runs -1 at the ventral midline to +1 at the dorsal.
function sectionY(section, v) {
  const centre = (section.top + section.bottom) * 0.5;
  return v >= 0
    ? centre + v * (section.top - centre)
    : centre + v * (centre - section.bottom);
}

// Half width of the surface at (x, v), with the features that make a head read as a
// head: the gill chamber swelling the cheek, the orbit taking the eyeball's shape, the
// opercular edge and the mouth cleft.
function sectionZ(x, v, section, y) {
  const fullness = v >= 0 ? section.fullUp : section.fullDown;
  const waist = Math.pow(
    Math.max(0, 1 - Math.pow(Math.abs(v), SECTION_WAIST)),
    1 / fullness,
  );
  const cheek =
    1 +
    0.09 *
      Math.exp(-(((x - 0.2) / 0.045) ** 2)) *
      THREE.MathUtils.smoothstep(-v, -0.35, 0.5);
  let z = section.width * waist * cheek;

  const margin = opercleX(y);
  z += 0.0013 * Math.exp(-(((x - margin - 0.009) / 0.008) ** 2));
  z -= 0.0023 * Math.exp(-(((x - margin) / 0.005) ** 2));

  const cleft = Math.exp(-(((y - mouthCleftY(x)) / 0.0045) ** 2));
  const gape = THREE.MathUtils.smoothstep(x, MOUTH.cornerX - 0.012, MOUTH.cornerX + 0.006);
  z -= Math.min(0.0019 * cleft * gape, z * 0.42);

  const orbit = Math.hypot(
    (x - EYE.x) / EYE.radiusX,
    (y - EYE.y) / EYE.radiusY,
  );
  if (orbit < 1.3) {
    const dome =
      EYE.inset + EYE.bulge * Math.sqrt(Math.max(0, 1 - orbit * orbit));
    const weight = 1 - THREE.MathUtils.smoothstep(orbit, 0.92, 1.62);
    z = THREE.MathUtils.lerp(z, dome, weight);
  }
  return Math.max(z, 0.0004);
}

function surfacePoint(x, v, side, target = new THREE.Vector3()) {
  const section = profile(x);
  const y = sectionY(section, v);
  return target.set(x, y, side * sectionZ(x, v, section, y));
}

// Depth coordinate of a given height, so fin roots and lip ribbons can be placed by
// anatomy (an oblique insertion line) rather than by guessing a v.
function depthCoordinate(section, y) {
  const centre = (section.top + section.bottom) * 0.5;
  return y >= centre
    ? (y - centre) / Math.max(section.top - centre, 1e-6)
    : (y - centre) / Math.max(centre - section.bottom, 1e-6);
}

function surfaceAt(x, y, side, target = new THREE.Vector3()) {
  const section = profile(x);
  const v = THREE.MathUtils.clamp(depthCoordinate(section, y), -1, 1);
  return target.set(x, y, side * sectionZ(x, v, section, y));
}

function surfaceNormal(x, y, side, target = new THREE.Vector3()) {
  const step = 0.0015;
  const here = surfaceAt(x, y, side);
  const alongX = surfaceAt(x + step, y, side).sub(here);
  const alongY = surfaceAt(x, y + step, side).sub(here);
  return target
    .crossVectors(alongX, alongY)
    .multiplyScalar(side)
    .normalize();
}

function bodyRows(count) {
  const samples = 1600;
  const density = splineThrough(ROW_DENSITY.map((knot) => [...knot]).reverse());
  const cumulative = [0];
  for (let i = 1; i <= samples; i++) {
    const x = HYPURAL_X + ((SNOUT_X - HYPURAL_X) * i) / samples;
    cumulative.push(cumulative[i - 1] + density(x));
  }
  const total = cumulative[samples];
  const rows = [];
  let cursor = 0;
  for (let row = 0; row <= count; row++) {
    const wanted = (total * row) / count;
    while (cursor < samples && cumulative[cursor + 1] < wanted) cursor++;
    const span = cumulative[cursor + 1] - cumulative[cursor] || 1;
    const fraction = (wanted - cumulative[cursor]) / span;
    rows.push(
      HYPURAL_X +
        ((SNOUT_X - HYPURAL_X) * (cursor + fraction)) / samples,
    );
  }
  return rows.reverse();
}

// The body shell: a closed tube whose columns start on the dorsal midline, so the uv
// seam and the normals' only discontinuity fall under the dorsal fin. uv.x runs 0 at
// the snout to 1 at the hypural; uv.y is the arc fraction from the dorsal midline to
// the ventral, identical on both flanks, which is how scale rows actually sit.
function bodyGeometry() {
  const positions = [];
  const uvs = [];
  const indices = [];
  const rows = bodyRows(BODY_ROWS);
  const columns = BODY_COLUMNS;
  const point = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const halfArc = [];
  const arcs = [];

  for (const x of rows) {
    let arc = 0;
    halfArc.length = 0;
    halfArc.push(0);
    surfacePoint(x, 1, 1, previous);
    for (let column = 1; column <= columns / 2; column++) {
      const v = Math.cos((column / (columns / 2)) * Math.PI);
      surfacePoint(x, v, 1, point);
      arc += point.distanceTo(previous);
      previous.copy(point);
      halfArc.push(arc);
    }
    arcs.push(halfArc.map((value) => value / Math.max(arc, 1e-6)));
  }

  rows.forEach((x, row) => {
    for (let column = 0; column < columns; column++) {
      const s = (column / columns) * 2;
      const mirrored = s <= 1;
      const t = mirrored ? s : 2 - s;
      const v = Math.cos(t * Math.PI);
      surfacePoint(x, v, mirrored ? 1 : -1, point);
      positions.push(point.x, point.y, point.z);
      const index = Math.round(t * (columns / 2));
      uvs.push((SNOUT_X - x) / STANDARD_LENGTH, arcs[row][index]);
    }
  });

  for (let row = 0; row < rows.length - 1; row++) {
    for (let column = 0; column < columns; column++) {
      const next = (column + 1) % columns;
      const a = row * columns + column;
      const b = row * columns + next;
      const c = (row + 1) * columns + column;
      const d = (row + 1) * columns + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  // Close both ends so the shell is watertight for the shadow pass and nothing can be
  // seen through the caudal peduncle when the tail swings across the camera.
  for (const [row, flip] of [
    [0, false],
    [rows.length - 1, true],
  ]) {
    const centre = new THREE.Vector3();
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      centre.x += positions[index * 3] / columns;
      centre.y += positions[index * 3 + 1] / columns;
      centre.z += positions[index * 3 + 2] / columns;
    }
    const hub = positions.length / 3;
    positions.push(centre.x, centre.y, centre.z);
    uvs.push((SNOUT_X - centre.x) / STANDARD_LENGTH, 0.5);
    for (let column = 0; column < columns; column++) {
      const a = row * columns + column;
      const b = row * columns + ((column + 1) % columns);
      if (flip) indices.push(hub, b, a);
      else indices.push(hub, a, b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function geometryBuilder() {
  const positions = [],
    normals = [],
    uvs = [],
    parts = [],
    progress = [],
    indices = [];
  return {
    add(geometry, part, finProgress) {
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      const uv = geometry.getAttribute("uv");
      const offset = positions.length / 3;
      for (let i = 0; i < position.count; i++) {
        positions.push(position.getX(i), position.getY(i), position.getZ(i));
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        uvs.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        parts.push(part);
        progress.push(finProgress ? finProgress[i] : 0);
      }
      const index = geometry.getIndex();
      for (let i = 0; i < (index ? index.count : position.count); i++) {
        indices.push(offset + (index ? index.getX(i) : i));
      }
      geometry.dispose();
    },
    finish() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(normals, 3),
      );
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute(
        "aPart",
        new THREE.Float32BufferAttribute(parts, 1),
      );
      geometry.setAttribute(
        "aFinProgress",
        new THREE.Float32BufferAttribute(progress, 1),
      );
      geometry.setIndex(indices);
      return geometry;
    },
  };
}

function fromArrays(positions, normals, uvs, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  if (normals.length) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(normals, 3),
    );
  }
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// A spherical-cap patch of the eyeball, cut between two radius fractions. All three
// eye patches share the analytic normal of the same lens, so the pupil, iris and
// corneal rim meet without a shading crease.
function eyeCap(side, inner, outer, rings, segments, lift, rimLift) {
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const f = THREE.MathUtils.lerp(inner, outer, ring / rings);
    const height = Math.sqrt(Math.max(0, 1 - Math.min(f, 1) ** 2));
    const clearance = lift + rimLift * f * f;
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * TAU;
      const dx = Math.cos(angle) * f;
      const dy = Math.sin(angle) * f;
      const normal = new THREE.Vector3(
        (dx * EYE.radiusX) / (EYE.bulge * EYE.bulge),
        (dy * EYE.radiusY) / (EYE.bulge * EYE.bulge),
        (side * height) / EYE.bulge,
      ).normalize();
      positions.push(
        EYE.x + dx * EYE.radiusX + normal.x * clearance,
        EYE.y + dy * EYE.radiusY + normal.y * clearance,
        side * (EYE.inset + EYE.bulge * height) + normal.z * clearance,
      );
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(segment / segments, ring / rings);
      if (ring < rings && segment < segments) {
        const i = ring * (segments + 1) + segment;
        if (side > 0) indices.push(i, i + segments + 1, i + 1, i + 1, i + segments + 1, i + segments + 2);
        else indices.push(i, i + 1, i + segments + 1, i + 1, i + segments + 2, i + segments + 1);
      }
    }
  }
  return fromArrays(positions, normals, uvs, indices);
}

// A narrow strip laid along the mouth cleft, offset from the skin along its normal:
// negative for the dark slit at the bottom of the groove, positive for the lip above it.
function cleftRibbon(side, fromY, toY, offset, segments) {
  const positions = [],
    normals = [],
    uvs = [],
    indices = [];
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let segment = 0; segment <= segments; segment++) {
    const k = segment / segments;
    const x = THREE.MathUtils.lerp(MOUTH.cornerX - 0.004, MOUTH.tipX, k);
    const taper = Math.sin(Math.min(1, 1.25 * (1 - k)) * Math.PI * 0.5);
    for (const edge of [0, 1]) {
      const y =
        mouthCleftY(x) + THREE.MathUtils.lerp(fromY, toY, edge) * taper;
      surfaceAt(x, y, side, point);
      surfaceNormal(x, y, side, normal);
      positions.push(
        point.x + normal.x * offset,
        point.y + normal.y * offset,
        point.z + normal.z * offset,
      );
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(k, edge);
    }
    if (segment < segments) {
      const i = segment * 2;
      if (side > 0) indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
      else indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  return fromArrays(positions, normals, uvs, indices);
}

function curveThrough(points) {
  return new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    false,
    "catmullrom",
    0.5,
  );
}

// A fin is a fan of rays. `base` is the insertion line in the skin, `tip` the free
// margin; between rays the membrane falls short of the ray tips, which is what gives a
// real fin its finely scalloped edge. Rays become tapered tubes in the opaque mesh,
// the membrane a single double-sided sheet.
function finFan(
  { part, base, tip, sway = 0, roll = 0, edge = 0.055, root = 0.006 },
  membranes,
) {
  const rays = FIN_RAYS[part] || 3;
  const columns = (rays - 1) * RAY_SUBDIVISIONS;
  const baseCurve = curveThrough(base);
  const tipCurve = curveThrough(tip);
  const positions = [],
    uvs = [],
    progress = [],
    indices = [];
  const hinge = new THREE.Vector3();
  const free = new THREE.Vector3();
  const point = new THREE.Vector3();
  const inward = new THREE.Vector3();
  // The membrane falls short of the ray tips between rays, and no two rays reach
  // exactly the same distance: that is what makes a real fin's edge finely uneven.
  const margin = (along) => {
    const rayIndex = along * (rays - 1);
    const between = 0.5 - 0.5 * Math.cos(TAU * rayIndex);
    const uneven =
      0.013 * Math.sin(rayIndex * 5.3 + part * 2.1) +
      0.008 * Math.sin(rayIndex * 11.7 + part);
    return 1 - edge * Math.pow(between, 1.4) + uneven * (1 - between);
  };

  for (let column = 0; column <= columns; column++) {
    const along = column / columns;
    baseCurve.getPoint(along, hinge);
    tipCurve.getPoint(along, free);
    // Sink the insertion into the skin so the membrane grows out of the body.
    inward.subVectors(free, hinge).normalize().multiplyScalar(-root);
    hinge.add(inward);
    const reach = margin(along);
    for (let step = 0; step <= MEMBRANE_STEPS; step++) {
      const t = step / MEMBRANE_STEPS;
      point.lerpVectors(hinge, free, t * reach);
      const bow = Math.sin(t * Math.PI * 0.85);
      point.z += sway * bow;
      point.z += roll * bow * Math.sin((along - 0.5) * Math.PI);
      positions.push(point.x, point.y, point.z);
      uvs.push(along, t);
      progress.push(t);
      if (column < columns && step < MEMBRANE_STEPS) {
        const i = column * (MEMBRANE_STEPS + 1) + step;
        indices.push(
          i,
          i + 1,
          i + MEMBRANE_STEPS + 1,
          i + 1,
          i + MEMBRANE_STEPS + 2,
          i + MEMBRANE_STEPS + 1,
        );
      }
    }
  }
  const membrane = fromArrays(positions, [], uvs, indices);
  membrane.computeVertexNormals();
  membranes.add(membrane, part, progress);
}

// Insertion lines read off the body surface, so every fin is rooted in the skin
// wherever the profile happens to run.
function insertion(points, side = 1) {
  return points.map(([x, y]) => surfaceAt(x, y, side).toArray());
}

function medianInsertion(from, to, samples, dorsal, sink) {
  const line = [];
  for (let i = 0; i <= samples; i++) {
    const x = THREE.MathUtils.lerp(from, to, i / samples);
    const section = profile(x);
    const y = dorsal ? section.top - sink : section.bottom + sink;
    line.push([x, y, 0]);
  }
  return line;
}

export function makeAnatomy() {
  const opaque = geometryBuilder();
  const membranes = geometryBuilder();
  opaque.add(bodyGeometry(), 0);

  for (const side of [-1, 1]) {
    opaque.add(eyeCap(side, 0, EYE.pupil, 4, 30, 0.0009, 0.0013), 8);
    opaque.add(eyeCap(side, EYE.pupil, EYE.iris, 5, 30, 0.0006, 0.0013), 7);
    opaque.add(eyeCap(side, EYE.iris, EYE.rim, 2, 30, 0.0004, 0.0013), 10);
    opaque.add(cleftRibbon(side, -0.0016, 0.0016, -0.001, 7), 9);
    opaque.add(cleftRibbon(side, 0.0022, 0.005, 0.0005, 7), 11);
  }

  // Caudal fin: 19 principal rays fanning from the hypural plate into two rounded
  // lobes, the median rays a third of the lobe length so the fork stays deep.
  finFan(
    {
      part: 1,
      base: [
        [-0.271, 0.03840, 0],
        [-0.286, 0.02520, 0],
        [-0.292, 0, 0],
        [-0.286, -0.02400, 0],
        [-0.271, -0.03720, 0],
      ],
      tip: [
        [-0.302, 0.05400, 0],
        [-0.362, 0.09840, 0],
        [-0.414, 0.11280, 0],
        [-0.436, 0.11520, 0],
        [-0.43, 0.08760, 0],
        [-0.398, 0.04560, 0],
        [-0.347, 0.00120, 0],
        [-0.394, -0.04320, 0],
        [-0.426, -0.08520, 0],
        [-0.434, -0.11160, 0],
        [-0.412, -0.11280, 0],
        [-0.356, -0.09240, 0],
        [-0.3, -0.05040, 0],
      ],
      edge: 0.022,
      root: 0.015,
    },
    membranes,
  );

  // Dorsal fin at 52% SL: a short base, the apex over the third ray, the margin
  // falling away concavely behind it.
  finFan(
    {
      part: 2,
      base: medianInsertion(0.03, -0.09, 4, true, 0.006),
      tip: [
        [.032,.13,0], [.018,.19,0], [-.005,.235,0],
        [-.025,.205,0], [-.055,.161,0], [-.078,.139,0], [-.092,.12,0],
      ],
      edge: 0.02,
    },
    membranes,
  );

  // Short anal fin behind the pelvics; cyprinids have no adipose fin.
  finFan({ part: 3,
    base: medianInsertion(-.15, -.21, 4, false, .006),
    tip: [[-.15,-.080,0],[-.17,-.135,0],[-.195,-.143,0],[-.22,-.115,0],[-.23,-.065,0]],
    edge: .025,
  }, membranes);

  for (const side of [-1, 1]) {
    // Pectorals inserted low and just behind the opercular margin, reaching back to
    // the pelvic origin.
    finFan(
      {
        part: side > 0 ? 4 : 5,
        base: insertion(
          [
            [0.174, -0.066],
            [0.166, -0.079],
            [0.156, -0.090],
          ],
          side,
        ),
        tip: [
          [.135, -.09, side * .056],
          [.10, -.12, side * .09],
          [.045, -.16, side * .11],
          [.025, -.18, side * .09],
          [.08, -.18, side * .07],
          [.13, -.125, side * .055],
        ],
        sway: side * 0.002,
        roll: side * 0.004,
        edge: 0.024,
        root: 0.005,
      },
      membranes,
    );
    // Pelvics at 46% SL, close to the ventral midline.
    finFan(
      {
        part: 6,
        base: insertion(
          [
            [.025, -.105],
            [.010, -.11],
            [-.005, -.105],
          ],
          side,
        ),
        tip: [
          [0,-.145,side*.04],
          [-.045,-.19,side*.055],
          [-.075,-.185,side*.04],
          [-.035,-.12,side*.02],
        ],
        sway: side * 0.0012,
        roll: side * 0.002,
        edge: 0.024,
        root: 0.005,
      },
      membranes,
    );
  }

  const lip = new THREE.TorusGeometry(.009, .0025, 10, 28);
  lip.rotateY(Math.PI / 2); lip.scale(1, .62, 1.15); lip.translate(.350, -.024, 0);
  opaque.add(lip, 11);
  for (const side of [-1, 1]) {
    for (const [x, y, z, length] of [[.343, -.025, .015, .045], [.32, -.018, .025, .033]]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, y, side*z), new THREE.Vector3(x-.015,y-.012,side*(z+.008)),
        new THREE.Vector3(x-length,y-.022,side*(z+.014)),
      ]);
      opaque.add(new THREE.TubeGeometry(curve, 12, .0015, 5, false), 11);
    }
  }

  return { body: opaque.finish(), fins: membranes.finish() };
}

// Colour, scales, guanine sheen and fin membranes in the fragment stage. The vertex
// stage (owned by fish.js) supplies vSkinPoint, vFishUV and vFishPart; the water light
// model is wired here so the fish receive the same surface focusing and depth
// absorption as everything else lit in the tank. `paint` is one species' livery: the
// light transport below is shared by every fish, the pigment on top of it is not.
export function applySkin(shader, paint = LIVERY) {
  if (!/vWaterPosition/.test(shader.vertexShader)) {
    waterLitShader(shader, {
      perLight: /* glsl */ `
        // Light that entered the far face and scattered out towards the eye. What enters
        // still obeys Lambert on the face it crosses, so the leak is strongest where the
        // surface turns away from the light; what survives the path is in gFishThrough,
        // and the lobe is how much of it leaves towards the viewer rather than sideways.
        float enter = max(0.0, -dot(geometryNormal, directLight.direction));
        vec3 through = normalize(directLight.direction
          + geometryNormal * ${glsl(THROUGH.distortion)});
        float lobe = ${glsl(THROUGH.wrap)}
          + pow(max(dot(geometryViewDir, -through), 0.0), ${glsl(THROUGH.sharpness)});
        reflectedLight.directDiffuse += lit.color * gFishThrough
          * enter * lobe * ${glsl(THROUGH.gain)} * RECIPROCAL_PI;
      `,
    });
  }
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      /* glsl */ `
      #include <common>
      varying vec3 vSkinPoint;
      varying vec2 vFishUV;
      varying float vFishPart;

      // What the tissue under this fragment passes: set once the anatomy is known, read
      // back by every light below.
      vec3 gFishThrough = vec3(0.0);

      const vec3 FISH_ABSORPTION = vec3(${MUSCLE_ABSORPTION.map(glsl).join(", ")});
      const vec3 FISH_FIN_PIGMENT = ${vec3(paint.pigmentAbsorption)};
      const vec3 FISH_LOWER_BAND_PIGMENT = ${vec3(paint.lowerBand?.colour ?? paint.belly)};
      const float FISH_LOWER_BAND_STRENGTH = ${glsl(paint.lowerBand?.strength ?? 0)};
      const vec2 FISH_SCALES = vec2(${glsl(SCALE_ROWS[0])}, ${glsl(SCALE_ROWS[1])});
      ${paint.caudalBars ? `const vec3 FISH_BAR_DARK = ${vec3(paint.caudalBars.dark)};
      const vec3 FISH_BAR_LIGHT = ${vec3(paint.caudalBars.light)};
      const float FISH_BAR_COUNT = ${glsl(paint.caudalBars.count)};` : ""}
      const vec2 FISH_EYE = vec2(${glsl(EYE.x)}, ${glsl(EYE.y)});
      const vec2 FISH_EYE_RADIUS = vec2(${glsl(EYE.radiusX)}, ${glsl(EYE.radiusY)});

      float fishHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      // What a slab of tissue this thick sends back out diffusely: what survives the
      // absorption along the path, the tissue's own and any pigment standing in it,
      // times the share the tissue scatters instead of passing straight on.
      vec3 fishThrough(float path, vec3 pigment) {
        return exp(-FISH_ABSORPTION * path - pigment)
          * (1.0 - exp(-${glsl(TISSUE_SCATTER)} * path));
      }

      // Overlapping scales stagger across the body.
      vec2 fishScaleGrid() {
        vec2 grid = vFishUV * FISH_SCALES;
        grid.y += 0.11 * sin(grid.x * 0.62 + 1.3);
        grid.x += grid.y * 0.24 + mod(floor(grid.y), 2.0) * 0.5;
        return grid;
      }
      // Detail fades out rather than aliasing once a cell is smaller than a pixel.
      float fishFade(vec2 grid) {
        return 1.0 - smoothstep(0.42, 1.1, max(fwidth(grid.x), fwidth(grid.y)));
      }
      float fishOpercleX(float y) {
        float t = clamp((y - ${glsl(OPERCLE.y)}) / ${glsl(OPERCLE.span)}, -1.0, 1.0);
        return ${glsl(OPERCLE.x)} - ${glsl(OPERCLE.bow)} * (1.0 - t * t);
      }
      // Scales stop at the caudal fin base and at the bare bony gill cover.
      float fishScaleMask() {
        float rear = smoothstep(${glsl(HYPURAL_X)}, ${glsl(HYPURAL_X + 0.05)}, vSkinPoint.x);
        float front = 1.0 - smoothstep(-0.005, 0.011,
          vSkinPoint.x - fishOpercleX(vSkinPoint.y));
        float ridge = smoothstep(0.0, 0.11, vFishUV.y)
          * (1.0 - smoothstep(0.90, 1.0, vFishUV.y));
        return rear * front * ridge * fishFade(fishScaleGrid());
      }
      float fishScaleRelief() {
        vec2 cell = fract(fishScaleGrid()) - 0.5;
        float dome = 1.0 - smoothstep(0.15, 0.55, length(cell * vec2(.88,1.05)));
        return dome * (0.42 - cell.x * 0.85) * fishScaleMask();
      }
      float fishOrbit() {
        return length((vSkinPoint.xy - FISH_EYE) / FISH_EYE_RADIUS);
      }
      float fishCleftY(float x) {
        float k = clamp((x - ${glsl(MOUTH.cornerX)}) / ${glsl(MOUTH.tipX - MOUTH.cornerX)}, 0.0, 1.0);
        return mix(${glsl(MOUTH.cornerY)}, ${glsl(MOUTH.tipY)}, k * k * (3.0 - 2.0 * k));
      }
      float fishRayCount(float part) {
        ${Object.entries(FIN_RAYS)
          .map(([part, count]) => `if (part < ${glsl(Number(part) + 0.5)}) return ${glsl(Math.max(count - 1, 2))};`)
          .join("\n        ")}
        return 2.0;
      }
      // Guanine platelets stacked under the scales make a broadband reflector. It covers
      // the flank between the dark dorsum and the scattering belly, and it is tuned
      // blue-green, which is why the band flares cyan off normal. The layer is thickest
      // where it doubles as the lining of the body cavity and thins over the caudal
      // muscle, which passes light instead of mirroring it.
      float fishReflector(float band, float x) {
        return smoothstep(0.07, 0.24, band) * (1.0 - smoothstep(0.58, 0.92, band))
          * mix(0.70, 1.0, smoothstep(-0.195, 0.015, x));
      }
      // The second band, lower down the flank, for the species that carry one. Its
      // strength is zero on the others, and that is what removes the term.
      float fishLowerBand(float band, float x) {
        return exp(-pow((band - ${glsl(paint.lowerBand?.centre ?? 0.5)})
            / ${glsl(paint.lowerBand?.width ?? 0.1)}, 2.0))
          * FISH_LOWER_BAND_STRENGTH
          * smoothstep(${glsl(paint.lowerBand?.front ?? 0.0)},
              ${glsl((paint.lowerBand?.front ?? 0.0) + 0.06)}, x)
          * (1.0 - smoothstep(${glsl((paint.lowerBand?.rear ?? 0.0) - 0.06)},
              ${glsl(paint.lowerBand?.rear ?? 0.0)}, x));
      }
      // The peritoneum: the silvered sheet lining the body cavity, from behind the
      // pectoral girdle back to the anal fin origin and from the belly up to the swim
      // bladder under the spine. Gut and bladder fill it, so nothing gets through.
      float fishCavity(float x, float band) {
        return smoothstep(-0.080, -0.020, x) * (1.0 - smoothstep(0.140, 0.180, x))
          * smoothstep(0.34, 0.47, band);
      }
      // The vertebral column and the septa between the muscle blocks stand in the path
      // behind the cavity: a denser line along the axis with a faint chevron either side.
      float fishAxialShadow(float x, float y) {
        float column = exp(-pow(y / 0.011, 2.0));
        float phase = (x + 0.007 * cos(y * 30.0)) * ${glsl(MYOMERE_PITCH)};
        return 0.62 * column - 0.06 * cos(PI2 * phase) * fishFade(vec2(phase, 0.0));
      }
    `,
    )
    .replace(
      "#include <color_fragment>",
      /* glsl */ `
      #include <color_fragment>
      float fishX = vSkinPoint.x;
      float fishY = vSkinPoint.y;
      // Band runs 0 on the dorsal midline to 1 on the ventral, measured along the
      // section, so every colour zone follows the body outline instead of a height.
      float fishBand = clamp(vFishUV.y, 0.0, 1.0);
      float fishHead = smoothstep(-0.008, 0.034, fishX - fishOpercleX(fishY));
      if (vFishPart < 0.5) {
        // Countershading: an olive dorsum against the substrate seen from above, a
        // guanine flank that mirrors the water, a pale belly against the surface.
        vec3 skin = mix(${vec3(paint.backDark)}, ${vec3(paint.back)},
          smoothstep(0.02, 0.135, fishBand));
        skin = mix(skin, ${vec3(paint.flank)}, smoothstep(0.185, 0.42, fishBand));
        float bellyReach = smoothstep(-0.26, -0.12, fishX);
        skin = mix(skin, ${vec3(paint.belly)},
          smoothstep(0.52, 0.84, fishBand) * bellyReach);
        skin = mix(skin, ${vec3(paint.bellyLow)},
          smoothstep(0.88, 1.0, fishBand) * bellyReach);
        // The dark band, where the species has one under the guanine one.
        skin = mix(skin, FISH_LOWER_BAND_PIGMENT,
          clamp(fishLowerBand(fishBand, fishX), 0.0, 1.0));

        // The reflector band: from behind the eye to the caudal peduncle.
        float sheen = exp(-pow((fishBand - ${glsl(paint.band.centre)})
            / ${glsl(paint.band.width)}, 2.0))
          * smoothstep(${glsl(paint.band.front)}, ${glsl(paint.band.front + 0.06)}, fishX)
          * (1.0 - smoothstep(${glsl(paint.band.rear - 0.06)},
              ${glsl(paint.band.rear)}, fishX));
        vec2 sheenGrid = fishScaleGrid();
        float mottle = 1.0 + (fishHash(floor(sheenGrid) + 7.0) - 0.5) * 0.14
          * fishFade(sheenGrid);
        skin = mix(skin, ${vec3(paint.band.colour)} * mottle,
          sheen * ${glsl(paint.band.strength)});

        // Lateral line: one row of pored scales, gently decurved along the flank.
        float lineBand = mix(0.50, 0.43, smoothstep(-0.28, 0.16, fishX));
        float lateral = exp(-pow((fishBand - lineBand) / 0.020, 2.0));
        vec2 poreGrid = fishScaleGrid();
        float pore = smoothstep(0.60, 0.95, fishHash(vec2(floor(poreGrid.x), 3.0)));
        skin *= 1.0 - lateral * (0.09 + 0.20 * pore) * fishFade(poreGrid);

        // Scales: a faint sheen difference per scale and a darker free margin. Most
        // of the scale relief lives in roughness and normal, not in albedo.
        vec2 grid = fishScaleGrid();
        float mask = fishScaleMask();
        float rim = smoothstep(0.40, 0.50, length((fract(grid)-.5)*vec2(.88,1.05)));
        skin *= 1.0 + (fishHash(floor(grid)) - 0.5) * 0.10 * mask - rim * 0.16 * mask;

        // Red pigment bleeds out of the caudal and anal fin bases over the posterior
        // ventral flank, and the gill chamber shows warm through thin opercular skin.
        float warm = (1.0 - smoothstep(-0.27, 0.0, fishX))
          * smoothstep(0.32, 0.60, fishBand) * (1.0 - smoothstep(0.88, 1.0, fishBand));
        skin = mix(skin, ${vec3(paint.warm)}, warm * ${glsl(paint.warmGain)});
        float sheath = 1.0 - smoothstep(-0.292, -0.240, fishX);
        skin = mix(skin, ${vec3(paint.sheath)}, sheath * ${glsl(paint.sheathGain)});
        float gill = exp(-pow((fishX - 0.178) / 0.026, 2.0)
          - pow((fishBand - 0.66) / 0.16, 2.0));
        skin = mix(skin, ${vec3(paint.gill)}, gill * ${glsl(paint.gillGain)});

        // Head: cheek and opercle, dark over the skull and the snout.
        vec3 cheek = mix(${vec3(paint.cheekDark)}, ${vec3(paint.cheekPale)},
          smoothstep(0.13, 0.40, fishBand));
        skin = mix(skin, cheek, fishHead * 0.92);
        skin = mix(skin, ${vec3(paint.snout)}, smoothstep(0.250, 0.330, fishX) * 0.82);
        skin = mix(skin, ${vec3(paint.snoutTip)}, smoothstep(0.330, 0.350, fishX) * 0.7);

        // The opercular edge: a fine dark seam with the pale bony lip in front of it.
        float margin = fishX - fishOpercleX(fishY);
        float opercleFace = 1.0 - smoothstep(0.84, 1.0, fishBand);
        skin *= 1.0 - 0.60 * exp(-pow(margin / 0.0028, 2.0)) * opercleFace;
        skin *= 1.0 + 0.28 * exp(-pow((margin - 0.008) / 0.005, 2.0)) * opercleFace;

        // Mouth cleft, and the ring of skin around the orbit.
        float cleft = exp(-pow((fishY - fishCleftY(fishX)) / 0.0030, 2.0))
          * smoothstep(0.304, 0.322, fishX);
        skin = mix(skin, ${vec3(paint.cleft)}, cleft * 0.85);
        float orbit = fishOrbit();
        float ring = (1.0 - smoothstep(1.00, 1.18, orbit)) * smoothstep(0.88, 0.99, orbit);
        skin = mix(skin, ${vec3(paint.orbit)}, ring * 0.8);

        diffuseColor.rgb = skin;

        // Thinner caudal muscle allows some light through. The path is the width of the section here, so the caudal
        // peduncle and the dorsal and ventral ridges leak most, while the silvered
        // cavity, the skull and the column leak nothing. The gill chamber is the one
        // place light crosses the head, through the thin opercular flap.
        float path = max(abs(vSkinPoint.z) * 2.0, ${glsl(MUSCLE_FLOOR)});
        float wall = (1.0 - max(fishHead, fishCavity(fishX, fishBand)))
          * (1.0 - 0.55 * fishReflector(fishBand, fishX))
          * (1.0 - fishAxialShadow(fishX, fishY));
        gFishThrough = fishThrough(path, vec3(0.0)) * wall
          + ${vec3(paint.gillThrough)} * gill;
      } else if (vFishPart < 6.5 || vFishPart > 11.5) {
        float caudal = 1.0 - step(1.5, vFishPart);
        float pectoral = step(3.5, vFishPart) * (1.0 - step(5.5, vFishPart));
        float paleTip = step(2.5, vFishPart) * (1.0 - step(3.5, vFishPart))
          + step(5.5, vFishPart) * (1.0 - step(6.5, vFishPart));
        float span = clamp(vFishUV.y, 0.0, 1.0);
        float along = clamp(vFishUV.x, 0.0, 1.0);
        float rays = fishRayCount(vFishPart);

        // Membrane: nearly colourless where there is no pigment, so the plants and
        // water behind the fin show through it.
        vec3 membrane = ${vec3(paint.membrane)};
        // Pigment at the base, carried furthest out through the two caudal lobes and
        // clearing to hyaline at the margin. The pectorals stay almost clear.
        float lobe = 0.5 - 0.5 * cos(PI2 * 2.0 * along);
        float pigment = pow(1.0 - smoothstep(0.34, 1.04, span), 0.8)
          * mix(1.0, 0.42 + 0.58 * lobe, caudal) * mix(1.0, 0.65, pectoral);
        pigment = clamp(pigment * ${glsl(paint.finPigmentGain)}, 0.0, 1.0);
        diffuseColor.rgb = mix(membrane, ${vec3(paint.finPigment)}, pigment);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${vec3(paint.finTip)},
          paleTip * smoothstep(0.76, 0.98, span) * ${glsl(paint.finTipGain)});
        ${paint.caudalBars
          ? `// Transverse bars across the caudal, on the species whose tail carries them.
        float bar = smoothstep(0.42, 0.58,
          0.5 + 0.5 * cos(PI2 * (span * FISH_BAR_COUNT + 0.25)));
        diffuseColor.rgb = mix(diffuseColor.rgb,
          mix(FISH_BAR_DARK, FISH_BAR_LIGHT, bar), caudal * 0.95);`
          : ""}

        // Each soft ray branches twice on its way to the margin, so the ribbing
        // doubles and then doubles again over the outer half of the fin.
        float stem = pow(0.5 + 0.5 * cos(PI2 * along * rays), 20.0);
        float split = pow(0.5 + 0.5 * cos(PI2 * (along * rays + 0.5)), 24.0)
          * smoothstep(0.30, 0.55, span);
        float twig = pow(0.5 + 0.5 * cos(PI2 * (along * rays * 2.0 + 0.5)), 28.0)
          * smoothstep(0.62, 0.86, span);
        float ribs = clamp(
          stem * fishFade(vec2(along * rays, span)) +
          split * fishFade(vec2(along * rays * 2.0, span)) +
          twig * fishFade(vec2(along * rays * 4.0, span)), 0.0, 1.0);
        vec3 rayTint = diffuseColor.rgb * 0.68 + ${vec3(paint.rayTint)};
        diffuseColor.rgb = mix(diffuseColor.rgb, rayTint, ribs * 0.85);

        // Hyaline membrane: thin enough that most of the light carries straight through
        // it rather than scattering back, which is what keeps a fin see-through.
        gFishThrough = fishThrough(${glsl(MEMBRANE_THICKNESS)},
          FISH_FIN_PIGMENT * pigment + ${glsl(FIN_RAY_DENSITY)} * ribs);
        #ifdef FISH_MEMBRANE
          // Thickness falls away toward the free margin; pigment and rays add body.
          float thickness = mix(1.0, mix(0.34, 0.50, caudal), smoothstep(0.06, 1.0, span));
          diffuseColor.a = clamp(diffuseColor.a * mix(0.86, 1.0, caudal) * thickness
            * (1.0 + pigment * 1.2 + ribs * 0.85), 0.0, 1.0);
        #endif
      } else if (vFishPart < 7.5) {
        // Iris: a guanine ring, brightest below and behind the pupil, with fine fibres.
        float fibre = 0.5 + 0.5 * cos(vFishUV.x * PI2 * 24.0);
        vec3 iris = mix(${vec3(paint.irisInner)}, ${vec3(paint.irisOuter)}, vFishUV.y);
        diffuseColor.rgb = iris * (0.92 + 0.08 * fibre)
          * (0.48 + 0.52 * smoothstep(0.034, -0.016, fishY));
      } else if (vFishPart < 8.5) {
        diffuseColor.rgb = ${vec3(paint.pupil)};
      } else if (vFishPart < 9.5) {
        diffuseColor.rgb = ${vec3(paint.oralSlit)};
      } else if (vFishPart < 10.5) {
        diffuseColor.rgb = ${vec3(paint.corneaRim)};
      } else {
        diffuseColor.rgb = ${vec3(paint.upperLip)};
      }
    `,
    )
    .replace(
      "#include <metalnessmap_fragment>",
      /* glsl */ `
      #include <metalnessmap_fragment>
      if (vFishPart < 0.5) {
        // Only the reflector layer behaves as a metal. The dark dorsum and the
        // light-scattering belly stay dielectric, which is what keeps the flank
        // reading as a mirror set into a fish rather than as chrome plating.
        // Guanine sits under the scales and in the opercle and cheek plates. The
        // snout, jaws and skull roof carry none, so they stay dull dielectric.
        float scaled = fishReflector(fishBand, fishX)
          * (1.0 - smoothstep(0.155, 0.205, fishX));
        float plate = exp(-pow((fishX - 0.200) / 0.038, 2.0))
          * smoothstep(0.22, 0.46, fishBand) * (1.0 - smoothstep(0.80, 0.96, fishBand));
        metalnessFactor = clamp(0.06 + 0.36 * max(scaled, plate), 0.0, 0.44);
        metalnessFactor *= smoothstep(-0.292, -0.248, fishX);
        metalnessFactor *= 1.0 - 0.85 * smoothstep(0.88, 1.06, fishOrbit());
      } else if (vFishPart > 6.5 && vFishPart < 7.5) {
        metalnessFactor = 0.20;
      } else if (vFishPart < 6.5 || vFishPart > 11.5) {
        metalnessFactor = 0.05;
      } else {
        metalnessFactor = 0.0;
      }
    `,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      /* glsl */ `
      #include <roughnessmap_fragment>
      if (vFishPart < 0.5) {
        // Each scale is a slightly different mirror, which breaks what would
        // otherwise be one broad plastic highlight into a field of glints.
        float scale = 0.17 + fishHash(floor(fishScaleGrid())) * 0.13;
        roughnessFactor = mix(roughnessFactor, scale, fishScaleMask());
        roughnessFactor = mix(roughnessFactor, 0.44, smoothstep(0.60, 0.94, fishBand));
        float grain = fishHash(floor(vSkinPoint.xy * 260.0));
        roughnessFactor *= 1.0 + (grain - 0.5) * 0.26 * fishHead;
        roughnessFactor = mix(roughnessFactor, 0.06, 1.0 - smoothstep(0.86, 1.04, fishOrbit()));
      } else if (vFishPart > 6.5 && vFishPart < 7.5) {
        roughnessFactor = 0.34;
      } else if (vFishPart < 8.5) {
        roughnessFactor = 0.05;
      } else if (vFishPart > 9.5 && vFishPart < 10.5) {
        roughnessFactor = 0.09;
      }
    `,
    )
    .replace(
      "#include <normal_fragment_maps>",
      /* glsl */ `
      #include <normal_fragment_maps>
      if (vFishPart < 0.5) {
        float relief = fishScaleRelief() * 0.0012;
        vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
        vec3 rx = cross(dy, normal), ry = cross(normal, dx);
        float determinant = dot(dx, rx);
        vec3 gradient = sign(determinant) * (dFdx(relief) * rx + dFdy(relief) * ry);
        normal = normalize(abs(determinant) * normal - gradient);
      }
    `,
    )
    .replace(
      "#include <clearcoat_normal_fragment_maps>",
      /* glsl */ `
      #include <clearcoat_normal_fragment_maps>
      #ifdef USE_CLEARCOAT
        clearcoatNormal = normal;
      #endif
    `,
    )
    .replace(
      "#include <lights_physical_fragment>",
      /* glsl */ `
      #include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        // The cornea is a wet lens over the iris: one tight highlight, not a sheen.
        float cornea = step(6.5, vFishPart) * (1.0 - step(8.5, vFishPart))
          + step(9.5, vFishPart) * (1.0 - step(10.5, vFishPart));
        material.clearcoat = mix(material.clearcoat, 1.0, cornea);
        material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.02, cornea);
      #endif
      #ifdef USE_IRIDESCENCE
        // Thin-film interference over the guanine stack, mottled scale by scale.
        float sheenBand = vFishPart < 0.5
          ? fishReflector(fishBand, fishX) * smoothstep(-0.30, -0.22, fishX)
          : 0.0;
        material.iridescence *= 0.12 + sheenBand * 0.88;
        material.iridescenceThickness = 230.0
          + fishHash(floor(fishScaleGrid())) * 160.0
          + fishHash(floor(fishScaleGrid() * 0.34)) * 110.0;
      #endif
    `,
    )
    .replace(
      "#include <lights_fragment_end>",
      /* glsl */ `
      #include <lights_fragment_end>
      // The same transport for the light that arrives from everywhere, so the thin
      // places read lit through even with nothing behind them. View-independent, and
      // small enough to leave the modelling alone.
      reflectedLight.indirectDiffuse += (irradiance + iblIrradiance) * gFishThrough
        * ${glsl(THROUGH.ambient)} * RECIPROCAL_PI;
    `,
    );
}

export function createFishMaterials() {
  const skin = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.5,
    roughness: 0.32,
    clearcoat: 0.1,
    clearcoatRoughness: 0.3,
    iridescence: 0.5,
    iridescenceIOR: 1.38,
    iridescenceThicknessRange: [180, 420],
  });
  const fins = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.40,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  // Both materials run the same fragment hook; the define marks out the fin membranes.
  fins.defines.FISH_MEMBRANE = "";
  return { skin, fins };
}
