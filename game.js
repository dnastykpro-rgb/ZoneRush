const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Параметры круглой арены и сетки
const GRID_SIZE = 140;
const CELL_SIZE = 20;
const ARENA_RADIUS = (GRID_SIZE * CELL_SIZE) / 2;
const CENTER = ARENA_RADIUS;
const PLAYER_SPEED = 235;
const TURN_SPEED = 6.2;
const TARGET_BOTS = 9;

let dpr = Math.min(window.devicePixelRatio || 1, 2);
let width = window.innerWidth;
let height = window.innerHeight;

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Игровое состояние
let grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
const entities = new Map();
const particles = [];
const floatingTexts = [];

let myId = window.ZoneNet ? window.ZoneNet.myId : 'local_player';
let isPlaying = false;
let matchStats = { maxPercent: 0, kills: 0 };
let shakeTime = 0;

// Управление (плавающий джойстик + клавиатура/мышь)
const input = {
  active: false,
  startX: 0,
  startY: 0,
  currX: 0,
  currY: 0,
  targetAngle: null
};

// ==========================================
// 1. СЦЕНАРИЙ ЗАСТАВКИ И ЭКРАНОВ МЕНЮ
// ==========================================
function initFlows() {
  const prog = window.ZoneProgression;
  prog.refreshUI();

  // Анимированная заставка (2.1 сек) -> затем запрос ника или главное меню
  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    splash.classList.add('fade-out');
    setTimeout(() => splash.classList.add('hidden'), 500);

    const savedState = prog.getState();
    if (!savedState.nickname) {
      document.getElementById('nicknameScreen').classList.remove('hidden');
      document.getElementById('firstNickInput').focus();
    } else {
      document.getElementById('mainMenu').classList.remove('hidden');
      prog.refreshUI();
    }
  }, 2100);

  // Сохранение ника при первом входе
  document.getElementById('saveFirstNickBtn').addEventListener('click', () => {
    const val = document.getElementById('firstNickInput').value.trim() || 'Игрок';
    prog.setNickname(val);
    document.getElementById('nicknameScreen').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
    prog.refreshUI();
  });

  // Кнопки главного меню
  document.getElementById('playBtn').addEventListener('click', startMatch);
  document.getElementById('restartBtn').addEventListener('click', startMatch);

  document.getElementById('toMenuBtn').addEventListener('click', () => {
    document.getElementById('gameOverModal').classList.add('hidden');
    document.getElementById('mainMenu').classList.remove('hidden');
    prog.refreshUI();
  });

  // Гардероб
  const openWardrobe = () => {
    prog.renderWardrobe();
    document.getElementById('wardrobeModal').classList.remove('hidden');
  };
  document.getElementById('wardrobeBtn').addEventListener('click', openWardrobe);
  document.getElementById('openWardrobeCard').addEventListener('click', openWardrobe);
  document.getElementById('closeWardrobeBtn').addEventListener('click', () => {
    document.getElementById('wardrobeModal').classList.add('hidden');
    prog.refreshUI();
  });
}

// ==========================================
// 2. СЕНСОРНЫЙ ДЖОЙСТИК И КЛАВИАТУРА
// ==========================================
canvas.addEventListener('touchstart', (e) => {
  if (!isPlaying) return;
  const t = e.touches;
  input.active = true;
  input.startX = t.clientX;
  input.startY = t.clientY;
  input.currX = t.clientX;
  input.currY = t.clientY;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (!isPlaying || !input.active) return;
  e.preventDefault();
  const t = e.touches;
  input.currX = t.clientX;
  input.currY = t.clientY;
  const dx = input.currX - input.startX;
  const dy = input.currY - input.startY;
  if (Math.hypot(dx, dy) > 8) {
    input.targetAngle = Math.atan2(dy, dx);
  }
}, { passive: false });

canvas.addEventListener('touchend', () => {
  input.active = false;
});

// Поддержка ПК (мышь при зажатии + стрелки/WASD)
canvas.addEventListener('mousedown', (e) => {
  if (!isPlaying) return;
  input.active = true;
  input.startX = e.clientX;
  input.startY = e.clientY;
  input.currX = e.clientX;
  input.currY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
  if (!isPlaying || !input.active) return;
  input.currX = e.clientX;
  input.currY = e.clientY;
  const dx = input.currX - input.startX;
  const dy = input.currY - input.startY;
  if (Math.hypot(dx, dy) > 8) {
    input.targetAngle = Math.atan2(dy, dx);
  }
});
window.addEventListener('mouseup', () => { input.active = false; });

