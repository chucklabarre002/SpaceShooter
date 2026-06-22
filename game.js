const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreDisplay = document.getElementById('scoreDisplay');
const highDisplay = document.getElementById('highDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('nameInput');
const highscoreList = document.getElementById('highscoreList');

let player, bullets, enemies, particles, floatingTexts, score, lives, gameRunning, animId;
let keys = {};
let shootCooldown = 0;
let enemySpawnTimer = 0;
let enemySpawnInterval = 90;
let level = 1;
let frameCount = 0;
let mothershipSpawnCounter = 0;

// Generate stable star field once
const STARS = Array.from({ length: 160 }, (_, i) => ({
  x: Math.random() * 600,
  y: Math.random() * 700,
  size: Math.random() < 0.08 ? 2.5 : Math.random() < 0.25 ? 1.8 : 1,
  speed: 0.08 + Math.random() * 0.18,
  twinkleSpeed: 0.03 + Math.random() * 0.07,
  twinkleOffset: Math.random() * Math.PI * 2,
  color: (() => {
    const r = Math.random();
    if (r < 0.15) return '#aaddff';   // blue-white
    if (r < 0.25) return '#ffeecc';   // warm yellow
    if (r < 0.30) return '#ffccaa';   // orange
    return '#ffffff';
  })()
}));

// High scores
function getHighScores() {
  return JSON.parse(localStorage.getItem('spaceShooterScores') || '[]');
}
function saveHighScore(name, score) {
  const scores = getHighScores();
  scores.push({ name, score });
  scores.sort((a, b) => b.score - a.score);
  scores.splice(5);
  localStorage.setItem('spaceShooterScores', JSON.stringify(scores));
}
function renderHighScores() {
  const scores = getHighScores();
  if (scores.length === 0) { highscoreList.textContent = ''; return; }
  highscoreList.innerHTML = '<strong>TOP SCORES</strong><br>' +
    scores.map((s, i) => `${i + 1}. ${s.name} — ${s.score}`).join('<br>');
}

// Draw a photorealistic distant gas giant (Saturn-like)
function drawPlanet(x, y, r) {
  ctx.save();

  // Outer haze glow — makes it feel far away
  const hazeGrad = ctx.createRadialGradient(x, y, r * 0.9, x, y, r * 1.8);
  hazeGrad.addColorStop(0, 'rgba(180,150,100,0.07)');
  hazeGrad.addColorStop(0.5, 'rgba(140,120,80,0.04)');
  hazeGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = hazeGrad;
  ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();

  // ── RINGS (behind planet — drawn first) ──
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.18); // very flat perspective = distant look

  // Ring shadow cast by planet onto rings
  const ringShadowGrad = ctx.createLinearGradient(-r * 0.6, 0, r * 0.6, 0);
  ringShadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
  ringShadowGrad.addColorStop(0.38, 'rgba(0,0,0,0.6)');
  ringShadowGrad.addColorStop(0.62, 'rgba(0,0,0,0.6)');
  ringShadowGrad.addColorStop(1, 'rgba(0,0,0,0)');

  const ringDefs = [
    { inner: 1.15, outer: 1.30, r: 210, g: 185, b: 140, a: 0.10 }, // C ring (faint)
    { inner: 1.30, outer: 1.60, r: 230, g: 205, b: 155, a: 0.30 }, // B ring (bright)
    { inner: 1.60, outer: 1.68, r: 180, g: 160, b: 120, a: 0.08 }, // Cassini division
    { inner: 1.68, outer: 1.92, r: 215, g: 195, b: 148, a: 0.22 }, // A ring
    { inner: 1.92, outer: 2.00, r: 190, g: 175, b: 135, a: 0.06 }, // F ring (faint)
  ];

  ringDefs.forEach(rd => {
    const rg = ctx.createRadialGradient(0, 0, rd.inner * r, 0, 0, rd.outer * r);
    rg.addColorStop(0,   `rgba(${rd.r},${rd.g},${rd.b},0)`);
    rg.addColorStop(0.15,`rgba(${rd.r},${rd.g},${rd.b},${rd.a})`);
    rg.addColorStop(0.5, `rgba(${Math.min(255,rd.r+20)},${Math.min(255,rd.g+20)},${Math.min(255,rd.b+15)},${rd.a * 1.3})`);
    rg.addColorStop(0.85,`rgba(${rd.r},${rd.g},${rd.b},${rd.a})`);
    rg.addColorStop(1,   `rgba(${rd.r},${rd.g},${rd.b},0)`);
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, rd.outer * r, 0, Math.PI * 2); ctx.fill();
  });

  // Ring shadow
  ctx.fillStyle = ringShadowGrad;
  ctx.fillRect(-r * 2, -r * 12, r * 4, r * 24);

  ctx.restore();

  // ── PLANET SPHERE ──
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();

  // Deep base — warm tan/ochre like Saturn
  const baseGrad = ctx.createLinearGradient(x, y - r, x, y + r);
  baseGrad.addColorStop(0,    '#c8a96e');
  baseGrad.addColorStop(0.08, '#d4b87a');
  baseGrad.addColorStop(0.18, '#c9a96b');
  baseGrad.addColorStop(0.28, '#e8d4a0');
  baseGrad.addColorStop(0.36, '#d4b87a');
  baseGrad.addColorStop(0.44, '#c4a060');
  baseGrad.addColorStop(0.52, '#dcc88a');
  baseGrad.addColorStop(0.60, '#c8aa6c');
  baseGrad.addColorStop(0.70, '#b89558');
  baseGrad.addColorStop(0.80, '#a88040');
  baseGrad.addColorStop(0.90, '#8a6028');
  baseGrad.addColorStop(1,    '#5a3a10');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // Fine horizontal band details
  const bandData = [
    { yOff: -0.72, h: 0.04, c: 'rgba(255,245,200,0.18)' },
    { yOff: -0.58, h: 0.06, c: 'rgba(180,140, 80,0.20)' },
    { yOff: -0.44, h: 0.05, c: 'rgba(255,235,170,0.22)' },
    { yOff: -0.30, h: 0.08, c: 'rgba(200,160, 90,0.18)' },
    { yOff: -0.14, h: 0.04, c: 'rgba(255,240,190,0.25)' },
    { yOff:  0.00, h: 0.06, c: 'rgba(170,130, 60,0.20)' },
    { yOff:  0.14, h: 0.05, c: 'rgba(240,215,150,0.18)' },
    { yOff:  0.28, h: 0.07, c: 'rgba(155,115, 50,0.22)' },
    { yOff:  0.44, h: 0.04, c: 'rgba(210,175,100,0.15)' },
    { yOff:  0.60, h: 0.06, c: 'rgba(120, 80, 30,0.25)' },
  ];
  bandData.forEach(b => {
    const by = y + b.yOff * r;
    const bh = b.h * r;
    const bg = ctx.createLinearGradient(0, by - bh, 0, by + bh);
    bg.addColorStop(0, 'transparent');
    bg.addColorStop(0.4, b.c);
    bg.addColorStop(0.6, b.c);
    bg.addColorStop(1, 'transparent');
    ctx.fillStyle = bg;
    ctx.fillRect(x - r, by - bh, r * 2, bh * 2);
  });

  // Storm oval (subtle, mid latitude)
  ctx.save();
  ctx.translate(x + r * 0.25, y - r * 0.12);
  ctx.scale(1.8, 1);
  const stormG = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.09);
  stormG.addColorStop(0, 'rgba(255,220,140,0.45)');
  stormG.addColorStop(0.6, 'rgba(210,170,90,0.20)');
  stormG.addColorStop(1, 'transparent');
  ctx.fillStyle = stormG;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.09, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Sphere light — top-left specular highlight
  const hlGrad = ctx.createRadialGradient(x - r * 0.32, y - r * 0.35, r * 0.02, x - r * 0.1, y - r * 0.1, r * 1.0);
  hlGrad.addColorStop(0,    'rgba(255,250,230,0.38)');
  hlGrad.addColorStop(0.15, 'rgba(255,240,200,0.18)');
  hlGrad.addColorStop(0.40, 'rgba(255,230,170,0.06)');
  hlGrad.addColorStop(1,    'transparent');
  ctx.fillStyle = hlGrad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // Terminator shadow — right/bottom limb darkening
  const termGrad = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, r * 0.5, x + r * 0.3, y + r * 0.3, r * 1.2);
  termGrad.addColorStop(0, 'transparent');
  termGrad.addColorStop(0.55, 'rgba(0,0,0,0.10)');
  termGrad.addColorStop(0.78, 'rgba(0,0,0,0.40)');
  termGrad.addColorStop(1,    'rgba(0,0,0,0.75)');
  ctx.fillStyle = termGrad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // Limb darkening edge
  const limbGrad = ctx.createRadialGradient(x, y, r * 0.72, x, y, r);
  limbGrad.addColorStop(0, 'transparent');
  limbGrad.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = limbGrad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // Thin atmosphere rim (warm glow at edge)
  const rimGrad = ctx.createRadialGradient(x, y, r * 0.88, x, y, r);
  rimGrad.addColorStop(0, 'transparent');
  rimGrad.addColorStop(0.7, 'rgba(200,160,80,0.10)');
  rimGrad.addColorStop(1,   'rgba(255,200,100,0.22)');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  ctx.restore(); // end clip

  // ── FRONT RINGS (overlap planet's lower half) ──
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.18);

  // Only draw ring arcs in front (lower semicircle = positive y in scaled space)
  ctx.beginPath();
  ctx.rect(-r * 2.1, 0, r * 4.2, r * 2.1);
  ctx.clip();

  ringDefs.forEach(rd => {
    const rg = ctx.createRadialGradient(0, 0, rd.inner * r, 0, 0, rd.outer * r);
    rg.addColorStop(0,   `rgba(${rd.r},${rd.g},${rd.b},0)`);
    rg.addColorStop(0.2, `rgba(${rd.r},${rd.g},${rd.b},${rd.a * 1.1})`);
    rg.addColorStop(0.5, `rgba(${Math.min(255,rd.r+25)},${Math.min(255,rd.g+20)},${Math.min(255,rd.b+15)},${rd.a * 1.5})`);
    rg.addColorStop(0.8, `rgba(${rd.r},${rd.g},${rd.b},${rd.a * 1.1})`);
    rg.addColorStop(1,   `rgba(${rd.r},${rd.g},${rd.b},0)`);
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, rd.outer * r, 0, Math.PI * 2); ctx.fill();
  });

  ctx.restore();
}

