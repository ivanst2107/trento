import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BG = 0x05060a;
const MINT = new THREE.Color(0x5cf2c5);
const VIOLET = new THREE.Color(0x8b7bff);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => v * v * (3 - 2 * v);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Floating "ledger cards" that morph between three states as the visitor scrolls:
 *   0 = chaos (scattered manual work), 1 = helix (data connected around a core),
 *   2 = grid (an orderly, living data surface).
 */
export function createScene(canvas, { mobile = false, reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.042);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 15);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const keyLight = new THREE.PointLight(MINT, 28, 40);
  keyLight.position.set(6, 4, 6);
  const rimLight = new THREE.PointLight(VIOLET, 40, 40);
  rimLight.position.set(-7, -3, 4);
  scene.add(keyLight, rimLight);

  const world = new THREE.Group();
  scene.add(world);

  // ---- Cards ---------------------------------------------------------------
  const COUNT = mobile ? 340 : 820;
  const ACCENT_EVERY = 9; // every Nth card glows
  const cardGeo = new THREE.BoxGeometry(0.62, 0.4, 0.014);

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0f121b, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 0.55,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x0a0f0e, emissive: MINT, emissiveIntensity: 1.25, metalness: 0.1, roughness: 0.4,
  });

  const accentIdx = [];
  const plainIdx = [];
  for (let i = 0; i < COUNT; i++) (i % ACCENT_EVERY === 0 ? accentIdx : plainIdx).push(i);

  const plainMesh = new THREE.InstancedMesh(cardGeo, glass, plainIdx.length);
  const accentMesh = new THREE.InstancedMesh(cardGeo, glow, accentIdx.length);
  plainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  accentMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // A few accent cards glow violet instead of mint.
  accentIdx.forEach((_, j) => accentMesh.setColorAt(j, j % 3 === 0 ? VIOLET.clone().multiplyScalar(1.3) : new THREE.Color(1, 1, 1)));
  world.add(plainMesh, accentMesh);

  // Per-card target states (positions + orientations) and stagger delays.
  const P = [new Float32Array(COUNT * 3), new Float32Array(COUNT * 3), new Float32Array(COUNT * 3)];
  const Q = [[], [], []];
  const delay = new Float32Array(COUNT);
  const phase = new Float32Array(COUNT);

  const e = new THREE.Euler();
  const cols = mobile ? 20 : 34;
  const rows = Math.ceil(COUNT / cols);

  for (let i = 0; i < COUNT; i++) {
    const k = i / COUNT;
    phase[i] = Math.random() * Math.PI * 2;
    delay[i] = Math.random();

    // chaos: a thick, uneven shell
    const r = 4 + Math.random() * 6;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    P[0].set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.75, r * Math.sin(ph) * Math.sin(th) * 0.6], i * 3);
    Q[0].push(new THREE.Quaternion().setFromEuler(e.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3)));

    // helix: a double strand of cards wrapped around the core
    const strand = i % 2;
    const a = k * Math.PI * 2 * 7 + strand * Math.PI;
    const hr = 3.1 + Math.sin(k * 40) * 0.25;
    P[1].set([Math.cos(a) * hr, (k - 0.5) * 13, Math.sin(a) * hr], i * 3);
    Q[1].push(new THREE.Quaternion().setFromEuler(e.set(0, -a + Math.PI / 2, 0)));

    // grid: a flat data surface viewed at an angle
    const c = i % cols;
    const rw = Math.floor(i / cols);
    P[2].set([(c - cols / 2 + 0.5) * 0.7, -2.2, (rw - rows / 2 + 0.5) * 0.48], i * 3);
    Q[2].push(new THREE.Quaternion().setFromEuler(e.set(-Math.PI / 2, 0, 0)));
  }

  // ---- Core ----------------------------------------------------------------
  const core = new THREE.Group();
  const coreWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.25, 1)),
    new THREE.LineBasicMaterial({ color: MINT, transparent: true, opacity: 0.9 }),
  );
  const coreOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: VIOLET, emissiveIntensity: 2.2 }),
  );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.012, 8, 160),
    new THREE.MeshBasicMaterial({ color: MINT, transparent: true, opacity: 0.6 }),
  );
  ring.rotation.x = Math.PI / 2.3;
  core.add(coreWire, coreOrb, ring);
  world.add(core);

  // ---- Dust ----------------------------------------------------------------
  const DUST = mobile ? 600 : 1600;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos.set([(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 30], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x9aa3c7, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  scene.add(dust);

  // ---- Post-processing ------------------------------------------------------
  let composer = null;
  if (!mobile) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.4));
    composer.addPass(new OutputPass());
  }

  // ---- State ---------------------------------------------------------------
  const state = { morph: 0, morphTarget: 0, dim: 0, dimTarget: 0, px: 0, py: 0, pxT: 0, pyT: 0 };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3(1, 1, 1);
  const clock = new THREE.Clock();

  function cardTransform(i, t) {
    const m = state.morph;
    const seg = m < 1 ? 0 : 1;
    const f = smooth(clamp01((m - seg - delay[i] * 0.35) / 0.65));
    const a = seg, b = seg + 1;
    const i3 = i * 3;
    v.set(
      lerp(P[a][i3], P[b][i3], f),
      lerp(P[a][i3 + 1], P[b][i3 + 1], f),
      lerp(P[a][i3 + 2], P[b][i3 + 2], f),
    );
    q.slerpQuaternions(Q[a][i], Q[b][i], f);

    // Life: chaos drifts and tumbles, the grid ripples like live data.
    const chaosW = clamp01(1 - m);
    const gridW = clamp01(m - 1);
    v.y += Math.sin(t * 0.6 + phase[i]) * 0.25 * chaosW;
    v.x += Math.cos(t * 0.4 + phase[i]) * 0.15 * chaosW;
    if (gridW > 0) {
      v.y += (Math.sin(v.x * 0.55 + t * 1.1) * 0.35 + Math.cos(v.z * 0.7 + t * 0.8) * 0.25) * gridW;
    }
    m4.compose(v, q, s);
  }

  let wide = false;
  function resize() {
    const w = window.innerWidth;
    wide = w > 1000;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    // Pull the camera back on narrow screens so the scene still fits.
    camera.position.z = w < 700 ? 19 : 15;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let running = true;
  let last = performance.now();
  function frame(now = performance.now()) {
    if (!running) return;
    const t = reduced ? 0 : clock.getElapsedTime();
    // Frame-rate independent easing (same feel at 30, 60 or 120 fps).
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ease = reduced ? 1 : 1 - Math.pow(0.0125, dt);
    const soft = 1 - Math.pow(0.05, dt);
    state.morph = lerp(state.morph, state.morphTarget, ease);
    state.dim = lerp(state.dim, state.dimTarget, ease);
    state.px = lerp(state.px, state.pxT, soft);
    state.py = lerp(state.py, state.pyT, soft);

    let pj = 0, aj = 0;
    for (let i = 0; i < COUNT; i++) {
      cardTransform(i, t);
      if (i % ACCENT_EVERY === 0) accentMesh.setMatrixAt(aj++, m4);
      else plainMesh.setMatrixAt(pj++, m4);
    }
    plainMesh.instanceMatrix.needsUpdate = true;
    accentMesh.instanceMatrix.needsUpdate = true;

    const helixW = 1 - Math.abs(state.morph - 1); // peaks in the helix state
    const gridW = clamp01(state.morph - 1);
    world.rotation.y = t * lerp(0.06, 0.22, clamp01(helixW)) * (1 - gridW * 0.8) + state.px * 0.25;
    world.rotation.x = lerp(0, 0.42, gridW) + state.py * 0.08;
    world.position.y = lerp(0, 1.2, gridW);
    // On wide screens the opening chaos sits right of the headline.
    world.position.x = wide ? lerp(3.2, 0, clamp01(state.morph)) : 0;

    const coreS = (0.25 + 0.75 * clamp01(helixW)) * (1 - gridW);
    core.scale.setScalar(Math.max(0.001, coreS));
    coreWire.rotation.set(t * 0.3, t * 0.45, 0);
    ring.rotation.z = t * 0.5;

    dust.rotation.y = t * 0.01;
    camera.position.x = state.px * 1.1;
    camera.position.y = -state.py * 0.7;
    camera.lookAt(0, 0, 0);

    renderer.toneMappingExposure = 1 - state.dim * 0.75;
    if (composer) composer.render();
    else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    if (visible && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    else if (!visible) running = false;
  });

  return {
    /** 0 = chaos, 1 = helix, 2 = grid */
    setMorph(m) { state.morphTarget = m; },
    /** 0 = full brightness, 1 = dimmed behind content */
    setDim(d) { state.dimTarget = d; },
    /** pointer in -1..1 */
    setPointer(x, y) { state.pxT = x; state.pyT = y; },
  };
}