window.addEventListener('keydown', (e) => {
  if (!isPlaying) return;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'ц') input.targetAngle = -Math.PI / 2;
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'ы') input.targetAngle = Math.PI / 2;
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'ф') input.targetAngle = Math.PI;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'в') input.targetAngle = 0;
});
// ==========================================
// 3. ЛОГИКА СУЩНОСТЕЙ, БОТОВ И ЗАХВАТА ЗОН
// ==========================================
const BOT_NAMES = ['Кобра', 'Шустрый', 'Титан', 'Зефирка', 'Молния', 'Пиксель', 'Акула', 'Вулкан', 'Космос', 'Ниндзя'];

function getRandomSpawnPoint() {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * (ARENA_RADIUS - 260);
  return {
    x: CENTER + Math.cos(angle) * dist,
    y: CENTER + Math.sin(angle) * dist
  };
}

function paintStartBase(id, worldX, worldY) {
  const gx = Math.floor(worldX / CELL_SIZE);
  const gy = Math.floor(worldY / CELL_SIZE);
  const r = 3;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r + 1) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
          grid[ny][nx] = id;
        }
      }
    }
  }
}

function clearTerritory(id) {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (grid[y][x] === id) grid[y][x] = null;
    }
  }
}

function spawnParticles(x, y, colorHex, count = 24) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 60 + Math.random() * 220;
    particles.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      size: 4 + Math.random() * 6,
      color: colorHex,
      life: 0.6 + Math.random() * 0.4
    });
  }
}

function spawnFloatingText(x, y, text, color = '#16a34a') {
  floatingTexts.push({ x, y, text, color, life: 1.1 });
}

function createBot(index) {
  const prog = window.ZoneProgression;
  const id = 'bot_' + index + '_' + Math.floor(Math.random() * 9999);
  const pos = getRandomSpawnPoint();
  const colorObj = prog.COLORS[index % prog.COLORS.length];
  const skinObj = prog.SKINS[Math.floor(Math.random() * prog.SKINS.length)];

  clearTerritory(id);
  paintStartBase(id, pos.x, pos.y);

  entities.set(id, {
    id,
    isBot: true,
    name: BOT_NAMES[index % BOT_NAMES.length],
    x: pos.x,
    y: pos.y,
    angle: Math.random() * Math.PI * 2,
    colorId: colorObj.id,
    skinId: skinObj.id,
    trail: [],
    alive: true,
    aiTimer: 0,
    aiState: 'expand',
    aiTargetAngle: Math.random() * Math.PI * 2
  });
}