// Draw player ship — detailed fighter with cockpit, wings, engines
function drawShip(x, y) {
  ctx.save();
  ctx.translate(x, y);

  // Engine glow trails
  const flicker = Math.random() * 6;
  const grad1 = ctx.createLinearGradient(0, 8, 0, 28 + flicker);
  grad1.addColorStop(0, '#ff8800');
  grad1.addColorStop(1, 'transparent');
  ctx.fillStyle = grad1;
  ctx.beginPath();
  ctx.moveTo(-6, 10);
  ctx.lineTo(0, 28 + flicker);
  ctx.lineTo(6, 10);
  ctx.closePath();
  ctx.fill();

  // Wing engine trails
  const grad2 = ctx.createLinearGradient(0, 8, 0, 18 + flicker * 0.6);
  grad2.addColorStop(0, '#ff4400');
  grad2.addColorStop(1, 'transparent');
  ctx.fillStyle = grad2;
  ctx.beginPath(); ctx.moveTo(-16, 4); ctx.lineTo(-13, 16 + flicker * 0.6); ctx.lineTo(-10, 4); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, 4); ctx.lineTo(13, 16 + flicker * 0.6); ctx.lineTo(16, 4); ctx.closePath(); ctx.fill();

  // Main fuselage
  const fuselageGrad = ctx.createLinearGradient(-10, -24, 10, -24);
  fuselageGrad.addColorStop(0, '#446688');
  fuselageGrad.addColorStop(0.5, '#aaccff');
  fuselageGrad.addColorStop(1, '#446688');
  ctx.fillStyle = fuselageGrad;
  ctx.strokeStyle = '#88bbff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#0088ff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(7, -8);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 6);
  ctx.lineTo(-7, 8);
  ctx.lineTo(-7, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Left wing
  const wingGrad = ctx.createLinearGradient(-26, 0, -6, 0);
  wingGrad.addColorStop(0, '#223355');
  wingGrad.addColorStop(1, '#5588bb');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.moveTo(-7, -4);
  ctx.lineTo(-26, 10);
  ctx.lineTo(-22, 14);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Right wing
  const wingGrad2 = ctx.createLinearGradient(6, 0, 26, 0);
  wingGrad2.addColorStop(0, '#5588bb');
  wingGrad2.addColorStop(1, '#223355');
  ctx.fillStyle = wingGrad2;
  ctx.beginPath();
  ctx.moveTo(7, -4);
  ctx.lineTo(26, 10);
  ctx.lineTo(22, 14);
  ctx.lineTo(7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Wing tips (red accent)
  ctx.fillStyle = '#ff3322';
  ctx.shadowColor = '#ff3322';
  ctx.shadowBlur = 6;
  ctx.fillRect(-24, 10, 5, 3);
  ctx.fillRect(19, 10, 5, 3);

  // Cockpit
  const cockpitGrad = ctx.createRadialGradient(-2, -14, 1, -2, -14, 7);
  cockpitGrad.addColorStop(0, '#ccffff');
  cockpitGrad.addColorStop(0.5, '#0099cc');
  cockpitGrad.addColorStop(1, '#003355');
  ctx.fillStyle = cockpitGrad;
  ctx.strokeStyle = '#00ccff';
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -12, 4, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Nose tip
  ctx.fillStyle = '#aaddff';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.lineTo(3, -16);
  ctx.lineTo(-3, -16);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// Draw enemy fighter
function drawEnemyShip(x, y, type) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI);

  const colors = {
    0: { body: '#882299', wing: '#550066', glow: '#ff00ff', accent: '#ff88ff' },
    1: { body: '#993311', wing: '#661100', glow: '#ff4400', accent: '#ff8844' },
    2: { body: '#887700', wing: '#554400', glow: '#ffaa00', accent: '#ffdd44' },
  };
  const c = colors[type] || colors[0];

  // Engine trail
  const flicker = Math.random() * 5;
  const eg = ctx.createLinearGradient(0, 8, 0, 24 + flicker);
  eg.addColorStop(0, c.glow);
  eg.addColorStop(1, 'transparent');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(0, 24 + flicker); ctx.lineTo(5, 10); ctx.closePath(); ctx.fill();

  // Fuselage
  const fg = ctx.createLinearGradient(-8, -20, 8, -20);
  fg.addColorStop(0, c.wing);
  fg.addColorStop(0.5, c.body);
  fg.addColorStop(1, c.wing);
  ctx.fillStyle = fg;
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = c.glow;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, -20); ctx.lineTo(6, -6); ctx.lineTo(6, 8); ctx.lineTo(0, 5); ctx.lineTo(-6, 8); ctx.lineTo(-6, -6);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Wings
  ctx.fillStyle = c.wing;
  ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-22, 10); ctx.lineTo(-18, 14); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(22, 10); ctx.lineTo(18, 14); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Cockpit
  const cg = ctx.createRadialGradient(0, -10, 1, 0, -10, 6);
  cg.addColorStop(0, c.accent);
  cg.addColorStop(1, c.body);
  ctx.fillStyle = cg;
  ctx.strokeStyle = c.accent;
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.ellipse(0, -10, 3, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  ctx.restore();
}

