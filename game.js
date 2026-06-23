const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const glowCanvas = document.getElementById('glowCanvas');
const glowCtx = glowCanvas.getContext('2d');

const scoreDisplay = document.getElementById('scoreDisplay');
const highDisplay = document.getElementById('highDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const nameInput = document.getElementById('nameInput');
const highscoreList = document.getElementById('highscoreList');

let player, bullets, enemies, enemyBullets, particles, floatingTexts, torpedoes, score, lives, gameRunning, animId;
let keys = {};
let shootCooldown = 0;
let torpedoCooldown = 0;
let lastFireTap = 0;
let lastSpaceTime = 0;
let enemySpawnTimer = 0;
let enemySpawnInterval = 90;
let level = 1;
let tier = 1;
let frameCount = 0;
let mothershipSpawnCounter = 0;
let transitionPhase = 0; // 0 = none, 1 = "mission complete", 2 = "prepare for next wave"
let transitionTimer = 0;
let pendingTier = 2;
let difficulty = 'expert';
let invulnerable = 0;
let shakeTime = 0;
let shakeMag = 0;
let cloakerSpawnTimer = 300;
let cloakerBannerTimer = 0;

function speedMul() { return difficulty === 'beginner' ? 0.6 : 1; }

const TIER_THRESHOLDS = {
  beginner: { 2: 2000, 3: 16000 },
  expert: { 2: 2000, 3: 16000 },
  test: { 2: 2000, 3: 6000 }
};

const MISSION_TEXT = {
  2: {
    1: { lines: ['MISSION 1 COMPLETED', 'NICE JOB, PILOT!'], accent: '#00ff88' },
    2: { lines: ['PREPARE FOR THE NEXT WAVE...', 'YOU GOT THIS!'], accent: '#ff2244' }
  },
  3: {
    1: { lines: ['MISSION 2 COMPLETED', 'OUTSTANDING WORK, ACE!'], accent: '#66ddff' },
    2: { lines: ['ENEMY REINFORCEMENTS INCOMING...', 'HOLD THE LINE!'], accent: '#ff8800' }
  }
};

// ── Synthesized sound effects (Web Audio API, no audio files needed) ──
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Plays a short tone with a simple attack/decay envelope. freqEnd lets the pitch sweep.
function playTone({ freq, freqEnd, duration = 0.12, type = 'sine', volume = 0.2 }) {
  const ac = getAudioCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), ac.currentTime + duration);
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

// Plays a filtered white-noise burst — good for explosions/impacts.
function playNoise({ duration = 0.2, volume = 0.25, filterFreq = 1200, filterFreqEnd }) {
  const ac = getAudioCtx();
  const bufferSize = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFreq, ac.currentTime);
  if (filterFreqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterFreqEnd), ac.currentTime + duration);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  noise.start();
  noise.stop(ac.currentTime + duration);
}

