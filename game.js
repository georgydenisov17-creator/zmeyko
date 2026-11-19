// ===== Змейка =====
(() => {
  'use strict';

  // ---------- Настройки ----------
  const GRID = 20;               // поле GRID x GRID клеток
  const START_DELAY = 150;       // мс на шаг в начале
  const MIN_DELAY = 70;          // самая высокая скорость
  const SPEEDUP = 2;             // на сколько мс ускоряемся за каждую еду
  const STORAGE_KEY = 'snake-best';

  const DIRS = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 }
  };

  // ---------- Элементы ----------
  const $ = id => document.getElementById(id);
  const board = $('board'), canvas = $('canvas'), ctx = canvas.getContext('2d');
  const scoreEl = $('score'), bestEl = $('best');
  const startOverlay = $('startOverlay'), overOverlay = $('overOverlay');
  const finalScoreEl = $('finalScore'), newBestEl = $('newBest');

  // ---------- Состояние ----------
  let snake, dir, dirQueue, food, score, best, delay;
  let state = 'ready';           // ready | playing | paused | over
  let lastTime = 0, acc = 0, cell = 10;

  // ---------- Рекорд (localStorage может быть недоступен) ----------
  function loadBest() {
    try { return parseInt(localStorage.getItem(STORAGE_KEY), 10) || 0; }
    catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem(STORAGE_KEY, String(v)); } catch (e) { /* игнор */ }
  }

  // ---------- Размер поля под экран ----------
  function resize() {
    const pad = document.querySelector('.pad');
    const hud = document.querySelector('.hud');
    const availW = window.innerWidth - 20;
    // оставляем место под HUD и кнопки (кнопкам минимум ~120px)
    const availH = window.innerHeight - hud.offsetHeight - 120 - 40;
    const size = Math.max(160, Math.floor(Math.min(availW, availH, 560) / GRID) * GRID);
    const dpr = window.devicePixelRatio || 1;
    board.style.width = board.style.height = size + 'px';
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = size / GRID;
    draw();
  }

  // ---------- Инициализация новой игры ----------
  function reset() {
    const mid = Math.floor(GRID / 2);
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    dir = DIRS.right;
    dirQueue = [];
    score = 0;
    delay = START_DELAY;
    acc = 0;
    placeFood();
    updateHud();
  }

  function placeFood() {
    const free = [];
    for (let x = 0; x < GRID; x++)
      for (let y = 0; y < GRID; y++)
        if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  // ---------- Управление ----------
  // Очередь поворотов: защита от разворота на 180° и от потери быстрых свайпов
  function setDirection(name) {
    const next = DIRS[name];
    if (!next) return;
    const last = dirQueue.length ? dirQueue[dirQueue.length - 1] : dir;
    if (next.x === -last.x && next.y === -last.y) return; // разворот
    if (next === last) return;
    if (dirQueue.length < 2) dirQueue.push(next);
  }

  function handleInput(name) {
    if (state === 'ready') start();
    else if (state === 'paused') resume();
    if (state === 'playing') setDirection(name);
  }

  // Клавиатура
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right'
  };
  window.addEventListener('keydown', e => {
    const name = KEYS[e.code];
    if (name) { e.preventDefault(); handleInput(name); }
    else if (e.code === 'Space' || e.code === 'Enter') {
      if (state === 'over') start();
      else if (state === 'ready') start();
    }
  });

  // Экранные кнопки
  document.querySelectorAll('.pad button').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      handleInput(btn.dataset.dir);
    });
  });

  // Свайпы по полю
  let touchStart = null;
  const SWIPE_MIN = 20;
  canvas.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  canvas.addEventListener('touchend', e => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    handleInput(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });

  // Тап по стартовому экрану / кнопке
  startOverlay.addEventListener('pointerdown', () => { if (state === 'ready') start(); });
  $('restartBtn').addEventListener('click', start);

  // Пауза при сворачивании
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') state = 'paused';
  });
  function resume() { state = 'playing'; lastTime = performance.now(); }

  // ---------- Состояния игры ----------
  function start() {
    reset();
    startOverlay.classList.add('hidden');
    overOverlay.classList.add('hidden');
    state = 'playing';
    lastTime = performance.now();
  }

  function gameOver() {
    state = 'over';
    const isRecord = score > best;
    if (isRecord) { best = score; saveBest(best); }
    updateHud();
    finalScoreEl.textContent = score;
    newBestEl.classList.toggle('hidden', !isRecord || score === 0);
    overOverlay.classList.remove('hidden');
  }

  // ---------- Игровой шаг ----------
  function step() {
    if (dirQueue.length) dir = dirQueue.shift();
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // стена
    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) return gameOver();

    const eating = food && head.x === food.x && head.y === food.y;
    // хвост освободится, если еду не съели
    const body = eating ? snake : snake.slice(0, -1);
    if (body.some(s => s.x === head.x && s.y === head.y)) return gameOver();

    snake.unshift(head);
    if (eating) {
      score++;
      delay = Math.max(MIN_DELAY, delay - SPEEDUP);
      placeFood();
      updateHud();
      if (!food) return gameOver(); // поле заполнено
    } else {
      snake.pop();
    }
  }

  // ---------- Главный цикл (фиксированный шаг) ----------
  function loop(now) {
    if (state === 'playing') {
      acc += now - lastTime;
      lastTime = now;
      while (acc >= delay && state === 'playing') { acc -= delay; step(); }
    }
    draw();
    requestAnimationFrame(loop);
  }

  // ---------- Отрисовка ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGrid() {
    const size = cell * GRID;
    ctx.strokeStyle = 'rgba(57,255,136,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID; i++) {
      ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size);
      ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell);
    }
    ctx.stroke();
  }

  function draw() {
    if (!snake) return;
    const size = cell * GRID;
    ctx.clearRect(0, 0, size, size);
    drawGrid();

    // еда
    if (food) {
      ctx.shadowColor = '#ff3d71'; ctx.shadowBlur = cell * 0.8;
      ctx.fillStyle = '#ff3d71';
      ctx.beginPath();
      ctx.arc((food.x + 0.5) * cell, (food.y + 0.5) * cell, cell * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    // змейка: голова ярче, хвост темнее
    ctx.shadowColor = '#39ff88'; ctx.shadowBlur = cell * 0.6;
    const gap = Math.max(1, cell * 0.08);
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const k = 1 - (i / Math.max(snake.length, 6)) * 0.55;
      ctx.fillStyle = i === 0 ? '#b6ffd2' : `rgba(57,255,136,${k.toFixed(2)})`;
      roundRect(s.x * cell + gap, s.y * cell + gap, cell - gap * 2, cell - gap * 2, cell * 0.3);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // ---------- Запуск ----------
  best = loadBest();
  reset();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();
  requestAnimationFrame(t => { lastTime = t; loop(t); });
})();