// Draw mothership
function drawMothership(x, y, hp) {
  ctx.save();
  ctx.translate(x, y);

  const pulse = 0.8 + 0.2 * Math.sin(frameCount * 0.05);
  ctx.shadowColor = '#00ff88';
  ctx.shadowBlur = 20 * pulse;

  // Main saucer body
  const bg = ctx.createRadialGradient(0, 0, 5, 0, 5, 55);
  bg.addColorStop(0, '#335544');
  bg.addColorStop(0.5, '#1a3322');
  bg.addColorStop(1, '#0a1a10');
  ctx.fillStyle = bg;
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 55, 22, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Top dome
  const dg = ctx.createRadialGradient(-10, -18, 2, 0, -14, 22);
  dg.addColorStop(0, '#88ffcc');
  dg.addColorStop(0.4, '#00aa55');
  dg.addColorStop(1, '#003322');
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.ellipse(0, -8, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Rotating lights around rim
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + frameCount * 0.04;
    const lx = Math.cos(angle) * 44;
    const ly = Math.sin(angle) * 14;
    ctx.fillStyle = i % 2 === 0 ? '#ffff00' : '#ff4400';
    ctx.shadowColor = i % 2 === 0 ? '#ffff00' : '#ff4400';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();
  }

  // HP bar
  const barW = 100;
  const maxHp = 20;
  const hpFrac = hp / maxHp;
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#111';
  ctx.fillRect(-barW / 2, 28, barW, 7);
  ctx.fillStyle = hpFrac > 0.5 ? '#00ff44' : hpFrac > 0.25 ? '#ffaa00' : '#ff2200';
  ctx.fillRect(-barW / 2, 28, barW * hpFrac, 7);
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  ctx.strokeRect(-barW / 2, 28, barW, 7);

  ctx.restore();
}