function maintainBots() {
  if (window.ZoneNet && !window.ZoneNet.isHost) return;
  let botCount = 0;
  entities.forEach(e => { if (e.isBot && e.alive) botCount++; });

  let idx = 0;
  while (botCount  {
    const gx = Math.floor(pt.x / CELL_SIZE);
    const gy = Math.floor(pt.y / CELL_SIZE);
    if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy  Array(GRID_SIZE).fill(false));
  const queue = [];

  for (let i = 0; i = 0 && nx < GRID_SIZE && ny >= 0 && ny  0) {
    const pctGain = ((newlyFilled / (Math.PI * (GRID_SIZE / 2) ** 2)) * 100).toFixed(1);
    if (parseFloat(pctGain) >= 0.2) {
      spawnFloatingText(entity.x, entity.y - 24, `+${pctGain}%`);
    }
    if (window.ZoneNet) {
      window.ZoneNet.broadcastCapture(capturedCells, myId);
    }
  }
}

function killEntity(victimId, killerId = null) {
  const victim = entities.get(victimId);
  if (!victim || !victim.alive) return;

  const col = window.ZoneProgression.getColorObj(victim.colorId);
  spawnParticles(victim.x, victim.y, col.hex, 30);

  clearTerritory(victimId);
  victim.trail = [];
  victim.alive = false;

  if (killerId === myId && victimId !== myId) {
    matchStats.kills += 1;
    shakeTime = 0.25;
    spawnFloatingText(victim.x, victim.y - 30, 'КИЛЛ! +50 XP', '#ef4444');
  }

  if (victimId === myId) {
    endMatch();
  } else {
    entities.delete(victimId);
  }
}

function startMatch() {
  const prog = window.ZoneProgression;
  const nickVal = document.getElementById('nicknameInput').value.trim();
  if (nickVal) prog.setNickname(nickVal);

  const st = prog.getState();
  myId = window.ZoneNet ? window.ZoneNet.myId : 'local_player';

  document.getElementById('mainMenu').classList.add('hidden');
  document.getElementById('gameOverModal').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  matchStats = { maxPercent: 0, kills: 0 };
  isPlaying = true;
  input.active = false;
  input.targetAngle = null;

  const pos = getRandomSpawnPoint();
  clearTerritory(myId);
  paintStartBase(myId, pos.x, pos.y);

  entities.set(myId, {
    id: myId,
    isBot: false,
    name: st.nickname || 'Игрок',
    x: pos.x,
    y: pos.y,
    angle: 0,
    colorId: st.colorId,
    skinId: st.skinId,
    trail: [],
    alive: true
  });

  maintainBots();
}

function endMatch() {
  isPlaying = false;
  input.active = false;
  shakeTime = 0.35;

  document.getElementById('hud').classList.add('hidden');
  const res = window.ZoneProgression.addMatchXp(matchStats.maxPercent, matchStats.kills);

  document.getElementById('resPercent').textContent = `${matchStats.maxPercent.toFixed(1)}%`;
  document.getElementById('resKills').textContent = matchStats.kills;
  document.getElementById('resXp').textContent = `+${res.gainedXp} XP`;

  const prizeBox = document.getElementById('rewardUnlockBox');
  if (res.unlockedSkin) {
    document.getElementById('unlockedSkinTitle').textContent = res.unlockedSkin.name;
    prizeBox.classList.remove('hidden');
  } else {
    prizeBox.classList.add('hidden');
  }

  setTimeout(() => {
    document.getElementById('gameOverModal').classList.remove('hidden');
  }, 450);
}
// ==========================================
// 4. ОБНОВЛЕНИЕ ФИЗИКИ И ИИ БОТОВ
// ==========================================
function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function updateBotAI(bot, dt) {
  bot.aiTimer -= dt;
  const distFromCenter = Math.hypot(bot.x - CENTER, bot.y - CENTER);

  if (distFromCenter > ARENA_RADIUS - 140) {
    bot.aiTargetAngle = Math.atan2(CENTER - bot.y, CENTER - bot.x);
    bot.aiTimer = 0.6;
  } else if (bot.aiTimer <= 0) {
    if (bot.trail.length > 18) {
      bot.aiTargetAngle += (Math.PI * 0.65) * (Math.random() > 0.5 ? 1 : -1);
      bot.aiTimer = 0.9 + Math.random() * 0.8;
    } else {
      bot.aiTargetAngle += (Math.random() - 0.5) * 1.8;
      bot.aiTimer = 0.7 + Math.random() * 1.1;
    }
  }

  const diff = normalizeAngle(bot.aiTargetAngle - bot.angle);
  bot.angle += Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * 0.85 * dt);
}

