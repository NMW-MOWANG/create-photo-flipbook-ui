// Fairytale 3D bookshelf: an ornate cream-and-gold cabinet built from geometry, standing in a
// pale room with an arched castle window. Every book is a real 3D volume whose front cover is
// the book's own artwork; clicking one opens its reader.
import { books, bookUrl, coverUrl } from "./books.js";

const stage = document.getElementById("stage");
const label = document.getElementById("book-label");
const loading = document.getElementById("loading");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");

const CREAM = 0xf2e0cb, GOLD = 0xbf9455, PINK = 0xeebfc7, BG = 0xe6c4c5;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (err) {
  fail();
  throw err;
}

function fail() {
  document.getElementById("fallback").hidden = false;
  if (loading) loading.hidden = true;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.66;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 28, 54);

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
const CAM = new THREE.Vector3(-2.6, 5.55, 22.2);
const LOOK = new THREE.Vector3(0, 4.9, 0);
camera.position.copy(CAM);
camera.lookAt(LOOK);

// ---------- light ----------
scene.add(new THREE.HemisphereLight(0xfff3e8, 0xc29f90, 0.3));
const key = new THREE.DirectionalLight(0xfff0d8, 1.45);
key.position.set(-9, 12, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -9, right: 9, top: 11, bottom: -3, near: 1, far: 40 });
key.shadow.bias = -0.0006;
key.shadow.normalBias = 0.02;
scene.add(key);
const fill = new THREE.DirectionalLight(0xffe4ea, 0.22);
fill.position.set(8, 4, 7);
scene.add(fill);
const bounce = new THREE.PointLight(0xffd9bc, 0.3, 20, 2);
bounce.position.set(0, 1.4, 4.5);
scene.add(bounce);

// ---------- canvas textures: the room and the carving are drawn in code ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function radialSprite(inner, mid, size = 128) {
  return canvasTex(size, size, (g) => {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.5, mid);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  });
}

const wallpaperTex = canvasTex(512, 512, (g) => {
  g.fillStyle = "#f0dfd0"; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      const ox = (y / 64) % 2 ? 32 : 0;
      g.fillStyle = "rgba(180,132,74,0.26)";
      g.beginPath(); g.arc(x + ox, y, 2.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(214,158,166,0.34)";
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        g.beginPath();
        g.ellipse(x + ox + Math.cos(a) * 6, y + 32 + Math.sin(a) * 6, 4.2, 2.6, a, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}, [2, 2]);

const laceTex = canvasTex(512, 128, (g) => {
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = "#fffaf3";
  g.fillRect(0, 0, 512, 70);
  for (let x = 0; x < 512; x += 32) {
    g.beginPath(); g.moveTo(x, 68); g.quadraticCurveTo(x + 16, 124, x + 32, 68); g.fill();
  }
  g.globalCompositeOperation = "destination-out";
  for (let x = 10; x < 512; x += 22) {
    g.beginPath(); g.arc(x, 30, 5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x + 11, 82, 4, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "rgba(201,161,102,0.6)";
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 6); g.lineTo(512, 6); g.stroke();
}, [2, 1]);

const ornamentTex = canvasTex(512, 256, (g) => {
  g.clearRect(0, 0, 512, 256);
  const gold = "#c9a166", pale = "#fdf6ee", shade = "rgba(196,152,104,0.45)";
  const scroll = (mirror) => {
    g.save();
    g.translate(256, 150);
    g.scale(mirror, 1);
    g.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = i % 2 ? gold : shade;
      g.lineWidth = i % 2 ? 5 : 8;
      g.beginPath();
      g.arc(18 + i * 12, 0, 34 + i * 22, Math.PI * 0.1, Math.PI * 1.25);
      g.stroke();
    }
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i % 2 ? pale : "#f2e3d4";
      g.beginPath(); g.ellipse(78 + i * 40, -62 - i * 14, 28, 11, -0.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = gold; g.lineWidth = 2; g.stroke();
    }
    g.restore();
  };
  scroll(1); scroll(-1);
  g.fillStyle = pale;
  g.beginPath(); g.arc(256, 138, 34, 0, Math.PI * 2); g.fill();
  g.strokeStyle = gold; g.lineWidth = 3; g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    g.beginPath();
    g.ellipse(256 + Math.cos(a) * 18, 138 + Math.sin(a) * 18, 12, 7, a, 0, Math.PI * 2);
    g.fillStyle = i % 2 ? "#f0ded0" : pale; g.fill();
    g.strokeStyle = gold; g.lineWidth = 1.6; g.stroke();
  }
  g.fillStyle = gold;
  g.beginPath(); g.arc(256, 138, 6, 0, Math.PI * 2); g.fill();
  for (let i = -5; i <= 5; i++) {
    g.fillStyle = "#fff8f1";
    g.beginPath(); g.arc(256 + i * 30, 46 - Math.cos(i / 5 * Math.PI / 2) * 14, 5.5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(201,161,102,0.75)"; g.lineWidth = 1.3; g.stroke();
  }
});

const clothGrainTex = canvasTex(256, 256, (g) => {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = i % 2 ? "rgba(120,100,90,0.10)" : "rgba(255,255,255,0.16)";
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
}, [3, 3]);

const sheenTex = canvasTex(256, 256, (g) => {
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.12)");
  grad.addColorStop(0.6, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(255,255,255,0.18)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
});

const petalTex = radialSprite("rgba(255,240,244,0.95)", "rgba(248,200,210,0.5)");
const sparkTex = radialSprite("rgba(255,252,238,1)", "rgba(255,222,164,0.45)", 64);
const blossomTex = canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 - Math.PI / 2;
      const grad = g.createRadialGradient(64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22, 2, 64 + Math.cos(a) * 26, 64 + Math.sin(a) * 26, 26);
      grad.addColorStop(0, "rgba(255,255,255,0.98)");
      grad.addColorStop(0.6, "rgba(253,231,236,0.95)");
      grad.addColorStop(1, "rgba(246,205,214,0.15)");
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(64 + Math.cos(a) * 24, 64 + Math.sin(a) * 24, 20, 15, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(214,166,96,0.95)";
    g.beginPath(); g.arc(64, 64, 7, 0, Math.PI * 2); g.fill();
  });

const haloTexture = radialSprite("rgba(255,246,232,0.6)", "rgba(255,226,200,0.18)", 256);

// ---------- optional AI textures (assets/scene/*.png) ----------
// Generated textures replace the drawn ones when present; anything missing keeps its canvas version.
function aiTexture(name, apply, { keyOut = false } = {}) {
  const img = new Image();
  img.onload = () => {
    let source = img;
    if (keyOut) {
      // the carving is generated on a flat cream ground: drop that ground so it can sit on the crest
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, c.width, c.height);
      const [r0, g0, b0] = [data.data[0], data.data[1], data.data[2]];
      for (let i = 0; i < data.data.length; i += 4) {
        const near = Math.abs(data.data[i] - r0) + Math.abs(data.data[i + 1] - g0) + Math.abs(data.data[i + 2] - b0);
        if (near < 42) data.data[i + 3] = 0;
      }
      g.putImageData(data, 0, 0);
      source = c;
    }
    const t = new THREE.CanvasTexture(source);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    apply(t);
    for (const m of Object.values(mat)) m.needsUpdate = true;
  };
  img.onerror = () => {};  // no file yet: keep the drawn texture
  img.src = `assets/scene/${name}.png`;
}