function sfxLaser() { playTone({ freq: 2200, freqEnd: 280, duration: 0.14, type: 'sawtooth', volume: 0.07 }); }
function sfxTorpedoLaunch() { playTone({ freq: 200, freqEnd: 700, duration: 0.35, type: 'sawtooth', volume: 0.12 }); }
function sfxExplosionSmall() { playNoise({ duration: 0.18, volume: 0.18, filterFreq: 1800, filterFreqEnd: 200 }); }
function sfxExplosionBig() {
  playNoise({ duration: 0.45, volume: 0.3, filterFreq: 2200, filterFreqEnd: 100 });
  playTone({ freq: 140, freqEnd: 40, duration: 0.4, type: 'sawtooth', volume: 0.15 });
}
function sfxMothershipHit() { playTone({ freq: 220, freqEnd: 180, duration: 0.07, type: 'square', volume: 0.1 }); }
function sfxPlayerHit() { playNoise({ duration: 0.3, volume: 0.22, filterFreq: 900, filterFreqEnd: 80 }); }
function sfxTierUp() {
  [523, 659, 784, 1046].forEach((freq, i) => {
    setTimeout(() => playTone({ freq, duration: 0.18, type: 'triangle', volume: 0.15 }), i * 90);
  });
}
function sfxGameOver() { playTone({ freq: 300, freqEnd: 60, duration: 0.8, type: 'sawtooth', volume: 0.18 }); }
function sfxButton() { playTone({ freq: 600, duration: 0.05, type: 'square', volume: 0.06 }); }
function sfxBonusLife() {
  [660, 880, 1320].forEach((freq, i) => {
    setTimeout(() => playTone({ freq, duration: 0.22, type: 'sine', volume: 0.18 }), i * 80);
  });
}
function sfxCloakerAppear() { playTone({ freq: 1200, freqEnd: 2000, duration: 0.2, type: 'sine', volume: 0.12 }); }

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
  // Note: every layer below fills the sphere circle directly (not a clipped rect) —
  // each gradient already fades to transparent at its own edges, so filling the full
  // circle each time reproduces the old clip-then-fillRect look without needing ctx.clip().
  ctx.save();

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
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

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
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  // Terminator shadow — right/bottom limb darkening
  const termGrad = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, r * 0.5, x + r * 0.3, y + r * 0.3, r * 1.2);
  termGrad.addColorStop(0, 'transparent');
  termGrad.addColorStop(0.55, 'rgba(0,0,0,0.10)');
  termGrad.addColorStop(0.78, 'rgba(0,0,0,0.40)');
  termGrad.addColorStop(1,    'rgba(0,0,0,0.75)');
  ctx.fillStyle = termGrad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  // Limb darkening edge
  const limbGrad = ctx.createRadialGradient(x, y, r * 0.72, x, y, r);
  limbGrad.addColorStop(0, 'transparent');
  limbGrad.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = limbGrad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  // Thin atmosphere rim (warm glow at edge)
  const rimGrad = ctx.createRadialGradient(x, y, r * 0.88, x, y, r);
  rimGrad.addColorStop(0, 'transparent');
  rimGrad.addColorStop(0.7, 'rgba(200,160,80,0.10)');
  rimGrad.addColorStop(1,   'rgba(255,200,100,0.22)');
  ctx.fillStyle = rimGrad;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();

  ctx.restore();

  // ── FRONT RINGS (overlap planet's lower half) ──
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.18);

  // Only draw the lower semicircle of each ring (positive y in scaled space) so it
  // appears to pass in front of the planet — built as a half-disk path instead of a
  // clip, since the "ring" look already comes entirely from the radial gradient stops.
  ringDefs.forEach(rd => {
    const rg = ctx.createRadialGradient(0, 0, rd.inner * r, 0, 0, rd.outer * r);
    rg.addColorStop(0,   `rgba(${rd.r},${rd.g},${rd.b},0)`);
    rg.addColorStop(0.2, `rgba(${rd.r},${rd.g},${rd.b},${rd.a * 1.1})`);
    rg.addColorStop(0.5, `rgba(${Math.min(255,rd.r+25)},${Math.min(255,rd.g+20)},${Math.min(255,rd.b+15)},${rd.a * 1.5})`);
    rg.addColorStop(0.8, `rgba(${rd.r},${rd.g},${rd.b},${rd.a * 1.1})`);
    rg.addColorStop(1,   `rgba(${rd.r},${rd.g},${rd.b},0)`);
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, rd.outer * r, 0, Math.PI); ctx.closePath(); ctx.fill();
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
function drawEnemyShip(x, y, type, tier) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI);

  const colors = {
    0: { body: '#882299', wing: '#550066', glow: '#ff00ff', accent: '#ff88ff' },
    1: { body: '#993311', wing: '#661100', glow: '#ff4400', accent: '#ff8844' },
    2: { body: '#887700', wing: '#554400', glow: '#ffaa00', accent: '#ffdd44' },
  };
  const tier2Colors = {
    0: { body: '#1a4488', wing: '#0a2255', glow: '#22aaff', accent: '#aaeeff' },
    1: { body: '#225544', wing: '#0e3322', glow: '#22ffaa', accent: '#aaffdd' },
    2: { body: '#444466', wing: '#222244', glow: '#8888ff', accent: '#ccccff' },
  };
  const tier3Colors = {
    0: { body: '#334455', wing: '#1a2530', glow: '#66ddff', accent: '#e0ffff' },
    1: { body: '#4a3355', wing: '#251a2c', glow: '#cc66ff', accent: '#f0e0ff' },
    2: { body: '#553344', wing: '#2c1a22', glow: '#ff6699', accent: '#ffe0ec' },
  };
  const c = tier === 3 ? (tier3Colors[type] || tier3Colors[0]) : tier === 2 ? (tier2Colors[type] || tier2Colors[0]) : (colors[type] || colors[0]);

  // Tier 3 stealth drones flicker in and out — a cloaking effect
  if (tier === 3) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(frameCount * 0.07 + x * 0.1));
  }

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

  // Forward spike fins — tier 2 ships only, gives a sleeker/meaner silhouette
  if (tier === 2) {
    ctx.fillStyle = c.accent;
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-14, -16); ctx.lineTo(-7, -8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(14, -16); ctx.lineTo(7, -8); ctx.closePath(); ctx.fill();
  }

  // Sniper-rail antennae — tier 3 stealth drones only
  if (tier === 3) {
    ctx.strokeStyle = c.glow;
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-4, -18); ctx.lineTo(-10, -26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -18); ctx.lineTo(10, -26); ctx.stroke();
    ctx.fillStyle = c.glow;
    ctx.beginPath(); ctx.arc(-10, -26, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -26, 1.5, 0, Math.PI * 2); ctx.fill();
  }

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
function drawMothership(x, y, hp, maxHp, tier) {
  ctx.save();
  ctx.translate(x, y);

  const glowColor = tier === 3 ? '#66ddff' : tier === 2 ? '#ff2244' : '#00ff88';
  const pulse = 0.8 + 0.2 * Math.sin(frameCount * 0.05);
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 20 * pulse;

  // Main saucer body
  const bg = ctx.createRadialGradient(0, 0, 5, 0, 5, 55);
  if (tier === 3) {
    bg.addColorStop(0, '#3a4a55');
    bg.addColorStop(0.5, '#1c2a33');
    bg.addColorStop(1, '#06090c');
  } else if (tier === 2) {
    bg.addColorStop(0, '#552233');
    bg.addColorStop(0.5, '#330e1a');
    bg.addColorStop(1, '#150508');
  } else {
    bg.addColorStop(0, '#335544');
    bg.addColorStop(0.5, '#1a3322');
    bg.addColorStop(1, '#0a1a10');
  }
  ctx.fillStyle = bg;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 55, 22, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Top dome
  const dg = ctx.createRadialGradient(-10, -18, 2, 0, -14, 22);
  if (tier === 3) {
    dg.addColorStop(0, '#eaffff');
    dg.addColorStop(0.4, '#3399cc');
    dg.addColorStop(1, '#0a2233');
  } else if (tier === 2) {
    dg.addColorStop(0, '#ff99aa');
    dg.addColorStop(0.4, '#cc1133');
    dg.addColorStop(1, '#330011');
  } else {
    dg.addColorStop(0, '#88ffcc');
    dg.addColorStop(0.4, '#00aa55');
    dg.addColorStop(1, '#003322');
  }
  ctx.fillStyle = dg;
  ctx.beginPath();
  ctx.ellipse(0, -8, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Spikes around the rim (tier 2 — more menacing silhouette)
  if (tier === 2) {
    ctx.fillStyle = '#aa1133';
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const bx = Math.cos(angle) * 50;
      const by = Math.sin(angle) * 19;
      const tx = Math.cos(angle) * 64;
      const ty = Math.sin(angle) * 25;
      ctx.beginPath();
      ctx.moveTo(bx - 3, by);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx + 3, by);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Twin side cannons (tier 3 — Dreadnought) with a charging muzzle glow
  if (tier === 3) {
    const cannonPulse = 0.6 + 0.4 * Math.abs(Math.sin(frameCount * 0.08));
    [-30, 30].forEach(cx => {
      ctx.fillStyle = '#7799aa';
      ctx.fillRect(cx - 5, 8, 10, 16);
      ctx.fillStyle = `rgba(150,230,255,${cannonPulse})`;
      ctx.shadowColor = '#66ddff';
      ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(cx, 24, 4, 0, Math.PI * 2); ctx.fill();
    });
    // Electric arcs across the hull
    ctx.strokeStyle = `rgba(150,230,255,${cannonPulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-20, 2); ctx.lineTo(-6, -6); ctx.lineTo(6, 4); ctx.lineTo(20, -4);
    ctx.stroke();
  }

  // Rotating lights around rim
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + frameCount * 0.04;
    const lx = Math.cos(angle) * 44;
    const ly = Math.sin(angle) * 14;
    const lit1 = tier === 3 ? '#aaffff' : '#ffff00';
    const lit2 = tier === 3 ? '#3399ff' : tier === 2 ? '#ff0044' : '#ff4400';
    ctx.fillStyle = i % 2 === 0 ? lit1 : lit2;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();
  }

  // HP bar
  const barW = 100;
  const hpFrac = hp / maxHp;
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#111';
  ctx.fillRect(-barW / 2, 28, barW, 7);
  ctx.fillStyle = hpFrac > 0.5 ? '#00ff44' : hpFrac > 0.25 ? '#ffaa00' : '#ff2200';
  ctx.fillRect(-barW / 2, 28, barW * hpFrac, 7);
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(-barW / 2, 28, barW, 7);

  ctx.restore();
}

// Draw the rare cloaking ship — same silhouette as a normal fighter (fuselage,
// wings, cockpit), just recolored gold and wrapped in a bright pulsing halo so it
// still reads as a special, valuable target while visible.
function drawCloaker(x, y, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI);
  ctx.globalAlpha = alpha;

  const pulse = 0.7 + 0.3 * Math.sin(frameCount * 0.15);

  // Outer halo — large and bright so it reads as a special target at a glance
  const haloGrad = ctx.createRadialGradient(0, 0, 3, 0, 0, 38 * pulse);
  haloGrad.addColorStop(0, 'rgba(255,245,180,0.55)');
  haloGrad.addColorStop(0.45, 'rgba(255,221,0,0.28)');
  haloGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = haloGrad;
  ctx.beginPath(); ctx.arc(0, 0, 38 * pulse, 0, Math.PI * 2); ctx.fill();

  ctx.shadowColor = '#ffdd00';
  ctx.shadowBlur = 16 * pulse;

  // Shimmering "ghost" copy, slightly offset and faint — sells the cloaking-tech feel
  ctx.save();
  ctx.globalAlpha *= 0.3;
  ctx.translate(Math.sin(frameCount * 0.18) * 3, 0);
  drawCloakerHull();
  ctx.restore();

  // Main hull — standard fighter silhouette, just in gold
  drawCloakerHull();

  ctx.restore();

  function drawCloakerHull() {
    // Engine trail (same shape as a normal fighter's)
    const flicker = Math.random() * 5;
    const eg = ctx.createLinearGradient(0, 8, 0, 24 + flicker);
    eg.addColorStop(0, '#ffdd00');
    eg.addColorStop(1, 'transparent');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.moveTo(-5, 10); ctx.lineTo(0, 24 + flicker); ctx.lineTo(5, 10); ctx.closePath(); ctx.fill();

    // Fuselage
    const fg = ctx.createLinearGradient(-8, -20, 8, -20);
    fg.addColorStop(0, '#aa7700');
    fg.addColorStop(0.5, '#ffcc00');
    fg.addColorStop(1, '#aa7700');
    ctx.fillStyle = fg;
    ctx.strokeStyle = '#ffffaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -20); ctx.lineTo(6, -6); ctx.lineTo(6, 8); ctx.lineTo(0, 5); ctx.lineTo(-6, 8); ctx.lineTo(-6, -6);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Wings
    ctx.fillStyle = '#aa7700';
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-22, 10); ctx.lineTo(-18, 14); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(22, 10); ctx.lineTo(18, 14); ctx.lineTo(6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();

    // Cockpit
    const cg = ctx.createRadialGradient(0, -10, 1, 0, -10, 6);
    cg.addColorStop(0, '#fff7cc');
    cg.addColorStop(1, '#aa7700');
    ctx.fillStyle = cg;
    ctx.strokeStyle = '#ffffaa';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(0, -10, 3, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
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

// Photon torpedo detonation — splash damage equal to 13 machine-gun rounds to every ship caught in the blast
function explodeTorpedo(t) {
  const splashRadius = 100;
  spawnParticles(t.x, t.y, '#66ffff', 32);
  sfxExplosionBig();
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const e = enemies[ei];
    if (e.type === 'cloaker' && e.phase !== 'visible') continue;
    const reach = splashRadius + (e.type === 'mothership' ? 40 : 0);
    if (Math.hypot(e.x - t.x, e.y - t.y) > reach) continue;
    if (e.type === 'cloaker') {
      triggerCloakerHit(e);
      enemies.splice(ei, 1);
      continue;
    }
    e.hp -= t.damage;
    if (e.hp <= 0) {
      const col = e.type === 'mothership' ? '#00ff88' : e.type === 0 ? '#ff00ff' : e.type === 1 ? '#ff4400' : '#ffaa00';
      spawnParticles(e.x, e.y, col, e.type === 'mothership' ? 28 : 12);
      const proximity = Math.max(0, Math.min(1, 1 - (e.y - 40) / (canvas.height - 100)));
      const multiplier = Math.round(1 + proximity * 3);
      const earned = e.points * multiplier;
      const label = multiplier > 1 ? `+${earned} x${multiplier}!` : `+${earned}`;
      addFloatingText(e.x, e.y, label, col);
      score += earned;
      enemies.splice(ei, 1);
      updateUI();
    } else if (e.type === 'mothership') {
      spawnParticles(e.x, e.y, '#ffff00', 10);
    }
  }
}

function initGame() {
  player = { x: canvas.width / 2, y: canvas.height - 60, speed: 13, width: 28, height: 28 };
  bullets = [];
  enemies = [];
  enemyBullets = [];
  particles = [];
  floatingTexts = [];
  torpedoes = [];
  score = 0;
  lives = difficulty === 'test' ? 6 : difficulty === 'beginner' ? 6 : 4;
  shootCooldown = 0;
  torpedoCooldown = 0;
  enemySpawnTimer = 0;
  enemySpawnInterval = 90;
  level = 1;
  tier = 1;
  frameCount = 0;
  mothershipSpawnCounter = 0;
  transitionPhase = 0;
  transitionTimer = 0;
  invulnerable = 0;
  shakeTime = 0;
  cloakerSpawnTimer = 300 + Math.random() * 300;
  cloakerBannerTimer = 0;
  gameRunning = true;
  updateUI();
  loop();
}

function updateUI() {
  scoreDisplay.textContent = score;
  highDisplay.textContent = Math.max(score, ...getHighScores().map(s => s.score), 0);
  livesDisplay.textContent = Math.max(lives, 0);
}

function loop() {
  if (!gameRunning) return;
  animId = requestAnimationFrame(loop);
  frameCount++;
  update();
  draw();
}

function fireTorpedo() {
  if (!gameRunning || transitionPhase || torpedoCooldown > 0) return;
  torpedoes.push({ x: player.x, y: player.y - 24, vy: -5, pulse: 0, damage: 13 });
  torpedoCooldown = 30;
  sfxTorpedoLaunch();
}

// Single entry point for any damage the player takes — handles the life loss,
// a brief invulnerability window so overlapping hits in the same frame or two
// don't chain-kill the player, a screen shake, and haptic feedback where supported
// (note: iOS Safari does not implement the Vibration API, so this silently no-ops there).
function damagePlayer(amount) {
  if (invulnerable > 0) return;
  lives -= amount;
  updateUI();
  sfxPlayerHit();
  invulnerable = 60;
  shakeTime = 18;
  shakeMag = amount > 1 ? 14 : 9;
  if (navigator.vibrate) navigator.vibrate(amount > 1 ? [80, 40, 80] : 60);
  if (lives <= 0) endGame();
}

// Hitting the rare cloaking ship is a pure bonus: a bigger explosion, a brief
// freeze-frame celebration, and a free extra life.
function triggerCloakerHit(e) {
  spawnParticles(e.x, e.y, '#ffdd00', 40);
  spawnParticles(e.x, e.y, '#ffffff', 16);
  sfxExplosionBig();
  sfxBonusLife();
  lives++;
  updateUI();
  shakeTime = 12;
  shakeMag = 6;
  cloakerBannerTimer = 110;
  if (navigator.vibrate) navigator.vibrate([60, 40, 60, 40, 120]);
}

function update() {
  // Shake/invulnerability must always tick down, even during a freeze-frame banner --
  // otherwise a freeze that starts right after a hit holds the shake at full intensity
  // for the entire freeze instead of its short intended duration.
  if (invulnerable > 0) invulnerable--;
  if (shakeTime > 0) shakeTime--;

  // Mission-complete cutscene — freeze gameplay while the banner plays out
  if (transitionPhase) {
    transitionTimer--;
    if (transitionTimer <= 0) {
      if (transitionPhase === 1) { transitionPhase = 2; transitionTimer = 110; }
      else transitionPhase = 0;
    }
    return;
  }

  // Cloaking-ship bonus freeze-frame — pause briefly to celebrate the hit
  if (cloakerBannerTimer > 0) {
    cloakerBannerTimer--;
    return;
  }

  // Move player
  if (keys['ArrowLeft'] && player.x - player.width / 2 > 0) player.x -= player.speed;
  if (keys['ArrowRight'] && player.x + player.width / 2 < canvas.width) player.x += player.speed;

  // Machine gun fire — longer cooldown so holding the button isn't just automatic fire
  if (keys[' '] && shootCooldown <= 0) {
    bullets.push({ x: player.x, y: player.y - 22, width: 7, height: 14, vy: -30 });
    shootCooldown = difficulty === 'beginner' ? 9 : 14;
    sfxLaser();
  }
  if (shootCooldown > 0) shootCooldown--;
  if (torpedoCooldown > 0) torpedoCooldown--;

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
      const baseMotherHp = tier === 3 ? 35 : tier === 2 ? 25 : 20;
      const motherHp = difficulty === 'beginner' ? Math.round(baseMotherHp * 0.6) : baseMotherHp;
      enemies.push({
        x: 80 + Math.random() * (canvas.width - 160),
        y: -50,
        width: 55, height: 22,
        speed: (0.5 + level * 0.08) * speedMul(),
        type: 'mothership',
        hp: motherHp,
        maxHp: motherHp,
        tier,
        points: 1000,
        cannonTimer: 60
      });
      // Give extra breathing room before the next ship spawns — fighting a mothership
      // already demands full attention, a small fighter sneaking in is unfair.
      enemySpawnTimer = -90;
    } else {
      const type = level >= 3 ? Math.floor(Math.random() * 3) : (level === 2 ? Math.floor(Math.random() * 2) : 0);
      const spawnX = 30 + Math.random() * (canvas.width - 60);
      enemies.push({
        x: spawnX,
        y: -20,
        width: 26, height: 26,
        speed: (1.1 + level * 0.3 + Math.random()) * speedMul(),
        type,
        tier,
        hp: 1,
        points: (type + 1) * 20,
        vx: 0,
        dodged: false,
        dodgeTimer: 0,
        baseX: spawnX,
        weaveSeed: Math.random() * Math.PI * 2,
        fireTimer: 60 + Math.random() * 60
      });
    }

    if (enemySpawnInterval > 40) enemySpawnInterval -= 0.3;
  }

  // Rare cloaking ship — glows, teleports around the screen, and rewards a free
  // life if you manage to hit it while it's briefly visible.
  cloakerSpawnTimer--;
  if (cloakerSpawnTimer <= 0 && !enemies.some(e => e.type === 'cloaker')) {
    const cx = 60 + Math.random() * (canvas.width - 120);
    const cy = 100 + Math.random() * (canvas.height - 300);
    enemies.push({
      type: 'cloaker',
      x: cx,
      y: cy,
      width: 30, height: 30,
      hp: 1,
      phase: 'visible',
      phaseTimer: 130 + Math.random() * 50,
      alpha: 1,
      driftPhase: Math.random() * Math.PI * 2
    });
    spawnParticles(cx, cy, '#ffdd00', 14);
    sfxCloakerAppear();
    cloakerSpawnTimer = 600 + Math.random() * 600;
  }

  // Level / tier
  level = Math.floor(score / (difficulty === 'test' ? 2000 : difficulty === 'beginner' ? 350 : 200)) + 1;
  if (tier === 1 && score >= TIER_THRESHOLDS[difficulty][2]) {
    tier = 2;
    pendingTier = 2;
    transitionPhase = 1;
    transitionTimer = 110;
    if (difficulty === 'test') { lives = 6; updateUI(); }
    sfxTierUp();
    return;
  }
  if (tier === 2 && score >= TIER_THRESHOLDS[difficulty][3]) {
    tier = 3;
    pendingTier = 3;
    transitionPhase = 1;
    transitionTimer = 110;
    if (difficulty === 'test') { lives = 6; updateUI(); }
    sfxTierUp();
    return;
  }

  // Move enemies
  // Tier 2 fighters dodge sideways away from an incoming bullet once, then fly straight.
  // Tier 3 fighters continuously weave side-to-side and periodically snipe an aimed shot at the player.
  enemies.forEach(e => {
    if (e.type === 'cloaker') {
      // Slow continuous drift forward (down the screen) and a gentle side-to-side
      // sway, on top of the teleport hops — it travels across the screen rather
      // than looping in place forever, and eventually drifts off the bottom.
      e.y += 0.45 * speedMul();
      e.x += Math.sin(frameCount * 0.02 + e.driftPhase) * 0.5;
      e.x = Math.max(e.width / 2, Math.min(canvas.width - e.width / 2, e.x));

      e.phaseTimer--;
      if (e.phase === 'visible') {
        e.alpha = 1;
        if (e.phaseTimer <= 0) { e.phase = 'fading'; e.phaseTimer = 20; }
      } else if (e.phase === 'fading') {
        e.alpha = Math.max(0, e.phaseTimer / 20);
        if (e.phaseTimer <= 0) { e.phase = 'hidden'; e.phaseTimer = 30 + Math.random() * 20; }
      } else if (e.phase === 'hidden') {
        e.alpha = 0;
        if (e.phaseTimer <= 0) {
          // Teleport forward along its journey rather than jumping anywhere on screen
          e.x = 40 + Math.random() * (canvas.width - 80);
          e.y = Math.min(canvas.height - 80, e.y + 80 + Math.random() * 120);
          e.phase = 'appearing';
          e.phaseTimer = 20;
        }
      } else if (e.phase === 'appearing') {
        e.alpha = Math.min(1, 1 - e.phaseTimer / 20);
        if (e.phaseTimer <= 0) {
          e.phase = 'visible';
          e.phaseTimer = 130 + Math.random() * 50;
          spawnParticles(e.x, e.y, '#ffdd00', 14);
          sfxCloakerAppear();
        }
      }
      return;
    }
    if (e.tier === 3 && e.type !== 'mothership') {
      e.x = e.baseX + Math.sin(frameCount * 0.05 + e.weaveSeed) * 30;
      e.x = Math.max(e.width / 2, Math.min(canvas.width - e.width / 2, e.x));
      e.fireTimer--;
      if (e.fireTimer <= 0 && e.y > 0) {
        enemyBullets.push({ x: e.x, y: e.y + 14, vy: (4 + level * 0.2) * speedMul() });
        e.fireTimer = 90 + Math.random() * 60;
      }
    } else if (e.tier === 2 && e.type !== 'mothership') {
      if (!e.dodged) {
        const threat = bullets.find(b => b.y < e.y && e.y - b.y < 110 && Math.abs(b.x - e.x) < 35);
        if (threat) {
          e.dodged = true;
          e.dodgeTimer = 18;
          e.vx = (threat.x < e.x ? 1 : -1) * 4.5 * speedMul();
        }
      }
      if (e.dodgeTimer > 0) {
        e.x += e.vx;
        e.x = Math.max(e.width / 2, Math.min(canvas.width - e.width / 2, e.x));
        e.dodgeTimer--;
      }
    }
    if (e.type === 'mothership' && e.tier === 3) {
      e.cannonTimer--;
      if (e.cannonTimer <= 0 && e.y > 0) {
        const spread = 30;
        enemyBullets.push({ x: e.x - spread, y: e.y + 10, vy: (3.5 + level * 0.15) * speedMul() });
        enemyBullets.push({ x: e.x + spread, y: e.y + 10, vy: (3.5 + level * 0.15) * speedMul() });
        e.cannonTimer = 100;
      }
    }
    e.y += e.speed;
  });

  // The cloaker drifts off naturally once it reaches the bottom of its journey —
  // no penalty, it just leaves (it was never a threat, only a bonus target).
  enemies = enemies.filter(e => !(e.type === 'cloaker' && e.y > canvas.height + 60));

  // Move enemy bullets and resolve collision with the player
  for (let bi = enemyBullets.length - 1; bi >= 0; bi--) {
    const eb = enemyBullets[bi];
    eb.y += eb.vy;
    const hitPlayer = lives > 0 && Math.abs(eb.x - player.x) < 16 && Math.abs(eb.y - player.y) < 20;
    if (hitPlayer) {
      spawnParticles(player.x, player.y, '#ff2244', 16);
      enemyBullets.splice(bi, 1);
      damagePlayer(1);
    } else if (eb.y > canvas.height + 20) {
      enemyBullets.splice(bi, 1);
    }
  }

  // Move & resolve photon torpedoes — slow, pulsing, AoE splash damage
  for (let ti = torpedoes.length - 1; ti >= 0; ti--) {
    const t = torpedoes[ti];
    t.y += t.vy;
    t.pulse += 0.22;
    let hit = false;
    for (const e of enemies) {
      if (e.type === 'cloaker' && e.phase !== 'visible') continue;
      const hitDist = e.type === 'mothership' ? 60 : 26;
      if (Math.hypot(e.x - t.x, e.y - t.y) < hitDist) { hit = true; break; }
    }
    if (hit) {
      explodeTorpedo(t);
      torpedoes.splice(ti, 1);
    } else if (t.y < -30) {
      torpedoes.splice(ti, 1);
    }
  }

  // Collision: bullets vs enemies
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      if (e.type === 'cloaker' && e.phase !== 'visible') continue;
      const hitW = e.type === 'mothership' ? 55 : 22;
      const hitH = e.type === 'mothership' ? 28 : 22;
      if (Math.abs(b.x - e.x) < hitW && Math.abs(b.y - e.y) < hitH) {
        if (e.type === 'cloaker') {
          bullets.splice(bi, 1);
          triggerCloakerHit(e);
          enemies.splice(ei, 1);
          break;
        }
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
          if (e.type === 'mothership') sfxExplosionBig(); else sfxExplosionSmall();
        } else if (e.type === 'mothership') {
          // Show damage hit on mothership
          spawnParticles(b.x, b.y, '#ffff00', 4);
          sfxMothershipHit();
        }
        break;
      }
    }
  }

  // Enemies passing bottom or hitting player (the cloaker is harmless to touch —
  // it's a bonus target, only vulnerable to being shot while visible)
  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const e = enemies[ei];
    if (e.type === 'cloaker') continue;
    const hitW = e.type === 'mothership' ? 50 : 24;
    const hitPlayer = Math.abs(e.x - player.x) < hitW && Math.abs(e.y - player.y) < 26;
    if (e.y > canvas.height + 60 || hitPlayer) {
      if (hitPlayer) spawnParticles(player.x, player.y, '#0099ff', 18);
      enemies.splice(ei, 1);
      damagePlayer(e.type === 'mothership' ? 2 : 1);
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
  // Background — drawn before the shake transform so the starfield stays put;
  // only the foreground (ships, particles, bullets) actually shakes on impact.
  ctx.fillStyle = '#000005';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  if (shakeTime > 0) {
    const mag = shakeMag * (shakeTime / 18);
    ctx.translate((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag);
  }

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

  // Enemy bullets — tier 3 sniper/cannon fire
  enemyBullets.forEach(eb => {
    const eg = ctx.createLinearGradient(eb.x, eb.y - 8, eb.x, eb.y + 8);
    eg.addColorStop(0, '#ffffff');
    eg.addColorStop(0.4, '#66ddff');
    eg.addColorStop(1, '#ff2266');
    ctx.fillStyle = eg;
    ctx.shadowColor = '#66ddff';
    ctx.shadowBlur = 8;
    ctx.fillRect(eb.x - 2.5, eb.y - 8, 5, 16);
  });
  ctx.shadowBlur = 0;

  // Photon torpedoes — pulsing glowing orb
  torpedoes.forEach(t => {
    const pulseR = 9 + Math.sin(t.pulse) * 3.5;
    const tg = ctx.createRadialGradient(t.x, t.y, 1, t.x, t.y, pulseR * 2);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(0.3, '#aaffff');
    tg.addColorStop(0.6, '#22aaff');
    tg.addColorStop(1, 'transparent');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.arc(t.x, t.y, pulseR * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#66ffff';
    ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(t.x, t.y, pulseR * 0.4, 0, Math.PI * 2); ctx.fill();
  });
  ctx.shadowBlur = 0;

  // Enemies
  enemies.forEach(e => {
    if (e.type === 'cloaker') { if (e.alpha > 0.02) drawCloaker(e.x, e.y, e.alpha); }
    else if (e.type === 'mothership') drawMothership(e.x, e.y, e.hp, e.maxHp, e.tier);
    else drawEnemyShip(e.x, e.y, e.type, e.tier);
  });

  // Player — flickers while invulnerable after a hit, so the recovery window is visible
  if (lives > 0 && (invulnerable <= 0 || frameCount % 6 < 3)) drawShip(player.x, player.y);

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

  ctx.restore(); // end shake transform — HUD text and the mission banner stay steady

  // Level
  ctx.font = '13px Courier New';
  ctx.fillStyle = 'rgba(0,255,255,0.35)';
  ctx.fillText(`LEVEL ${level}${tier > 1 ? `  //  TIER ${tier}` : ''}`, 10, canvas.height - 10);

  // Mission-complete cutscene banner
  if (transitionPhase) drawMissionBanner();

  // Cloaking-ship bonus banner
  if (cloakerBannerTimer > 0) drawCloakerBanner();

  // Bloom pass — copy the frame onto a blurred, screen-blended layer (see #glowCanvas
  // CSS). Screen-blending a near-black background barely changes it, so only the
  // bright neon shapes visibly bloom outward.
  glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
  glowCtx.drawImage(canvas, 0, 0);
}

function drawMissionBanner() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const fadeWindow = 20;
  const fadeIn = Math.min(1, (110 - transitionTimer) / fadeWindow);
  const fadeOut = Math.min(1, transitionTimer / fadeWindow);
  const alpha = Math.min(fadeIn, fadeOut);

  const banner = MISSION_TEXT[pendingTier][transitionPhase];
  const lines = banner.lines;
  const accent = banner.accent;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Dim the battlefield behind the banner
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Banner panel
  const panelW = 460, panelH = 160;
  const pulse = 0.85 + 0.15 * Math.sin(frameCount * 0.12);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 25 * pulse;
  ctx.fillStyle = 'rgba(5,15,20,0.92)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 12);
  else ctx.rect(cx - panelW / 2, cy - panelH / 2, panelW, panelH);
  ctx.fill(); ctx.stroke();

  // Badge icon — glowing ring with a checkmark / chevron
  ctx.shadowBlur = 14;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy - panelH / 2 + 8, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  if (transitionPhase === 1) {
    ctx.moveTo(cx - 10, cy - panelH / 2 + 8);
    ctx.lineTo(cx - 2, cy - panelH / 2 + 16);
    ctx.lineTo(cx + 12, cy - panelH / 2 - 2);
  } else {
    ctx.moveTo(cx - 8, cy - panelH / 2 - 4);
    ctx.lineTo(cx + 8, cy - panelH / 2 + 8);
    ctx.lineTo(cx - 8, cy - panelH / 2 + 20);
  }
  ctx.stroke();

  // Text
  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.font = 'bold 22px Courier New';
  ctx.fillText(lines[0], cx, cy + 14);
  ctx.font = 'bold 17px Courier New';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(lines[1], cx, cy + 44);
  ctx.textAlign = 'left';

  ctx.restore();
}

function drawCloakerBanner() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const fadeWindow = 20;
  const fadeIn = Math.min(1, (110 - cloakerBannerTimer) / fadeWindow);
  const fadeOut = Math.min(1, cloakerBannerTimer / fadeWindow);
  const alpha = Math.min(fadeIn, fadeOut);
  const accent = '#ffdd00';

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panelW = 460, panelH = 160;
  const pulse = 0.85 + 0.15 * Math.sin(frameCount * 0.12);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 25 * pulse;
  ctx.fillStyle = 'rgba(20,15,0,0.92)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - panelW / 2, cy - panelH / 2, panelW, panelH, 12);
  else ctx.rect(cx - panelW / 2, cy - panelH / 2, panelW, panelH);
  ctx.fill(); ctx.stroke();

  // Badge icon — a small glowing star for the bonus
  ctx.shadowBlur = 14;
  ctx.fillStyle = accent;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    const a2 = a + Math.PI / 5;
    ctx.lineTo(cx + Math.cos(a) * 16, cy - panelH / 2 + 8 + Math.sin(a) * 16);
    ctx.lineTo(cx + Math.cos(a2) * 7, cy - panelH / 2 + 8 + Math.sin(a2) * 7);
  }
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px Courier New';
  ctx.fillText('ENEMY CLOAKING SHIP HIT!', cx, cy + 14);
  ctx.font = 'bold 17px Courier New';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('NEW LIFE ADDED', cx, cy + 44);
  ctx.textAlign = 'left';

  ctx.restore();
}

function endGame() {
  gameRunning = false;
  cancelAnimationFrame(animId);
  sfxGameOver();
  const name = nameInput.value.trim() || 'PILOT';
  saveHighScore(name, score);
  renderHighScores();
  overlay.style.display = 'flex';
  startBtn.textContent = 'PLAY AGAIN';
}

window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) {
      const now = performance.now();
      if (now - lastSpaceTime < 350) fireTorpedo();
      lastSpaceTime = now;
    }
  }
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
  // Ignore a second finger (palm/thumb resting on screen) while one is already
  // controlling the ship — otherwise it can hijack movement and snap the ship
  // to wherever that stray touch landed.
  if (touchId !== null) { e.preventDefault(); return; }
  const t = e.changedTouches[0];
  touchId = t.identifier;
  const pos = touchToPlayerPos(t);
  player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, pos.x));
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (!gameRunning) return;
  for (const t of e.changedTouches) {
    if (t.identifier === touchId) {
      const pos = touchToPlayerPos(t);
      player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, pos.x));
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

// Mouse: move the cursor over the canvas to steer, click (and hold) to fire,
// double-click to launch a photon torpedo.
canvas.addEventListener('mousemove', e => {
  if (!gameRunning) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const x = (e.clientX - rect.left) * scaleX;
  player.x = Math.max(player.width / 2, Math.min(canvas.width - player.width / 2, x));
});
canvas.addEventListener('mousedown', () => { keys[' '] = true; });
canvas.addEventListener('mouseup', () => { keys[' '] = false; });
canvas.addEventListener('mouseleave', () => { keys[' '] = false; });
canvas.addEventListener('dblclick', e => { e.preventDefault(); fireTorpedo(); });

// Touch: press and hold FIRE button to shoot; rapid double-tap launches a photon torpedo
const fireBtn = document.getElementById('fireBtn');
fireBtn.addEventListener('touchstart', e => {
  keys[' '] = true;
  fireBtn.classList.add('active');
  const now = performance.now();
  if (now - lastFireTap < 350) fireTorpedo();
  lastFireTap = now;
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

document.querySelectorAll('#difficultySelect button').forEach(btn => {
  btn.addEventListener('click', () => {
    difficulty = btn.dataset.difficulty;
    document.querySelectorAll('#difficultySelect button').forEach(b => b.classList.toggle('active', b === btn));
    sfxButton();
  });
});

startBtn.addEventListener('click', () => {
  sfxButton();
  if (!nameInput.value.trim()) { nameInput.focus(); return; }
  overlay.style.display = 'none';
  initGame();
});

renderHighScores();