function updateWorld(dt) {
  if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 38 * dt;
    ft.life -= dt;
    if (ft.life <= 0) floatingTexts.splice(i, 1);
  }

  maintainBots();

  entities.forEach((ent) => {
    if (!ent.alive) return;

    if (ent.id === myId && !ent.isBot) {
      if (input.targetAngle !== null) {
        const diff = normalizeAngle(input.targetAngle - ent.angle);
        ent.angle += Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * dt);
      }
    } else if (ent.isBot) {
      updateBotAI(ent, dt);
    }

    if (ent.id === myId || ent.isBot) {
      ent.x += Math.cos(ent.angle) * PLAYER_SPEED * dt;
      ent.y += Math.sin(ent.angle) * PLAYER_SPEED * dt;
    }

    if (Math.hypot(ent.x - CENTER, ent.y - CENTER) >= ARENA_RADIUS - 12) {
      killEntity(ent.id);
      return;
    }

    const gx = Math.floor(ent.x / CELL_SIZE);
    const gy = Math.floor(ent.y / CELL_SIZE);
    if (gx < 0 || gx >= GRID_SIZE || gy < 0 || gy >= GRID_SIZE) return;

    if (grid[gy][gx] === ent.id) {
      if (ent.trail.length > 0) captureZone(ent);
    } else {
      const last = ent.trail[ent.trail.length - 1];
      if (!last || Math.hypot(ent.x - last.x, ent.y - last.y) > 10) {
        ent.trail.push({ x: ent.x, y: ent.y });
      }
    }

    entities.forEach((other) => {
      if (!other.alive || other.trail.length < 3) return;
      const limit = other.id === ent.id ? other.trail.length - 5 : other.trail.length;
      for (let i = 0; i < limit; i++) {
        const t = other.trail[i];
        if (Math.hypot(ent.x - t.x, ent.y - t.y) < 13) {
          killEntity(other.id, ent.id);
          break;
        }
      }
    });
  });

  const me = entities.get(myId);
  if (isPlaying && me && me.alive && window.ZoneNet) {
    window.ZoneNet.broadcastMove({
      name: me.name,
      x: me.x,
      y: me.y,
      angle: me.angle,
      colorId: me.colorId,
      skinId: me.skinId,
      trail: me.trail
    });
  }
}
let hudTimer = 0;
function updateHUD(dt) {
  hudTimer += dt;
  if (hudTimer < 0.25) return;
  hudTimer = 0;

  const counts = {};
  const totalArenaCells = Math.PI * (GRID_SIZE / 2) * (GRID_SIZE / 2);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const owner = grid[y][x];
      if (owner) counts[owner] = (counts[owner] || 0) + 1;
    }
  }

  const myPct = ((counts[myId] || 0) / totalArenaCells) * 100;
  if (myPct > matchStats.maxPercent) matchStats.maxPercent = myPct;

  document.getElementById('hudPercent').textContent = `${myPct.toFixed(1)}%`;
  document.getElementById('hudKills').textContent = matchStats.kills;

  const ranking = [];
  entities.forEach((ent) => {
    if (!ent.alive) return;
    const pct = ((counts[ent.id] || 0) / totalArenaCells) * 100;
    ranking.push({ id: ent.id, name: ent.name, pct, colorId: ent.colorId });
  });
  ranking.sort((a, b) => b.pct - a.pct);

  const lbList = document.getElementById('lbList');
  lbList.innerHTML = '';
  ranking.slice(0, 5).forEach((item, idx) => {
    const col = window.ZoneProgression.getColorObj(item.colorId);
    const row = document.createElement('div');
    row.className = 'lb-row';
    row.style.color = item.id === myId ? '#16a34a' : '#1e293b';
    row.innerHTML = `<span>${idx + 1}. ${item.name}</span><span style="color:${col.hex}">${item.pct.toFixed(1)}%</span>`;
    lbList.appendChild(row);
  });
}