// ---------- materials ----------
const mat = {
  body: new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.55, metalness: 0.03 }),
  gold: new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.85 }),
  pearl: new THREE.MeshStandardMaterial({ color: 0xfff7f1, roughness: 0.16, metalness: 0.04 }),
  wallpaper: new THREE.MeshStandardMaterial({ map: wallpaperTex, roughness: 0.92 }),
  lace: new THREE.MeshStandardMaterial({ map: laceTex, roughness: 0.85, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }),
  ornament: new THREE.MeshStandardMaterial({ map: ornamentTex, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }),
  crest: new THREE.MeshStandardMaterial({ map: ornamentTex, transparent: true, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }),
  pages: new THREE.MeshStandardMaterial({ color: 0xfdf7ee, roughness: 0.92 }),
};

aiTexture("lace", (t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  mat.lace.map = t;
});
aiTexture("ornament", (t) => { mat.ornament.map = t; });

// ---------- the cabinet ----------
const W = 8.2, H = 7.4, D = 1.9, T = 0.28;
const ROW_Y = [0.58, 2.86, 5.14];     // standing surface of the three shelves

const cabinet = new THREE.Group();
scene.add(cabinet);

function box(w, h, d, material, x, y, z, parent = cabinet) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// carcass
box(T, H, D, mat.body, -W / 2 + T / 2, H / 2, 0);
box(T, H, D, mat.body, W / 2 - T / 2, H / 2, 0);
box(W, T, D, mat.body, 0, H - T / 2, 0);
box(W, T, D, mat.body, 0, T / 2, 0);
for (const y of [ROW_Y[1] - T / 2, ROW_Y[2] - T / 2]) box(W - 2 * T, T, D - 0.1, mat.body, 0, y, 0.02);
// wallpapered back
const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, H - T * 2), mat.wallpaper);
back.position.set(0, H / 2, -D / 2 + 0.03);
back.receiveShadow = true;
cabinet.add(back);

// soft shading at the back of each bay
(() => {
  const shadeTex = canvasTex(256, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "rgba(120,86,72,0.30)");
    grad.addColorStop(0.7, "rgba(120,86,72,0.05)");
    grad.addColorStop(1, "rgba(120,86,72,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  });
  for (const [y0, y1] of [[ROW_Y[0], ROW_Y[1] - T], [ROW_Y[1], ROW_Y[2] - T], [ROW_Y[2], H - T]]) {
    const h = y1 - y0;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(W - 2 * T, h * 0.55),
      new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false }));
    panel.position.set(0, y1 - h * 0.275, -D / 2 + 0.05);
    cabinet.add(panel);
  }
})();

// gold trim: shelf lips and uprights
for (const y of [T, ROW_Y[1] - T, ROW_Y[1], ROW_Y[2] - T, ROW_Y[2], H - T]) {
  box(W - 0.02, 0.05, 0.055, mat.gold, 0, y, D / 2 - 0.01);
}
for (const x of [-W / 2 + T, W / 2 - T]) {
  box(0.055, H - T * 2, 0.055, mat.gold, x, H / 2, D / 2 - 0.005);
}
// pilasters on the outer faces, with a capital and a base at each end
for (const x of [-W / 2 - 0.015, W / 2 + 0.015]) {
  box(0.07, H - 1.3, 0.07, mat.gold, x, H / 2, D / 2 - 0.05);
  box(0.05, H - 1.8, 0.05, mat.gold, x, H / 2, -D / 2 + 0.35);
  box(0.24, 0.1, 0.2, mat.gold, x, H - 0.72, D / 2 - 0.05);
  box(0.24, 0.12, 0.2, mat.gold, x, 0.82, D / 2 - 0.05);
  const rosette = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 24), mat.gold);
  rosette.position.set(x, H * 0.5, D / 2 - 0.02);
  cabinet.add(rosette);
}

