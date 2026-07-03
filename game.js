// ============================================================
//  SNAKE GAME — Enhanced Edition
// ============================================================

// --- Canvas setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const SIZE = 520;
const GRID = 20;
const CELL = SIZE / GRID; // 26px

canvas.width = SIZE;
canvas.height = SIZE;

// --- DOM refs ---
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMessage = document.getElementById('overlayMessage');
const startBtn = document.getElementById('startBtn');

// --- Game state ---
let snake = [];
let prevSnake = []; // for smooth interpolation
let food = { x: 0, y: 0 };
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let prevDirection = { x: 1, y: 0 }; // for smooth head rotation
let score = 0;
let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
let gameOver = false;
let isPaused = false;
let isRunning = false;
let gameLoopId = null;
let inputQueue = [];

// --- Interpolation state ---
let lastTickTime = 0;
let tickProgress = 1; // 0 → 1 between ticks

// --- Animation state ---
let foodAnim = 0;
let tongueAnim = 0;
let particles = [];
let stars = [];
let screenShake = 0;
let gridPulse = 0;

highScoreEl.textContent = highScore;

// ============================================================
//  STARFIELD
// ============================================================
function initStars() {
  stars = [];
  for (let i = 0; i < 80; i++) {
    stars.push({
      x: Math.random() * SIZE,
      y: Math.random() * SIZE,
      r: 0.3 + Math.random() * 1.2,
      baseAlpha: 0.2 + Math.random() * 0.6,
      alpha: 0.2 + Math.random() * 0.6,
      speed: 0.005 + Math.random() * 0.02,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function updateStars() {
  for (const s of stars) {
    s.alpha = s.baseAlpha + Math.sin(s.phase + performance.now() * s.speed) * 0.3;
    s.alpha = Math.max(0.1, Math.min(1, s.alpha));
  }
}

function drawStars() {
  for (const s of stars) {
    ctx.globalAlpha = s.alpha * 0.6;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // Glow on brighter stars
    if (s.r > 0.8) {
      ctx.globalAlpha = s.alpha * 0.15;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = '#a5f3fc';
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ============================================================
//  SNAKE COLORS
// ============================================================
function snakeGradient(t) {
  const r1 = 16,  g1 = 185, b1 = 129;
  const r2 = 59,  g2 = 130, b2 = 246;
  const r3 = 139, g3 = 92,  b3 = 246;
  if (t < 0.5) {
    const u = t / 0.5;
    return {
      r: Math.round(r1 + (r2 - r1) * u),
      g: Math.round(g1 + (g2 - g1) * u),
      b: Math.round(b1 + (b2 - b1) * u),
    };
  } else {
    const u = (t - 0.5) / 0.5;
    return {
      r: Math.round(r2 + (r3 - r2) * u),
      g: Math.round(g2 + (g3 - g2) * u),
      b: Math.round(b2 + (b3 - b2) * u),
    };
  }
}

// ============================================================
//  INIT
// ============================================================
function initGame() {
  const mid = Math.floor(GRID / 2);
  snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  prevSnake = snake.map(s => ({ ...s }));
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  prevDirection = { x: 1, y: 0 };
  score = 0;
  gameOver = false;
  isPaused = false;
  inputQueue = [];
  particles = [];
  screenShake = 0;
  tickProgress = 1;
  scoreEl.textContent = '0';
  scoreEl.classList.remove('score-pop');
  spawnFood();
}

function spawnFood() {
  const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
  const free = [];
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  if (free.length === 0) return;
  food = free[Math.floor(Math.random() * free.length)];
}

// ============================================================
//  PARTICLES
// ============================================================
function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x: x * CELL + CELL / 2,
      y: y * CELL + CELL / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      decay: 0.015 + Math.random() * 0.025,
      size: 2 + Math.random() * 4,
      color,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.97;
    p.vy *= 0.97;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ============================================================
//  GAME TICK
// ============================================================
function tick() {
  if (gameOver || isPaused) return;

  // Save previous state for interpolation
  prevSnake = snake.map(s => ({ ...s }));
  prevDirection = { ...direction };

  // Process input queue
  while (inputQueue.length > 0) {
    const d = inputQueue.shift();
    if (d.x !== -direction.x || d.y !== -direction.y) {
      nextDirection = d;
      break;
    }
  }
  direction = { ...nextDirection };

  const head = snake[0];
  const newHead = {
    x: head.x + direction.x,
    y: head.y + direction.y,
  };

  // Wall collision
  if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
    endGame();
    return;
  }

  // Self collision
  const bodyToCheck = snake.slice(0, -1);
  for (const seg of bodyToCheck) {
    if (seg.x === newHead.x && seg.y === newHead.y) {
      endGame();
      return;
    }
  }

  // Move
  snake.unshift(newHead);

  // Check food
  if (newHead.x === food.x && newHead.y === food.y) {
    score += 10;
    scoreEl.textContent = score;
    scoreEl.classList.remove('score-pop');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('score-pop');
    spawnParticles(food.x, food.y, '#10b981', 16);
    spawnParticles(food.x, food.y, '#34d399', 8);
    spawnParticles(food.x, food.y, '#6ee7b7', 6);
    screenShake = 4;
    spawnFood();
  } else {
    snake.pop();
  }

  tickProgress = 0;
  updateParticles();
  if (screenShake > 0) screenShake *= 0.85;
  if (screenShake < 0.1) screenShake = 0;
}

// ============================================================
//  END GAME
// ============================================================
function endGame() {
  gameOver = true;
  isRunning = false;
  if (gameLoopId) {
    cancelAnimationFrame(gameLoopId);
    gameLoopId = null;
  }

  for (const seg of snake) {
    spawnParticles(seg.x, seg.y, '#ef4444', 3);
    spawnParticles(seg.x, seg.y, '#f97316', 2);
  }
  screenShake = 8;

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('snakeHighScore', highScore);
    highScoreEl.textContent = highScore;
  }

  overlayTitle.textContent = 'Game Over';
  overlayMessage.innerHTML = `
    <div class="final-score-label">Score</div>
    <div class="final-score">${score}</div>
  `;
  startBtn.textContent = 'Play Again';
  overlay.classList.add('visible');
}

// ============================================================
//  LERP HELPERS
// ============================================================
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPos(p1, p2, t) {
  return {
    x: lerp(p1.x, p2.x, t),
    y: lerp(p1.y, p2.y, t),
  };
}

// ============================================================
//  DRAWING — BACKGROUND
// ============================================================

function drawBackground() {
  // Deep space gradient base
  const bgGrad = ctx.createRadialGradient(
    SIZE * 0.3, SIZE * 0.2, 0,
    SIZE * 0.3, SIZE * 0.2, SIZE * 0.9,
  );
  bgGrad.addColorStop(0, '#12123a');
  bgGrad.addColorStop(0.5, '#0a0a24');
  bgGrad.addColorStop(1, '#060612');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Nebula clouds
  const nebX = SIZE * 0.7 + Math.sin(performance.now() * 0.0003) * 40;
  const nebY = SIZE * 0.8 + Math.cos(performance.now() * 0.0004) * 30;
  const nebGrad = ctx.createRadialGradient(nebX, nebY, 0, nebX, nebY, 200);
  nebGrad.addColorStop(0, 'rgba(59, 130, 246, 0.04)');
  nebGrad.addColorStop(0.5, 'rgba(139, 92, 246, 0.025)');
  nebGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = nebGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const nebX2 = SIZE * 0.2 + Math.sin(performance.now() * 0.0005 + 1) * 50;
  const nebY2 = SIZE * 0.3 + Math.cos(performance.now() * 0.0003 + 2) * 40;
  const nebGrad2 = ctx.createRadialGradient(nebX2, nebY2, 0, nebX2, nebY2, 160);
  nebGrad2.addColorStop(0, 'rgba(16, 185, 129, 0.03)');
  nebGrad2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = nebGrad2;
  ctx.fillRect(0, 0, SIZE, SIZE);

  drawStars();
}

function drawGrid() {
  gridPulse = 0.5 + Math.sin(performance.now() * 0.002) * 0.3;

  for (let x = 0; x <= GRID; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, SIZE);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.015 + gridPulse * 0.01})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  for (let y = 0; y <= GRID; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(SIZE, y * CELL);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.015 + gridPulse * 0.01})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Center crosshair glow
  const cx = Math.floor(GRID / 2) * CELL + CELL / 2;
  const cy = cx;
  const crossGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
  crossGrad.addColorStop(0, `rgba(255, 255, 255, ${0.01 + gridPulse * 0.01})`);
  crossGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = crossGrad;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

// ============================================================
//  DRAWING — SNAKE BODY
// ============================================================
function drawSnakeBody() {
  const len = snake.length;
  for (let i = len - 1; i >= 0; i--) {
    // Interpolated position
    const curr = snake[i];
    const prev = prevSnake[i] || curr;
    const pos = lerpPos(prev, curr, tickProgress);

    const px = pos.x * CELL;
    const py = pos.y * CELL;

    const t = len > 1 ? i / (len - 1) : 0;
    const c = snakeGradient(t);
    const baseSize = len > 1 ? CELL * (0.85 - 0.12 * t) : CELL * 0.85;
    // Head is larger
    const size = i === 0 ? CELL * 0.95 : baseSize;
    const r = size / 2;

    const cx = px + CELL / 2;
    const cy = py + CELL / 2;

    // Glow
    const glowSize = size + 8;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
    grad.addColorStop(0, `rgba(${c.r}, ${c.g}, ${c.b}, 0.2)`);
    grad.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - glowSize, cy - glowSize, glowSize * 2, glowSize * 2);

    // Body segment
    // For non-head segments, slight oval along movement direction
    if (i > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const bodyGrad = ctx.createRadialGradient(
        cx - r * 0.3, cy - r * 0.3, r * 0.1,
        cx, cy, r,
      );
      bodyGrad.addColorStop(0, `rgba(${Math.min(255, c.r + 80)}, ${Math.min(255, c.g + 80)}, ${Math.min(255, c.b + 80)}, 1)`);
      bodyGrad.addColorStop(1, `rgba(${c.r}, ${c.g}, ${c.b}, 1)`);
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      ctx.strokeStyle = `rgba(${Math.max(0, c.r - 30)}, ${Math.max(0, c.g - 30)}, ${Math.max(0, c.b - 30)}, 0.3)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ============================================================
//  DRAWING — SNAKE FACE
// ============================================================
function drawSnakeFace() {
  if (snake.length === 0) return;

  const curr = snake[0];
  const prev = prevSnake[0] || curr;
  const pos = lerpPos(prev, curr, tickProgress);

  const px = pos.x * CELL;
  const py = pos.y * CELL;
  const cx = px + CELL / 2;
  const cy = py + CELL / 2;

  // Smooth direction for rotation
  const smoothDir = {
    x: lerp(prevDirection.x, direction.x, tickProgress),
    y: lerp(prevDirection.y, direction.y, tickProgress),
  };
  const angle = Math.atan2(smoothDir.y, smoothDir.x);

  const headSize = CELL * 0.95;
  const r = headSize / 2;

  // --- Head shape (slightly oval, oriented in movement direction) ---
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Head glow
  const headGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
  const c0 = snakeGradient(0);
  headGlow.addColorStop(0, `rgba(${c0.r}, ${c0.g}, ${c0.b}, 0.25)`);
  headGlow.addColorStop(1, `rgba(${c0.r}, ${c0.g}, ${c0.b}, 0)`);
  ctx.fillStyle = headGlow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Head body — slightly wider horizontally (along movement)
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.1, r * 0.9, 0, 0, Math.PI * 2);
  const headGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
  headGrad.addColorStop(0, `rgba(${Math.min(255, c0.r + 90)}, ${Math.min(255, c0.g + 90)}, ${Math.min(255, c0.b + 90)}, 1)`);
  headGrad.addColorStop(0.7, `rgba(${c0.r}, ${c0.g}, ${c0.b}, 1)`);
  headGrad.addColorStop(1, `rgba(${Math.max(0, c0.r - 40)}, ${Math.max(0, c0.g - 40)}, ${Math.max(0, c0.b - 40)}, 1)`);
  ctx.fillStyle = headGrad;
  ctx.fill();

  // Head border
  ctx.strokeStyle = `rgba(${Math.max(0, c0.r - 30)}, ${Math.max(0, c0.g - 30)}, ${Math.max(0, c0.b - 30)}, 0.4)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- Scale pattern on head (small dots along the back) ---
  ctx.fillStyle = `rgba(255, 255, 255, 0.12)`;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * r * 0.18, -r * 0.65, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(i * r * 0.18, r * 0.65, r * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Eyes ---
  const eyeXOff = r * 0.35;
  const eyeYOff = r * 0.35;
  const eyeR = r * 0.18;

  // Eye sockets (darker area)
  ctx.fillStyle = `rgba(0, 0, 0, 0.2)`;
  ctx.beginPath();
  ctx.ellipse(-eyeXOff, -eyeYOff, eyeR * 1.3, eyeR * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeXOff, -eyeYOff, eyeR * 1.3, eyeR * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  // White of eyes
  ctx.fillStyle = '#f0f8ff';
  ctx.beginPath();
  ctx.arc(-eyeXOff, -eyeYOff, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeXOff, -eyeYOff, eyeR, 0, Math.PI * 2);
  ctx.fill();

  // Pupils — slit pupils (snake-like)
  const pupilW = eyeR * 0.35;
  const pupilH = eyeR * 0.7;
  const pupilOff = eyeR * 0.25; // look forward

  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(-eyeXOff + pupilOff, -eyeYOff, pupilW, pupilH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeXOff + pupilOff, -eyeYOff, pupilW, pupilH, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pupil highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(-eyeXOff + pupilOff + pupilW * 0.3, -eyeYOff - pupilH * 0.2, pupilW * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eyeXOff + pupilOff + pupilW * 0.3, -eyeYOff - pupilH * 0.2, pupilW * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // --- Eyebrows (slight angry/serious angle) ---
  ctx.strokeStyle = `rgba(${Math.max(0, c0.r - 50)}, ${Math.max(0, c0.g - 50)}, ${Math.max(0, c0.b - 50)}, 0.7)`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const browLen = r * 0.45;
  const browY = -eyeYOff - eyeR * 1.1;
  ctx.beginPath();
  ctx.moveTo(-eyeXOff - browLen * 0.6, browY + 2);
  ctx.lineTo(-eyeXOff + browLen * 0.6, browY - 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(eyeXOff - browLen * 0.6, browY + 2);
  ctx.lineTo(eyeXOff + browLen * 0.6, browY - 2);
  ctx.stroke();

  // --- Nostrils ---
  ctx.fillStyle = `rgba(0, 0, 0, 0.25)`;
  ctx.beginPath();
  ctx.ellipse(r * 0.15, -r * 0.15, r * 0.05, r * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.35, -r * 0.15, r * 0.05, r * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Mouth (subtle smile curve) ---
  ctx.strokeStyle = `rgba(0, 0, 0, 0.2)`;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(r * 0.25, r * 0.15, r * 0.25, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // --- Tongue ---
  tongueAnim += 0.06;
  const tongueOut = 0.3 + Math.sin(tongueAnim) * 0.15;
  const tongueLen = r * (0.5 + tongueOut);
  const tongueWidth = r * 0.06;

  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = tongueWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.5, 0);
  ctx.lineTo(r * 0.5 + tongueLen, 0);
  ctx.stroke();

  // Tongue fork
  const forkLen = tongueLen * 0.3;
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = tongueWidth * 0.7;
  ctx.beginPath();
  ctx.moveTo(r * 0.5 + tongueLen, 0);
  ctx.lineTo(r * 0.5 + tongueLen + forkLen, -tongueWidth * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.5 + tongueLen, 0);
  ctx.lineTo(r * 0.5 + tongueLen + forkLen, tongueWidth * 1.5);
  ctx.stroke();

  ctx.restore();
}

// ============================================================
//  DRAWING — FOOD
// ============================================================
function drawFood() {
  foodAnim += 0.05;
  const pulse = 1 + Math.sin(foodAnim) * 0.15;
  const baseSize = CELL * 0.38 * pulse;

  const cx = food.x * CELL + CELL / 2;
  const cy = food.y * CELL + CELL / 2;

  // Outer glow — pulsing
  const glowR = baseSize * 3.5;
  const glowAlpha = 0.15 + Math.sin(foodAnim * 1.5) * 0.08;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  grad.addColorStop(0, `rgba(239, 68, 68, ${glowAlpha})`);
  grad.addColorStop(0.3, `rgba(239, 68, 68, ${glowAlpha * 0.3})`);
  grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

  // Rotation
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(foodAnim * 1.2);

  // Apple shape
  ctx.beginPath();
  ctx.arc(0, 0, baseSize, 0, Math.PI * 2);
  const foodGrad = ctx.createRadialGradient(
    -baseSize * 0.3, -baseSize * 0.3, baseSize * 0.1,
    0, 0, baseSize,
  );
  foodGrad.addColorStop(0, '#fca5a5');
  foodGrad.addColorStop(0.35, '#ef4444');
  foodGrad.addColorStop(0.8, '#dc2626');
  foodGrad.addColorStop(1, '#991b1b');
  ctx.fillStyle = foodGrad;
  ctx.fill();

  // Stem
  ctx.strokeStyle = '#65a30d';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -baseSize * 0.8);
  ctx.lineTo(2, -baseSize * 1.15);
  ctx.stroke();

  // Small leaf
  ctx.fillStyle = '#4d7c0f';
  ctx.beginPath();
  ctx.ellipse(4, -baseSize * 1.05, baseSize * 0.18, baseSize * 0.08, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(-baseSize * 0.25, -baseSize * 0.25, baseSize * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fill();

  ctx.restore();
}

// ============================================================
//  DRAWING — PARTICLES
// ============================================================
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();

    // Particle glow
    ctx.globalAlpha = p.life * 0.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ============================================================
//  DRAWING — PAUSE OVERLAY
// ============================================================
function drawPauseOverlay() {
  ctx.fillStyle = 'rgba(7, 7, 18, 0.65)';
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = 'bold 40px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Paused', SIZE / 2, SIZE / 2 - 14);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '16px "Segoe UI", sans-serif';
  ctx.fillText('Press Space to resume', SIZE / 2, SIZE / 2 + 28);
}

// ============================================================
//  RENDER LOOP
// ============================================================
let prevTimestamp = 0;
const TICK_INTERVAL = 130;

function gameLoop(timestamp) {
  if (!isRunning) return;

  const delta = timestamp - prevTimestamp;
  prevTimestamp = timestamp;

  // Throttle game ticks
  if (timestamp - lastTickTime >= TICK_INTERVAL) {
    lastTickTime = timestamp;
    tick();
  }

  // Update interpolation progress
  if (lastTickTime > 0) {
    tickProgress = Math.min(1, (timestamp - lastTickTime) / TICK_INTERVAL);
  }

  // Update background animations
  updateStars();

  // --- Draw ---
  ctx.save();

  // Screen shake
  if (screenShake > 0.1) {
    const sx = (Math.random() - 0.5) * screenShake;
    const sy = (Math.random() - 0.5) * screenShake;
    ctx.translate(sx, sy);
  }

  drawBackground();
  drawGrid();
  drawFood();
  drawSnakeBody();
  drawSnakeFace();
  drawParticles();

  if (isPaused && !gameOver) {
    drawPauseOverlay();
  }

  ctx.restore();

  gameLoopId = requestAnimationFrame(gameLoop);
}

// ============================================================
//  CONTROLS
// ============================================================
function handleKey(e) {
  const key = e.key;

  if ((key === 'Enter' || key === ' ') && !isRunning && gameOver) {
    e.preventDefault();
    startGame();
    return;
  }

  if (key === ' ') {
    e.preventDefault();
    if (isRunning) {
      isPaused = !isPaused;
      if (isPaused) {
        overlayTitle.textContent = 'Paused';
        overlayMessage.textContent = 'Press Space to resume';
        startBtn.textContent = 'Resume';
        overlay.classList.add('visible');
      } else {
        overlay.classList.remove('visible');
      }
    }
    return;
  }

  if (!isRunning || gameOver || isPaused) return;

  let d = null;
  switch (key) {
    case 'ArrowUp':    case 'w': case 'W': d = { x:  0, y: -1 }; break;
    case 'ArrowDown':  case 's': case 'S': d = { x:  0, y:  1 }; break;
    case 'ArrowLeft':  case 'a': case 'A': d = { x: -1, y:  0 }; break;
    case 'ArrowRight': case 'd': case 'D': d = { x:  1, y:  0 }; break;
  }

  if (d) {
    e.preventDefault();
    inputQueue.push(d);
  }
}

document.addEventListener('keydown', handleKey);

// ============================================================
//  START / STOP
// ============================================================
function startGame() {
  initGame();
  isRunning = true;
  prevTimestamp = performance.now();
  lastTickTime = performance.now();
  overlay.classList.remove('visible');
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  gameLoop(performance.now());
}

startBtn.addEventListener('click', () => {
  if (gameOver) {
    startGame();
  } else if (isPaused) {
    isPaused = false;
    overlay.classList.remove('visible');
  } else {
    startGame();
  }
});

// ============================================================
//  INITIAL STATE
// ============================================================
initStars();
initGame();
overlayTitle.textContent = 'Snake';
overlayMessage.textContent = 'Use arrow keys or WASD to move';
startBtn.textContent = 'Play';
overlay.classList.add('visible');