// ==========================================
// 5. ОТРИСОВКА В ВЫСОКОМ КАЧЕСТВЕ (HD RENDER)
// ==========================================
function render(now) {
  const prog = window.ZoneProgression;
  ctx.fillStyle = '#dbe4f0';
  ctx.fillRect(0, 0, width, height);

  const me = entities.get(myId);
  const camX = me && me.alive ? me.x : CENTER + Math.cos(now * 0.0003) * 350;
  const camY = me && me.alive ? me.y : CENTER + Math.sin(now * 0.0003) * 350;

  ctx.save();
  let sx = 0, sy = 0;
  if (shakeTime > 0) {
    sx = (Math.random() - 0.5) * 14;
    sy = (Math.random() - 0.5) * 14;
  }
  ctx.translate(width / 2 - camX + sx, height / 2 - camY + sy);

  ctx.beginPath();
  ctx.arc(CENTER, CENTER + 16, ARENA_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#94a3b8';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(CENTER, CENTER, ARENA_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#cbd5e1';
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, ARENA_RADIUS - 4, 0, Math.PI * 2);
  ctx.clip();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  const startX = Math.max(0, Math.floor((camX - width / 2) / 40) * 40);
  const endX = Math.min(ARENA_RADIUS * 2, camX + width / 2 + 40);
  const startY = Math.max(0, Math.floor((camY - height / 2) / 40) * 40);
  const endY = Math.min(ARENA_RADIUS * 2, camY + height / 2 + 40);

  for (let x = startX; x <= endX; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
  }
  for (let y = startY; y <= endY; y += 40) {
    ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
  }

  const minGx = Math.max(0, Math.floor((camX - width / 2) / CELL_SIZE) - 1);
  const maxGx = Math.min(GRID_SIZE - 1, Math.ceil((camX + width / 2) / CELL_SIZE) + 1);
  const minGy = Math.max(0, Math.floor((camY - height / 2) / CELL_SIZE) - 1);
  const maxGy = Math.min(GRID_SIZE - 1, Math.ceil((camY + height / 2) / CELL_SIZE) + 1);

  for (let y = minGy; y <= maxGy; y++) {
    for (let x = minGx; x <= maxGx; x++) {
      const ownerId = grid[y][x];
      if (!ownerId) continue;
      const owner = entities.get(ownerId);
      const col = prog.getColorObj(owner ? owner.colorId : 'blue');

      if (y + 1 < GRID_SIZE && grid[y + 1][x] !== ownerId) {
        ctx.fillStyle = col.dark;
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE + 5, CELL_SIZE + 0.6, CELL_SIZE + 0.6);
      }
      ctx.fillStyle = col.hex;
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE + 0.6, CELL_SIZE + 0.6);
    }
  }
  ctx.restore();
  entities.forEach((ent) => {
    if (!ent.alive || ent.trail.length === 0) return;
    const col = prog.getColorObj(ent.colorId);
    ctx.save();
    ctx.strokeStyle = col.hex + '99';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ent.trail.x, ent.trail.y);
    for (let i = 1; i < ent.trail.length; i++) {
      ctx.lineTo(ent.trail[i].x, ent.trail[i].y);
    }
    ctx.lineTo(ent.x, ent.y);
    ctx.stroke();
    ctx.restore();
  });

  entities.forEach((ent) => {
    if (!ent.alive) return;
    prog.drawCharacter(ctx, ent.x, ent.y, 32, ent.colorId, ent.skinId, ent.angle, now);

    ctx.font = '800 13px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(ent.name, ent.x, ent.y - 26);
  });

  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  floatingTexts.forEach((ft) => {
    ctx.globalAlpha = Math.max(0, ft.life);
    ctx.font = '900 18px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, ft.x, ft.y);
  });
  ctx.globalAlpha = 1;

  ctx.restore();

  if (isPlaying && input.active) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(input.startX, input.startY, 44, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.12)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.stroke();

    const dx = input.currX - input.startX;
    const dy = input.currY - input.startY;
    const dist = Math.min(32, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.arc(input.startX + Math.cos(ang) * dist, input.startY + Math.sin(ang) * dist, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    ctx.restore();
  }
}

// ==========================================
// 6. ПОДКЛЮЧЕНИЕ МУЛЬТИПЛЕЕРА И ЗАПУСК ЦИКЛА
// ==========================================
if (window.ZoneNet) {
  window.ZoneNet.connect({
    onPlayerUpdate: (peerId, data) => {
      if (!entities.has(peerId)) paintStartBase(peerId, data.x, data.y);
      entities.set(peerId, {
        id: peerId,
        isBot: false,
        name: data.name || 'Игрок',
        x: data.x,
        y: data.y,
        angle: data.angle,
        colorId: data.colorId || 'red',
        skinId: data.skinId || 'classic',
        trail: data.trail || [],
        alive: true
      });
    },
    onPlayerCapture: (peerId, data) => {
      if (data && Array.isArray(data.cells)) {
        data.cells.forEach(([gx, gy]) => {
          if (gx >= 0 && gx < GRID_SIZE && gy >= 0 && gy < GRID_SIZE) {
            grid[gy][gx] = data.ownerId;
          }
        });
      }
    },
    onPlayerLeave: (peerId) => {
      clearTerritory(peerId);
      entities.delete(peerId);
    },
    onOnlineChange: (count) => {
      document.getElementById('onlineBadge').textContent = `🌐 Онлайн: ${count}`;
    }
  });
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  updateWorld(dt);
  if (isPlaying) updateHUD(dt);
  render(now);

  requestAnimationFrame(loop);
}

initFlows();
maintainBots();
requestAnimationFrame(loop);