// carved panels on the outer side faces
for (const x of [-W / 2 - 0.005, W / 2 + 0.005]) {
  for (const y of [ROW_Y[1] + 0.42, ROW_Y[2] + 0.42]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), mat.ornament);
    panel.position.set(x, y, 0);
    panel.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
    cabinet.add(panel);
  }
}

// lace valance under each shelf lip
const laceGeo = new THREE.PlaneGeometry(W - T * 2, 0.3);
for (const y of [ROW_Y[1] - T, ROW_Y[2] - T, H - T]) {
  const lace = new THREE.Mesh(laceGeo, mat.lace);
  lace.position.set(0, y - 0.15, D / 2 + 0.005);
  cabinet.add(lace);
}

// pediment: a cornice and a carved crown above it
(() => {
  box(W + 0.5, 0.2, D + 0.16, mat.body, 0, H + 0.06, 0);
  box(W + 0.62, 0.06, D + 0.22, mat.gold, 0, H + 0.18, 0);

  // a solid crest panel behind the carving, so the spray sits on something
  const crestTex = canvasTex(512, 256, (g) => {
    g.clearRect(0, 0, 512, 256);
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#f7e9da");
    grad.addColorStop(1, "#e9d3c1");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(10, 256);
    g.quadraticCurveTo(256, -40, 502, 256);
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(191,148,85,0.75)";
    g.lineWidth = 5;
    g.stroke();
  });
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.62, 1.55),
    new THREE.MeshStandardMaterial({ map: crestTex, transparent: true, roughness: 0.6, side: THREE.DoubleSide }));
  crest.position.set(0, H + 0.62, -0.02);
  cabinet.add(crest);

  // a spray of carved scrollwork standing on the cornice
  const orn = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 1.38), mat.crest);
  orn.position.set(0, H + 0.6, 0.12);
  cabinet.add(orn);

  // gold arch drawn over the carving, ending in a finial
  const arc = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-W * 0.31, H + 0.28, 0.16),
    new THREE.Vector3(0, H + 1.22, 0.16),
    new THREE.Vector3(W * 0.31, H + 0.28, 0.16)
  );
  cabinet.add(new THREE.Mesh(new THREE.TubeGeometry(arc, 60, 0.032, 8, false), mat.gold));
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 18), mat.gold);
  finial.position.set(0, H + 0.84, 0.2);
  finial.castShadow = true;
  cabinet.add(finial);
  const crownTop = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), mat.gold);
  crownTop.position.set(0, H + 1.22, 0.16);
  cabinet.add(crownTop);
})();

// feet
for (const x of [-W / 2 + 0.6, W / 2 - 0.6]) {
  for (const z of [-D / 2 + 0.55, D / 2 - 0.55]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 18), mat.body);
    foot.position.set(x, 0.02, z);
    foot.scale.set(0.82, 1, 0.82);
    foot.castShadow = true;
    cabinet.add(foot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.032, 8, 32), mat.gold);
    ring.position.set(x, 0.18, z);
    ring.rotation.x = Math.PI / 2;
    cabinet.add(ring);
  }
}

// contact shadow
(() => {
  const t = radialSprite("rgba(120,84,72,0.45)", "rgba(120,84,72,0.1)", 256);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W + 4.5, 4.2),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, 0.012, 0.4);
  scene.add(plane);
})();

// a soft rose rug under the cabinet
(() => {
  const rugTex = canvasTex(512, 512, (g) => {
    const rad = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    rad.addColorStop(0, "rgba(246, 216, 220, 0.95)");
    rad.addColorStop(0.72, "rgba(238, 200, 206, 0.8)");
    rad.addColorStop(1, "rgba(238, 200, 206, 0)");
    g.fillStyle = rad; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "rgba(201,161,102,0.35)"; g.lineWidth = 3;
    g.beginPath(); g.arc(256, 256, 190, 0, Math.PI * 2); g.stroke();
  });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ map: rugTex, transparent: true, roughness: 0.95, depthWrite: false }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, 1.8);
  scene.add(rug);
})();

// a soft contact shadow under each object standing on a shelf
const contactTex = radialSprite("rgba(110,78,66,0.5)", "rgba(110,78,66,0.08)", 128);
function contact(x, y, z, w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.004, z);
  cabinet.add(m);
}
// ---------- books ----------
// Local axes: x = cover width, y = height, z = thickness (spine on -x, cover on +z).
const THICK = 0.32;
const bookRoots = [];