function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + Math.random() * 0.3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * (1 + Math.random() * 4),
      vy: Math.sin(angle) * (1 + Math.random() * 4),
      life: 35 + Math.random() * 25,
      color
    });
  }
}

function addFloatingText(x, y, text, color) {
  floatingTexts.push({ x, y, text, color, life: 50, vy: -1.2 });
}

function initGame() {
  player = { x: canvas.width / 2, y: canvas.height - 60, speed: 9, width: 28, height: 28 };
  bullets = [];
  enemies = [];
  particles = [];
  floatingTexts = [];
  score = 0;
  lives = 3;
  shootCooldown = 0;
  enemySpawnTimer = 0;
  enemySpawnInterval = 90;
  level = 1;
  frameCount = 0;
  mothershipSpawnCounter = 0;
  gameRunning = true;
  updateUI();
  loop();
}

function updateUI() {
  scoreDisplay.textContent = score;
  highDisplay.textContent = Math.max(score, ...getHighScores().map(s => s.score), 0);
  livesDisplay.textContent = lives;
}

function loop() {
  if (!gameRunning) return;
  animId = requestAnimationFrame(loop);
  frameCount++;
  update();
  draw();
}

function update() {
  // Move player
  if (keys['ArrowLeft'] && player.x - player.width / 2 > 0) player.x -= player.speed;
  if (keys['ArrowRight'] && player.x + player.width / 2 < canvas.width) player.x += player.speed;

  // Machine gun fire — short cooldown
  if (keys[' '] && shootCooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - 22, width: 4, height: 14, vy: -14 });
    shootCooldown = 5;
  }
  if (shootCooldown > 0) shootCooldown--;

  // Move bullets
  bullets.forEach(b => b.y += b.vy);
  bullets = bullets.filter(b => b.y > -20);

  // Spawn enemies
  enemySpawnTimer++;
  if (enemySpawnTimer >= enemySpawnInterval) {
    enemySpawnTimer = 0;
    mothershipSpawnCounter++;

    // Spawn mothership every 8 enemies
    if (mothershipSpawnCounter % 8 === 0) {
      enemies.push({
        x: 80 + Math.random() * (canvas.width - 160),
        y: -50,
        width: 55, height: 22,
        speed: 0.6 + level * 0.1,
        type: 'mothership',
        hp: 20,
        maxHp: 20,
        points: 500
      });
    } else {
      const type = level >= 3 ? Math.floor(Math.random() * 3) : (level === 2 ? Math.floor(Math.random() * 2) : 0);
      enemies.push({
        x: 30 + Math.random() * (canvas.width - 60),
        y: -20,
        width: 26, height: 26,
        speed: 1.5 + level * 0.4 + Math.random(),
        type,
        hp: 1,
        points: (type + 1) * 10
      });
    }

    if (enemySpawnInterval > 40) enemySpawnInterval -= 0.3;
  }

  // Move enemies
  enemies.forEach(e => e.y += e.speed);

  // Level
  level = Math.floor(score / 200) + 1;

  // Collision: bullets vs enemies
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      const hitW = e.type === 'mothership' ? 55 : 22;
      const hitH = e.type === 'mothership' ? 28 : 22;
      if (Math.abs(b.x - e.x) < hitW && Math.abs(b.y - e.y) < hitH) {
        e.hp--;
        bullets.splice(bi, 1);
        if (e.hp <= 0) {
          const col = e.type === 'mothership' ? '#00ff88' : e.type === 0 ? '#ff00ff' : e.type === 1 ? '#ff4400' : '#ffaa00';
          spawnParticles(e.x, e.y, col, e.type === 'mothership' ? 28 : 12);
          // Bonus multiplier: 1x at top, up to 4x near the bottom
          const proximity = Math.max(0, Math.min(1, 1 - (e.y - 40) / (canvas.height - 100)));
          const multiplier = Math.round(1 + proximity * 3);
          const earned = e.points * multiplier;
          const label = multiplier > 1 ? `+${earned} x${multiplier}!` : `+${earned}`;
          addFloatingText(e.x, e.y, label, col);
          score += earned;
          enemies.splice(ei, 1);
          updateUI();
        } else if (e.type === 'mothership') {
          // Show damage hit on mothership
          spawnParticles(b.x, b.y, '#ffff00', 4);
        }
        break;
      }
    }
  }

  // Enemies passing bottom or hitting player
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const e = enemies[ei];
    const hitW = e.type === 'mothership' ? 50 : 24;
    const hitPlayer = Math.abs(e.x - player.x) < hitW && Math.abs(e.y - player.y) < 26;
    if (e.y > canvas.height + 60 || hitPlayer) {
      if (hitPlayer) spawnParticles(player.x, player.y, '#0099ff', 18);
      enemies.splice(ei, 1);
      lives--;
      updateUI();
      if (lives <= 0) endGame();
    }
  }

  // Particles
  particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy *= 0.95; p.life--; });
  particles = particles.filter(p => p.life > 0);

  // Floating texts
  floatingTexts.forEach(t => { t.y += t.vy; t.life--; });
  floatingTexts = floatingTexts.filter(t => t.life > 0);
}

