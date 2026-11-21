/* 小猫寻鱼 —— 《TRAE 与 AI 创意编程》第二单元 Mechanics 互动案例
 * 纯原生 Canvas 实现，无外部依赖，可直接双击 index.html 运行。
 * 结构：常量与关卡数据 → 场景绘制 → 状态更新 → UI 绑定 → 自动化测试接口
 */
(function () {
  'use strict';

  /* ============================================================
   * 1. 常量与关卡数据
   * ============================================================ */
  const TILE = 48;
  const COLS = 16;
  const ROWS = 11;
  const W = COLS * TILE;   // 768
  const H = ROWS * TILE;   // 528
  const STEP_MS = 165;     // 走一格的时间，保证按键响应稳定
  const HIT_PENALTY = 5;   // 撞狗扣秒
  const HIT_RADIUS = 30;   // 碰撞半径（像素）
  const BGC = 2;           // 背景离屏画布倍率

  // V1 / V2 共用同一张地图：便于对比“只多了狗和倒计时”
  const MAP_SHARED = [
    'TTTTTTTTTTTTTTTT',
    'T..............T',
    'T..T..PP...T...T',
    'T..............T',
    'T..............T',
    'T..............T',
    'T..............T',
    'T...T..PP..T...T',
    'T..............T',
    'T..............T',
    'TTTTTTTTTTTTTTTT'
  ];

  // V3：中间一道树墙把地图分成“安全区（左）/ 危险区（右）”
  // 危险区里再用栅栏把小狗巡逻圈内部切成两个口袋，拿鱼必须反复穿过狗的巡逻线
  const MAP_V3 = [
    'TTTTTTTTTTTTTTTT',
    'T.......T......T',
    'T..T....T..PP..T',
    'T...FF..T..PP..T',
    'T.......T......T',
    'T....,,,,,,.F..T',
    'T..T....T...F..T',
    'T.......T......T',
    'T...FF..T......T',
    'T.......T......T',
    'TTTTTTTTTTTTTTTT'
  ];

  const FISH_SHARED = [
    [1, 1], [14, 1], [1, 9], [14, 9], [6, 4], [9, 5]
  ];

  const FISH_V3 = [
    // 安全区（左）：8 条 × 1 分
    { x: 1, y: 1, p: 1 }, { x: 6, y: 1, p: 1 },
    { x: 1, y: 4, p: 1 }, { x: 7, y: 4, p: 1 },
    { x: 1, y: 7, p: 1 }, { x: 6, y: 7, p: 1 },
    { x: 2, y: 9, p: 1 }, { x: 7, y: 9, p: 1 },
    // 危险区（右）：4 条 × 3 分
    { x: 10, y: 2, p: 3 }, { x: 10, y: 5, p: 3 },
    { x: 13, y: 6, p: 3 }, { x: 12, y: 8, p: 3 }
  ];

  const VERSIONS = {
    1: {
      id: 1,
      tag: '第 1 关',
      name: '找到食物',
      map: MAP_SHARED,
      fish: FISH_SHARED,
      start: [1, 5],
      time: null,
      targetPoints: null,
      dogPath: null,
      dogSpeed: 0,
      briefingGoal: '让小猫吃饱就通关。',
      briefingRules: ['碰到鱼就收集，每条鱼增加 1 点饱腹度。', '收集 6 条鱼，让小猫吃饱。']
    },
    2: {
      id: 2,
      tag: '第 2 关',
      name: '躲开巡逻狗',
      map: MAP_SHARED,
      fish: FISH_SHARED,
      start: [1, 5],
      time: 25,
      targetPoints: null,
      dogPath: [[4, 3], [11, 3], [11, 6], [4, 6]],
      dogSpeed: 2.8,
      safeSpots: [[1, 5], [1, 1], [14, 1], [1, 9], [14, 9], [8, 8]],
      briefingGoal: '25 秒内让小猫吃饱。',
      briefingRules: ['每条鱼增加 1 点饱腹度，吃饱需要 6 点。', '碰到巡逻狗扣 5 秒，并退回安全处。']
    },
    3: {
      id: 3,
      tag: '第 3 关',
      name: '选择路线',
      map: MAP_V3,
      fish: FISH_V3,
      start: [3, 5],
      time: 24,
      targetPoints: 8,
      dogPath: [[9, 4], [14, 4], [14, 5], [13, 5], [13, 7], [14, 7], [9, 7]],
      dogSpeed: 3.4,
      safeSpots: [[3, 5], [1, 1], [6, 1], [1, 7], [6, 9], [7, 5]],
      briefingGoal: '24 秒内让小猫吃饱。',
      briefingRules: ['普通鱼增加 1 点饱腹度，金鱼增加 3 点；吃饱需要 8 点。', '碰到巡逻狗扣 5 秒，并退回安全处。']
    }
  };

  /* ============================================================
   * 2. DOM 与画布
   * ============================================================ */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');

  const el = {
    hudVersion: document.getElementById('hudVersion'),
    hud: document.getElementById('hud'),
    fishLegend: document.getElementById('fishLegend'),
    pillTime: document.getElementById('pillTime'),
    hudTime: document.getElementById('hudTime'),
    hudFullness: document.getElementById('hudFullness'),
    hudScore: document.getElementById('hudScore'),
    hudScoreUnit: document.getElementById('hudScoreUnit'),
    overlayMenu: document.getElementById('overlayMenu'),
    overlayBrief: document.getElementById('overlayBrief'),
    briefTitle: document.getElementById('briefTitle'),
    briefGoal: document.getElementById('briefGoal'),
    briefRules: document.getElementById('briefRules'),
    btnStart: document.getElementById('btnStart'),
    btnBriefMenu: document.getElementById('btnBriefMenu'),
    overlayPause: document.getElementById('overlayPause'),
    overlayResult: document.getElementById('overlayResult'),
    resultMark: document.getElementById('resultMark'),
    resultTitle: document.getElementById('resultTitle'),
    resultSub: document.getElementById('resultSub'),
    toast: document.getElementById('toast'),
    btnPause: document.getElementById('btnPause'),
    btnSound: document.getElementById('btnSound'),
    btnResume: document.getElementById('btnResume'),
    btnPauseRestart: document.getElementById('btnPauseRestart'),
    btnPauseMenu: document.getElementById('btnPauseMenu'),
    btnRetry: document.getElementById('btnRetry'),
    btnOtherVersion: document.getElementById('btnOtherVersion'),
  };

  const bgs = new Map();

  function fitCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  /* ============================================================
   * 3. 状态
   * ============================================================ */
  const G = {
    version: 1,
    ver: VERSIONS[1],
    state: 'menu',           // menu | briefing | playing | paused | won | lost
    map: MAP_SHARED,
    fish: [],
    cat: null,
    dog: null,
    timeLeft: null,
    elapsed: 0,
    score: 0,
    collected: 0,
    collisions: 0,
    invuln: 0,
    controlLock: 0,
    shake: 0,
    hitFlash: 0,
    particles: [],
    popups: [],
    pondCells: [],
    t: 0,
    lastTick: 0,
    input: { held: [], botDir: null, tap: null }
  };

  /* ============================================================
   * 4. 音效（WebAudio 合成，无外部素材）
   * ============================================================ */
  const Sfx = {
    ctx: null,
    enabled: true,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type, vol, delay) {
      if (!this.enabled || !this.ctx) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    collect() {
      this.tone(880, 0.09, 'triangle', 0.13, 0);
      this.tone(1320, 0.12, 'triangle', 0.10, 0.07);
    },
    big() {
      this.tone(660, 0.09, 'triangle', 0.13, 0);
      this.tone(990, 0.09, 'triangle', 0.12, 0.07);
      this.tone(1320, 0.14, 'triangle', 0.1, 0.14);
    },
    hit() {
      this.tone(200, 0.18, 'sawtooth', 0.14, 0);
      this.tone(130, 0.26, 'square', 0.1, 0.05);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, i * 0.11));
    },
    lose() {
      [440, 349, 262].forEach((f, i) => this.tone(f, 0.24, 'sine', 0.12, i * 0.15));
    },
    tick() {
      this.tone(1180, 0.05, 'square', 0.05);
    },
    step() {
      this.tone(320, 0.03, 'sine', 0.025);
    }
  };

  /* ============================================================
   * 5. 工具函数
   * ============================================================ */
  function hash(x, y) {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function circle(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  function ellipse(c, x, y, rx, ry, rot) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
    c.fill();
  }
  function rrect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
    c.fill();
  }

  function cellCenter(gx, gy) {
    return { x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2 };
  }

  function walkable(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    const ch = G.map[y][x];
    return ch !== 'T' && ch !== 'F' && ch !== 'P';
  }

  /* ============================================================
   * 6. 背景绘制（每个版本只构建一次）
   * ============================================================ */
  function buildBackground(map) {
    const cv = document.createElement('canvas');
    cv.width = W * BGC;
    cv.height = H * BGC;
    const g = cv.getContext('2d');
    g.scale(BGC, BGC);

    const ponds = [];

    // 鱼和出生点所在格不画装饰，避免影响辨识
    const decoBlocked = new Set();
    G.fish.forEach(f => decoBlocked.add(f.x + ',' + f.y));
    if (G.ver) decoBlocked.add(G.ver.start[0] + ',' + G.ver.start[1]);

    // --- 地面 ---
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = map[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (ch === 'P') { ponds.push([x, y]); continue; }

        const isPath = ch === ',';
        g.fillStyle = isPath ? ((x + y) % 2 ? '#ecd9b1' : '#e7d2a8')
                             : ((x + y) % 2 ? '#a9d5a0' : '#a3ce9a');
        g.fillRect(px, py, TILE, TILE);

        if (isPath) {
          for (let i = 0; i < 5; i++) {
            const rx = px + 6 + hash(x + i * 7, y + i * 3) * 36;
            const ry = py + 6 + hash(x + i * 5, y + i * 9) * 36;
            g.fillStyle = hash(x + i, y + i) > 0.5 ? 'rgba(196,170,124,0.5)' : 'rgba(255,248,226,0.55)';
            g.fillRect(rx, ry, 3, 2);
          }
        } else if (ch === '.' || ch === 'T' || ch === 'F') {
          for (let i = 0; i < 4; i++) {
            const gx = px + 5 + hash(x + i, y * 3 + i) * 38;
            const gy = py + 5 + hash(x * 2 + i, y + i) * 38;
            g.strokeStyle = 'rgba(103, 156, 96, 0.55)';
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(gx, gy);
            g.lineTo(gx + 1, gy - 3.5);
            g.stroke();
          }

          // 庭院点缀：草丛 / 石头 / 小花（只放在空地上，避免误读成障碍）
          if (ch === '.' && !decoBlocked.has(x + ',' + y)) {
            const r = hash(x * 31 + 5, y * 17 + 3);
            const ox = px + 12 + hash(x + 2, y + 8) * 24;
            const oy = py + 14 + hash(x + 9, y + 1) * 22;

            if (r > 0.87) {
              g.strokeStyle = 'rgba(90, 148, 84, 0.75)';
              g.lineWidth = 2;
              g.lineCap = 'round';
              [-4, 0, 4].forEach((dx, i) => {
                g.beginPath();
                g.moveTo(ox + dx, oy + 2);
                g.quadraticCurveTo(ox + dx + 2, oy - 3, ox + dx + 3.5, oy - 6 - i);
                g.stroke();
              });
            } else if (r > 0.77) {
              g.fillStyle = 'rgba(90, 80, 60, 0.14)';
              ellipse(g, ox, oy + 3, 7, 2.6);
              g.fillStyle = '#c9c4b5';
              ellipse(g, ox, oy, 6, 4.4);
              g.fillStyle = '#e2ded2';
              ellipse(g, ox - 1.4, oy - 1.2, 3.4, 2.3);
            } else if (r > 0.66) {
              g.fillStyle = 'rgba(255, 255, 255, 0.88)';
              for (let k = 0; k < 5; k++) {
                const a = (Math.PI * 2 * k) / 5;
                circle(g, ox + Math.cos(a) * 2.6, oy + Math.sin(a) * 2.6, 2.1);
              }
              g.fillStyle = '#f6d365';
              circle(g, ox, oy, 2);
            }
          }
        }
      }
    }

    // --- 池塘 ---
    ponds.forEach(([x, y]) => {
      const px = x * TILE;
      const py = y * TILE;
      const grad = g.createLinearGradient(px, py, px, py + TILE);
      grad.addColorStop(0, '#93d4ec');
      grad.addColorStop(1, '#66b2d9');
      g.fillStyle = grad;
      g.fillRect(px, py, TILE, TILE);

      // 岸边：邻居不是水的位置画浅色泥岸
      const edges = [
        { n: [x, y - 1], side: 'top' },
        { n: [x, y + 1], side: 'bottom' },
        { n: [x - 1, y], side: 'left' },
        { n: [x + 1, y], side: 'right' }
      ];
      g.fillStyle = '#e9d7ae';
      edges.forEach(({ n, side }) => {
        if (n[0] < 0 || n[1] < 0 || n[0] >= COLS || n[1] >= ROWS) return;
        if (map[n[1]][n[0]] === 'P') return;
        if (side === 'top') g.fillRect(px, py, TILE, 4);
        if (side === 'bottom') g.fillRect(px, py + TILE - 4, TILE, 4);
        if (side === 'left') g.fillRect(px, py, 4, TILE);
        if (side === 'right') g.fillRect(px + TILE - 4, py, 4, TILE);
      });

      // 水面高光
      g.fillStyle = 'rgba(255, 255, 255, 0.28)';
      g.fillRect(px + 4, py + 8, TILE - 8, 2);

      // 睡莲叶
      if (hash(x * 5 + 1, y * 3 + 2) > 0.45) {
        const lx = px + 18 + hash(x, y) * 12;
        const ly = py + 26 + hash(y, x) * 10;
        g.fillStyle = 'rgba(38, 80, 60, 0.18)';
        ellipse(g, lx, ly + 2, 8, 4);
        g.fillStyle = '#6aa869';
        ellipse(g, lx, ly, 7.5, 5);
        g.fillStyle = '#8cc47f';
        ellipse(g, lx - 1.5, ly - 1, 4.5, 3);
        g.fillStyle = '#f2a7b6';
        circle(g, lx + 3, ly - 2.4, 2.2);
      }

      // 芦苇
      if (hash(x * 11 + 3, y * 7 + 5) > 0.55) {
        const rx = px + 8 + hash(x + 1, y + 2) * 30;
        const ry = py + TILE - 5;
        g.strokeStyle = '#5f9257';
        g.lineWidth = 1.6;
        g.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.moveTo(rx + k * 3, ry);
          g.lineTo(rx + k * 3 + (k - 1) * 2, ry - 9 - k * 2);
          g.stroke();
        }
        g.fillStyle = '#9a7a52';
        ellipse(g, rx - 2, ry - 11, 1.8, 3.4);
      }
    });

    // --- 树木 / 栅栏：按 y 排序，保证遮挡关系正确 ---
    const objects = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = map[y][x];
        if (ch === 'T' || ch === 'F') objects.push({ x, y, ch });
      }
    }
    objects.sort((a, b) => a.y - b.y || a.x - b.x);
    objects.forEach(o => {
      if (o.ch === 'T') drawTree(g, o.x, o.y);
      else drawFence(g, o.x, o.y, map);
    });

    return cv;
  }

  function drawTree(g, gx, gy) {
    const cx = gx * TILE + TILE / 2;
    const baseY = gy * TILE + TILE - 4;
    g.fillStyle = 'rgba(74, 62, 42, 0.16)';
    ellipse(g, cx, baseY + 2, 18, 6);

    g.fillStyle = '#8a6244';
    rrect(g, cx - 5, baseY - 16, 10, 18, 3);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    rrect(g, cx - 4, baseY - 15, 3, 14, 2);

    g.fillStyle = '#437d4d';
    circle(g, cx - 11, baseY - 26, 12);
    circle(g, cx + 11, baseY - 26, 12);
    circle(g, cx, baseY - 36, 15);
    g.fillStyle = '#5a9d63';
    circle(g, cx - 6, baseY - 33, 11);
    circle(g, cx + 8, baseY - 30, 10);
    g.fillStyle = '#78b878';
    circle(g, cx - 7, baseY - 37, 7);
    circle(g, cx + 5, baseY - 34, 6);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    circle(g, cx - 9, baseY - 40, 3.4);
  }

  function drawFence(g, gx, gy, map) {
    const px = gx * TILE;
    const py = gy * TILE;
    const isF = (x, y) => y >= 0 && y < ROWS && x >= 0 && x < COLS && map[y][x] === 'F';

    const rail = (x1, y1, x2, y2) => {
      g.strokeStyle = '#c99a63';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.strokeStyle = 'rgba(255, 236, 205, 0.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x1, y1 - 1.5);
      g.lineTo(x2, y2 - 1.5);
      g.stroke();
    };

    if (isF(gx - 1, gy) || isF(gx + 1, gy)) {
      rail(px, py + 16, px + TILE, py + 16);
      rail(px, py + 30, px + TILE, py + 30);
    }
    if (isF(gx, gy - 1) || isF(gx, gy + 1)) {
      rail(px + 16, py, px + 16, py + TILE);
      rail(px + 30, py, px + 30, py + TILE);
    }
    // 立柱
    g.fillStyle = '#b1834f';
    const posts = [[px + 8, py + 10], [px + 40, py + 10], [px + 8, py + 38], [px + 40, py + 38]];
    posts.forEach(([x, y]) => {
      rrect(g, x - 4, y - 8, 8, 22, 2);
    });
    g.fillStyle = 'rgba(255,255,255,0.25)';
    posts.forEach(([x, y]) => {
      g.fillRect(x - 3, y - 7, 2, 18);
    });
  }

  function getBackground() {
    const key = G.version;
    if (!bgs.has(key)) bgs.set(key, buildBackground(G.map));
    return bgs.get(key);
  }

  /* ============================================================
   * 7. 角色与道具绘制
   * ============================================================ */
  function drawCat(c, cx, cy, t, moving, face, blink, invuln, dirY) {
    const bob = moving ? Math.sin(t * 20) * 1.7 : Math.sin(t * 2.2) * 0.7;
    const y = cy + bob;
    const f = face;

    c.save();
    if (invuln > 0) c.globalAlpha = Math.sin(t * 30) > 0 ? 0.45 : 1;

    c.fillStyle = 'rgba(70, 58, 40, 0.16)';
    ellipse(c, cx, cy + 17, 17, 6);

    // 尾巴
    const wag = Math.sin(t * 3.6) * 5;
    c.strokeStyle = '#e2a566';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx - f * 11, y + 5);
    c.quadraticCurveTo(cx - f * 22, y + 3 + wag, cx - f * 19, y - 12 + wag);
    c.stroke();

    // 后腿 / 前腿
    const legPhase = moving ? Math.sin(t * 22) : 0;
    c.fillStyle = '#e9ac6c';
    rrect(c, cx - 11, y + 8, 7, 10 + legPhase * 2, 3.5);
    rrect(c, cx + 5, y + 8, 7, 10 - legPhase * 2, 3.5);
    c.fillStyle = '#f0bb80';
    rrect(c, cx - 4, y + 9, 7, 9 - legPhase * 2, 3.5);
    rrect(c, cx + 11, y + 9, 7, 9 + legPhase * 2, 3.5);

    // 身体
    c.fillStyle = '#f7ca93';
    ellipse(c, cx, y + 3, 16, 11.5);
    // 背部条纹
    c.strokeStyle = '#e2a566';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(cx - 7, y - 4); c.quadraticCurveTo(cx - 4, y - 1, cx - 7, y + 2);
    c.moveTo(cx - 1, y - 5); c.quadraticCurveTo(cx + 2, y - 1, cx - 1, y + 2);
    c.stroke();

    // 脑袋
    const hx = cx + f * 8;
    const hy = y - 8;
    // 耳朵
    c.fillStyle = '#f0b87b';
    c.beginPath();
    c.moveTo(hx - 9, hy - 7); c.lineTo(hx - 4, hy - 16); c.lineTo(hx + 1, hy - 8);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(hx + 3, hy - 8); c.lineTo(hx + 8, hy - 16); c.lineTo(hx + 10, hy - 5);
    c.closePath(); c.fill();
    c.fillStyle = '#f6a7a2';
    c.beginPath();
    c.moveTo(hx - 6.5, hy - 8); c.lineTo(hx - 4.5, hy - 13); c.lineTo(hx - 2, hy - 8.5);
    c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(hx + 4.5, hy - 8.5); c.lineTo(hx + 7.5, hy - 13); c.lineTo(hx + 8.5, hy - 7);
    c.closePath(); c.fill();

    c.fillStyle = '#f9d4a6';
    circle(c, hx, hy, 11.5);
    c.fillStyle = '#fff6e6';
    ellipse(c, hx + f * 3, hy + 4, 6.5, 5);
    // 眼睛
    if (blink) {
      c.strokeStyle = '#4a3a2c';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(hx - 4, hy - 2); c.lineTo(hx - 0.5, hy - 2);
      c.moveTo(hx + 3, hy - 2); c.lineTo(hx + 6.5, hy - 2);
      c.stroke();
    } else {
      c.fillStyle = '#4a3a2c';
      circle(c, hx - 2.2, hy - 2.5, 2.4);
      circle(c, hx + 5.2, hy - 2.5, 2.4);
      c.fillStyle = '#fff';
      circle(c, hx - 1.5, hy - 3.2, 0.9);
      circle(c, hx + 5.9, hy - 3.2, 0.9);
    }
    // 鼻子与胡须
    c.fillStyle = '#e58a8a';
    c.beginPath();
    c.moveTo(hx + f * 2, hy + 4);
    c.lineTo(hx + f * 5, hy + 6);
    c.lineTo(hx + f * 2, hy + 7.4);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(120, 100, 80, 0.55)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(hx + 7, hy + 5); c.lineTo(hx + 14, hy + 4);
    c.moveTo(hx + 7, hy + 7); c.lineTo(hx + 13, hy + 9);
    c.stroke();
    // 腮红
    c.fillStyle = 'rgba(246, 154, 154, 0.5)';
    circle(c, hx - 7, hy + 3, 2.6);
    circle(c, hx + 10, hy + 3, 2.4);

    // 上下移动时的小提示：耳朵朝前
    if (dirY) {
      c.fillStyle = 'rgba(255,255,255,0.35)';
      circle(c, hx + f * 2, hy - 1, 1.2);
    }

    c.restore();
  }

  function drawDog(c, cx, cy, t, moving, face) {
    const bob = Math.sin(t * 15) * 1.6;
    const y = cy + bob;
    const f = face;

    c.fillStyle = 'rgba(70, 58, 40, 0.16)';
    ellipse(c, cx, cy + 18, 18, 6);

    // 尾巴（上翘摇晃）
    const wag = Math.sin(t * 12) * 6;
    c.strokeStyle = '#a3703f';
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(cx - f * 14, y + 1);
    c.quadraticCurveTo(cx - f * 24, y - 4 + wag * 0.4, cx - f * 22, y - 12 + wag);
    c.stroke();

    // 腿
    const trot = moving ? Math.sin(t * 18) * 3 : 0;
    c.fillStyle = '#a3703f';
    rrect(c, cx - 12, y + 7, 7, 11 + trot, 3);
    rrect(c, cx + 5, y + 7, 7, 11 - trot, 3);
    c.fillStyle = '#f3e3c8';
    rrect(c, cx - 4, y + 9, 7, 10 - trot, 3);
    rrect(c, cx + 11, y + 9, 7, 10 + trot, 3);

    // 身体
    c.fillStyle = '#c08a5a';
    ellipse(c, cx, y + 2, 18, 12);
    c.fillStyle = '#f3e3c8';
    ellipse(c, cx + f * 5, y + 7, 8, 5);

    // 脑袋
    const hx = cx + f * 12;
    const hy = y - 8;
    c.fillStyle = '#b5804f';
    // 耳朵（垂耳）
    ellipse(c, hx - f * 5, hy + 2, 5, 8, f * 0.3);
    c.fillStyle = '#c08a5a';
    circle(c, hx, hy, 10.5);
    c.fillStyle = '#f3e3c8';
    ellipse(c, hx + f * 5, hy + 3, 7, 5.5);
    // 鼻子眼睛
    c.fillStyle = '#3f3226';
    circle(c, hx + f * 9, hy + 2, 2.6);
    circle(c, hx + f * 2, hy - 2, 2.2);
    c.fillStyle = '#fff';
    circle(c, hx + f * 2.7, hy - 2.8, 0.8);
    // 项圈
    c.strokeStyle = '#dd6b64';
    c.lineWidth = 3.4;
    c.beginPath();
    c.arc(hx - f * 2, hy + 7, 6, f > 0 ? -0.2 : Math.PI - 0.6, f > 0 ? 1.2 : Math.PI + 0.6);
    c.stroke();
    c.fillStyle = '#f6d365';
    circle(c, hx - f * 2, hy + 12, 2.1);
  }

  function drawFish(c, cx, cy, t, points, phase) {
    const bob = Math.sin(t * 2.4 + phase) * 2.2;
    const y = cy + bob;
    const wig = Math.sin(t * 6 + phase) * 0.35;

    if (points > 1) {
      const halo = c.createRadialGradient(cx, y, 2, cx, y, 22);
      halo.addColorStop(0, 'rgba(255, 219, 128, 0.5)');
      halo.addColorStop(1, 'rgba(255, 219, 128, 0)');
      c.fillStyle = halo;
      circle(c, cx, y, 22);
    }

    c.save();
    c.translate(cx, y);
    // 尾巴
    c.fillStyle = points > 1 ? '#f2a93b' : '#f08a52';
    c.beginPath();
    c.moveTo(-8, 0);
    c.lineTo(-16, -6 + wig * 6);
    c.lineTo(-15, 6 + wig * 6);
    c.closePath();
    c.fill();
    // 身体
    c.fillStyle = points > 1 ? '#ffc95e' : '#ff9f68';
    ellipse(c, 0, 0, 10.5, 7);
    // 肚皮
    c.fillStyle = points > 1 ? '#ffe6a8' : '#ffd2b0';
    ellipse(c, 1, 2.4, 7.5, 4);
    // 背鳍
    c.fillStyle = points > 1 ? '#e8a12c' : '#e8794a';
    c.beginPath();
    c.moveTo(-1, -6.5);
    c.lineTo(4, -11);
    c.lineTo(7, -5.5);
    c.closePath();
    c.fill();
    // 眼睛
    c.fillStyle = '#3e2f24';
    circle(c, 6, -1.4, 1.9);
    c.fillStyle = '#fff';
    circle(c, 6.6, -2, 0.7);
    c.restore();

    if (points > 1) {
      const sy = y - 18 + Math.sin(t * 3 + phase) * 1.5;
      c.fillStyle = '#f7c948';
      c.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const a2 = a + Math.PI / 5;
        c.lineTo(cx + Math.cos(a) * 5, sy + Math.sin(a) * 5);
        c.lineTo(cx + Math.cos(a2) * 2.2, sy + Math.sin(a2) * 2.2);
      }
      c.closePath();
      c.fill();
    }
  }

  function drawPatrolPath(c, dog) {
    const pts = dog.path;
    c.save();
    c.strokeStyle = 'rgba(255, 253, 240, 0.55)';
    c.lineWidth = 3;
    c.setLineDash([7, 9]);
    c.lineJoin = 'round';
    c.beginPath();
    pts.forEach((p, i) => {
      const p1 = cellCenter(p.x, p.y);
      if (i === 0) c.moveTo(p1.x, p1.y);
      else c.lineTo(p1.x, p1.y);
    });
    c.closePath();
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = 'rgba(214, 150, 120, 0.55)';
    pts.forEach(p => {
      const p1 = cellCenter(p.x, p.y);
      circle(c, p1.x, p1.y, 2.4);
    });
    c.restore();
  }

  /* ============================================================
   * 8. 特效
   * ============================================================ */
  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (speed || 90) * (0.4 + Math.random() * 0.8);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 30,
        life: 0.55 + Math.random() * 0.35,
        max: 0.9,
        size: 2 + Math.random() * 3,
        color,
        gravity: 240
      });
    }
  }

  function confetti() {
    const colors = ['#ff9f68', '#f7c948', '#7ec4a8', '#f39a9a', '#8fb7e8'];
    for (let i = 0; i < 60; i++) {
      G.particles.push({
        x: Math.random() * W,
        y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 60,
        vy: 60 + Math.random() * 90,
        life: 2.2 + Math.random() * 0.8,
        max: 3,
        size: 3 + Math.random() * 4,
        color: colors[i % colors.length],
        gravity: 30,
        square: true
      });
    }
  }

  function popup(gx, gy, text, color, emphasize = false) {
    const p = cellCenter(gx, gy);
    const duration = emphasize ? 1.4 : 1.1;
    G.popups.push({ x: p.x, y: p.y - 12, text, color: color || '#fff', life: duration, max: duration, size: emphasize ? 21 : 14 });
  }

  function updateEffects(dt) {
    const d = dt / 1000;
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.x += p.vx * d;
      p.y += p.vy * d;
      p.vy += (p.gravity || 0) * d;
      p.life -= d;
      if (p.life <= 0) G.particles.splice(i, 1);
    }
    for (let i = G.popups.length - 1; i >= 0; i--) {
      const p = G.popups[i];
      p.y -= 26 * d;
      p.life -= d;
      if (p.life <= 0) G.popups.splice(i, 1);
    }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - 60 * d);
    if (G.hitFlash > 0) G.hitFlash = Math.max(0, G.hitFlash - 2.2 * d);
    if (G.invuln > 0) G.invuln = Math.max(0, G.invuln - d);
    if (G.controlLock > 0) G.controlLock = Math.max(0, G.controlLock - d);
  }

  function renderEffects(c) {
    G.particles.forEach(p => {
      const a = clamp(p.life / p.max, 0, 1);
      c.globalAlpha = a;
      c.fillStyle = p.color;
      if (p.square) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.x * 0.02 + p.life * 2);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        c.restore();
      } else {
        circle(c, p.x, p.y, p.size * a);
      }
    });
    c.globalAlpha = 1;

    G.popups.forEach(p => {
      const a = clamp(p.life / p.max, 0, 1);
      c.globalAlpha = a;
      c.font = `700 ${p.size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      c.textAlign = 'center';
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(60, 45, 30, 0.55)';
      c.strokeText(p.text, p.x, p.y);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, p.y);
    });
    c.globalAlpha = 1;
    c.textAlign = 'left';
  }

  /* ============================================================
   * 9. 场景与游戏流程
   * ============================================================ */
  function buildFish(list) {
    return list.map((f, i) => {
      const x = Array.isArray(f) ? f[0] : f.x;
      const y = Array.isArray(f) ? f[1] : f.y;
      const p = Array.isArray(f) ? 1 : f.p;
      return { x, y, p, collected: false, phase: hash(x + i * 3, y + i) };
    });
  }

  function setupVersion(v) {
    const ver = VERSIONS[v];
    G.version = v;
    G.ver = ver;
    G.map = ver.map;
    G.fish = buildFish(ver.fish);
    G.cat = {
      x: ver.start[0], y: ver.start[1],
      from: null, to: null, p: 0, moving: false,
      dir: { x: 1, y: 0 }, face: 1, bump: 0
    };
    G.dog = ver.dogPath ? {
      path: ver.dogPath.map(p => ({ x: p[0], y: p[1] })),
      seg: 0,
      segP: 0,
      speed: ver.dogSpeed,
      px: (ver.dogPath[0][0] + 0.5) * TILE,
      py: (ver.dogPath[0][1] + 0.5) * TILE,
      face: 1
    } : null;
    G.timeLeft = ver.time;
    G.elapsed = 0;
    G.score = 0;
    G.collected = 0;
    G.collisions = 0;
    G.invuln = 0;
    G.controlLock = 0;
    G.shake = 0;
    G.hitFlash = 0;
    G.particles = [];
    G.popups = [];
    G.input.held = [];
    G.input.botDir = null;
    G.input.tap = null;
    G.lastTick = Math.ceil(ver.time || 0);
    G.pondCells = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (ver.map[y][x] === 'P') G.pondCells.push([x, y]);
      }
    }
    getBackground();
    updateHUD();
  }

  function showBriefing(version) {
    G.state = 'briefing';
    setupVersion(version);
    hideOverlays();
    clearToast();
    el.briefTitle.textContent = `${G.ver.tag} · ${G.ver.name}`;
    el.briefGoal.textContent = G.ver.briefingGoal;
    el.briefRules.replaceChildren(...G.ver.briefingRules.map(rule => {
      const item = document.createElement('li');
      item.textContent = rule;
      return item;
    }));
    el.overlayBrief.classList.add('show');
    el.btnStart.focus();
  }

  function startVersion(version) {
    G.state = 'playing';
    setupVersion(version);
    hideOverlays();
    clearToast();
    Sfx.ensure();
    canvas.focus();
  }

  function restart() {
    startVersion(G.version);
  }

  function showMenu() {
    G.state = 'menu';
    setupVersion(G.version);
    hideOverlays();
    clearToast();
    el.overlayMenu.classList.add('show');
    el.overlayMenu.querySelector(`[data-version="${G.version}"]`).focus();
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    G.input.held = [];
    G.input.botDir = null;
    G.input.tap = null;
    el.overlayPause.classList.add('show');
    el.btnPause.hidden = true;
    el.btnResume.focus();
  }

  function resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    el.overlayPause.classList.remove('show');
    el.btnPause.hidden = false;
    canvas.focus();
    Sfx.ensure();
  }

  function hideOverlays() {
    el.overlayMenu.classList.remove('show');
    el.overlayBrief.classList.remove('show');
    el.overlayPause.classList.remove('show');
    el.overlayResult.classList.remove('show');
  }

  function endGame(win) {
    if (G.state === 'won' || G.state === 'lost') return;
    G.state = win ? 'won' : 'lost';
    G.input.held = [];
    G.input.botDir = null;

    if (win) {
      Sfx.win();
      confetti();
      const p = cellCenter(G.cat.x, G.cat.y);
      burst(p.x, p.y - 10, '#ffe08a', 18, 140);
    } else {
      Sfx.lose();
    }

    const ver = G.ver;
    const goal = satietyGoal(ver);
    document.getElementById('btnNext').hidden = !win || G.version === 3;
    el.btnOtherVersion.textContent = win && G.version === 3 ? '返回选关' : '换一关';
    el.resultMark.textContent = win ? '✓' : '!';
    el.resultMark.classList.toggle('lose', !win);

    if (win) {
      el.resultTitle.textContent = G.version === 3 ? '最后一关完成！' : '小猫吃饱了！';
      el.resultSub.textContent = `饱腹度达到 ${goal} 格，顺利通关。`;
    } else {
      el.resultTitle.textContent = '时间到，还差一点';
      el.resultSub.textContent = `还差 ${Math.max(0, goal - G.score)} 格饱腹度。`;
    }

    setTimeout(() => {
      if (G.state === 'won' || G.state === 'lost') {
        el.overlayResult.classList.add('show');
        el.btnRetry.focus();
      }
    }, 460);

    updateHUD();
  }

  function checkWin() {
    const ver = G.ver;
    if (ver.targetPoints != null) {
      if (G.score >= ver.targetPoints) endGame(true);
    } else if (G.collected >= ver.fish.length) {
      endGame(true);
    }
  }

  /* ============================================================
   * 10. 更新
   * ============================================================ */
  function updateCat(dt) {
    const cat = G.cat;
    const wasMoving = cat.moving;

    if (cat.moving) {
      cat.p += dt / STEP_MS;
      if (cat.p >= 1) {
        cat.p = 1;
        cat.moving = false;
        cat.x = cat.to.x;
        cat.y = cat.to.y;
        onArrive();
      }
    }

    // 到达新格子的当帧不再立刻起步，下一帧再读取方向，
    // 避免“用上一格的方向继续走”造成往复抖动。
    if (!wasMoving && !cat.moving && G.controlLock <= 0 && G.state === 'playing') tryStep();
  }

  function tryStep() {
    const cat = G.cat;
    const d = currentDir();
    if (!d) return;
    cat.dir = d;
    if (d.x) cat.face = d.x > 0 ? 1 : -1;
    const nx = cat.x + d.x;
    const ny = cat.y + d.y;
    if (!walkable(nx, ny)) {
      cat.bump = 0.14;
      return;
    }
    cat.from = { x: cat.x, y: cat.y };
    cat.to = { x: nx, y: ny };
    cat.p = 0;
    cat.moving = true;
  }

  function onArrive() {
    const cat = G.cat;
    const fish = G.fish.find(f => !f.collected && f.x === cat.x && f.y === cat.y);
    if (fish) {
      fish.collected = true;
      G.collected++;
      G.score += fish.p;
      const p = cellCenter(fish.x, fish.y);
      burst(p.x, p.y, fish.p > 1 ? '#ffd166' : '#ffb27a', fish.p > 1 ? 16 : 10, fish.p > 1 ? 150 : 100);
      const emphasize = (G.ver.id === 1 && G.collected === 1) || fish.p > 1;
      popup(fish.x, fish.y, `+${fish.p} 格`, fish.p > 1 ? '#ffe08a' : '#fff3d6', emphasize);
      if (fish.p > 1) Sfx.big(); else Sfx.collect();
      G.invuln = Math.max(G.invuln, 0.12);
      updateHUD();
      checkWin();
    }
  }

  function updateDog(dt) {
    const dog = G.dog;
    if (!dog) return;
    let remain = (dt / 1000) * dog.speed;
    let guard = 0;

    while (remain > 0 && guard++ < 12) {
      const a = dog.path[dog.seg];
      const b = dog.path[(dog.seg + 1) % dog.path.length];
      const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const need = (1 - dog.segP) * segLen;
      if (remain < need) {
        dog.segP += remain / segLen;
        remain = 0;
      } else {
        remain -= need;
        dog.seg = (dog.seg + 1) % dog.path.length;
        dog.segP = 0;
        if (b.x !== a.x) dog.face = b.x > a.x ? 1 : -1;
      }
    }

    const a = dog.path[dog.seg];
    const b = dog.path[(dog.seg + 1) % dog.path.length];
    dog.px = (a.x + (b.x - a.x) * dog.segP + 0.5) * TILE;
    dog.py = (a.y + (b.y - a.y) * dog.segP + 0.5) * TILE;
  }

  function catPixel() {
    const cat = G.cat;
    if (cat.moving && cat.from && cat.to) {
      const e = ease(cat.p);
      return {
        x: (lerp(cat.from.x, cat.to.x, e) + 0.5) * TILE,
        y: (lerp(cat.from.y, cat.to.y, e) + 0.5) * TILE
      };
    }
    return cellCenter(cat.x, cat.y);
  }

  function checkDogHit() {
    const dog = G.dog;
    if (!dog || G.invuln > 0 || G.state !== 'playing') return;
    const cat = catPixel();
    if (dist(cat.x, cat.y, dog.px, dog.py) < HIT_RADIUS) hitDog();
  }

  function hitDog() {
    G.collisions++;
    if (G.ver.time != null) {
      G.timeLeft = Math.max(0, G.timeLeft - HIT_PENALTY);
    }
    G.invuln = 1.3;
    G.controlLock = 0.24;
    G.shake = 12;
    G.hitFlash = 1;
    Sfx.hit();

    const from = catPixel();
    burst(from.x, from.y, '#ff9a8a', 12, 140);
    popup(G.cat.x, G.cat.y, `撞到小狗 −${HIT_PENALTY} 秒`, '#ff8f80');

    teleportSafe();
    toast(`撞到小狗 · −${HIT_PENALTY} 秒 · 已回到安全处`, 1650);

    const to = cellCenter(G.cat.x, G.cat.y);
    burst(to.x, to.y, '#ffe0b8', 10, 90);
    updateHUD();

    if (G.ver.time != null && G.timeLeft <= 0) endGame(false);
  }

  function teleportSafe() {
    const spots = G.ver.safeSpots || [[G.ver.start[0], G.ver.start[1]]];
    const cat = G.cat;
    let best = null;
    let bestScore = Infinity;

    spots.forEach(([x, y]) => {
      if (!walkable(x, y)) return;
      const p = cellCenter(x, y);
      const dogD = G.dog ? dist(p.x, p.y, G.dog.px, G.dog.py) / TILE : 99;
      if (dogD < 3) return;
      const catD = Math.hypot(x - cat.x, y - cat.y);
      if (catD < bestScore) {
        bestScore = catD;
        best = [x, y];
      }
    });

    if (!best) best = [G.ver.start[0], G.ver.start[1]];
    cat.moving = false;
    cat.x = best[0];
    cat.y = best[1];
    cat.p = 0;
    cat.from = null;
    cat.to = null;
  }

  function tickSecond() {
    if (G.ver.time == null) return;
    const s = Math.ceil(G.timeLeft);
    if (s !== G.lastTick) {
      G.lastTick = s;
      if (s <= 5 && s > 0) Sfx.tick();
    }
  }

  function update(dt) {
    G.t += dt / 1000;

    if (G.ver.time != null) {
      G.timeLeft -= dt / 1000;
      G.elapsed += dt / 1000;
      if (G.timeLeft <= 0) {
        G.timeLeft = 0;
        updateHUD();
        endGame(false);
        return;
      }
      tickSecond();
      updateHUD();
    } else {
      G.elapsed += dt / 1000;
    }

    updateCat(dt);
    if (G.state !== 'playing') return;

    updateDog(dt);
    checkDogHit();
    updateEffects(dt);
  }

  /* ============================================================
   * 11. 渲染
   * ============================================================ */
  let lastBlink = 0;
  let blinkUntil = 0;

  function render() {
    const t = G.t;
    const cat = G.cat;
    if (!cat) return;

    ctx.save();
    if (G.shake > 0) {
      ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
    }

    ctx.drawImage(getBackground(), 0, 0, W, H);

    // 水面波光
    if (G.pondCells.length) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      G.pondCells.forEach(([x, y], i) => {
        const a = Math.sin(t * 1.6 + i * 1.7);
        if (a < 0.1) return;
        ctx.globalAlpha = 0.15 + a * 0.35;
        ctx.beginPath();
        const px = x * TILE;
        const py = y * TILE;
        ctx.arc(px + 16 + a * 6, py + 18 + Math.sin(t + i) * 4, 5 + a * 3, 0.2, Math.PI - 0.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px + 34 - a * 4, py + 34, 4 + a * 2, Math.PI + 0.3, Math.PI * 2 - 0.2);
        ctx.stroke();
      });
      ctx.restore();
    }

    if (G.dog) drawPatrolPath(ctx, G.dog);

    G.fish.forEach(f => {
      if (f.collected) return;
      const p = cellCenter(f.x, f.y);
      ctx.fillStyle = 'rgba(70, 58, 40, 0.12)';
      ellipse(ctx, p.x, p.y + 11, 9, 3.5);
      drawFish(ctx, p.x, p.y - 2, t, f.p, f.phase);
    });

    if (G.dog) drawDog(ctx, G.dog.px, G.dog.py, t, true, G.dog.face);

    const cp = catPixel();
    const blink = t < blinkUntil;
    drawCat(ctx, cp.x, cp.y, t, cat.moving, cat.face, blink, G.invuln, cat.dir.y);

    renderEffects(ctx);

    // 受伤红闪
    if (G.hitFlash > 0) {
      const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.8);
      grad.addColorStop(0, 'rgba(255, 90, 80, 0)');
      grad.addColorStop(1, `rgba(255, 80, 70, ${0.42 * G.hitFlash})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // 快没时间了：边缘橙色呼吸
    if (G.state === 'playing' && G.ver.time != null && G.timeLeft <= 10) {
      const a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 6));
      const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      grad.addColorStop(0, 'rgba(240, 130, 80, 0)');
      grad.addColorStop(1, `rgba(240, 120, 70, ${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();

    // 眨眼控制
    if (t - lastBlink > 3.2) {
      lastBlink = t;
      blinkUntil = t + 0.13;
    }
  }

  /* ============================================================
   * 12. 主循环
   * ============================================================ */
  let lastTs = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - lastTs);
    lastTs = now;

    if (G.state === 'playing') {
      update(dt);
    } else {
      G.t += dt / 1000;
      updateEffects(dt);
    }

    render();
    requestAnimationFrame(frame);
  }

  /* ============================================================
   * 13. 输入
   * ============================================================ */
  const KEYMAP = {
    ArrowUp: { x: 0, y: -1, code: 'U' },
    ArrowDown: { x: 0, y: 1, code: 'D' },
    ArrowLeft: { x: -1, y: 0, code: 'L' },
    ArrowRight: { x: 1, y: 0, code: 'R' },
    KeyW: { x: 0, y: -1, code: 'U' },
    KeyS: { x: 0, y: 1, code: 'D' },
    KeyA: { x: -1, y: 0, code: 'L' },
    KeyD: { x: 1, y: 0, code: 'R' }
  };

  function currentDir() {
    const held = G.input.held;
    if (held.length) return held[held.length - 1];
    const tap = G.input.tap;
    if (tap && performance.now() < tap.until) return tap;
    return G.input.botDir;
  }

  document.addEventListener('keydown', e => {
    if (KEYMAP[e.code] && G.state === 'playing') {
      e.preventDefault();
      const d = KEYMAP[e.code];
      const held = G.input.held;
      if (!held.some(h => h.code === d.code)) held.push(d);
      // 轻点也保证能走出一格，避免极短按键被帧间隔吞掉
      G.input.tap = { x: d.x, y: d.y, until: performance.now() + 110 };
      return;
    }

    if (e.code === 'Space') {
      if (e.target.closest('button')) return;
      e.preventDefault();
      if (e.repeat) return;
      if (G.state === 'menu') showBriefing(1);
      else if (G.state === 'briefing') startVersion(G.version);
      else if (G.state === 'won' || G.state === 'lost') restart();
      else if (G.state === 'paused') resumeGame();
      // 游戏中空格不暂停：暂停只由 ESC 主动触发，避免玩家按空格确认时被打断
      return;
    }

    if (e.code === 'KeyR') {
      e.preventDefault();
      if (e.repeat) return;
      if (['playing', 'paused', 'won', 'lost'].includes(G.state)) restart();
      return;
    }

    if (e.code === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'paused') resumeGame();
      else if (G.state === 'briefing' || G.state === 'won' || G.state === 'lost') showMenu();
      return;
    }

    if (G.state === 'menu') {
      if (e.code === 'Digit1' || e.code === 'Numpad1') showBriefing(1);
      if (e.code === 'Digit2' || e.code === 'Numpad2') showBriefing(2);
      if (e.code === 'Digit3' || e.code === 'Numpad3') showBriefing(3);
    }
  });

  document.addEventListener('keyup', e => {
    if (!KEYMAP[e.code]) return;
    const d = KEYMAP[e.code];
    G.input.held = G.input.held.filter(h => h.code !== d.code);
  });

  // 窗口失焦只清空按键状态，避免“按住方向键切窗口”后角色继续走；
  // 不自动暂停、不弹遮罩，暂停统一交给 ESC / 暂停按钮。
  window.addEventListener('blur', () => {
    G.input.held = [];
    G.input.tap = null;
  });

  /* ============================================================
   * 14. UI 绑定
   * ============================================================ */
  function satietyGoal(version) {
    return version.targetPoints ?? version.fish.length;
  }

  function updateHUD() {
    if (G.state !== 'playing' && contact) clearTouch();
    if (!G.ver) return;
    const ver = G.ver;
    el.hudVersion.textContent = ver.tag;
    const duringGame = G.state !== 'menu' && G.state !== 'briefing';
    el.hud.hidden = !duringGame;
    el.btnPause.hidden = G.state !== 'playing';
    document.documentElement.classList.toggle('in-game', duringGame);
    el.fishLegend.hidden = ver.id !== 3;

    if (ver.time != null) {
      el.pillTime.hidden = false;
      el.hudTime.textContent = Math.max(0, G.timeLeft).toFixed(1);
      el.pillTime.classList.toggle('warn', G.timeLeft <= 10 && G.state === 'playing');
    } else {
      el.pillTime.hidden = true;
    }

    const goal = satietyGoal(ver);
    el.hudFullness.max = goal;
    el.hudFullness.value = Math.min(G.score, goal);
    el.hudScore.textContent = Math.min(G.score, goal);
    el.hudScoreUnit.textContent = ` / ${goal}`;
  }

  let toastTimer = null;
  function clearToast() {
    clearTimeout(toastTimer);
    el.toast.classList.remove('show');
  }
  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms || 2200);
  }

  document.querySelectorAll('.version-card').forEach(card => {
    card.addEventListener('click', () => showBriefing(Number(card.dataset.version)));
  });
  const fullscreen = document.getElementById('btnFullscreen');
  const fullTarget = document.documentElement;
  const hasFullscreen = !!(document.fullscreenEnabled && fullTarget.requestFullscreen);
  function enterFullscreen() {
    if (hasFullscreen && !document.fullscreenElement) {
      try { Promise.resolve(fullTarget.requestFullscreen()).catch(() => {}); } catch (_) {}
    }
  }
  fullscreen.hidden = !hasFullscreen;
  fullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) Promise.resolve(document.exitFullscreen()).catch(() => {});
    else enterFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  });
  el.btnStart.addEventListener('click', () => {
    startVersion(G.version);
    enterFullscreen();
  });
  el.btnBriefMenu.addEventListener('click', showMenu);
  el.btnPause.addEventListener('click', pauseGame);
  el.btnResume.addEventListener('click', resumeGame);
  el.btnPauseRestart.addEventListener('click', restart);
  el.btnPauseMenu.addEventListener('click', showMenu);
  document.getElementById('btnNext').addEventListener('click', () => { if (G.state === 'won' && G.version < 3) showBriefing(G.version + 1); });
  el.btnRetry.addEventListener('click', restart);
  el.btnOtherVersion.addEventListener('click', showMenu);
  // 触屏与键盘使用同一移动队列，关卡规则不变。
  const touchDirections = {up:[0,-1],left:[-1,0],down:[0,1],right:[1,0]};
  const directionButtons = [...document.querySelectorAll('[data-dir]')];
  let contact = null;
  function clearTouch() {
    G.input.held = G.input.held.filter(h => !h.code.startsWith('touch-'));
    directionButtons.forEach(button => button.classList.remove('pressed'));
    contact = null;
  }
  for (const button of directionButtons) {
    const code = 'touch-' + button.dataset.dir;
    const [x,y] = touchDirections[button.dataset.dir];
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('pointerdown', event => {
      if (G.state !== 'playing' || event.button !== 0) return;
      event.preventDefault();
      clearTouch();
      button.setPointerCapture(event.pointerId);
      contact = {id:event.pointerId,button};
      G.input.held.push({code,x,y});
      G.input.tap = {x,y,until:performance.now()+110};
      button.classList.add('pressed');
    });
    const release = event => {
      if (contact?.button !== button || contact.id !== event.pointerId) return;
      clearTouch();
      if (event.type !== 'pointerup') G.input.tap = null;
    };
    for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, release);
  }
  window.addEventListener('blur', clearTouch);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTouch();
      G.input.held = [];
      G.input.tap = null;
    }
  });
  el.btnSound.addEventListener('click', () => {
    Sfx.enabled = !Sfx.enabled;
    el.btnSound.textContent = Sfx.enabled ? '音效 开' : '音效 关';
    if (Sfx.enabled) Sfx.ensure();
  });

  /* ============================================================
   * 15. 自动化测试接口（不影响正常游玩）
   * ============================================================ */
  function snapshot() {
    return {
      state: G.state,
      version: G.version,
      cat: { x: G.cat.x, y: G.cat.y, moving: G.cat.moving },
      fishLeft: G.fish.filter(f => !f.collected).length,
      collected: G.collected,
      score: G.score,
      timeLeft: G.timeLeft,
      elapsed: G.elapsed,
      collisions: G.collisions,
      dog: G.dog ? { x: G.dog.px / TILE, y: G.dog.py / TILE, seg: G.dog.seg, segP: G.dog.segP } : null
    };
  }

  function bfs(start, goals, blocked) {
    const key = (x, y) => x + ',' + y;
    const prev = new Map();
    const seen = new Set([key(start.x, start.y)]);
    const queue = [start];
    let found = null;

    while (queue.length) {
      const cur = queue.shift();
      if (goals.has(key(cur.x, cur.y))) { found = cur; break; }
      const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!walkable(nx, ny)) continue;
        if (blocked && blocked.has(key(nx, ny))) continue;
        if (seen.has(key(nx, ny))) continue;
        seen.add(key(nx, ny));
        prev.set(key(nx, ny), cur);
        queue.push({ x: nx, y: ny });
      }
    }
    if (!found) return null;
    if (found.x === start.x && found.y === start.y) return null;

    let node = found;
    let back = node;
    while (true) {
      const p = prev.get(key(back.x, back.y));
      if (!p) break;
      if (p.x === start.x && p.y === start.y) break;
      back = p;
    }
    return { x: back.x - start.x, y: back.y - start.y };
  }

  function botChoose(strategy) {
    let pool = G.fish.filter(f => !f.collected);
    if (strategy === 'safe') {
      const safe = pool.filter(f => f.p === 1);
      if (safe.length) pool = safe;
    } else if (strategy === 'risky') {
      const risky = pool.filter(f => f.p > 1);
      if (risky.length) pool = risky;
    }
    if (!pool.length) return null;

    const goals = new Set(pool.map(f => `${f.x},${f.y}`));
    const blocked = new Set();
    if (G.dog) {
      const dx = Math.round(G.dog.px / TILE);
      const dy = Math.round(G.dog.py / TILE);
      for (let y = dy - 1; y <= dy + 1; y++) {
        for (let x = dx - 1; x <= dx + 1; x++) blocked.add(`${x},${y}`);
      }
    }
    const start = { x: G.cat.x, y: G.cat.y };
    return bfs(start, goals, blocked) || bfs(start, goals, null);
  }

  function botRun(opts) {
    opts = opts || {};
    const strategy = opts.strategy || 'all';
    const maxMs = opts.maxMs || 90000;
    const t0 = performance.now();
    return new Promise(resolve => {
      const step = () => {
        if (G.state !== 'playing') {
          G.input.botDir = null;
          resolve(snapshot());
          return;
        }
        if (performance.now() - t0 > maxMs) {
          G.input.botDir = null;
          const s = snapshot();
          s.timeout = true;
          resolve(s);
          return;
        }
        if (!G.cat.moving && G.controlLock <= 0) {
          G.input.botDir = botChoose(strategy);
        }
        setTimeout(step, 25);
      };
      step();
    });
  }

  window.__catfish = {
    start: startVersion,
    restart: restart,
    menu: showMenu,
    state: () => G.state,
    snap: snapshot,
    botRun,
    debug: {
      setCat(x, y) {
        G.cat.moving = false;
        G.cat.x = x;
        G.cat.y = y;
        G.cat.from = null;
        G.cat.to = null;
        G.cat.p = 0;
      },
      setTime(sec) { G.timeLeft = sec; updateHUD(); },
      setDog(seg, segP) {
        if (!G.dog) return;
        G.dog.seg = seg;
        G.dog.segP = segP;
        updateDog(0);
      },
      clearInvuln() { G.invuln = 0; },
      choose(strategy) { return botChoose(strategy); },
      fish() { return G.fish.map(f => ({ x: f.x, y: f.y, p: f.p, collected: f.collected })); },
      dogPath() { return G.dog ? G.dog.path : null; }
    }
  };

  /* ============================================================
   * 16. 启动
   * ============================================================ */
  const requestedVersion = Number(new URLSearchParams(location.search).get('version'));
  if (Object.hasOwn(VERSIONS, requestedVersion)) showBriefing(requestedVersion);
  else showMenu();
  requestAnimationFrame(frame);
})();