function spineTexture(book) {
  return canvasTex(128, 640, (g, w) => {
    g.fillStyle = book.paper || "#f6ece2";
    g.fillRect(0, 0, w, 640);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.06)" : "rgba(90,60,40,0.03)";
      g.fillRect(Math.random() * w, Math.random() * 640, 2, 2);
    }
    g.fillStyle = "rgba(201,161,102,0.85)";
    for (const y of [46, 66, 578, 598]) g.fillRect(8, y, w - 16, 3);
    const title = book.title;
    const size = title.length > 4 ? 34 : 40;
    g.font = `${size}px "Songti SC", Georgia, serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = book.ink || "#2a1d14";
    for (let i = 0; i < title.length; i++) g.fillText(title[i], w / 2, 110 + i * size * 1.2);
    g.fillStyle = "rgba(201,161,102,0.9)";
    g.beginPath(); g.arc(w / 2, 520, 7, 0, Math.PI * 2); g.fill();
  });
}

function makeBook(book, height) {
  const group = new THREE.Group();
  const width = height * 0.72;
  const src = coverUrl(book);
  const coverTex = src ? new THREE.TextureLoader().load(src) : null;
  if (coverTex) {
    coverTex.encoding = THREE.sRGBEncoding;
    coverTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }

  // the boards are bound in cloth in the book's own colour; the artwork is a plate inset on the front
  const clothColor = new THREE.Color(book.paper || "#efe0d0");
  const clothMat = new THREE.MeshStandardMaterial({
    color: clothColor, roughness: 0.78, metalness: 0.02, bumpMap: clothGrainTex, bumpScale: 0.004,
  });
  const artMat = new THREE.MeshStandardMaterial({
    map: coverTex, color: coverTex ? 0xffffff : PINK, roughness: 0.44, metalness: 0.06,
  });
  const spineMat = new THREE.MeshStandardMaterial({ map: spineTexture(book), roughness: 0.7 });

  // text block: the page edges, slightly smaller than the boards
  const block = new THREE.Mesh(new THREE.BoxGeometry(width - 0.05, height - 0.06, THICK - 0.05), mat.pages);
  block.position.z = 0.004;
  group.add(block);

  // boards
  const front = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.04), clothMat);
  front.position.z = THICK / 2 - 0.02;
  const rear = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.04), clothMat);
  rear.position.z = -THICK / 2 + 0.02;
  group.add(front, rear);

  // the artwork, inset from the board edge like a printed plate
  const mx = 0.052, my = 0.062;
  const artW = width - mx * 2, artH = height - my * 2;
  const art = new THREE.Mesh(new THREE.PlaneGeometry(artW, artH), artMat);
  art.position.set(0, 0, THICK / 2 + 0.0025);
  group.add(art);
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(artW, artH),
    new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 }));
  sheen.position.set(0, 0, THICK / 2 + 0.0035);
  group.add(sheen);

  // a thin gold rule around the plate, and a blind-tooled line just inside the board edge
  const rule = (w, h, x, y, mat, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), mat);
    m.position.set(x, y, z);
    group.add(m);
  };
  const gold = mat.gold;
  const blind = new THREE.MeshStandardMaterial({ color: clothColor.clone().multiplyScalar(0.82), roughness: 0.85 });
  for (const [w, h, x, y] of [
    [artW + 0.018, 0.012, 0, artH / 2 + 0.009],
    [artW + 0.018, 0.012, 0, -artH / 2 - 0.009],
    [0.012, artH + 0.03, artW / 2 + 0.009, 0],
    [0.012, artH + 0.03, -artW / 2 - 0.009, 0],
  ]) rule(w, h, x, y, gold, THICK / 2 + 0.003);
  for (const [w, h, x, y] of [
    [width - 0.03, 0.008, 0, height / 2 - 0.016],
    [width - 0.03, 0.008, 0, -height / 2 + 0.016],
    [0.008, height - 0.032, width / 2 - 0.016, 0],
    [0.008, height - 0.032, -width / 2 + 0.016, 0],
  ]) rule(w, h, x, y, blind, THICK / 2 + 0.0015);

  // spine on the -x edge: its -x face carries the title
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.045, height, THICK),
    [mat.pages, spineMat, mat.pages, mat.pages, mat.pages, mat.pages]);
  spine.position.x = -width / 2 + 0.008;
  group.add(spine);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, width };
}

// a decorative filler volume: banded board, not interactive
function makeDummyBook(height, color) {
  const g = new THREE.Group();
  const width = height * 0.2;
  const board = new THREE.MeshStandardMaterial({ color, roughness: 0.74, bumpMap: clothGrainTex, bumpScale: 0.003 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(width, height, THICK), board));
  // a slim gold rule down the spine edge
  const rule = new THREE.Mesh(new THREE.BoxGeometry(0.012, height - 0.34, 0.02), mat.gold);
  rule.position.set(-width / 2 - 0.006, 0, THICK / 2 - 0.06);
  g.add(rule);
  for (const y of [height / 2 - 0.12, -height / 2 + 0.12]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.012, 0.05, THICK + 0.012), mat.gold);
    band.position.y = y;
    g.add(band);
  }
  // a gold frame and a rosette on the front board
  const frameW = width - 0.05, frameH = height - 0.34;
  for (const [w, h, x, y] of [
    [frameW, 0.012, 0, frameH / 2], [frameW, 0.012, 0, -frameH / 2],
    [0.012, frameH, frameW / 2, 0], [0.012, frameH, -frameW / 2, 0],
  ]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.008), mat.gold);
    line.position.set(x, y, THICK / 2 + 0.006);
    g.add(line);
  }
  const rosette = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 20), mat.gold);
  rosette.position.set(0, height * 0.18, THICK / 2 + 0.012);
  g.add(rosette);
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), mat.pearl);
  pearl.position.set(0, height * 0.18, THICK / 2 + 0.02);
  g.add(pearl);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

const realBooks = books.filter((b) => b.dir);

// three feature books on the top and middle shelves, one on the bottom
const placement = [
  { row: 2, x: -2.25, rot: 0, scale: 1.0 },
  { row: 2, x: 0.6, rot: -0.04, scale: 1.1 },
  { row: 1, x: -1.1, rot: 0.02, scale: 1.18 },
  { row: 0, x: -1.85, rot: 0, scale: 1.24 },
];

realBooks.forEach((book, i) => {
  const spot = placement[i % placement.length];
  const height = 1.52 * spot.scale;
  const { group, width } = makeBook(book, height);
  group.position.set(spot.x, ROW_Y[spot.row] + height / 2 + 0.02, 0.18);
  group.rotation.y = spot.rot;
  group.userData = { book, base: { x: spot.x, y: group.position.y, z: 0.18 } };
  cabinet.add(group);
  bookRoots.push(group);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, transparent: true, depthWrite: false, opacity: 0.22 }));
  halo.scale.set(width * 2.0, height * 1.2, 1);
  halo.position.set(spot.x, group.position.y, -0.4);
  cabinet.add(halo);
});

// filler volumes, as on a real shelf
const fillers = [
  { row: 2, x: -3.45, h: 1.5, c: 0xc79aa6 }, { row: 2, x: -3.0, h: 1.42, c: 0xc2a582 },
  { row: 2, x: -0.65, h: 1.55, c: 0xc7ad8a }, { row: 2, x: 1.55, h: 1.45, c: 0xb5a0c2 },
  { row: 2, x: 2.0, h: 1.52, c: 0xc8b18d }, { row: 2, x: 2.45, h: 1.4, c: 0xc79ba7 },
  { row: 1, x: -2.35, h: 1.6, c: 0xc3a483 }, { row: 1, x: -0.3, h: 1.5, c: 0xc099a7 },
  { row: 1, x: 1.55, h: 1.58, c: 0xc9b28d }, { row: 1, x: 2.0, h: 1.48, c: 0xb19dbe },
  { row: 0, x: -3.1, h: 1.62, c: 0xc497a4 }, { row: 0, x: -2.65, h: 1.5, c: 0xbda07d },
  { row: 0, x: 1.3, h: 1.55, c: 0xbfa283 }, { row: 0, x: 1.75, h: 1.46, c: 0xc19daa },
  { row: 0, x: 2.2, h: 1.58, c: 0xc2ad88 },
];
for (const f of fillers) {
  const b = makeDummyBook(f.h, f.c);
  b.position.set(f.x, ROW_Y[f.row] + f.h / 2 + 0.02, 0.18);
  cabinet.add(b);
  contact(f.x, ROW_Y[f.row], 0.24, 0.55, 0.55);
}

for (const g of bookRoots) {
  const row = placement[realBooks.indexOf(g.userData.book)].row;
  contact(g.position.x, ROW_Y[row], 0.22, g.userData.book ? 0.9 : 0.7, 0.75);
}

// ---------- small decorations ----------
function pearl(x, y, z, r = 0.1) {
  const p = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat.pearl);
  p.position.set(x, y, z);
  p.castShadow = true;
  cabinet.add(p);
}
function ribbonRoll(x, y, z) {
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 20),
    new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.8 }));
  roll.rotation.z = Math.PI / 2;
  roll.position.set(x, y + 0.13, z);
  cabinet.add(roll);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 8, 24),
    new THREE.MeshStandardMaterial({ color: PINK, roughness: 0.8 }));
  loop.position.set(x + 0.42, y + 0.13, z);
  loop.rotation.y = Math.PI / 2;
  cabinet.add(loop);
}
function blossom(x, y, z, s = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: blossomTex, transparent: true, depthWrite: false }));
  sp.scale.set(0.42 * s, 0.42 * s, 1);
  sp.position.set(x, y, z);
  cabinet.add(sp);
  // a tiny gold centre, so it still catches the light from the side
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.016 * s, 10, 8), mat.gold);
  core.position.set(x, y, z + 0.01);
  cabinet.add(core);
}
pearl(-1.5, ROW_Y[2] + 0.16, 0.32); pearl(-1.24, ROW_Y[2] + 0.12, 0.44, 0.075);
blossom(-1.4, ROW_Y[2] + 0.36, 0.34, 1.1);
ribbonRoll(3.2, ROW_Y[2], 0.25);
blossom(3.5, ROW_Y[1] + 0.2, 0.32, 0.9);
pearl(0.55, ROW_Y[1] + 0.14, 0.38); pearl(0.82, ROW_Y[1] + 0.1, 0.46, 0.07);
(() => {
  const stackColours = [0xc9a9b2, 0xc9b58f];
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.8),
      new THREE.MeshStandardMaterial({ color: stackColours[i], roughness: 0.72 }));
    b.position.set(0.05, ROW_Y[0] + 0.07 + i * 0.14, 0.2);
    b.rotation.y = i * 0.07;
    b.castShadow = b.receiveShadow = true;
    cabinet.add(b);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.012, 0.82), mat.gold);
    edge.position.set(0.05, ROW_Y[0] + 0.14 + i * 0.14, 0.2);
    edge.rotation.y = i * 0.07;
    cabinet.add(edge);
  }
  blossom(0.05, ROW_Y[0] + 0.42, 0.2, 0.9);
})();
(() => {
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 28, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
    new THREE.MeshStandardMaterial({ color: 0xfff8f2, roughness: 0.18, side: THREE.DoubleSide })
  );
  bowl.position.set(2.85, ROW_Y[0] + 0.36, 0.2);
  cabinet.add(bowl);
  contact(2.85, ROW_Y[0], 0.24, 0.85, 0.85);
  pearl(2.85, ROW_Y[0] + 0.24, 0.2, 0.1);
})();

// a soft shadow cast on the wall behind the cabinet
(() => {
  const t = radialSprite("rgba(150,108,96,0.55)", "rgba(150,108,96,0.1)", 256);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(W + 5, 12),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.5 }));
  panel.position.set(0, H * 0.52, -12.2);
  scene.add(panel);
})();

// ---------- the room ----------
(() => {
  const wallTex = canvasTex(1024, 768, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 768);
    grad.addColorStop(0, "#f7e4e2");
    grad.addColorStop(0.5, "#f3dcda");
    grad.addColorStop(1, "#ead0cf");
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 768);
    g.strokeStyle = "rgba(201,161,102,0.3)";
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 250, y = 80, w = 190, h = 520;
      g.strokeRect(x, y, w, h);
      g.strokeStyle = "rgba(201,161,102,0.14)";
      g.strokeRect(x + 14, y + 14, w - 28, h - 28);
      g.strokeStyle = "rgba(201,161,102,0.3)";
    }
    g.fillStyle = "rgba(201,161,102,0.3)";
    g.fillRect(0, 640, 1024, 5);
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(56, 32), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }));
  wall.position.set(0, 11, -12.5);
  scene.add(wall);

  // arched window with a painted sky and a distant castle
  const skyTex = canvasTex(512, 768, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 768);
    grad.addColorStop(0, "#fff7ee");
    grad.addColorStop(0.4, "#f9cfd2");
    grad.addColorStop(0.75, "#eaa2b6");
    grad.addColorStop(1, "#dda3ad");
    g.fillStyle = grad; g.fillRect(0, 0, 512, 768);
    g.fillStyle = "rgba(132, 112, 128, 0.62)";
    const base = 600;
    g.fillRect(110, base - 100, 290, 130);
    for (const [x, w, h] of [[118, 48, 150], [205, 42, 210], [285, 54, 170], [350, 36, 132]]) {
      g.fillRect(x, base - h, w, h);
      g.beginPath();
      g.moveTo(x - 7, base - h); g.lineTo(x + w / 2, base - h - 54); g.lineTo(x + w + 7, base - h);
      g.closePath(); g.fill();
    }
    const haze = g.createLinearGradient(0, 420, 0, 768);
    haze.addColorStop(0, "rgba(255,246,240,0)");
    haze.addColorStop(1, "rgba(255,246,240,0.94)");
    g.fillStyle = haze; g.fillRect(0, 420, 512, 348);
  });

  const winShape = new THREE.Shape();
  const ww = 5.2, wh = 7.6, r = ww / 2;
  winShape.moveTo(-ww / 2, 0);
  winShape.lineTo(-ww / 2, wh - r);
  winShape.absarc(0, wh - r, r, Math.PI, 0, true);
  winShape.lineTo(ww / 2, 0);
  winShape.lineTo(-ww / 2, 0);
  const winGeo = new THREE.ShapeGeometry(winShape, 48);
  const uv = winGeo.attributes.uv, pos = winGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + ww / 2) / ww, pos.getY(i) / wh);
  uv.needsUpdate = true;
  const winGroup = new THREE.Group();
  const glass = new THREE.Mesh(winGeo, new THREE.MeshBasicMaterial({ map: skyTex }));
  winGroup.add(glass);
  aiTexture("sky", (t) => { glass.material.map = t; glass.material.needsUpdate = true; });

  const barMat = mat.gold;
  for (const x of [-ww / 2 - 0.05, ww / 2 + 0.05]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, wh - r + 0.1, 0.16), barMat);
    bar.position.set(x, (wh - r) / 2, 0.05);
    winGroup.add(bar);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.07, 10, 72, Math.PI), barMat);
  arch.position.set(0, wh - r, 0.05);
  winGroup.add(arch);
  for (const x of [-ww / 6, ww / 6]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, wh - 0.3, 0.1), barMat);
    bar.position.set(x, (wh - 0.3) / 2, 0.05);
    winGroup.add(bar);
  }
  for (let i = 1; i <= 3; i++) {
    const y = 0.7 + i * 1.5;
    if (y > wh - 0.6) break;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(ww - 0.12, 0.06, 0.1), barMat);
    bar.position.set(0, y, 0.05);
    winGroup.add(bar);
  }
  const sill = new THREE.Mesh(new THREE.BoxGeometry(ww + 1.0, 0.18, 0.55), mat.body);
  sill.position.set(0, -0.09, 0.2);
  sill.castShadow = sill.receiveShadow = true;
  winGroup.add(sill);
  winGroup.position.set(-8.8, 2.4, -11.8);
  winGroup.rotation.y = 0.18;
  scene.add(winGroup);

  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture, transparent: true, depthWrite: false, opacity: 0.5 }));
  glowSprite.scale.set(15, 15, 1);
  glowSprite.position.set(-8.4, 6.4, -11.2);
  scene.add(glowSprite);

  const floorTex = canvasTex(1024, 1024, (g) => {
    g.fillStyle = "#eed9cd"; g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = `rgba(196,150,112,${0.05 + Math.random() * 0.05})`;
      g.lineWidth = 1 + Math.random() * 2;
      const y = i * 36;
      g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y + 10); g.stroke();
    }
    const rad = g.createRadialGradient(512, 460, 60, 512, 512, 700);
    rad.addColorStop(0, "rgba(255,246,238,0.25)");
    rad.addColorStop(1, "rgba(170,120,105,0.28)");
    g.fillStyle = rad; g.fillRect(0, 0, 1024, 1024);
  }, [3, 3]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(56, 30), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.02, -1);
  floor.receiveShadow = true;
  scene.add(floor);

  const shaftTex = canvasTex(256, 512, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "rgba(255,244,220,0.55)");
    grad.addColorStop(1, "rgba(255,244,220,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 256, 512);
  });
  const shaft = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 18),
    new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 }));
  shaft.position.set(-8.6, 8.4, -6.6);
  shaft.rotation.z = 0.4;
  scene.add(shaft);

  // a side table with a vase of blossom stems, standing on the floor beside the cabinet
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xd8bda4, roughness: 0.62 });
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.12, 48), woodMat);
  top.position.y = 2.05;
  top.castShadow = top.receiveShadow = true;
  table.add(top);
  for (const [dx, dz] of [[-0.7, 0.5], [0.7, 0.5], [-0.7, -0.5], [0.7, -0.5]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 2.05, 12), woodMat);
    leg.position.set(dx, 1.02, dz);
    leg.castShadow = true;
    table.add(leg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.035, 8, 32), mat.gold);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.62;
  table.add(ring);
  table.position.set(5.5, 0, 0.3);
  scene.add(table);

  // porcelain vase
  const vasePoints = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    vasePoints.push(new THREE.Vector2(0.16 + Math.sin(t * Math.PI) * 0.22, t * 0.85));
  }
  const vase = new THREE.Mesh(new THREE.LatheGeometry(vasePoints, 40),
    new THREE.MeshStandardMaterial({ color: 0xfff6ee, roughness: 0.22, metalness: 0.05 }));
  vase.position.set(5.5, 2.11, 0.3);
  vase.castShadow = vase.receiveShadow = true;
  scene.add(vase);
  const vaseBand = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 32), mat.gold);
  vaseBand.rotation.x = Math.PI / 2;
  vaseBand.position.set(5.5, 2.55, 0.3);
  scene.add(vaseBand);

  // stems rising from the vase
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9 });
  const bouquet = [
    [[5.5, 2.85, 0.3], [5.15, 3.6, 0.2], [4.8, 4.3, 0.1], [4.55, 4.9, 0.05]],
    [[5.5, 2.85, 0.3], [5.7, 3.7, 0.45], [5.95, 4.5, 0.4], [6.1, 5.0, 0.25]],
    [[5.5, 2.85, 0.3], [5.35, 3.8, 0.05], [5.45, 4.6, -0.05], [5.55, 5.25, 0]],
    [[5.5, 2.85, 0.3], [5.85, 3.5, 0.15], [6.15, 4.0, 0], [6.3, 4.5, -0.1]],
  ];
  for (const pts of bouquet) {
    const curve = new THREE.CatmullRomCurve3(pts.map((a) => new THREE.Vector3(...a)));
    const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.022, 6, false), stemMat);
    stem.castShadow = true;
    scene.add(stem);
    for (const t of [0.7, 0.86, 1]) {
      const tip = curve.getPoint(t);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: blossomTex, transparent: true, depthWrite: false }));
      const size = 0.34 + Math.random() * 0.22;
      sp.scale.set(size, size, 1);
      sp.position.copy(tip).add(new THREE.Vector3((Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.18, (Math.random() - 0.5) * 0.18));
      scene.add(sp);
    }
  }
})();

// a low stool with two books, on the left, to balance the vase table
(() => {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xd9c0a6, roughness: 0.7 });
  const stool = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 40), woodMat);
  seat.position.y = 1.05;
  seat.castShadow = seat.receiveShadow = true;
  stool.add(seat);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 1.05, 10), woodMat);
    leg.position.set(Math.cos(a) * 0.62, 0.52, Math.sin(a) * 0.62);
    leg.rotation.z = Math.cos(a) * 0.06;
    leg.rotation.x = -Math.sin(a) * 0.06;
    leg.castShadow = true;
    stool.add(leg);
  }
  stool.position.set(-6.6, 0, 1.0);
  stool.rotation.y = 0.4;
  scene.add(stool);

  const coverTex = new THREE.TextureLoader().load("books/lvyin/assets/pages/cover-right.png");
  coverTex.encoding = THREE.sRGBEncoding;
  const lying = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.15),
    new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.6 }));
  lying.position.set(-6.6, 1.21, 1.0);
  lying.rotation.y = 0.4;
  lying.castShadow = lying.receiveShadow = true;
  scene.add(lying);
  const under = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xc9a9b2, roughness: 0.75 }));
  under.position.set(-6.55, 1.06, 1.05);
  under.rotation.y = 0.32;
  under.castShadow = true;
  scene.add(under);
})();

// ---------- petals and sparkles ----------
const petalCount = 70;
const petals = [];
const petalPoints = (() => {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(petalCount * 3);
  for (let i = 0; i < petalCount; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 22;
    pos[i * 3 + 1] = Math.random() * 15;
    pos[i * 3 + 2] = -2 + Math.random() * 7;
    petals.push({ speed: 0.12 + Math.random() * 0.22, sway: Math.random() * Math.PI * 2, amp: 0.3 + Math.random() * 0.6 });
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.32, map: petalTex, transparent: true, depthWrite: false, opacity: 0.85, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);
  return points;
})();

const sparkles = (() => {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 1] = Math.random() * 9;
    pos[i * 3 + 2] = -1 + Math.random() * 4;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.15, map: sparkTex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.8, sizeAttenuation: true,
  }));
  points.frustumCulled = false;
  scene.add(points);
  return points;
})();

// warm fairy lights drifting at the edges of the room
const fairyLights = [];
for (let i = 0; i < 9; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0.25 + Math.random() * 0.2,
  }));
  const s2 = 0.25 + Math.random() * 0.5;
  sp.scale.set(s2, s2, 1);
  sp.position.set(-11 + Math.random() * 7, 1.5 + Math.random() * 7.5, -8 + Math.random() * 2.5);
  sp.userData.phase = Math.random() * Math.PI * 2;
  fairyLights.push(sp);
  scene.add(sp);
}

// ---------- interaction ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-10, -10);
const parallax = new THREE.Vector2();
let hovered = null;
let pressed = null;

function pick() {
  raycaster.setFromCamera(pointer, camera);
  for (const hit of raycaster.intersectObjects(bookRoots, true)) {
    let node = hit.object;
    while (node && !bookRoots.includes(node)) node = node.parent;
    if (node) return node;
  }
  return null;
}

function setLabel(group, show) {
  if (!show || !group) { label.classList.remove("is-visible"); return; }
  const b = group.userData.book;
  const p = new THREE.Vector3(group.position.x, group.position.y + 1.05, group.position.z + 0.4).project(camera);
  const x = (p.x * 0.5 + 0.5) * stage.clientWidth;
  const y = (-p.y * 0.5 + 0.5) * stage.clientHeight;
  label.textContent = `${b.title} · ${b.pageCount} 页`;
  label.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  label.classList.add("is-visible");
}

function setPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  parallax.x = pointer.x;
  parallax.y = pointer.y;
}

renderer.domElement.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") setPointer(e); });
renderer.domElement.addEventListener("pointerleave", () => { pointer.set(-10, -10); parallax.set(0, 0); });
renderer.domElement.addEventListener("pointerdown", (e) => { setPointer(e); pressed = pick(); });
renderer.domElement.addEventListener("pointerup", (e) => {
  setPointer(e);
  const target = pick();
  if (target && target === pressed) location.href = bookUrl(target.userData.book.id);
  pressed = null;
});

const nav = document.getElementById("book-links");
realBooks.forEach((book) => {
  const a = document.createElement("a");
  a.href = bookUrl(book.id);
  a.textContent = `${book.title}，${book.pageCount} 页`;
  a.addEventListener("focus", () => {
    const g = bookRoots.find((x) => x.userData.book.id === book.id);
    hovered = g || null;
    setLabel(g, true);
  });
  a.addEventListener("blur", () => { if (hovered && hovered.userData.book.id === book.id) { hovered = null; setLabel(null, false); } });
  nav.appendChild(a);
});

// ---------- resize & loop ----------
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;

  // frame the cabinet by both its height and its width, along the same viewing direction
  const halfH = 6.05;
  const halfW = camera.aspect >= 1.25 ? 5.7 : camera.aspect >= 0.9 ? 4.75 : 3.85;
  const halfV = Math.tan((camera.fov * Math.PI / 180) / 2);
  const dist = Math.max(halfH / halfV, halfW / (halfV * camera.aspect));
  const dir = new THREE.Vector3().subVectors(LOOK, CAM).normalize();
  camera.position.copy(LOOK).addScaledVector(dir, -dist);
  camera.lookAt(LOOK);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
// the first layout can settle after load (and headless windows resize late), so keep watching
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
resize();

const clock = new THREE.Clock();
let started = false;

function frame() {
  const t = clock.getElapsedTime();
  const target = pressed || pick();
  if (target !== hovered) {
    hovered = target;
    setLabel(target, Boolean(target));
    if (finePointer.matches) renderer.domElement.style.cursor = target ? "pointer" : "";
  }

  for (const g of bookRoots) {
    const base = g.userData.base;
    const active = g === hovered;
    g.position.y += (base.y + (active ? 0.14 : 0) - g.position.y) * 0.14;
    g.position.z += (base.z + (active ? 0.34 : 0) - g.position.z) * 0.14;
    const s = active ? 1.04 : 1;
    g.scale.x += (s - g.scale.x) * 0.14;
    g.scale.y += (s - g.scale.y) * 0.14;
    g.scale.z += (s - g.scale.z) * 0.14;
  }
  if (hovered) setLabel(hovered, true);

  if (!reduceMotion) {
    const pos = petalPoints.geometry.attributes.position.array;
    for (let i = 0; i < petalCount; i++) {
      const p = petals[i];
      pos[i * 3 + 1] -= p.speed * 0.016;
      pos[i * 3] += Math.sin(t * 0.6 + p.sway) * p.amp * 0.004;
      if (pos[i * 3 + 1] < 0.4) { pos[i * 3 + 1] = 15; pos[i * 3] = (Math.random() - 0.5) * 22; }
    }
    petalPoints.geometry.attributes.position.needsUpdate = true;
    sparkles.material.opacity = 0.5 + Math.sin(t * 1.7) * 0.22;
    for (const f of fairyLights) f.material.opacity = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.9 + f.userData.phase));
    camera.position.x += (CAM.x + parallax.x * 0.5 - camera.position.x) * 0.05;
    camera.position.y += (CAM.y + parallax.y * 0.28 + Math.sin(t * 0.4) * 0.025 - camera.position.y) * 0.05;
    camera.lookAt(LOOK);
  }

  renderer.render(scene, camera);
  if (!started) {
    started = true;
    if (loading) {
      loading.classList.add("is-done");
      setTimeout(() => loading.remove(), 700);
    }
  }
  requestAnimationFrame(frame);
}
// the environment adds fill light; keep it subtle so the shading stays warm and defined
scene.traverse((o) => {
  if (!o.isMesh) return;
  for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    if (m && "envMapIntensity" in m) m.envMapIntensity = 0.42;
  }
});

requestAnimationFrame(frame);

stage.dataset.books = String(bookRoots.length);