function draw() {
  // Background
  ctx.fillStyle = '#000005';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Nebula blobs
  const nebulas = [
    { x: 120, y: 200, r: 130, color: 'rgba(30,0,60,0.45)' },
    { x: 460, y: 380, r: 110, color: 'rgba(0,15,55,0.35)' },
    { x: 300, y: 560, r: 100, color: 'rgba(0,40,30,0.3)' },
  ];
  nebulas.forEach(n => {
    const ng = ctx.createRadialGradient(n.x, n.y, 5, n.x, n.y, n.r);
    ng.addColorStop(0, n.color);
    ng.addColorStop(1, 'transparent');
    ctx.fillStyle = ng;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });

  // Planet — distant Saturn-like gas giant, upper-right, small to feel far away
  drawPlanet(490, 155, 48);

  // Twinkling stars
  STARS.forEach(s => {
    const sy = (s.y + frameCount * s.speed) % 700;
    const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(frameCount * s.twinkleSpeed + s.twinkleOffset));
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = s.color;
    ctx.shadowColor = s.color;
    ctx.shadowBlur = s.size > 1.5 ? 4 : 0;
    ctx.beginPath();
    ctx.arc(s.x, sy, s.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    // Cross sparkle on larger stars
    if (s.size > 2 && twinkle > 0.75) {
      ctx.globalAlpha = twinkle * 0.5;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(s.x - 5, sy); ctx.lineTo(s.x + 5, sy);
      ctx.moveTo(s.x, sy - 5); ctx.lineTo(s.x, sy + 5);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Particles
  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, p.life / 50);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 4;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Bullets
  bullets.forEach(b => {
    const bg = ctx.createLinearGradient(b.x, b.y - b.height / 2, b.x, b.y + b.height / 2);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.3, '#ffff44');
    bg.addColorStop(1, '#ff8800');
    ctx.fillStyle = bg;
    ctx.shadowColor = '#ffff00';
    ctx.shadowBlur = 6;
    ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
  });
  ctx.shadowBlur = 0;

  // Enemies
  enemies.forEach(e => {
    if (e.type === 'mothership') drawMothership(e.x, e.y, e.hp);
    else drawEnemyShip(e.x, e.y, e.type);
  });

  // Player
  if (lives > 0) drawShip(player.x, player.y);

  // Floating score texts (upper-right area, near score)
  floatingTexts.forEach(t => {
    ctx.globalAlpha = Math.min(1, t.life / 20);
    ctx.font = 'bold 16px Courier New';
    ctx.fillStyle = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur = 8;
    ctx.fillText(t.text, t.x - 16, t.y);
  });
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Level
  ctx.font = '13px Courier New';
  ctx.fillStyle = 'rgba(0,255,255,0.35)';
  ctx.fillText(`LEVEL ${level}`, 10, canvas.height - 10);
}

function endGame() {
  gameRunning = false;
  cancelAnimationFrame(animId);
  const name = nameInput.value.trim() || 'PILOT';
  saveHighScore(name, score);
  renderHighScores();
  overlay.style.display = 'flex';
  startBtn.textContent = 'PLAY AGAIN';
}

window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ') e.preventDefault();
});
window.addEventListener('keyup', e => keys[e.key] = false);

