window.ZoneProgression = (function () {
  const STORAGE_KEY = 'zonerush_save_v1';

  const COLORS = [
    { id: 'red', hex: '#ef4444', dark: '#b91c1c' },
    { id: 'blue', hex: '#3b82f6', dark: '#1d4ed8' },
    { id: 'green', hex: '#22c55e', dark: '#15803d' },
    { id: 'purple', hex: '#a855f7', dark: '#7e22ce' },
    { id: 'orange', hex: '#f97316', dark: '#c2410c' },
    { id: 'cyan', hex: '#06b6d4', dark: '#0e7490' }
  ];

  const SKINS = [
    { id: 'classic', name: 'Классик', reqLevel: 1 },
    { id: 'crown', name: 'Корона Короля', reqLevel: 5 },
    { id: 'cat', name: 'Милый Котик', reqLevel: 10 },
    { id: 'ninja', name: 'Тень Ниндзя', reqLevel: 15 },
    { id: 'demon', name: 'Рожки Демона', reqLevel: 20 },
    { id: 'cyborg', name: 'Киборг 3000', reqLevel: 25 },
    { id: 'rainbow', name: 'Радужный Дух', reqLevel: 30 }
  ];

  let state = {
    nickname: '',
    level: 1,
    xp: 0,
    colorId: 'blue',
    skinId: 'classic'
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { ...state, ...parsed };
      }
    } catch (e) {
      console.warn('Ошибка чтения сохранения', e);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Ошибка записи сохранения', e);
    }
  }

  function getXpForNextLevel(lvl) {
    return 100 + (lvl - 1) * 50;
  }

  function getColorObj(colorId) {
    return COLORS.find(c => c.id === colorId) || COLORS;
  }

  function getSkinObj(skinId) {
    return SKINS.find(s => s.id === skinId) || SKINS;
  }

  function addMatchXp(maxPercent, kills) {
    const gained = Math.round(maxPercent * 12 + kills * 50 + 15);
    state.xp += gained;

    let unlockedSkin = null;
    let needed = getXpForNextLevel(state.level);

    while (state.xp >= needed) {
      state.xp -= needed;
      state.level += 1;
      needed = getXpForNextLevel(state.level);

      const newPrize = SKINS.find(s => s.reqLevel === state.level);
      if (newPrize) {
        unlockedSkin = newPrize;
        state.skinId = newPrize.id; // Автоматически примеряем новый приз
      }
    }

    save();
    return { gainedXp: gained, newLevel: state.level, unlockedSkin };
  }

  function setNickname(name) {
    state.nickname = name.trim().slice(0, 14);
    save();
  }

  function selectColor(colorId) {
    state.colorId = colorId;
    save();
  }

  function selectSkin(skinId) {
    const skin = getSkinObj(skinId);
    if (state.level >= skin.reqLevel) {
      state.skinId = skinId;
      save();
      return true;
    }
    return false;
  }
  // Универсальная отрисовка кубика персонажа и его наряда (используется и в меню, и в игре)
  function drawCharacter(ctx, x, y, size, colorId, skinId, angle = 0, time = 0) {
    const color = getColorObj(colorId);
    const half = size / 2;
    const radius = size * 0.26;

    ctx.save();
    ctx.translate(x, y);

    // 1. Объемная 3D-тень под персонажем
    ctx.fillStyle = color.dark;
    roundRect(ctx, -half, -half + size * 0.14, size, size, radius);
    ctx.fill();

    // 2. Основной корпус куба (для Радужного духа — переливающийся градиент)
    if (skinId === 'rainbow') {
      const hue = (time * 0.15) % 360;
      ctx.fillStyle = `hsl(${hue}, 85%, 58%)`;
    } else if (skinId === 'ninja') {
      ctx.fillStyle = '#1e293b';
    } else if (skinId === 'cyborg') {
      ctx.fillStyle = '#64748b';
    } else {
      ctx.fillStyle = color.hex;
    }

    roundRect(ctx, -half, -half, size, size, radius);
    ctx.fill();

    // 3. Глянцевый верхний блик
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    roundRect(ctx, -half + size * 0.1, -half + size * 0.08, size * 0.8, size * 0.32, radius * 0.6);
    ctx.fill();

    // 4. Мультяшные глазки (смотрят в сторону движения)
    const lookX = Math.cos(angle) * (size * 0.1);
    const lookY = Math.sin(angle) * (size * 0.08);

    if (skinId === 'cyborg') {
      // Светящийся красный визор киборга
      ctx.fillStyle = '#0f172a';
      roundRect(ctx, -size * 0.34 + lookX, -size * 0.14 + lookY, size * 0.68, size * 0.24, 6);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 8;
      ctx.fillRect(-size * 0.26 + lookX, -size * 0.06 + lookY, size * 0.52, size * 0.08);
      ctx.shadowBlur = 0;
    } else {
      // Обычные живые глаза
      const eyeOffsetX = size * 0.18;
      const eyeY = -size * 0.04 + lookY;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-eyeOffsetX + lookX, eyeY, size * 0.13, 0, Math.PI * 2);
      ctx.arc(eyeOffsetX + lookX, eyeY, size * 0.13, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-eyeOffsetX + lookX * 1.3, eyeY, size * 0.065, 0, Math.PI * 2);
      ctx.arc(eyeOffsetX + lookX * 1.3, eyeY, size * 0.065, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Отрисовка нарядов (головных уборов и деталей)
    if (skinId === 'crown') {
      // Золотая корона сверху
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-size * 0.32, -half + 2);
      ctx.lineTo(-size * 0.36, -half - size * 0.32);
      ctx.lineTo(-size * 0.14, -half - size * 0.14);
      ctx.lineTo(0, -half - size * 0.38);
      ctx.lineTo(size * 0.14, -half - size * 0.14);
      ctx.lineTo(size * 0.36, -half - size * 0.32);
      ctx.lineTo(size * 0.32, -half + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (skinId === 'cat') {
      // Кошачьи ушки
      ctx.fillStyle = color.hex;
      ctx.beginPath();
      ctx.moveTo(-size * 0.38, -half + 4);
      ctx.lineTo(-size * 0.28, -half - size * 0.28);
      ctx.lineTo(-size * 0.06, -half + 2);
      ctx.moveTo(size * 0.38, -half + 4);
      ctx.lineTo(size * 0.28, -half - size * 0.28);
      ctx.lineTo(size * 0.06, -half + 2);
      ctx.fill();
      // Розовая серединка ушек
      ctx.fillStyle = '#f472b6';
      ctx.beginPath();
      ctx.moveTo(-size * 0.32, -half + 2);
      ctx.lineTo(-size * 0.26, -half - size * 0.18);
      ctx.lineTo(-size * 0.12, -half + 2);
      ctx.moveTo(size * 0.32, -half + 2);
      ctx.lineTo(size * 0.26, -half - size * 0.18);
      ctx.lineTo(size * 0.12, -half + 2);
      ctx.fill();
    } else if (skinId === 'ninja') {
      // Красная повязка ниндзя
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-half - 1, -size * 0.22, size + 2, size * 0.14);
      // Развевающиеся ленточки сзади
      ctx.beginPath();
      ctx.moveTo(-half, -size * 0.16);
      ctx.lineTo(-half - size * 0.26, -size * 0.26 + Math.sin(time * 0.01) * 4);
      ctx.lineTo(-half - size * 0.22, -size * 0.06 + Math.sin(time * 0.01) * 4);
      ctx.fill();
    } else if (skinId === 'demon') {
      // Острые рожки демона
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -half + 2);
      ctx.quadraticCurveTo(-size * 0.45, -half - size * 0.3, -size * 0.18, -half - size * 0.34);
      ctx.lineTo(-size * 0.12, -half + 2);
      ctx.moveTo(size * 0.3, -half + 2);
      ctx.quadraticCurveTo(size * 0.45, -half - size * 0.3, size * 0.18, -half - size * 0.34);
      ctx.lineTo(size * 0.12, -half + 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Обновление UI меню и гардероба
  function refreshUI() {
    const needed = getXpForNextLevel(state.level);
    const pct = Math.min(100, Math.round((state.xp / needed) * 100));

    document.getElementById('menuLevelBadge').textContent = `Ур. ${state.level}`;
    document.getElementById('menuXpText').textContent = `${state.xp} / ${needed} XP`;
    document.getElementById('menuXpBar').style.width = `${pct}%`;

    const nextPrize = SKINS.find(s => s.reqLevel > state.level);
    const hintEl = document.getElementById('nextRewardHint');
    if (nextPrize) {
      const diff = nextPrize.reqLevel - state.level;
      hintEl.textContent = `🎁 Наряд «${nextPrize.name}» через ${diff} ур. (на ${nextPrize.reqLevel} ур.)`;
    } else {
      hintEl.textContent = '👑 Все легендарные наряды открыты!';
    }

    const curSkin = getSkinObj(state.skinId);
    document.getElementById('currentSkinName').textContent = curSkin.name;

    const nickInput = document.getElementById('nicknameInput');
    if (nickInput && state.nickname) {
      nickInput.value = state.nickname;
    }

    // Отрисовка превью персонажа в главном меню
    const prevCanvas = document.getElementById('previewCanvas');
    if (prevCanvas) {
      const pCtx = prevCanvas.getContext('2d');
      pCtx.clearRect(0, 0, prevCanvas.width, prevCanvas.height);
      drawCharacter(pCtx, 60, 66, 54, state.colorId, state.skinId, 0, performance.now());
    }
  }

  function renderWardrobe() {
    const colorRow = document.getElementById('colorPickerRow');
    colorRow.innerHTML = '';
    COLORS.forEach(c => {
      const dot = document.createElement('div');
      dot.className = 'color-dot' + (state.colorId === c.id ? ' active' : '');
      dot.style.background = c.hex;
      dot.onclick = () => {
        selectColor(c.id);
        renderWardrobe();
        refreshUI();
      };
      colorRow.appendChild(dot);
    });

    const grid = document.getElementById('skinsGrid');
    grid.innerHTML = '';
    SKINS.forEach(skin => {
      const unlocked = state.level >= skin.reqLevel;
      const item = document.createElement('div');
      item.className = 'skin-item' +
        (state.skinId === skin.id ? ' selected' : '') +
        (!unlocked ? ' locked' : '');

      const cvs = document.createElement('canvas');
      cvs.width = 76;
      cvs.height = 76;
      const sCtx = cvs.getContext('2d');
      drawCharacter(sCtx, 38, 44, 38, state.colorId, skin.id, 0, 1000);

      const title = document.createElement('div');
      title.className = 'skin-item-title';
      title.textContent = skin.name;

      item.appendChild(cvs);
      item.appendChild(title);

      if (!unlocked) {
        const lock = document.createElement('div');
        lock.className = 'skin-item-lock';
        lock.textContent = `🔒 ${skin.reqLevel} ур.`;
        item.appendChild(lock);
      } else {
        item.onclick = () => {
          selectSkin(skin.id);
          renderWardrobe();
          refreshUI();
        };
      }

      grid.appendChild(item);
    });
  }

  load();

  return {
    getState: () => ({ ...state }),
    COLORS,
    SKINS,
    getColorObj,
    getSkinObj,
    setNickname,
    addMatchXp,
    drawCharacter,
    refreshUI,
    renderWardrobe
  };
})();
