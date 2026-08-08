/* =========================================================
   Cofres de cariño 🐾 — game.js
   Juego en <canvas>: mueves un gatito tocando la pantalla,
   y cada cofre cercano se abre solo revelando un mensaje.

   ✏️  PERSONALIZA TU JUEGO EN "CONFIG" DE ABAJO.
   ========================================================= */

const CONFIG = {
  // Nombre que aparece en el título. Déjalo vacío ("") para usar "ti".
  recipientName: "",

  // Nombre del gatito.
  catName: "Michi",

  // Mensajes que aparecen al abrir cada cofre (se reparten en orden).
  // Puedes agregar o quitar líneas; el número de cofres se ajusta solo,
  // hasta un máximo razonable de 8.
  messages: [
    "Un mensaje solo para ti 💌",
    "Sonríe un poquito, te lo mereces 🌸",
    "Alguien piensa en ti hoy ✨",
    "Eres más fuerte de lo que crees 🐾",
    "Un pequeño respiro también cuenta 🍃",
    "Gracias por existir 💜",
    "Puedes ir despacio, no hay prisa 🌙",
    "Está bien descansar un ratito ☁️"
  ],

  // Mensaje final al abrir todos los cofres.
  finaleLine1: "Cada mensaje era real: pensé en ti al hacer cada uno.",
  finaleLine2: "Espero que este juego pequeño te haya sacado una sonrisa. Cuídate mucho. 🫂"
};

const CHEST_COUNT = Math.min(Math.max(CONFIG.messages.length, 3), 8);

/* =========================================================
   ESTADO
   ========================================================= */

const cat = {
  xFrac: 0.08,
  targetXFrac: 0.08,
  speed: 0.55,        // fracción del ancho por segundo
  facing: 1,           // 1 = derecha, -1 = izquierda
  walking: false,
  bobPhase: 0,
  tailPhase: 0,
  blinkTimer: 2 + Math.random() * 2,
  blinking: false
};

let chests = [];
let particles = [];
let lastTime = 0;
let canvas, ctx, dpr;
let reduceMotion = false;

/* =========================================================
   INIT
   ========================================================= */

function init() {
  reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  applyConfigText();
  buildChests();
  loadProgress();

  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  resizeCanvas();
  window.addEventListener("resize", debounce(resizeCanvas, 150));
  window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 200));

  initInput();
  initResetButton();
  initFinaleModal();

  updateCounterUI();
  checkAlreadyOpenedOnLoad();

  requestAnimationFrame(loop);
}