// Touch: drag finger on canvas to move the ship directly
let touchId = null;
function touchToPlayerPos(touch) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top) * scaleY
  };
}
canvas.addEventListener('touchstart', e => {
  if (!gameRunning) return;
  const t = e.changedTouches[0];
  touchId = t.identifier;
  const pos = touchToPlayerPos(t);
  player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, pos.x));
  player.y = Math.max(player.height / 2, Math.min(canvas.height - player.height / 2, pos.y));
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (!gameRunning) return;
  for (const t of e.changedTouches) {
    if (t.identifier === touchId) {
      const pos = touchToPlayerPos(t);
      player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, pos.x));
      player.y = Math.max(player.height / 2, Math.min(canvas.height - player.height / 2, pos.y));
    }
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === touchId) touchId = null;
  }
}, { passive: false });
canvas.addEventListener('touchcancel', () => { touchId = null; });

// Touch: press and hold FIRE button to shoot
const fireBtn = document.getElementById('fireBtn');
fireBtn.addEventListener('touchstart', e => {
  keys[' '] = true;
  fireBtn.classList.add('active');
  e.preventDefault();
}, { passive: false });
fireBtn.addEventListener('touchend', e => {
  keys[' '] = false;
  fireBtn.classList.remove('active');
  e.preventDefault();
}, { passive: false });
fireBtn.addEventListener('touchcancel', () => {
  keys[' '] = false;
  fireBtn.classList.remove('active');
});

startBtn.addEventListener('click', () => {
  if (!nameInput.value.trim()) { nameInput.focus(); return; }
  overlay.style.display = 'none';
  initGame();
});

renderHighScores();