function applyConfigText() {
  document.getElementById("catNameLabel").textContent = CONFIG.catName;
  if (CONFIG.recipientName && CONFIG.recipientName.trim()) {
    document.getElementById("recipientName").textContent = CONFIG.recipientName;
  }
  document.getElementById("chestTotal").textContent = CHEST_COUNT;
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* =========================================================
   COFRES
   ========================================================= */

function buildChests() {
  chests = [];
  const margin = 0.09;
  const usable = 1 - margin * 2;
  for (let i = 0; i < CHEST_COUNT; i++) {
    const xFrac = margin + (usable * (i + 0.5)) / CHEST_COUNT;
    chests.push({
      id: "chest-" + i,
      xFrac,
      message: CONFIG.messages[i % CONFIG.messages.length],
      opened: false,
      lidAngle: 0,       // 0 = cerrado, 1 = abierto
      justOpened: false,
      glowPulse: Math.random() * Math.PI * 2
    });
  }
}

function groundYFrac(xFrac) {
  // Colina suave: una curva senoidal sutil.
  return 0.72 + Math.sin(xFrac * Math.PI * 2.2) * 0.045;
}

/* =========================================================
   CANVAS / RESIZE
   ========================================================= */

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* =========================================================
   INPUT (mouse + touch unificado con Pointer Events)
   ========================================================= */

function initInput() {
  function handlePointer(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xFrac = clamp((clientX - rect.left) / rect.width, 0.02, 0.98);
    cat.targetXFrac = xFrac;
    cat.facing = xFrac >= cat.xFrac ? 1 : -1;
  }

  canvas.addEventListener("pointerdown", handlePointer);
  canvas.addEventListener("pointermove", (e) => {
    if (e.pressure > 0 || e.buttons > 0) handlePointer(e);
  });
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/* =========================================================
   BUCLE PRINCIPAL
   ========================================================= */

function loop(t) {
  const dt = Math.min((t - lastTime) / 1000, 0.05) || 0;
  lastTime = t;

  update(dt, t / 1000);
  draw();

  requestAnimationFrame(loop);
}

function update(dt, tSec) {
  // Movimiento del gato hacia el objetivo.
  const dx = cat.targetXFrac - cat.xFrac;
  const dist = Math.abs(dx);
  cat.walking = dist > 0.004;

  if (cat.walking) {
    const step = Math.sign(dx) * cat.speed * dt;
    if (Math.abs(step) > dist) {
      cat.xFrac = cat.targetXFrac;
    } else {
      cat.xFrac += step;
    }
    cat.facing = dx >= 0 ? 1 : -1;
  }

  cat.bobPhase += dt * (cat.walking ? 9 : 2.2);
  cat.tailPhase += dt * (cat.walking ? 5 : 2);

  cat.blinkTimer -= dt;
  if (cat.blinkTimer <= 0) {
    cat.blinking = true;
    if (cat.blinkTimer <= -0.14) {
      cat.blinking = false;
      cat.blinkTimer = 2.5 + Math.random() * 3;
    }
  }

  // Revisar cofres cercanos.
  chests.forEach((chest) => {
    const near = Math.abs(cat.xFrac - chest.xFrac) < 0.045;
    if (near && !chest.opened) {
      openChest(chest);
    }
    // Animar tapa.
    const targetAngle = chest.opened ? 1 : 0;
    chest.lidAngle += (targetAngle - chest.lidAngle) * Math.min(dt * 6, 1);
    chest.glowPulse += dt * 2;
  });

  updateParticles(dt);
}

/* =========================================================
   ABRIR COFRE
   ========================================================= */

function openChest(chest) {
  chest.opened = true;
  chest.justOpened = true;
  saveProgress();
  updateCounterUI();
  showMessage(chest.message);
  spawnSparkles(chest.xFrac);
  checkFinale();
  setTimeout(() => { chest.justOpened = false; }, 600);
}

function updateCounterUI() {
  const openedCount = chests.filter((c) => c.opened).length;
  document.getElementById("chestCount").textContent = openedCount;
  const resetBtn = document.getElementById("resetBtn");
  if (openedCount > 0) resetBtn.classList.remove("hidden");
}

function showMessage(text) {
  const bubble = document.getElementById("messageBubble");
  bubble.classList.remove("hidden", "show");
  void bubble.offsetWidth;
  bubble.textContent = text;
  bubble.classList.add("show");
}

/* =========================================================
   PARTÍCULAS (destellos al abrir)
   ========================================================= */

function spawnSparkles(xFrac) {
  if (reduceMotion) return;
  const count = 10;
  for (let i = 0; i < count; i++) {
    particles.push({
      xFrac,
      yFrac: groundYFrac(xFrac) - 0.04,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -0.25 - Math.random() * 0.25,
      life: 0.7 + Math.random() * 0.4,
      maxLife: 0.7 + Math.random() * 0.4,
      size: 3 + Math.random() * 3,
      hue: Math.random() > 0.5 ? "gold" : "purple"
    });
  }
}

function updateParticles(dt) {
  particles.forEach((p) => {
    p.xFrac += p.vx * dt;
    p.yFrac += p.vy * dt;
    p.vy += 0.4 * dt;
    p.life -= dt;
  });
  particles = particles.filter((p) => p.life > 0);
}

/* =========================================================
   DIBUJO
   ========================================================= */

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  drawSky(w, h);
  drawHills(w, h);
  chests.forEach((chest) => drawChest(chest, w, h));
  drawCat(w, h);
  drawParticles(w, h);
}

function drawSky(w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#c9aef2");
  g.addColorStop(0.5, "#ffc2dd");
  g.addColorStop(1, "#ffdfb0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Sol/luna suave decorativo.
  ctx.save();
  ctx.globalAlpha = 0.85;
  const sunGrad = ctx.createRadialGradient(w * 0.82, h * 0.16, 4, w * 0.82, h * 0.16, 46);
  sunGrad.addColorStop(0, "rgba(255,246,214,0.95)");
  sunGrad.addColorStop(1, "rgba(255,246,214,0)");
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(w * 0.82, h * 0.16, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Nubecitas suaves.
  drawCloud(w * 0.18, h * 0.14, 0.9);
  drawCloud(w * 0.55, h * 0.09, 0.6);
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.ellipse(x, y, 26 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 18 * scale, y - 6 * scale, 16 * scale, 10 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 16 * scale, y - 4 * scale, 14 * scale, 9 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHills(w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, h);
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const xFrac = i / steps;
    const y = groundYFrac(xFrac) * h;
    ctx.lineTo(xFrac * w, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  const hillGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
  hillGrad.addColorStop(0, "#8fdba9");
  hillGrad.addColorStop(1, "#5cb885");
  ctx.fillStyle = hillGrad;
  ctx.fill();
  ctx.restore();

  // Textura de pasto: pequeñas líneas.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    const xFrac = (i + 0.5) / 26;
    const yBase = groundYFrac(xFrac) * h;
    ctx.beginPath();
    ctx.moveTo(xFrac * w, yBase + 4);
    ctx.lineTo(xFrac * w, yBase + 12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawChest(chest, w, h) {
  const x = chest.xFrac * w;
  const groundY = groundYFrac(chest.xFrac) * h;
  const size = Math.min(w, h) * 0.09;
  const y = groundY - size * 0.5;

  ctx.save();
  ctx.translate(x, y);

  // Brillo suave si está abierto.
  if (chest.opened) {
    const pulse = 0.5 + Math.sin(chest.glowPulse) * 0.15;
    const glow = ctx.createRadialGradient(0, -size * 0.3, 2, 0, -size * 0.3, size * 1.6);
    glow.addColorStop(0, `rgba(240,200,105,${0.35 * pulse})`);
    glow.addColorStop(1, "rgba(240,200,105,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -size * 0.3, size * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Base del cofre.
  ctx.fillStyle = "#b5793f";
  roundRect(ctx, -size * 0.55, -size * 0.1, size * 1.1, size * 0.7, size * 0.08);
  ctx.fill();

  // Franja metálica central.
  ctx.fillStyle = "#f0c869";
  ctx.fillRect(-size * 0.07, -size * 0.1, size * 0.14, size * 0.7);

  // Tapa (rota según lidAngle 0..1).
  const lidRot = -chest.lidAngle * 0.9;
  ctx.save();
  ctx.translate(0, -size * 0.1);
  ctx.rotate(lidRot);
  ctx.fillStyle = "#8a5a2b";
  roundRect(ctx, -size * 0.58, -size * 0.42, size * 1.16, size * 0.42, size * 0.1);
  ctx.fill();
  ctx.fillStyle = "#f0c869";
  ctx.fillRect(-size * 0.07, -size * 0.42, size * 0.14, size * 0.42);
  // Broche dorado.
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = "#f0c869";
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function drawCat(w, h) {
  const x = cat.xFrac * w;
  const groundY = groundYFrac(cat.xFrac) * h;
  const size = Math.min(w, h) * 0.1;
  const bob = cat.walking ? Math.sin(cat.bobPhase) * size * 0.06 : Math.sin(cat.bobPhase) * size * 0.015;
  const y = groundY - size * 0.55 + bob;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(cat.facing, 1);

  // Sombra.
  ctx.save();
  ctx.translate(0, size * 0.62 - bob * 0.3);
  ctx.fillStyle = "rgba(74,59,82,0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.5, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Cola.
  const tailWag = Math.sin(cat.tailPhase) * 0.5;
  ctx.save();
  ctx.translate(-size * 0.42, size * 0.05);
  ctx.rotate(0.6 + tailWag * 0.3);
  ctx.strokeStyle = "#d98a4a";
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-size * 0.3, -size * 0.25, -size * 0.15, -size * 0.55);
  ctx.stroke();
  ctx.restore();

  // Cuerpo.
  ctx.fillStyle = "#f0a868";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.12, size * 0.42, size * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pancita crema.
  ctx.fillStyle = "#fff3e0";
  ctx.beginPath();
  ctx.ellipse(size * 0.02, size * 0.22, size * 0.26, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Patitas.
  ctx.fillStyle = "#f0a868";
  const legLift = cat.walking ? Math.abs(Math.sin(cat.bobPhase)) * size * 0.08 : 0;
  ctx.beginPath();
  ctx.ellipse(-size * 0.18, size * 0.4 - legLift, size * 0.1, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(size * 0.2, size * 0.4 - (size * 0.08 - legLift), size * 0.1, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cabeza.
  ctx.save();
  ctx.translate(size * 0.28, -size * 0.14);

  // Orejas.
  ctx.fillStyle = "#f0a868";
  ctx.beginPath();
  ctx.moveTo(-size * 0.16, -size * 0.18);
  ctx.lineTo(-size * 0.04, -size * 0.4);
  ctx.lineTo(size * 0.06, -size * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.06, -size * 0.2);
  ctx.lineTo(size * 0.2, -size * 0.4);
  ctx.lineTo(size * 0.26, -size * 0.14);
  ctx.closePath();
  ctx.fill();
  // Interior orejas.
  ctx.fillStyle = "#d9769a";
  ctx.beginPath();
  ctx.moveTo(-size * 0.1, -size * 0.2);
  ctx.lineTo(-size * 0.04, -size * 0.32);
  ctx.lineTo(size * 0.02, -size * 0.18);
  ctx.closePath();
  ctx.fill();

  // Cráneo.
  ctx.fillStyle = "#f0a868";
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.24, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cachetes crema.
  ctx.fillStyle = "#fff3e0";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.06, size * 0.18, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ojos.
  ctx.fillStyle = "#4a3b52";
  const eyeY = -size * 0.02;
  if (cat.blinking) {
    ctx.strokeStyle = "#4a3b52";
    ctx.lineWidth = size * 0.02;
    ctx.beginPath();
    ctx.moveTo(-size * 0.1, eyeY);
    ctx.lineTo(-size * 0.02, eyeY);
    ctx.moveTo(size * 0.03, eyeY);
    ctx.lineTo(size * 0.11, eyeY);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-size * 0.06, eyeY, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size * 0.07, eyeY, size * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nariz.
  ctx.fillStyle = "#d9769a";
  ctx.beginPath();
  ctx.moveTo(0, size * 0.04);
  ctx.lineTo(-size * 0.025, size * 0.07);
  ctx.lineTo(size * 0.025, size * 0.07);
  ctx.closePath();
  ctx.fill();

  // Bigotes.
  ctx.strokeStyle = "rgba(74,59,82,0.4)";
  ctx.lineWidth = size * 0.012;
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(side * size * 0.1, size * (0.06 + i * 0.03));
      ctx.lineTo(side * size * 0.26, size * (0.02 + i * 0.045));
      ctx.stroke();
    }
  });

  ctx.restore(); // cabeza
  ctx.restore(); // gato
}

function drawParticles(w, h) {
  particles.forEach((p) => {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.hue === "gold" ? "#f0c869" : "#b6a3f2";
    ctx.beginPath();
    ctx.arc(p.xFrac * w, p.yFrac * h, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/* =========================================================
   FINAL / REINICIO
   ========================================================= */

function checkFinale() {
  const allOpened = chests.every((c) => c.opened);
  if (allOpened) {
    setTimeout(() => {
      document.getElementById("finaleModal").classList.remove("hidden");
    }, 500);
  }
}

function initFinaleModal() {
  const lines = document.querySelectorAll(".finale-line");
  if (lines[0]) lines[0].textContent = CONFIG.finaleLine1;
  if (lines[1]) lines[1].textContent = CONFIG.finaleLine2;

  document.getElementById("finaleClose").addEventListener("click", () => {
    document.getElementById("finaleModal").classList.add("hidden");
  });
}

function initResetButton() {
  document.getElementById("resetBtn").addEventListener("click", () => {
    chests.forEach((c) => { c.opened = false; c.lidAngle = 0; });
    document.getElementById("messageBubble").classList.add("hidden", "show");
    document.getElementById("resetBtn").classList.add("hidden");
    saveProgress();
    updateCounterUI();
  });
}

function checkAlreadyOpenedOnLoad() {
  if (chests.some((c) => c.opened)) {
    document.getElementById("resetBtn").classList.remove("hidden");
  }
}

/* =========================================================
   PERSISTENCIA
   ========================================================= */

function saveProgress() {
  const openedIds = chests.filter((c) => c.opened).map((c) => c.id);
  localStorage.setItem("cofresGatito_progress", JSON.stringify(openedIds));
}

function loadProgress() {
  try {
    const raw = localStorage.getItem("cofresGatito_progress");
    if (!raw) return;
    const openedIds = JSON.parse(raw);
    chests.forEach((c) => {
      if (openedIds.includes(c.id)) {
        c.opened = true;
        c.lidAngle = 1;
      }
    });
  } catch (e) {
    // Progreso corrupto: comenzar de cero sin romper la página.
  }
}

/* =========================================================
   ARRANQUE
   ========================================================= */

document.addEventListener("DOMContentLoaded", init);
