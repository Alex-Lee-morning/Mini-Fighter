(function () {
  let gameState = "menu";

  const D = window.MiniFighterData;
  const Rend = window.MiniFighterRender;
  const canvas = document.getElementById("game");
  if (!canvas || typeof canvas.getContext !== "function") {
    document.body.insertAdjacentHTML("beforeend", "<p style=\"color:#fb7185\">找不到画布 #game，请使用 mini-fighter/index.html 打开。</p>");
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx || !D || !D.ATTACKS || !D.MAPS || !Rend || typeof Rend.drawFighterWorld !== "function") {
    document.body.insertAdjacentHTML("beforeend", "<p style=\"color:#fb7185\">资源加载失败（请确认 game-data.js / game-render.js 与页面同目录），请刷新。</p>");
    return;
  }

  const W = 900;
  const H = D.H;
  canvas.width = W;
  canvas.height = H;

  const ATTACKS = D.ATTACKS;
  const MAPS = D.MAPS;
  const rectsOverlap = D.rectsOverlap;
  const ATK_AIR_STREAK = Number.isFinite(D.ATK_AIR_STREAK) ? D.ATK_AIR_STREAK : 18;
  const ATK_ARCHER_AIR_VOLLEY = Number.isFinite(D.ATK_ARCHER_AIR_VOLLEY) ? D.ATK_ARCHER_AIR_VOLLEY : 19;
  const ATK_PILLAR_DROP = Number.isFinite(D.ATK_PILLAR_DROP) ? D.ATK_PILLAR_DROP : 20;

  const keys = Object.create(null);
  let prevJ = false;
  let prevK = false;
  let prevL = false;
  let prevU = false;

  function keyId(e) {
    return typeof e.key === "string" ? e.key.toLowerCase() : "";
  }

  window.addEventListener("keydown", (e) => {
    const k = keyId(e);
    if (["a", "d", "j", "k", "l", "s", "u", "w", " "].includes(k) || e.code === "ArrowLeft" || e.code === "ArrowRight") {
      e.preventDefault();
    }
    if (e.code === "Escape") {
      if (gameState === "playing") {
        e.preventDefault();
        pauseGame("manual");
      } else if (gameState === "paused" && pauseReason === "manual") {
        e.preventDefault();
        resumeGame();
      }
    }
    if (k === "p" && gameState === "playing") {
      e.preventDefault();
      pauseGame("manual");
    }
    if (e.key === "Enter" && gameState === "paused" && pauseReason === "manual") {
      e.preventDefault();
      resumeGame();
    }
    if (k) keys[k] = true;
    if (e.code === "ArrowLeft") keys.a = true;
    if (e.code === "ArrowRight") keys.d = true;
  });
  window.addEventListener("keyup", (e) => {
    const k = keyId(e);
    if (k) keys[k] = false;
    if (e.code === "ArrowLeft") keys.a = false;
    if (e.code === "ArrowRight") keys.d = false;
  });

  const menuEl = document.getElementById("menu");
  const hudEl = document.getElementById("hud");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const pauseTitle = document.getElementById("pauseTitle");
  const pauseSub = document.getElementById("pauseSub");
  const btnPauseContinue = document.getElementById("btnPauseContinue");
  const btnPauseQuit = document.getElementById("btnPauseQuit");
  const wrapDiff = document.getElementById("wrapDifficulty");
  const wrapHp = document.getElementById("wrapHp");
  const optMode = document.getElementById("optMode");
  const optDifficulty = document.getElementById("optDifficulty");
  const optHp = document.getElementById("optHp");
  const optMap = document.getElementById("optMap");
  const optChar = document.getElementById("optChar");
  const btnStart = document.getElementById("btnStart");
  const hpYou = document.getElementById("hpYou");
  const hpFoe = document.getElementById("hpFoe");
  const foeLabel = document.getElementById("foeLabel");
  const waveLine = document.getElementById("waveLine");
  const waveNum = document.getElementById("waveNum");

  let settings = { mode: "dummy", difficulty: "normal", maxHp: 120, mapIndex: 0, playerChar: "warrior" };
  let map = MAPS[0];
  let platforms = map.platforms;

  let camera = { x: W / 2, y: H * 0.42, zoom: 1, tx: W / 2, ty: H * 0.42, tz: 1 };

  const dummy = { x: 0, y: 0, w: 56, h: 140, flash: 0, shake: 0, hitStop: 0 };
  const particles = [];
  const floatTexts = [];
  /** 坠劈 / 落地震荡：扩散椭圆波 */
  const shockRings = [];
  /** 玩家 U 键球形气弹（世界坐标） */
  const orbBlasts = [];
  const arrows = [];
  /** 斜上短光柱（世界坐标） */
  const slantBeams = [];
  /** 裂地斩地面波 */
  const slashWaves = [];
  const ORB_CD_MS = 520;
  const ORB_VX = 12.4;
  const ORB_LIFE_MS = 2600;
  const ORB_HIT_ATK = 3;
  const ATK_QI_WINDUP = 13;
  const ATK_SLANT_WAR = 14;
  const ATK_SLANT_ARCH = 15;
  const ATK_SLASH_WAR = 16;
  const ATK_VOLLEY_ARCH = 17;
  /** 小于此水平距离时 J 四连切贴身短打；略减小以更久保持拉弓射击 */
  const ARCHER_MELEE_DIST = 84;
  /** 弓手箭矢水平速度倍率（更远有效射程） */
  const ARCHER_ARROW_SPEED_MUL = 1.4;
  const ARROW_LIFE_MS = 2400;
  const BOSS_U_CHARGE_FRAMES = 36;
  const SLANT_BEAM_LIFE_MS = 380;
  const SLASH_WAVE_LIFE_MS = 520;
  const GETUP_INVULN_FRAMES = 44;
  /** 空中 S+J / S+A/D+J 等特攻共用短 CD（帧） */
  const AIR_COMBAT_SPECIAL_CD = 78;

  let player = null;
  let foe = null;
  let totalDamage = 0;
  let maxComboEver = 0;
  let screenShake = 0;
  let hitStopGlobal = 0;
  let challengeWave = 1;
  const CHALLENGE_MAX = 3;
  /** 每名角色落地后可用的额外空中跳跃次数（二段跳） */
  const EXTRA_AIR_JUMPS = 1;

  /** manual：可继续；lose / win：仅返回菜单 */
  let pauseReason = "manual";
  let aiJPrev = false;
  let aiKPrev = false;
  let aiLPrev = false;

  const foePalette = {
    coat: "#241018",
    coatHi: "#3d1e28",
    coatSh: "#14080c",
    trim: "#94a3b8",
    trimHi: "#e2e8f0",
    trimDark: "#475569",
    skin: "#d4b09a",
    skinSh: "#a67d62",
    hair: "#120c10",
    hairMid: "#241820",
    hairHi: "#3a2830",
    brow: "#4c3628",
    lipLine: "#6b5344",
    pants: "#160c10",
    pantsHi: "#241820",
    boot: "#0a0608",
    bootHi: "#2a1820",
    fist: "#e2d8d2",
    armWrap: "#1a0c14",
    armWrapHi: "#2a1422",
    scabbard: "#120810",
    hilt: "#2a1824",
    outline: "#0a0608",
    sharingan: "#1a1c22",
    sharinganCore: "#2c3038",
  };

  function surfaceYAt(x, fw, plats) {
    let best = Infinity;
    for (const p of plats) {
      if (x + fw > p.x && x < p.x + p.w && p.y < best) best = p.y;
    }
    return best === Infinity ? H - 72 : best;
  }

  /** 当前 x 下可站立的最低台面（最大 p.y），用于贯落落点 */
  function lowestSurfaceYAt(x, fw, plats) {
    let best = -Infinity;
    for (const p of plats || []) {
      if (x + fw <= p.x || x >= p.x + p.w) continue;
      if (p.y > best) best = p.y;
    }
    return best === -Infinity ? H - 72 : best;
  }

  function makeFighter(xFeet, maxHp, charType) {
    const ct = charType === "archer" ? "archer" : "warrior";
    return {
      x: xFeet,
      y: surfaceYAt(xFeet, 48, platforms),
      w: 48,
      h: 46,
      vx: 0,
      vy: 0,
      facing: 1,
      onGround: true,
      coyote: 0,
      jumpBuffer: 0,
      airJumpsLeft: EXTRA_AIR_JUMPS,
      charType: ct,
      uChargeFrames: 0,
      _arrowSpawnedThisSwing: false,
      /** 弓手站射：本位掩码，同一 swing 内可多帧射多矢（bit i ↔ spawnPlan[i]） */
      _archerArrowSpawnMask: 0,
      _archerJMelee: false,
      attackPhase: 0,
      atkIdx: 0,
      landedHitThisSwing: false,
      combo: 0,
      comboTimer: 0,
      hp: maxHp,
      maxHp,
      hitStun: 0,
      guarding: false,
      crouchHeldDraw: false,
      crouchMove: false,
      _comboCd: 0,
      blockFlash: 0,
      hitReactKind: "",
      hitReactMax: 0,
      hitPushDir: 0,
      hitFlash: 0,
      _sDropShockDone: false,
      dashFrames: 0,
      dashCd: 0,
      dashDir: 1,
      /** 攻击被格挡后，进攻方硬直 */
      guardRecoilStun: 0,
      orbCd: 0,
      downTimer: 0,
      getupInvuln: 0,
      slashCharge: 0,
      _uOrbSpawned: false,
      _slantSpawned: false,
      _slashWaveSpawned: false,
      _volleySpawned: false,
      _slashPower: 0,
      /** 刚穿台子后若干帧内忽略该 platform 碰撞，避免被同一台面立刻接住 */
      platformDropCd: 0,
      _dropIgnorePi: -1,
      _pillarHitDummy: false,
      _pillarHitFoe: false,
      _pillarHitPlayer: false,
      _pillarForceRecover: false,
      _pendingAirStreakLand: false,
      _archerAirShotWide: false,
      _archerAirShotSpawned: false,
      airCombatCd: 0,
    };
  }

  /** S 单按格挡；S+A/D 蹲移；下段 atk 4/5 破防 */
  function syncFighterStance(f, inp) {
    const ap = f.attackPhase | 0;
    const cm = !!(f.onGround && inp.s && (inp.a || inp.d));
    const lowAnim = ap > 0 && (f.atkIdx === 4 || f.atkIdx === 5);
    const skickSquat = ap > 0 && f.atkIdx === 6 && f.onGround;
    const pillarSquatGround =
      ap > 0 && (f.atkIdx | 0) === ATK_PILLAR_DROP && f.onGround && ap < curAtk(f).act0;
    f.crouchMove = cm;
    const At = curAtk(f);
    const atkTotal = Number.isFinite(At.total) && At.total > 0 ? At.total : 26;
    const act1 = At.act1 | 0;
    /** idle 或命中窗结束后收招段可架招（起手势仍不可挡） */
    const guardOkPhase = ap === 0 || (ap > act1 && ap <= atkTotal);
    const slashHold = !!(inp.slashChargeHold && ap === 0);
    const pillarWind = ap > 0 && (f.atkIdx | 0) === ATK_PILLAR_DROP && ap < curAtk(f).act0;
    f.guarding = !!(f.onGround && inp.s && !inp.a && !inp.d && guardOkPhase && !slashHold && !pillarWind);
    f.crouchHeldDraw = !!(cm || (f.onGround && lowAnim) || skickSquat || pillarSquatGround);
  }

  function syncMenuVisibility() {
    if (!optMode || !wrapDiff || !wrapHp) return;
    const isDummy = optMode.value === "dummy";
    wrapDiff.style.opacity = isDummy ? "0.45" : "1";
    const sd = wrapDiff.querySelector("select");
    if (sd) sd.disabled = isDummy;
    wrapHp.style.opacity = isDummy ? "0.45" : "1";
    const sh = wrapHp.querySelector("select");
    if (sh) sh.disabled = isDummy;
  }

  if (optMode) optMode.addEventListener("change", syncMenuVisibility);
  syncMenuVisibility();

  if (btnStart) btnStart.addEventListener("click", startGame);
  if (btnPauseContinue) btnPauseContinue.addEventListener("click", () => resumeGame());
  if (btnPauseQuit) btnPauseQuit.addEventListener("click", () => quitToMenu());

  function clearHeldKeysForMenu() {
    for (const k of Object.keys(keys)) keys[k] = false;
    prevJ = false;
    prevK = false;
    prevL = false;
    prevU = false;
    aiJPrev = false;
    aiKPrev = false;
    aiLPrev = false;
  }

  function showPauseOverlay(show) {
    if (!pauseOverlay) return;
    pauseOverlay.classList.toggle("hidden", !show);
  }

  function refreshPauseUi() {
    if (!pauseTitle || !pauseSub || !btnPauseContinue) return;
    if (pauseReason === "lose") {
      pauseTitle.textContent = "本局结束";
      pauseSub.textContent = "你被击倒了。可返回菜单开始新对局。";
      btnPauseContinue.classList.add("hidden");
    } else if (pauseReason === "win") {
      pauseTitle.textContent = "胜利！";
      pauseSub.textContent = "本局已完成。返回菜单可调整难度再开一局。";
      btnPauseContinue.classList.add("hidden");
    } else {
      pauseTitle.textContent = "游戏已暂停";
      pauseSub.innerHTML = "按 <kbd>Esc</kbd> 或下方「继续」恢复；战斗中按 <kbd>P</kbd> 也可暂停。";
      btnPauseContinue.classList.remove("hidden");
    }
  }

  function readSettings() {
    if (optMode) settings.mode = optMode.value;
    if (optDifficulty) settings.difficulty = optDifficulty.value;
    settings.maxHp = optHp && Number(optHp.value) ? Number(optHp.value) : 120;
    const mi = optMap && Number(optMap.value);
    settings.mapIndex = Math.max(0, Math.min(MAPS.length - 1, Number.isFinite(mi) ? mi : 0));
    settings.playerChar = optChar && optChar.value === "archer" ? "archer" : "warrior";
  }

  function difficultyMul() {
    if (settings.difficulty === "easy") return 0.62;
    if (settings.difficulty === "hard") return 1.82;
    return 1.28;
  }

  /** 人机决策/连招额外倍率（与全局难度叠乘） */
  function foeAiAggroMul() {
    if (settings.difficulty === "easy") return 0.94;
    if (settings.difficulty === "hard") return 1.2;
    return 1.1;
  }

  function startGame() {
    readSettings();
    const m = MAPS[settings.mapIndex];
    if (!m || !m.platforms || !m.platforms.length) {
      console.error("[mini-fighter] 无效地图索引", settings.mapIndex);
      return;
    }
    map = m;
    platforms = map.platforms;
    gameState = "playing";
    pauseReason = "manual";
    if (menuEl) menuEl.style.display = "none";
    if (hudEl) hudEl.classList.remove("hidden");
    showPauseOverlay(false);
    totalDamage = 0;
    maxComboEver = 0;
    challengeWave = 1;
    resetPositions(true);
    if (foeLabel) foeLabel.textContent = settings.mode === "dummy" ? "木桩" : "对手";
    if (waveLine) waveLine.classList.toggle("hidden", settings.mode !== "challenge");
  }

  function pauseGame(reason) {
    if (gameState !== "playing") return;
    pauseReason = reason === "lose" || reason === "win" ? reason : "manual";
    gameState = "paused";
    refreshPauseUi();
    showPauseOverlay(true);
    clearHeldKeysForMenu();
  }

  function resumeGame() {
    if (gameState !== "paused" || pauseReason !== "manual") return;
    gameState = "playing";
    pauseReason = "manual";
    showPauseOverlay(false);
    clearHeldKeysForMenu();
  }

  function quitToMenu() {
    if (gameState === "menu") return;
    gameState = "menu";
    pauseReason = "manual";
    showPauseOverlay(false);
    if (menuEl) menuEl.style.display = "block";
    if (hudEl) hudEl.classList.add("hidden");
    clearHeldKeysForMenu();
    readSettings();
    const m = MAPS[settings.mapIndex] || MAPS[0];
    map = m;
    platforms = map.platforms;
    resetPositions(true);
    syncMenuVisibility();
  }

  function resetPositions(full) {
    const hpP = settings.mode === "dummy" ? settings.maxHp : settings.maxHp;
    const hpF = settings.mode === "dummy" ? 99999 : settings.maxHp;
    player = makeFighter(map.spawnYou, hpP, settings.playerChar || "warrior");
    player.facing = 1;
    if (settings.mode === "dummy") {
      foe = null;
      dummy.x = map.dummyX - dummy.w * 0.5;
      dummy.y = surfaceYAt(dummy.x + dummy.w * 0.5, dummy.w, platforms);
      dummy.flash = 0;
      dummy.shake = 0;
    } else {
      foe = makeFighter(map.spawnFoe, hpF + (settings.mode === "challenge" ? (challengeWave - 1) * 40 : 0), "warrior");
      foe.facing = -1;
    }
    if (full) {
      screenShake = 0;
      hitStopGlobal = 0;
      particles.length = 0;
      floatTexts.length = 0;
      shockRings.length = 0;
      orbBlasts.length = 0;
      arrows.length = 0;
      slantBeams.length = 0;
      slashWaves.length = 0;
    }
    snapCamera();
    updateHudHp();
  }

  function updateHudHp() {
    if (!player || !hpYou || !hpFoe) return;
    const py = settings.mode === "dummy" ? 1 : Math.max(0, player.hp / Math.max(1, player.maxHp));
    hpYou.style.transform = "scaleX(" + py + ")";
    if (settings.mode === "dummy") {
      hpFoe.style.transform = "scaleX(1)";
    } else if (foe) {
      hpFoe.style.transform = "scaleX(" + Math.max(0, foe.hp / Math.max(1, foe.maxHp)) + ")";
    }
    const td = document.getElementById("totalDmg");
    const mc = document.getElementById("maxCombo");
    if (td) td.textContent = String(totalDamage);
    if (mc) mc.textContent = String(maxComboEver);
    if (waveNum) waveNum.textContent = String(challengeWave);
  }

  function spawnParticles(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * spread;
      const sp = 3 + Math.random() * 6;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp * (Math.random() > 0.5 ? 1 : -1),
        vy: Math.sin(a) * sp - 2,
        life: 18 + Math.random() * 14,
        max: 32,
        col: Math.random() > 0.35 ? "#fbbf24" : "#fb7185",
        s: 3 + Math.random() * 4,
      });
    }
  }

  /** 武者 W+A/D+U 冰霜破：冰屑溅射 */
  function spawnFrostBreakBurst(x, y, dir, n) {
    const cols = ["#ecfeff", "#e0f2fe", "#cffafe", "#a5f3fc", "#7dd3fc", "#bae6fd"];
    const di = dir >= 0 ? 1 : -1;
    const spread = Math.PI * 0.62;
    const base = di > 0 ? 0.12 : Math.PI - 0.12;
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * spread;
      const sp = 2.4 + Math.random() * 10;
      particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 3.6 - Math.random() * 2,
        life: 16 + Math.random() * 26,
        max: 38,
        col: cols[i % cols.length],
        s: 2.2 + Math.random() * 4.2,
      });
    }
  }

  /** 格挡火花：沿攻击反方向溅射，偏冷色高光 */
  function spawnHitParticles(cx, cy, kind, comboN) {
    const k = kind || "tap";
    const mul =
      k === "slam" ? 1.5 : k === "spin" || k === "launch" ? 1.28 : k === "wide" || k === "sweep" ? 1.15 : k === "tap" ? 0.62 : 1;
    const n = Math.max(6, Math.floor((9 + Math.min(comboN | 0, 10)) * mul));
    const spread = k === "wide" || k === "slam" ? Math.PI * 1.05 : Math.PI * 0.82;
    const cols =
      k === "launch" || k === "slam"
        ? ["#fef08a", "#fdba74", "#fca5a5", "#e2e8f0"]
        : k === "low" || k === "sweep"
          ? ["#cbd5e1", "#94a3b8", "#fca5a5"]
          : ["#fecdd3", "#fdba74", "#fbbf24", "#fb7185"];
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * spread;
      const sp = 2.8 + Math.random() * 8.5;
      particles.push({
        x: cx + (Math.random() - 0.5) * 16,
        y: cy + (Math.random() - 0.5) * 18,
        vx: Math.cos(a) * sp * (Math.random() > 0.5 ? 1 : -1),
        vy: Math.sin(a) * sp - 1.8,
        life: 16 + Math.random() * 20,
        max: 34,
        col: cols[(i + (comboN | 0)) % cols.length],
        s: 2.4 + Math.random() * 3.6,
      });
    }
  }

  function spawnShockRings(mx, footY) {
    shockRings.push({ x: mx, y: footY - 2, age: 0, life: 520 });
  }

  /** 坠劈落地 / 命中：尘粒 + 扩散震荡波 */
  function spawnSlamShock(mxs, footY) {
    spawnShockRings(mxs, footY);
    for (let i = 0; i < 72; i++) {
      const spread = (Math.random() - 0.5) * 160;
      particles.push({
        x: mxs + spread * 0.45,
        y: footY - 3 + (Math.random() - 0.5) * 12,
        vx: (Math.random() - 0.5) * 12,
        vy: -1.8 - Math.random() * 6.2,
        life: 22 + Math.random() * 26,
        max: 48,
        col: Math.random() > 0.4 ? "#e2e8f0" : Math.random() > 0.52 ? "#94a3b8" : "#fde68a",
        s: 2.6 + Math.random() * 4.5,
      });
    }
  }

  function maybeSlamLandShock(f, preGround) {
    const ai = f.atkIdx | 0;
    if (f.attackPhase <= 0 || f._sDropShockDone) return;
    if (preGround || !f.onGround) return;
    const Acur = ATTACKS[Math.min(ai, ATTACKS.length - 1)];
    if (!Acur || f.attackPhase < Acur.act0 || f.attackPhase > Acur.act1) return;
    if (ai !== 11 && ai !== ATK_PILLAR_DROP && ai !== ATK_AIR_STREAK) return;
    spawnSlamShock(f.x + f.w * 0.5, f.y);
    screenShake = Math.min(26, screenShake + 14);
    hitStopGlobal = Math.min(14, hitStopGlobal + 5);
    f._sDropShockDone = true;
  }

  /** 武者空俯冲轨迹火花（红） */
  function spawnRedBurstParticles(x, y, n, spread) {
    const reds = ["#ef4444", "#fca5a5", "#f87171", "#fecaca", "#dc2626"];
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * spread;
      const sp = 2.4 + Math.random() * 7;
      particles.push({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.6,
        life: 12 + Math.random() * 18,
        max: 34,
        col: reds[(i + Math.floor(Math.random() * 5)) % reds.length],
        s: 2.4 + Math.random() * 4,
      });
    }
  }

  function spawnBlockSparks(cx, cy, punchDir) {
    const back = -punchDir;
    for (let i = 0; i < 18; i++) {
      const sp = 3.5 + Math.random() * 10;
      const spread = (Math.random() - 0.5) * 1.15;
      const base = back > 0 ? 0 : Math.PI;
      const a = base + spread + (Math.random() - 0.5) * 0.5;
      const col =
        Math.random() > 0.55 ? "#ecfeff" : Math.random() > 0.45 ? "#7dd3fc" : Math.random() > 0.35 ? "#fef08a" : "#bae6fd";
      particles.push({
        x: cx + (Math.random() - 0.5) * 22,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(a) * sp + (Math.random() - 0.5) * 2.5,
        vy: Math.sin(a) * sp * 0.55 + (Math.random() - 0.5) * 6 - 1.2,
        life: 14 + Math.random() * 22,
        max: 36,
        col,
        s: 2.2 + Math.random() * 3.8,
      });
    }
  }

  function spawnFloatText(x, y, text, color, scale) {
    floatTexts.push({ x, y, text, color, scale: scale || 1, vy: -2.2, life: 45, age: 0 });
  }

  /** 全身受击框：宽度对齐像素小人外廓；脚底仍为 f.y；蹲/格挡时略压低框高（与渲染 squat 大致一致） */
  function hurtbox(f) {
    if (!f) return { x: 0, y: 0, w: 0, h: 0 };
    const bw = Number.isFinite(D.FIGHTER_BODY_HURT_W) ? D.FIGHTER_BODY_HURT_W : f.w;
    let bh = Number.isFinite(D.FIGHTER_BODY_HURT_H) ? D.FIGHTER_BODY_HURT_H : f.h;
    let squat = 0;
    if (f.onGround) {
      if (f.crouchHeldDraw) squat += 18;
      if (f.guarding) squat += 11;
    }
    bh = Math.max(52, Math.round(bh - squat));
    const cx = f.x + f.w * 0.5;
    return { x: cx - bw * 0.5, y: f.y - bh, w: bw, h: bh };
  }

  /** 仅双脚都在地面且身体重叠时横向推开；空中可重叠，便于从对方头顶跳过 */
  function resolvePlayerFoeOverlap() {
    if (!foe || settings.mode === "dummy" || !player) return;
    if (!player.onGround || !foe.onGround) return;
    const a = hurtbox(player);
    const b = hurtbox(foe);
    if (!rectsOverlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) return;
    const push = 3.5;
    const pm = player.x + player.w * 0.5;
    const fm = foe.x + foe.w * 0.5;
    if (pm < fm) {
      player.x -= push;
      foe.x += push;
    } else {
      player.x += push;
      foe.x -= push;
    }
    clampWorldX(player);
    clampWorldX(foe);
  }

  function dummyHurtbox() {
    return { x: dummy.x, y: dummy.y - dummy.h, w: dummy.w, h: dummy.h };
  }

  function defenderHurtImmune(defender) {
    return defender && ((defender.getupInvuln | 0) > 0 || (defender.downTimer | 0) > 0);
  }

  function applyDamage(attacker, defender, isDummyTarget, baseDmg, tierColor, chipBlock, srcAtkIdx) {
    if (!isDummyTarget && defenderHurtImmune(defender)) return;
    const si = Number.isFinite(srcAtkIdx) ? (srcAtkIdx | 0) : Math.min(attacker.atkIdx | 0, ATTACKS.length - 1);
    const At = ATTACKS[Math.max(0, Math.min(si, ATTACKS.length - 1))];
    const stBase = At.hitStun != null ? At.hitStun : 10;
    const react = At.hitReact || "tap";
    const knockM = At.hitKnock != null ? At.hitKnock : 1;

    if (isDummyTarget) {
      dummy.flash = 10;
      dummy.shake = (Math.random() > 0.5 ? 1 : -1) * 10;
    } else {
      defender.dashFrames = 0;
      if (defender === foe) defender.uChargeFrames = 0;
      defender.hp -= baseDmg;
      if (chipBlock) {
        /** 崩血仍由 tryHit 的 dmg 决定，此处只加长格挡方硬直、略增击退；不提高扣血 */
        const stChip = Math.max(4, Math.min(12, Math.floor(2.8 + stBase * 0.36 + baseDmg * 0.035)));
        defender.hitStun = stChip;
        defender.hitReactKind = "tap";
        defender.hitReactMax = stChip;
        defender.hitPushDir = attacker.facing;
        defender.vx += attacker.facing * (0.62 + baseDmg * 0.011) * knockM * 0.58;
        defender.blockFlash = 220;
        defender.hitFlash = 0;
        const dh = hurtbox(defender);
        spawnBlockSparks(dh.x + dh.w * 0.5, dh.y + dh.h * 0.38, attacker.facing);
        spawnFloatText(defender.x + defender.w * 0.5, defender.y - defender.h * 0.55, "格挡", "#e0f2fe", 1.35);
        if (attacker) {
          const rec = Math.min(24, Math.max(12, Math.floor(8 + stBase * 0.62 + baseDmg * 0.05)));
          attacker.guardRecoilStun = Math.max(attacker.guardRecoilStun | 0, rec);
          attacker.vx -= attacker.facing * (3.1 + Math.min(baseDmg, 48) * 0.042);
          attacker.dashFrames = 0;
          attacker.attackPhase = 0;
          attacker.atkIdx = 0;
          attacker.landedHitThisSwing = true;
          attacker._sDropShockDone = false;
        }
      } else {
        const knockdown =
          react === "slam" ||
          react === "spin" ||
          si === ATK_SLASH_WAR ||
          si === 11 ||
          si === ATK_PILLAR_DROP;
        if (knockdown && (defender.downTimer | 0) <= 0) {
          defender.downTimer = Math.min(96, Math.max(56, 50 + Math.floor(baseDmg * 0.9)));
          defender.hitStun = 0;
          defender.hitReactKind = "downed";
          defender.hitReactMax = defender.downTimer;
          defender.hitPushDir = attacker.facing;
          defender.hitFlash = 240;
          defender.vx += attacker.facing * (2.25 + baseDmg * 0.028) * knockM;
          defender.blockFlash = 0;
          defender.guardRecoilStun = 0;
          defender.attackPhase = 0;
          defender.atkIdx = 0;
          defender.guarding = false;
        } else {
          const stFull = Math.round(stBase * (0.68 + Math.min(baseDmg, 52) / 78));
          defender.hitStun = Math.min(32, Math.max(4, stFull));
          defender.hitReactKind = react;
          defender.hitReactMax = defender.hitStun;
          defender.hitPushDir = attacker.facing;
          defender.hitFlash = 220;
          defender.vx += attacker.facing * (1.85 + baseDmg * 0.024) * knockM;
          defender.blockFlash = 0;
          defender.guardRecoilStun = 0;
        }
      }
    }
    const stHeavy = !chipBlock && !isDummyTarget ? Math.min(4, Math.floor((stBase || 10) / 4)) : 0;
    screenShake = chipBlock
      ? Math.min(4.5, 1.8 + attacker.combo * 0.12)
      : Math.min(14, 6 + attacker.combo * 0.6 + stHeavy * 0.35);
    hitStopGlobal = chipBlock
      ? Math.min(7, 3 + Math.floor(attacker.combo / 7))
      : Math.min(14, 5 + Math.floor(attacker.combo / 3) + stHeavy);
    if (isDummyTarget) dummy.hitStop = hitStopGlobal;

    const hb = isDummyTarget ? dummyHurtbox() : hurtbox(defender);
    const cx = hb.x + hb.w * 0.5;
    const cy = hb.y + hb.h * 0.35;
    if (!chipBlock && si === 11) {
      spawnSlamShock(cx, isDummyTarget ? dummy.y : defender.y);
      screenShake = Math.min(24, screenShake + 9);
      hitStopGlobal = Math.min(14, hitStopGlobal + 3);
      if (!isDummyTarget) attacker._sDropShockDone = true;
    }
    if (!chipBlock) spawnHitParticles(cx, cy, react, attacker.combo | 0);
    spawnFloatText(
      cx,
      hb.y - (chipBlock ? 4 : 8),
      chipBlock ? "-" + baseDmg + " 崩" : "-" + baseDmg,
      chipBlock ? "#bae6fd" : tierColor,
      (chipBlock ? 0.88 : 0.9) + Math.min(attacker.combo, 12) * 0.04,
    );
    if (!chipBlock && attacker.combo >= 3) {
      spawnFloatText(cx, hb.y - 36, attacker.combo + " HIT!", tierColor, 1.1);
    }
    updateHudHp();

    if (!isDummyTarget) checkEliminatedFromHp(defender);
  }

  function archerArrowStandSwing(attacker) {
    return (
      attacker &&
      attacker.charType === "archer" &&
      (attacker.atkIdx | 0) >= 0 &&
      (attacker.atkIdx | 0) <= 3 &&
      !attacker._archerJMelee
    );
  }

  function horizDistToTargetFor(f) {
    const fm = f.x + f.w * 0.5;
    if (settings.mode === "dummy") return Math.abs(fm - (dummy.x + dummy.w * 0.5));
    if (!foe) return ARCHER_MELEE_DIST + 100;
    const tm = f === player ? foe.x + foe.w * 0.5 : player.x + player.w * 0.5;
    return Math.abs(fm - tm);
  }

  function tryHit(attacker, defender, isDummyTarget) {
    if (archerArrowStandSwing(attacker)) return;
    const box = Rend.getAttackBox(attacker);
    if (!box) return;
    if (attacker.landedHitThisSwing) return;
    if (!isDummyTarget && defenderHurtImmune(defender)) return;
    const hb = isDummyTarget ? dummyHurtbox() : hurtbox(defender);
    if (!rectsOverlap(box.x, box.y, box.w, box.h, hb.x, hb.y, hb.w, hb.h)) return;
    if (!isDummyTarget && defender.dashFrames > 5) return;

    const aIdx = Math.min(attacker.atkIdx | 0, ATTACKS.length - 1);
    const lowHit = aIdx === 4 || aIdx === 5;
    const blocked = !isDummyTarget && defender && defender.guarding && !lowHit;

    const comboWindow = 380;
    if (!blocked) {
      if (attacker.comboTimer > 0) attacker.combo += 1;
      else attacker.combo = 1;
      attacker.comboTimer = comboWindow;
    }

    const A = ATTACKS[aIdx];
    const base = 8;
    const comboSteps = Math.min(Math.max(0, attacker.combo - 1), 9);
    const comboBonus = Math.floor(comboSteps * 1.35);
    const airMul = attacker.onGround ? 1 : 1.25;
    const rawDmg = Math.floor((base + comboBonus) * airMul * A.dmg);
    let dmg = blocked ? Math.max(1, Math.floor(rawDmg * 0.22)) : rawDmg;
    const archMeleeHit =
      attacker.charType === "archer" &&
      Number.isFinite(D.ARCHER_MELEE_DMG_MUL) &&
      ((aIdx >= 0 && aIdx <= 3 && attacker._archerJMelee) || aIdx === 4 || aIdx === 5);
    if (!blocked && archMeleeHit) dmg = Math.max(1, Math.floor(dmg * D.ARCHER_MELEE_DMG_MUL));

    attacker.landedHitThisSwing = true;

    if (attacker === player) {
      totalDamage += dmg;
      if (!blocked && attacker.combo > maxComboEver) maxComboEver = attacker.combo;
    }

    const tier =
      attacker.combo >= 12 ? "#f472b6" : attacker.combo >= 7 ? "#a78bfa" : attacker.combo >= 4 ? "#6ee7b7" : "#fcd34d";
    if (settings.mode === "dummy" && attacker === player) {
      applyDamage(attacker, defender, true, dmg, tier, false, aIdx);
    } else {
      applyDamage(attacker, defender, false, dmg, tier, blocked, aIdx);
    }
  }

  /** 武者空俯冲：贴身扫判（每段最多命中一次） */
  function tryAirStreakWarriorHit(attacker, defender, isDummyTarget) {
    if ((attacker.atkIdx | 0) !== ATK_AIR_STREAK || attacker.charType !== "warrior") return;
    const Ap = ATTACKS[ATK_AIR_STREAK];
    const ap = attacker.attackPhase | 0;
    if (ap < Ap.act0 || ap > Ap.act1 || attacker.onGround) return;
    if (attacker.landedHitThisSwing) return;
    if (!isDummyTarget && defenderHurtImmune(defender)) return;
    const dir = attacker.facing >= 0 ? 1 : -1;
    const bx = attacker.x - 14 + dir * 10;
    const by = attacker.y - attacker.h - 14;
    const bw = attacker.w + 36;
    const bh = attacker.h + 26;
    const hb = isDummyTarget ? dummyHurtbox() : hurtbox(defender);
    if (!rectsOverlap(bx, by, bw, bh, hb.x, hb.y, hb.w, hb.h)) return;
    if (!isDummyTarget && defender.dashFrames > 5) return;
    const lowHit = false;
    const blocked = !isDummyTarget && defender.guarding && !lowHit;
    const comboWindow = 380;
    if (!blocked) {
      if (attacker.comboTimer > 0) attacker.combo += 1;
      else attacker.combo = 1;
      attacker.comboTimer = comboWindow;
    }
    const A = ATTACKS[ATK_AIR_STREAK];
    const base = 8;
    const comboSteps = Math.min(Math.max(0, attacker.combo - 1), 9);
    const comboBonus = Math.floor(comboSteps * 1.35);
    const airMul = attacker.onGround ? 1 : 1.25;
    const rawDmg = Math.floor((base + comboBonus) * airMul * A.dmg);
    let dmg = blocked ? Math.max(1, Math.floor(rawDmg * 0.22)) : rawDmg;
    attacker.landedHitThisSwing = true;
    if (attacker === player) {
      totalDamage += dmg;
      if (!blocked && attacker.combo > maxComboEver) maxComboEver = attacker.combo;
    }
    const tier =
      attacker.combo >= 12 ? "#f472b6" : attacker.combo >= 7 ? "#a78bfa" : attacker.combo >= 4 ? "#6ee7b7" : "#fcd34d";
    spawnRedBurstParticles(attacker.x + attacker.w * 0.5 + dir * 12, attacker.y - attacker.h * 0.4, 14, Math.PI * 0.65);
    if (settings.mode === "dummy" && attacker === player) {
      applyDamage(attacker, defender, true, dmg, tier, false, ATK_AIR_STREAK);
    } else {
      applyDamage(attacker, defender, false, dmg, tier, blocked, ATK_AIR_STREAK);
    }
  }

  /** 地面 S+J 贯落：竖条扫判，每名目标每段招式最多吃一次 */
  function tryPillarDropHits(attacker, prevFootY, attackerIsPlayer) {
    if ((attacker.atkIdx | 0) !== ATK_PILLAR_DROP) return;
    const Ap = ATTACKS[ATK_PILLAR_DROP];
    const ap = attacker.attackPhase | 0;
    if (ap < Ap.act0 || ap > Ap.act1) return;

    const yLo = Math.min(prevFootY, attacker.y);
    const yHi = Math.max(prevFootY, attacker.y);
    const padX = 12;
    const padY = 18;
    const bx = attacker.x - padX;
    const by = yLo - attacker.h - padY;
    const bw = attacker.w + padX * 2;
    const bh = yHi - yLo + attacker.h + padY * 2;
    if (bh < 10) return;

    function doOne(defender, isDummyTarget) {
      if (isDummyTarget) {
        if (attacker._pillarHitDummy) return;
      } else if (defender === player) {
        if (attacker._pillarHitPlayer) return;
      } else if (attacker._pillarHitFoe) return;
      if (!isDummyTarget && defenderHurtImmune(defender)) return;
      const hb = isDummyTarget ? dummyHurtbox() : hurtbox(defender);
      if (!rectsOverlap(bx, by, bw, bh, hb.x, hb.y, hb.w, hb.h)) return;
      if (!isDummyTarget && defender.dashFrames > 5) return;
      const lowHit = false;
      const blocked = !isDummyTarget && defender.guarding && !lowHit;
      const comboWindow = 380;
      if (!blocked) {
        if (attacker.comboTimer > 0) attacker.combo += 1;
        else attacker.combo = 1;
        attacker.comboTimer = comboWindow;
      }
      const aIdx = ATK_PILLAR_DROP;
      const A = ATTACKS[aIdx];
      const base = 8;
      const comboSteps = Math.min(Math.max(0, attacker.combo - 1), 9);
      const comboBonus = Math.floor(comboSteps * 1.35);
      const airMul = attacker.onGround ? 1 : 1.25;
      const rawDmg = Math.floor((base + comboBonus) * airMul * A.dmg);
      const dmg = blocked ? Math.max(1, Math.floor(rawDmg * 0.22)) : rawDmg;
      if (attacker === player) {
        totalDamage += dmg;
        if (!blocked && attacker.combo > maxComboEver) maxComboEver = attacker.combo;
      }
      const tier =
        attacker.combo >= 12 ? "#f472b6" : attacker.combo >= 7 ? "#a78bfa" : attacker.combo >= 4 ? "#6ee7b7" : "#fcd34d";
      if (settings.mode === "dummy" && attackerIsPlayer) {
        applyDamage(attacker, defender, true, dmg, tier, false, aIdx);
      } else {
        applyDamage(attacker, defender, false, dmg, tier, blocked, aIdx);
      }
      if (isDummyTarget) attacker._pillarHitDummy = true;
      else if (defender === player) attacker._pillarHitPlayer = true;
      else attacker._pillarHitFoe = true;
    }

    if (settings.mode === "dummy" && attackerIsPlayer) doOne(null, true);
    else if (attackerIsPlayer && foe) doOne(foe, false);
    else if (!attackerIsPlayer && player) doOne(player, false);
  }

  function firePlayerOrbBlast() {
    if (!player || gameState !== "playing") return;
    if (player.hitStun > 0 || player.guardRecoilStun > 0) return;
    if ((player.downTimer | 0) > 0 || defenderHurtImmune(player)) return;
    if (player.attackPhase !== 0 || player.dashFrames > 0) return;
    if (player.orbCd > 0) return;
    if (player.charType === "archer") {
      player.atkIdx = 12;
      player.attackPhase = 1;
      player.landedHitThisSwing = false;
      player._arrowSpawnedThisSwing = false;
      player._archerArrowSpawnMask = 0;
      player.orbCd = ORB_CD_MS;
      return;
    }
    player.atkIdx = ATK_QI_WINDUP;
    player.attackPhase = 1;
    player.landedHitThisSwing = false;
    player._uOrbSpawned = false;
    player.orbCd = ORB_CD_MS;
  }

  function fireFoeOrbBlast() {
    if (!foe || gameState !== "playing") return;
    const dir = foe.facing >= 0 ? 1 : -1;
    const ox = foe.x + foe.w * 0.5 + dir * 38;
    const oy = foe.y - foe.h * 0.56;
    orbBlasts.push({
      x: ox,
      y: oy,
      vx: ORB_VX * dir,
      age: 0,
      life: ORB_LIFE_MS,
      fromPlayer: false,
    });
    foe.orbCd = ORB_CD_MS;
    spawnParticles(ox - dir * 6, oy + 4, 14, dir > 0 ? 0.06 : Math.PI - 0.06);
  }

  function tickOrbBlasts(dt) {
    if (!player || gameState !== "playing") return;
    const ww = map.worldW || D.WORLD_W;
    const rw = 32;
    const rh = 32;
    for (let i = orbBlasts.length - 1; i >= 0; i--) {
      const o = orbBlasts[i];
      o.age += dt;
      o.x += o.vx;
      if (o.age >= o.life || o.x < -100 || o.x > ww + 100) {
        orbBlasts.splice(i, 1);
        continue;
      }
      const fromPlayer = o.fromPlayer !== false;
      const hbOrb = { x: o.x - rw * 0.5, y: o.y - rh * 0.5, w: rw, h: rh };
      if (fromPlayer) {
        if (settings.mode === "dummy") {
          const dh = dummyHurtbox();
          if (rectsOverlap(hbOrb.x, hbOrb.y, hbOrb.w, hbOrb.h, dh.x, dh.y, dh.w, dh.h)) {
            const A = ATTACKS[ORB_HIT_ATK];
            const base = 8;
            const comboSteps = Math.min(Math.max(0, player.combo - 1), 9);
            const comboBonus = Math.floor(comboSteps * 1.35);
            const airMul = player.onGround ? 1 : 1.25;
            const rawDmg = Math.floor((base + comboBonus) * airMul * A.dmg);
            if (player.comboTimer > 0) player.combo += 1;
            else player.combo = 1;
            player.comboTimer = 380;
            const tier =
              player.combo >= 12 ? "#f472b6" : player.combo >= 7 ? "#a78bfa" : player.combo >= 4 ? "#6ee7b7" : "#fcd34d";
            totalDamage += rawDmg;
            if (player.combo > maxComboEver) maxComboEver = player.combo;
            applyDamage(player, null, true, rawDmg, tier, false, ORB_HIT_ATK);
            spawnParticles(dh.x + dh.w * 0.5, dh.y + dh.h * 0.35, 22, player.facing > 0 ? 0.12 : Math.PI - 0.12);
            hitStopGlobal = Math.min(11, hitStopGlobal + 5);
            orbBlasts.splice(i, 1);
          }
        } else if (foe) {
          const hb = hurtbox(foe);
          if (rectsOverlap(hbOrb.x, hbOrb.y, hbOrb.w, hbOrb.h, hb.x, hb.y, hb.w, hb.h)) {
            const blocked = !!foe.guarding;
            const A = ATTACKS[ORB_HIT_ATK];
            const base = 8;
            const comboSteps = Math.min(Math.max(0, player.combo - 1), 9);
            const comboBonus = Math.floor(comboSteps * 1.35);
            const airMul = player.onGround ? 1 : 1.25;
            const rawDmg = Math.floor((base + comboBonus) * airMul * A.dmg);
            const dmg = blocked ? Math.max(1, Math.floor(rawDmg * 0.22)) : rawDmg;
            if (!blocked) {
              if (player.comboTimer > 0) player.combo += 1;
              else player.combo = 1;
              player.comboTimer = 380;
            }
            const tier =
              player.combo >= 12 ? "#f472b6" : player.combo >= 7 ? "#a78bfa" : player.combo >= 4 ? "#6ee7b7" : "#fcd34d";
            totalDamage += dmg;
            if (!blocked && player.combo > maxComboEver) maxComboEver = player.combo;
            applyDamage(player, foe, false, dmg, tier, blocked, ORB_HIT_ATK);
            spawnParticles(hb.x + hb.w * 0.5, hb.y + hb.h * 0.35, 22, player.facing > 0 ? 0.15 : Math.PI - 0.15);
            hitStopGlobal = Math.min(11, hitStopGlobal + (blocked ? 3 : 6));
            orbBlasts.splice(i, 1);
          }
        }
      } else if (foe && player) {
        const hb = hurtbox(player);
        if (defenderHurtImmune(player)) continue;
        if (rectsOverlap(hbOrb.x, hbOrb.y, hbOrb.w, hbOrb.h, hb.x, hb.y, hb.w, hb.h)) {
          const blocked = !!player.guarding;
          const A = ATTACKS[ORB_HIT_ATK];
          const base = 8;
          const comboSteps = Math.min(Math.max(0, foe.combo - 1), 9);
          const comboBonus = Math.floor(comboSteps * 1.35);
          const airMul = foe.onGround ? 1 : 1.25;
          const rawDmg = Math.floor((base + comboBonus) * airMul * A.dmg);
          const dmg = blocked ? Math.max(1, Math.floor(rawDmg * 0.22)) : rawDmg;
          if (!blocked) {
            if (foe.comboTimer > 0) foe.combo += 1;
            else foe.combo = 1;
            foe.comboTimer = 380;
          }
          const tier =
            foe.combo >= 12 ? "#f472b6" : foe.combo >= 7 ? "#a78bfa" : foe.combo >= 4 ? "#6ee7b7" : "#fcd34d";
          applyDamage(foe, player, false, dmg, tier, blocked, ORB_HIT_ATK);
          spawnParticles(hb.x + hb.w * 0.5, hb.y + hb.h * 0.35, 22, foe.facing > 0 ? 0.15 : Math.PI - 0.15);
          hitStopGlobal = Math.min(11, hitStopGlobal + (blocked ? 3 : 6));
          orbBlasts.splice(i, 1);
        }
      }
    }
  }

  const ARROW_WEAK_MUL = 0.52;
  const ARROW_SPEED = 14.8;
  const DASH_SPEED_PLAYER = 13.6;
  const DASH_SPEED_FOE = 13.4;
  const ARCHER_DASH_SPEED_MUL = 1.5;

  /**
   * 弓手远程站射 J：0 单箭、1 连射两箭、2/3 各一支重箭（更高伤、更大判定与像素）
   * @returns {{ phase: number, opts: object }[]}
   */
  function archerStandRangedArrowPlan(f, Ap) {
    const pk = Ap.peakAp;
    const p0 = pk && pk.length ? pk[0] : null;
    if (p0 == null) return [];
    const p1 = pk.length >= 2 ? pk[1] : p0;
    const idx = f.atkIdx | 0;
    if (idx === 0) {
      return [{ phase: p0, opts: { weak: true } }];
    }
    if (idx === 1) {
      const p2 = p1 > p0 ? p1 : p0 + 3;
      return [
        { phase: p0, opts: { weak: true, yOff: -22, duoLine: true } },
        { phase: p2, opts: { weak: true, yOff: 24, duoLine: true } },
      ];
    }
    if (idx === 2) {
      return [{ phase: p0, opts: { weak: false, heavy: true, dmgScale: 1.34 } }];
    }
    if (idx === 3) {
      return [{ phase: p0, opts: { weak: false, heavy: true, dmgScale: 1.52 } }];
    }
    return [];
  }

  function spawnPlayerArrow(arg) {
    if (!player || gameState !== "playing") return;
    const opts = typeof arg === "object" && arg !== null ? arg : { weak: !!arg };
    const weak = !!opts.weak;
    const heavy = !!opts.heavy;
    const yOff = Number.isFinite(opts.yOff) ? opts.yOff : 0;
    const dir = player.facing >= 0 ? 1 : -1;
    const ax = player.x + player.w * 0.5 + dir * 26;
    const ay = player.y - player.h * 0.58 + yOff;
    const spdMul = player.charType === "archer" ? ARCHER_ARROW_SPEED_MUL : 1;
    const arr = {
      x: ax,
      y: ay,
      vx: ARROW_SPEED * spdMul * dir,
      vy: 0,
      age: 0,
      life: ARROW_LIFE_MS,
      weak,
      heavy,
      atkIdxSnap: Math.min(player.atkIdx | 0, ATTACKS.length - 1),
    };
    if (Number.isFinite(opts.dmgScale) && opts.dmgScale > 0) arr.dmgScale = opts.dmgScale;
    if (opts.duoLine) arr.duoLine = true;
    arrows.push(arr);
    spawnParticles(ax - dir * 4, ay, player.charType === "archer" ? 16 : 10, dir > 0 ? 0.05 : Math.PI - 0.05);
  }

  function tickArrows(dt) {
    if (!player || gameState !== "playing" || !arrows.length) return;
    const ww = map.worldW || D.WORLD_W;
      const rwBase = player && player.charType === "archer" ? 42 : 24;
      const rhBase = player && player.charType === "archer" ? 17 : 10;
    const rwHeavy = 62;
    const rhHeavy = 38;
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.age += dt;
      a.x += a.vx;
      a.y += a.vy || 0;
      if (a.age >= a.life || a.x < -120 || a.x > ww + 120 || a.y < -80 || a.y > H + 80) {
        arrows.splice(i, 1);
        continue;
      }
      let rw = a.heavy && player && player.charType === "archer" ? rwHeavy : rwBase;
      let rh = a.heavy && player && player.charType === "archer" ? rhHeavy : rhBase;
      if (player && player.charType === "archer" && a.duoLine) {
        rw = Math.round(rw * 1.58);
        rh = Math.round(rh * 1.62);
      }
      if (player && player.charType === "archer" && (a.atkIdxSnap | 0) === ATK_VOLLEY_ARCH) {
        rw = Math.round(rw * 1.68);
        rh = Math.round(rh * 2.75);
      }
      if (player && player.charType === "archer" && (a.atkIdxSnap | 0) === ATK_SLANT_ARCH) {
        rw = Math.round(rw * 1.62);
        rh = Math.round(rh * 1.78);
      }
      const hbArr = {
        x: a.vx >= 0 ? a.x : a.x - rw,
        y: a.y - rh * 0.5,
        w: rw,
        h: rh,
      };
      const aIdx = Math.min(Math.max(0, a.atkIdxSnap | 0), ATTACKS.length - 1);
      const A = ATTACKS[aIdx];
      const base = 8;
      const comboSteps = Math.min(Math.max(0, player.combo - 1), 9);
      const comboBonus = Math.floor(comboSteps * 1.35);
      const airMul = player.onGround ? 1 : 1.25;
      let rawDmg = Math.floor((base + comboBonus) * airMul * (A && A.dmg ? A.dmg : 1));
      const dm = Number(a.dmgScale);
      if (Number.isFinite(dm) && dm > 0) rawDmg = Math.max(1, Math.floor(rawDmg * dm));
      const weakMul =
        player.charType === "archer" && Number.isFinite(D.ARCHER_ARROW_WEAK_MUL)
          ? D.ARCHER_ARROW_WEAK_MUL
          : ARROW_WEAK_MUL;
      if (a.weak) rawDmg = Math.max(1, Math.floor(rawDmg * weakMul));
      if (
        player.charType === "archer" &&
        !a.weak &&
        Number.isFinite(D.ARCHER_ARROW_STRONG_MUL) &&
        D.ARCHER_ARROW_STRONG_MUL > 0
      ) {
        rawDmg = Math.max(1, Math.floor(rawDmg * D.ARCHER_ARROW_STRONG_MUL));
      }

      const applyArrowHit = (isDummy) => {
        if (player.comboTimer > 0) player.combo += 1;
        else player.combo = 1;
        player.comboTimer = 380;
        const tier =
          player.combo >= 12 ? "#f472b6" : player.combo >= 7 ? "#a78bfa" : player.combo >= 4 ? "#6ee7b7" : "#fcd34d";
        totalDamage += rawDmg;
        if (player.combo > maxComboEver) maxComboEver = player.combo;
        if (isDummy) applyDamage(player, null, true, rawDmg, tier, false, aIdx);
        else applyDamage(player, foe, false, rawDmg, tier, false, aIdx);
        hitStopGlobal = Math.min(10, hitStopGlobal + 4);
        arrows.splice(i, 1);
      };

      if (settings.mode === "dummy") {
        const dh = dummyHurtbox();
        if (rectsOverlap(hbArr.x, hbArr.y, hbArr.w, hbArr.h, dh.x, dh.y, dh.w, dh.h)) {
          spawnParticles(dh.x + dh.w * 0.5, dh.y + dh.h * 0.35, 18, player.facing > 0 ? 0.12 : Math.PI - 0.12);
          applyArrowHit(true);
        }
      } else if (foe) {
        const hb = hurtbox(foe);
        const lowHit = aIdx === 4 || aIdx === 5;
        if (defenderHurtImmune(foe)) continue;
        if (rectsOverlap(hbArr.x, hbArr.y, hbArr.w, hbArr.h, hb.x, hb.y, hb.w, hb.h)) {
          if (foe.dashFrames > 5) continue;
          const blocked = !!foe.guarding && !lowHit;
          if (blocked) {
            const chip = Math.max(1, Math.floor(rawDmg * 0.22));
            if (player.comboTimer > 0) player.combo += 1;
            else player.combo = 1;
            player.comboTimer = 380;
            const tier =
              player.combo >= 12 ? "#f472b6" : player.combo >= 7 ? "#a78bfa" : player.combo >= 4 ? "#6ee7b7" : "#fcd34d";
            totalDamage += chip;
            if (player.combo > maxComboEver) maxComboEver = player.combo;
            applyDamage(player, foe, false, chip, tier, true, aIdx);
            hitStopGlobal = Math.min(11, hitStopGlobal + 3);
            arrows.splice(i, 1);
            continue;
          }
          spawnParticles(hb.x + hb.w * 0.5, hb.y + hb.h * 0.35, 18, player.facing > 0 ? 0.14 : Math.PI - 0.14);
          applyArrowHit(false);
        }
      }
    }
  }

  function spawnSlantBeam(attacker, atkIdx) {
    if (!attacker || gameState !== "playing") return;
    const dir = attacker.facing >= 0 ? 1 : -1;
    const isWarIce = (atkIdx | 0) === ATK_SLANT_WAR;
    const bx = isWarIce
      ? attacker.x + attacker.w * 0.5 + dir * 64
      : attacker.x + attacker.w * 0.5 + dir * 24;
    const by = isWarIce ? attacker.y - 38 : attacker.y - attacker.h * 0.46;
    slantBeams.push({
      x: bx,
      y: by,
      vx: isWarIce ? 0 : 8.6 * dir,
      vy: isWarIce ? 0 : -6.4,
      iceFacing: isWarIce ? dir : 0,
      age: 0,
      life: isWarIce ? 620 : SLANT_BEAM_LIFE_MS,
      w: isWarIce ? 232 : 26,
      h: isWarIce ? 172 : 54,
      atkIdx,
      fromPlayer: attacker === player,
      hitDummy: false,
      hitFoe: false,
    });
    if (isWarIce) {
      spawnFrostBreakBurst(bx + dir * 124, by - 122, dir, 36);
    } else {
      spawnParticles(attacker.x + attacker.w * 0.5 + dir * 18, attacker.y - attacker.h * 0.5, 14, dir > 0 ? 0.22 : Math.PI - 0.22);
    }
  }

  function spawnSlashWave(attacker) {
    if (!attacker || gameState !== "playing") return;
    const dir = attacker.facing >= 0 ? 1 : -1;
    const pow = Math.min(100, Math.max(18, attacker._slashPower | 0));
    const x0 = attacker.x + attacker.w * 0.5 + dir * 30;
    slashWaves.push({
      x0,
      tip: x0,
      vx: 13.6 + pow * 0.065,
      facing: dir,
      maxDist: 210 + pow * 2.75,
      y: attacker.y - 6,
      h: 36,
      age: 0,
      life: SLASH_WAVE_LIFE_MS,
      atkIdx: ATK_SLASH_WAR,
      dmgMul: 0.74 + pow * 0.0048,
      fromPlayer: true,
      hitDummy: false,
      hitFoe: false,
    });
    spawnSlamShock(x0 + dir * 40, attacker.y);
    spawnRedBurstParticles(x0 + dir * 28, attacker.y - attacker.h * 0.38, 26, Math.PI * 0.95);
    screenShake = Math.min(22, screenShake + 8);
  }

  function spawnArcherFanArrows() {
    if (!player || gameState !== "playing") return;
    const dir = player.facing >= 0 ? 1 : -1;
    const sx = player.x + player.w * 0.5 + dir * 26;
    const sy = player.y - player.h * 0.58;
    const spd = 12.2 * ARCHER_ARROW_SPEED_MUL;
    const fanAng = 0.46;
    for (let i = -1; i <= 1; i++) {
      const ang = i * fanAng;
      arrows.push({
        x: sx,
        y: sy + i * 10,
        vx: Math.cos(ang) * spd * dir,
        vy: -6.2 + Math.sin(Math.abs(ang)) * -3.6,
        age: 0,
        life: 1650,
        weak: false,
        atkIdxSnap: ATK_SLANT_ARCH,
        fanVolley: true,
      });
    }
  }

  function spawnArcherVolleyArrows() {
    if (!player || gameState !== "playing") return;
    const dir = player.facing >= 0 ? 1 : -1;
    const pow = Math.min(100, Math.max(18, player._slashPower | 0));
    const sx = player.x + player.w * 0.5 + dir * 26;
    const sy = player.y - player.h * 0.78;
    const spd = (11.8 + pow * 0.042) * ARCHER_ARROW_SPEED_MUL;
    const dyOff = [-38, 0, 38];
    for (let i = 0; i < 3; i++) {
      arrows.push({
        x: sx + dir * i * 10,
        y: sy + dyOff[i],
        vx: spd * dir,
        vy: 0,
        age: 0,
        life: 2400,
        weak: false,
        atkIdxSnap: ATK_VOLLEY_ARCH,
        volley: true,
        dmgScale: 0.82 + pow * 0.0045,
      });
    }
    spawnParticles(sx, sy, 22, dir > 0 ? 0.06 : Math.PI - 0.06);
  }

  /** 弓手空中 S+J / S+A/D+J：射箭并给予向上速度（无俯冲） */
  function spawnArcherAirShotArrows(wide) {
    if (!player || gameState !== "playing" || player.charType !== "archer") return;
    const dir = player.facing >= 0 ? 1 : -1;
    const sx = player.x + player.w * 0.5 + dir * 24;
    const sy = player.y - player.h * 0.52;
    const spd = 15.8 * ARCHER_ARROW_SPEED_MUL;
    player.vy = Math.min(player.vy - (wide ? 10.2 : 11), -5.8);
    player.vx += dir * (wide ? 2.4 : 1.2);
    if (wide) {
      const baseAng = dir > 0 ? Math.PI / 4 : (3 * Math.PI) / 4;
      const fanSpread = [-0.085, 0, 0.085];
      const ys = [-8, 0, 8];
      for (let i = 0; i < 3; i++) {
        const ang = baseAng + fanSpread[i];
        arrows.push({
          x: sx + dir * i * 6,
          y: sy + ys[i],
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          age: 0,
          life: ARROW_LIFE_MS,
          weak: false,
          atkIdxSnap: ATK_ARCHER_AIR_VOLLEY,
          dmgScale: 1.06,
          airLaser: true,
        });
      }
    } else {
      for (let i = -1; i <= 1; i++) {
        arrows.push({
          x: sx + i * 7,
          y: sy + 8,
          vx: dir * (3.8 + i * 3.2),
          vy: 12.8 + Math.abs(i) * 0.65,
          age: 0,
          life: ARROW_LIFE_MS,
          weak: false,
          atkIdxSnap: ATK_ARCHER_AIR_VOLLEY,
          dmgScale: 1.03,
        });
      }
    }
    spawnParticles(sx, sy - 8, 15, dir > 0 ? 0.07 : Math.PI - 0.07);
  }

  function projectileRawDamage(attacker, atkIdx, dmgMul) {
    const A = ATTACKS[Math.min(Math.max(0, atkIdx | 0), ATTACKS.length - 1)];
    const base = 8;
    const comboSteps = Math.min(Math.max(0, attacker.combo - 1), 9);
    const comboBonus = Math.floor(comboSteps * 1.35);
    const airMul = attacker.onGround ? 1 : 1.25;
    let raw = Math.floor((base + comboBonus) * airMul * (A && A.dmg ? A.dmg : 1));
    const m = Number(dmgMul);
    if (Number.isFinite(m) && m > 0) raw = Math.max(1, Math.floor(raw * m));
    return raw;
  }

  function tickSlantBeams(dt) {
    if (!slantBeams.length || gameState !== "playing") return;
    const ww = map.worldW || D.WORLD_W;
    for (let i = slantBeams.length - 1; i >= 0; i--) {
      const b = slantBeams[i];
      b.age += dt;
      b.x += b.vx;
      b.y += b.vy;
      if (b.age >= b.life || b.x < -140 || b.x > ww + 140 || b.y < -120 || b.y > H + 40) {
        slantBeams.splice(i, 1);
        continue;
      }
      const atkIdx = b.atkIdx | 0;
      const attacker = b.fromPlayer ? player : foe;
      if (!attacker) continue;
      const rx = b.x - b.w * 0.5;
      const ry = b.y - b.h;
      const hbB = { x: rx, y: ry, w: b.w, h: b.h };

      const applyBeam = (isDummy) => {
        const rawDmg = projectileRawDamage(attacker, atkIdx, 1);
        if (attacker.comboTimer > 0) attacker.combo += 1;
        else attacker.combo = 1;
        attacker.comboTimer = 380;
        const tier =
          attacker.combo >= 12 ? "#f472b6" : attacker.combo >= 7 ? "#a78bfa" : attacker.combo >= 4 ? "#6ee7b7" : "#fcd34d";
        if (attacker === player) totalDamage += rawDmg;
        if (attacker === player && attacker.combo > maxComboEver) maxComboEver = attacker.combo;
        if (isDummy) applyDamage(attacker, null, true, rawDmg, tier, false, atkIdx);
        else applyDamage(attacker, foe, false, rawDmg, tier, false, atkIdx);
        hitStopGlobal = Math.min(11, hitStopGlobal + 5);
        if (atkIdx !== ATK_SLANT_WAR) slantBeams.splice(i, 1);
      };

      if (settings.mode === "dummy" && b.fromPlayer) {
        const dh = dummyHurtbox();
        if (!b.hitDummy && rectsOverlap(hbB.x, hbB.y, hbB.w, hbB.h, dh.x, dh.y, dh.w, dh.h)) {
          b.hitDummy = true;
          spawnParticles(dh.x + dh.w * 0.5, dh.y + dh.h * 0.35, 20, player.facing > 0 ? 0.14 : Math.PI - 0.14);
          applyBeam(true);
        }
      } else if (foe && b.fromPlayer && !b.hitFoe) {
        if (defenderHurtImmune(foe)) continue;
        const hb = hurtbox(foe);
        const lowHit = atkIdx === 4 || atkIdx === 5;
        if (rectsOverlap(hbB.x, hbB.y, hbB.w, hbB.h, hb.x, hb.y, hb.w, hb.h)) {
          if (foe.dashFrames > 5) continue;
          const blocked = !!foe.guarding && !lowHit;
          if (blocked) {
            const rawDmg = projectileRawDamage(attacker, atkIdx, 1);
            const chip = Math.max(1, Math.floor(rawDmg * 0.22));
            if (player.comboTimer > 0) player.combo += 1;
            else player.combo = 1;
            player.comboTimer = 380;
            const tier =
              player.combo >= 12 ? "#f472b6" : player.combo >= 7 ? "#a78bfa" : player.combo >= 4 ? "#6ee7b7" : "#fcd34d";
            totalDamage += chip;
            if (player.combo > maxComboEver) maxComboEver = player.combo;
            applyDamage(player, foe, false, chip, tier, true, atkIdx);
            if (atkIdx !== ATK_SLANT_WAR) {
              slantBeams.splice(i, 1);
            } else {
              b.hitFoe = true;
            }
            continue;
          }
          b.hitFoe = true;
          spawnParticles(hb.x + hb.w * 0.5, hb.y + hb.h * 0.35, 20, player.facing > 0 ? 0.14 : Math.PI - 0.14);
          applyBeam(false);
        }
      }
    }
  }

  function tickSlashWaves(dt) {
    if (!slashWaves.length || gameState !== "playing") return;
    const ww = map.worldW || D.WORLD_W;
    for (let i = slashWaves.length - 1; i >= 0; i--) {
      const sw = slashWaves[i];
      sw.age += dt;
      const face = sw.facing >= 0 ? 1 : -1;
      sw.tip += sw.vx * face;
      if (Math.abs(sw.tip - sw.x0) > sw.maxDist || sw.age >= sw.life || sw.tip < -100 || sw.tip > ww + 100) {
        slashWaves.splice(i, 1);
        continue;
      }
      const atkIdx = sw.atkIdx | 0;
      const left = Math.min(sw.x0, sw.tip);
      const waveW = Math.abs(sw.tip - sw.x0) + 28;
      const hbW = { x: left - 8, y: sw.y - sw.h, w: waveW, h: sw.h };

      const applySlash = (isDummy) => {
        const rawDmg = projectileRawDamage(player, atkIdx, sw.dmgMul || 1);
        if (player.comboTimer > 0) player.combo += 1;
        else player.combo = 1;
        player.comboTimer = 380;
        const tier =
          player.combo >= 12 ? "#f472b6" : player.combo >= 7 ? "#a78bfa" : player.combo >= 4 ? "#6ee7b7" : "#fcd34d";
        totalDamage += rawDmg;
        if (player.combo > maxComboEver) maxComboEver = player.combo;
        if (isDummy) applyDamage(player, null, true, rawDmg, tier, false, atkIdx);
        else applyDamage(player, foe, false, rawDmg, tier, false, atkIdx);
        hitStopGlobal = Math.min(13, hitStopGlobal + 6);
        slashWaves.splice(i, 1);
      };

      if (settings.mode === "dummy" && sw.fromPlayer && !sw.hitDummy) {
        const dh = dummyHurtbox();
        if (rectsOverlap(hbW.x, hbW.y, hbW.w, hbW.h, dh.x, dh.y, dh.w, dh.h)) {
          sw.hitDummy = true;
          spawnParticles(dh.x + dh.w * 0.5, dh.y + dh.h * 0.38, 26, 0.12);
          applySlash(true);
        }
      } else if (foe && sw.fromPlayer && !sw.hitFoe) {
        if (defenderHurtImmune(foe)) continue;
        const hb = hurtbox(foe);
        const blocked = !!foe.guarding;
        if (rectsOverlap(hbW.x, hbW.y, hbW.w, hbW.h, hb.x, hb.y, hb.w, hb.h)) {
          if (foe.dashFrames > 5) continue;
          if (blocked) {
            const rawDmg = projectileRawDamage(player, atkIdx, sw.dmgMul || 1);
            const chip = Math.max(1, Math.floor(rawDmg * 0.22));
            if (player.comboTimer > 0) player.combo += 1;
            else player.combo = 1;
            player.comboTimer = 380;
            const tier =
              player.combo >= 12 ? "#f472b6" : player.combo >= 7 ? "#a78bfa" : player.combo >= 4 ? "#6ee7b7" : "#fcd34d";
            totalDamage += chip;
            if (player.combo > maxComboEver) maxComboEver = player.combo;
            applyDamage(player, foe, false, chip, tier, true, atkIdx);
            slashWaves.splice(i, 1);
            continue;
          }
          sw.hitFoe = true;
          spawnParticles(hb.x + hb.w * 0.5, hb.y + hb.h * 0.36, 26, player.facing > 0 ? 0.12 : Math.PI - 0.12);
          applySlash(false);
        }
      }
    }
  }

  function curAtk(f) {
    const i = f.atkIdx | 0;
    const idx = i < ATTACKS.length ? i : 0;
    if (typeof D.resolveAttackForFighter === "function") return D.resolveAttackForFighter(f, idx);
    return ATTACKS[idx];
  }

  function nextStandCancel(idx, wHeld) {
    if (idx === 12) return 0;
    if (idx >= 13 && idx < ATK_PILLAR_DROP) return 0;
    if (idx === 3 && wHeld) return 7;
    if (idx === 3) return 9;
    if (idx === 7) return 9;
    if (idx === 9) return 10;
    if (idx === 10 || idx === 11) return 0;
    if (idx >= 0 && idx <= 2) return idx + 1;
    return 0;
  }

  /** 脚底 y 与最底层可走面同高或更低的一律视为「主地面」，不可 S+K 穿落 */
  const MAIN_FLOOR_Y = D.H - 80;

  function findSupportingPlatformIndex(f) {
    const eps = 4;
    let bestY = Infinity;
    let pi = -1;
    for (let i = 0; i < platforms.length; i++) {
      const p = platforms[i];
      if (f.x + f.w <= p.x || f.x >= p.x + p.w) continue;
      if (Math.abs(f.y - p.y) <= eps && p.y < bestY) {
        bestY = p.y;
        pi = i;
      }
    }
    return pi;
  }

  /** 蹲姿按 K：若站在上层台面则从台面落下（不占蹲跳踢） */
  function tryDropThroughPlatform(f) {
    if (!f.onGround || (f.platformDropCd | 0) > 0) return false;
    if (f.hitStun > 0 || f.guardRecoilStun > 0 || (f.downTimer | 0) > 0) return false;
    if (f.attackPhase !== 0 || f.dashFrames > 0) return false;
    const pi = findSupportingPlatformIndex(f);
    if (pi < 0) return false;
    const p = platforms[pi];
    if (p.y >= MAIN_FLOOR_Y) return false;
    f.y = p.y + 10;
    f.vy = 3.2;
    f.onGround = false;
    f.coyote = 0;
    f.jumpBuffer = 0;
    f.platformDropCd = 18;
    f._dropIgnorePi = pi;
    spawnParticles(f.x + f.w * 0.5, p.y + 6, 9, Math.PI * 0.5);
    return true;
  }

  function applyPlatformPhysics(f) {
    if ((f.atkIdx | 0) === ATK_PILLAR_DROP) {
      const Ap = ATTACKS[ATK_PILLAR_DROP];
      const ap = f.attackPhase | 0;
      if (ap >= Ap.act0 && ap <= Ap.act1) {
        const gy = lowestSurfaceYAt(f.x, f.w, platforms);
        f.vy = Math.min((f.vy || 0) + 0.88, 29);
        const nextY = f.y + f.vy;
        if (nextY >= gy - 0.35) {
          f.y = gy;
          f.vy = 0;
          f.onGround = true;
          f.coyote = 8;
          f._pillarForceRecover = true;
        } else {
          f.y = nextY;
          f.onGround = false;
          f.coyote = Math.max(0, f.coyote - 1);
        }
        f.x += f.vx;
        if ((f.platformDropCd | 0) > 0) {
          f.platformDropCd--;
          if (f.platformDropCd <= 0) f._dropIgnorePi = -1;
        }
        return;
      }
    }
    if ((f.atkIdx | 0) === ATK_AIR_STREAK && f.charType === "warrior") {
      const Ap = ATTACKS[ATK_AIR_STREAK];
      const ap = f.attackPhase | 0;
      if (ap >= Ap.act0 && ap <= Ap.act1) {
        const dir = f.facing >= 0 ? 1 : -1;
        f.vy = Math.min((f.vy || 0) + 0.68, 26);
        const gy = lowestSurfaceYAt(f.x, f.w, platforms);
        const nextY = f.y + f.vy;
        if (nextY >= gy - 0.45) {
          f.y = gy;
          f.vy = 0;
          f.vx *= 0.38;
          f.onGround = true;
          f.coyote = 8;
          f._pendingAirStreakLand = true;
        } else {
          f.y = nextY;
          f.onGround = false;
          f.coyote = Math.max(0, f.coyote - 1);
        }
        f.x += dir * 12.5;
        f.vx = dir * 11;
        if ((f.platformDropCd | 0) > 0) {
          f.platformDropCd--;
          if (f.platformDropCd <= 0) f._dropIgnorePi = -1;
        }
        return;
      }
    }
    f.vy = Math.min(f.vy + 0.52, 16);
    const nextY = f.y + f.vy;
    let best = Infinity;
    const ign = (f._dropIgnorePi | 0);
    for (let pi = 0; pi < platforms.length; pi++) {
      const p = platforms[pi];
      if ((f.platformDropCd | 0) > 0 && pi === ign) continue;
      if (f.x + f.w <= p.x || f.x >= p.x + p.w) continue;
      if (f.y <= p.y && nextY >= p.y) {
        if (p.y < best) best = p.y;
      }
    }
    if (best !== Infinity) {
      f.y = best;
      f.vy = 0;
      f.onGround = true;
      f.coyote = 8;
    } else {
      f.y = nextY;
      f.onGround = false;
      f.coyote = Math.max(0, f.coyote - 1);
    }
    f.x += f.vx;
    if ((f.platformDropCd | 0) > 0) {
      f.platformDropCd--;
      if (f.platformDropCd <= 0) f._dropIgnorePi = -1;
    }
  }

  function clampWorldX(f) {
    const margin = 24;
    const ww = map.worldW || D.WORLD_W;
    f.x = Math.max(margin, Math.min(ww - margin - f.w, f.x));
  }

  /** 脚底低于「最低可走台面」过远视为坠入场外 */
  function computeFallKillFeetY() {
    if (!platforms || !platforms.length) return H + 120;
    let maxTop = -Infinity;
    for (const p of platforms) {
      if (p.y > maxTop) maxTop = p.y;
    }
    return Number.isFinite(maxTop) ? maxTop + 200 : H + 120;
  }

  function respawnFighterFromFall(f, spawnFeetX) {
    f.x = spawnFeetX;
    clampWorldX(f);
    f.y = surfaceYAt(f.x, f.w, platforms);
    f.vx = 0;
    f.vy = 0;
    f.onGround = true;
    f.coyote = 8;
    f.attackPhase = 0;
    f.atkIdx = 0;
    f.landedHitThisSwing = false;
    f.dashFrames = 0;
    f.dashCd = 0;
    f.guarding = false;
    f.crouchHeldDraw = false;
    f.crouchMove = false;
    f.jumpBuffer = 0;
    f.airJumpsLeft = EXTRA_AIR_JUMPS;
    f.orbCd = 0;
    f.downTimer = 0;
    f.getupInvuln = 0;
    f.slashCharge = 0;
    f.platformDropCd = 0;
    f._dropIgnorePi = -1;
    f._pillarHitDummy = false;
    f._pillarHitFoe = false;
    f._pillarHitPlayer = false;
    f._pillarForceRecover = false;
    f.hitStun = 0;
    f.hitReactKind = "";
    f.hitReactMax = 0;
    f.hitPushDir = 0;
    f.guardRecoilStun = 0;
    f.blockFlash = 0;
    f.hitFlash = 0;
    f._sDropShockDone = false;
  }

  /** 血量归零时的关卡结算（与 applyDamage 共用） */
  function checkEliminatedFromHp(defender) {
    if (!defender || defender.hp > 0) return;
    if (defender === player) {
      pauseGame("lose");
      return;
    }
    if (settings.mode === "dummy") return;
    if (defender !== foe) return;
    if (settings.mode === "challenge" && challengeWave < CHALLENGE_MAX) {
      challengeWave += 1;
      resetPositions(false);
      spawnFloatText(player.x + 40, player.y - 120, "第 " + challengeWave + " 关！", "#6ee7b7", 1.2);
    } else {
      pauseGame("win");
      spawnFloatText(player.x + 20, player.y - 140, "胜利！", "#fde68a", 1.4);
    }
  }

  /**
   * 坠入地图下方虚空：扣血并在存活时重生至出生点。
   * @param {boolean} isPlayerChar 是否玩家（用于连击清零与结算）
   */
  function tryPitFall(f, spawnFeetX, isPlayerChar) {
    if (!f || gameState !== "playing") return;
    const killY = computeFallKillFeetY();
    if (f.y <= killY) return;

    const dmg = Math.max(14, Math.floor(f.maxHp * 0.14));
    f.hp = Math.max(0, f.hp - dmg);
    const cx = f.x + f.w * 0.5;
    spawnFloatText(cx, Math.min(f.y - f.h * 0.5, killY - 24), "坠落 -" + dmg, "#fb923c", 1.12);
    spawnParticles(cx, Math.min(f.y - 8, killY + 8), 16, Math.PI * 0.95);
    screenShake = Math.min(22, screenShake + 14);

    const dead = f.hp <= 0;
    if (!dead) {
      respawnFighterFromFall(f, spawnFeetX);
      if (isPlayerChar) {
        player.combo = 0;
        player.comboTimer = 0;
      } else if (foe && f === foe) {
        foe.combo = 0;
        foe.comboTimer = 0;
      }
      spawnFloatText(f.x + f.w * 0.5, f.y - f.h - 10, "重生", "#94a3b8", 0.92);
    } else {
      f.vx = 0;
      f.vy = 0;
      f.attackPhase = 0;
      f.atkIdx = 0;
    }

    updateHudHp();
    if (isPlayerChar) checkEliminatedFromHp(player);
    else checkEliminatedFromHp(foe);
  }

  function tickFighter(f, input, isPlayer) {
    if ((f.getupInvuln | 0) > 0) f.getupInvuln--;
    if ((f.airCombatCd | 0) > 0) f.airCombatCd -= 1;

    if ((f.downTimer | 0) > 0) {
      f.downTimer--;
      f.dashFrames = 0;
      f.attackPhase = 0;
      f.atkIdx = 0;
      f.guarding = false;
      f.crouchHeldDraw = false;
      f.crouchMove = false;
      f.blockFlash = 0;
      f.guardRecoilStun = 0;
      f.vx *= 0.9;
      applyPlatformPhysics(f);
      clampWorldX(f);
      if (f.downTimer <= 0) {
        f.getupInvuln = GETUP_INVULN_FRAMES;
        f.hitReactKind = "";
        f.hitReactMax = 0;
        f.hitPushDir = 0;
      }
      if (isPlayer) {
        prevJ = keys.j;
        prevK = keys.k;
        prevL = keys.l;
        prevU = keys.u;
      }
      return;
    }

    if (f.guardRecoilStun > 0) {
      f.guardRecoilStun -= 1;
      f.dashFrames = 0;
      f.vx *= 0.9;
      f.attackPhase = 0;
      f.atkIdx = 0;
      f.guarding = false;
      f.crouchHeldDraw = false;
      f.crouchMove = false;
      f.blockFlash = 0;
      f._sDropShockDone = false;
      applyPlatformPhysics(f);
      clampWorldX(f);
      if (isPlayer) {
        prevJ = keys.j;
        prevK = keys.k;
        prevL = keys.l;
        prevU = keys.u;
      }
      return;
    }
    if (f.hitStun > 0) {
      f.hitStun -= 1;
      f.dashFrames = 0;
      f.vx *= 0.88;
      f.attackPhase = 0;
      f.atkIdx = 0;
      f.guarding = false;
      f.crouchHeldDraw = false;
      f.crouchMove = false;
      f.blockFlash = 0;
      f._sDropShockDone = false;
      f.guardRecoilStun = 0;
      applyPlatformPhysics(f);
      clampWorldX(f);
      if (f.hitStun <= 0) {
        f.hitReactKind = "";
        f.hitReactMax = 0;
        f.hitPushDir = 0;
      }
      if (isPlayer) {
        prevJ = keys.j;
        prevK = keys.k;
        prevL = keys.l;
        prevU = keys.u;
      }
      return;
    }

    const moveAccel = 0.85;
    const maxRun = 5.2;
    const friction = 0.82;
    const ap = f.attackPhase;
    const A0 = curAtk(f);
    const rooted = f.onGround && ap >= 4 && ap <= A0.rootedEnd;
    if (f.onGround) f.airJumpsLeft = EXTRA_AIR_JUMPS;
    syncFighterStance(f, input);
    const crouchSlow = f.onGround && input.s;
    const runCap = crouchSlow ? maxRun * 0.48 : maxRun;

    if (f.dashCd > 0) f.dashCd -= 1;
    const skipMoveForDash = f.dashFrames > 0;

    if (!rooted && !skipMoveForDash) {
      if (input.a) {
        f.vx -= moveAccel * (crouchSlow ? 0.75 : 1);
        f.facing = -1;
      }
      if (input.d) {
        f.vx += moveAccel * (crouchSlow ? 0.75 : 1);
        f.facing = 1;
      }
      if (!input.a && !input.d) f.vx *= friction;
      f.vx = Math.max(-runCap, Math.min(runCap, f.vx));
    } else if (rooted) {
      f.vx *= 0.88;
    }
    if (!rooted && !skipMoveForDash && f.guarding && f.onGround) {
      f.vx *= 0.88;
    }

    if (isPlayer) {
      if (keys.k && !prevK) {
        if (crouchSlow && f.attackPhase === 0) {
          if (!tryDropThroughPlatform(f)) {
            f.atkIdx = 6;
            f.attackPhase = 1;
            f.landedHitThisSwing = false;
            f.vy = -8.2;
            f.vx += f.facing * 5.2;
            f.onGround = false;
            f.jumpBuffer = 0;
            spawnParticles(f.x + f.w * 0.5 + f.facing * 8, f.y - 4, 8, Math.PI * 0.5);
          }
        } else {
          f.jumpBuffer = 12;
        }
      }
      prevK = keys.k;

      const canGroundJump = f.onGround || f.coyote > 0;
      const canAirJump =
        !canGroundJump &&
        (f.airJumpsLeft | 0) > 0 &&
        f.attackPhase === 0 &&
        f.hitStun <= 0 &&
        f.guardRecoilStun <= 0;
      if (f.jumpBuffer > 0 && canGroundJump) {
        f.vy = -11.2;
        f.onGround = false;
        f.coyote = 0;
        f.jumpBuffer = 0;
      } else if (f.jumpBuffer > 0 && canAirJump) {
        f.vy = -9.85;
        f.jumpBuffer = 0;
        f.airJumpsLeft = Math.max(0, (f.airJumpsLeft | 0) - 1);
        spawnParticles(f.x + f.w * 0.5 + f.vx * 0.08, f.y - 2, 7, Math.PI * 0.48);
      } else if (f.jumpBuffer > 0) {
        f.jumpBuffer -= 1;
      }
    }

    if (isPlayer) {
      const jPressed = keys.j && !prevJ;
      const Ac = curAtk(f);
      const inCancel = f.attackPhase > 0 && f.attackPhase >= Ac.cancel0 && f.attackPhase <= Ac.cancel1;
      if (jPressed && f.attackPhase === 0) {
        f.dashFrames = 0;
        if (f.crouchMove) {
          f.atkIdx = 4;
        } else if (keys.s && f.onGround) {
          f.atkIdx = ATK_PILLAR_DROP;
          f._sDropShockDone = false;
          f._pillarHitDummy = false;
          f._pillarHitFoe = false;
          f._pillarHitPlayer = false;
          f._pillarForceRecover = false;
        } else if (keys.s && !f.onGround && (keys.a || keys.d) && (f.airCombatCd | 0) <= 0) {
          if (f.charType === "archer") {
            f.atkIdx = ATK_ARCHER_AIR_VOLLEY;
            f.facing = keys.a ? -1 : 1;
            f._archerAirShotWide = true;
            f._archerAirShotSpawned = false;
            f._sDropShockDone = false;
          } else {
            f.atkIdx = ATK_AIR_STREAK;
            f.facing = keys.a ? -1 : 1;
            f._pendingAirStreakLand = false;
            f._sDropShockDone = false;
          }
          f.airCombatCd = AIR_COMBAT_SPECIAL_CD;
        } else if (keys.s && !f.onGround && (f.airCombatCd | 0) <= 0) {
          if (f.charType === "archer") {
            f.atkIdx = ATK_ARCHER_AIR_VOLLEY;
            f._archerAirShotWide = false;
            f._archerAirShotSpawned = false;
            f._sDropShockDone = false;
          } else {
            f.atkIdx = 11;
            f._sDropShockDone = false;
          }
          f.airCombatCd = AIR_COMBAT_SPECIAL_CD;
        } else if (keys.w && !f.onGround) {
          f.atkIdx = 8;
        } else if (keys.w && f.onGround) {
          f.atkIdx = 7;
        } else {
          f.atkIdx = 0;
        }
        f.attackPhase = 1;
        f.landedHitThisSwing = false;
        f._arrowSpawnedThisSwing = false;
        f._archerArrowSpawnMask = 0;
        if (f.charType === "archer" && f.atkIdx >= 0 && f.atkIdx <= 3) {
          f._archerJMelee = horizDistToTargetFor(f) < ARCHER_MELEE_DIST;
        }
      } else if (jPressed && inCancel) {
        f.dashFrames = 0;
        f.landedHitThisSwing = false;
        f.attackPhase = 1;
        f._arrowSpawnedThisSwing = false;
        f._archerArrowSpawnMask = 0;
        if (keys.s && !f.onGround && (keys.a || keys.d) && (f.airCombatCd | 0) <= 0) {
          if (f.charType === "archer") {
            f.atkIdx = ATK_ARCHER_AIR_VOLLEY;
            f.facing = keys.a ? -1 : 1;
            f._archerAirShotWide = true;
            f._archerAirShotSpawned = false;
            f._sDropShockDone = false;
          } else {
            f.atkIdx = ATK_AIR_STREAK;
            f.facing = keys.a ? -1 : 1;
            f._pendingAirStreakLand = false;
            f._sDropShockDone = false;
          }
          f.airCombatCd = AIR_COMBAT_SPECIAL_CD;
        } else if (keys.s && !f.onGround && (f.airCombatCd | 0) <= 0) {
          if (f.charType === "archer") {
            f.atkIdx = ATK_ARCHER_AIR_VOLLEY;
            f._archerAirShotWide = false;
            f._archerAirShotSpawned = false;
            f._sDropShockDone = false;
          } else {
            f.atkIdx = 11;
            f._sDropShockDone = false;
          }
          f.airCombatCd = AIR_COMBAT_SPECIAL_CD;
        } else if (keys.s) {
          if (f.atkIdx < 4) f.atkIdx = 4;
          else if (f.atkIdx === 4) f.atkIdx = 5;
          else if (f.atkIdx === 5) f.atkIdx = 4;
          else f.atkIdx = 4;
        } else {
          if (f.atkIdx === 6) {
            f.atkIdx = 0;
          } else if (f.atkIdx === 4 || f.atkIdx === 5) {
            if (f.atkIdx === 4) f.atkIdx = 5;
            else f.atkIdx = 4;
          } else {
            f.atkIdx = nextStandCancel(f.atkIdx, keys.w);
          }
        }
        if (f.charType === "archer" && f.atkIdx >= 0 && f.atkIdx <= 3) {
          f._archerJMelee = horizDistToTargetFor(f) < ARCHER_MELEE_DIST;
        }
      }
      const dashOk =
        keys.l &&
        !prevL &&
        f.dashCd <= 0 &&
        f.hitStun <= 0 &&
        f.attackPhase === 0 &&
        f.dashFrames <= 0;
      if (dashOk) {
        f.dashFrames = 15;
        f.dashCd = 52;
        f.dashDir = keys.d ? 1 : keys.a ? -1 : f.facing;
        f.facing = f.dashDir;
        spawnParticles(f.x + f.w * 0.5 - f.dashDir * 8, f.y - 26, 11, f.dashDir > 0 ? 0.15 : Math.PI - 0.15);
      }
      prevJ = keys.j;
      prevL = keys.l;

      const canSpecial =
        f.hitStun <= 0 &&
        f.guardRecoilStun <= 0 &&
        f.attackPhase === 0 &&
        f.dashFrames <= 0 &&
        (f.downTimer | 0) <= 0 &&
        !defenderHurtImmune(f);

      if (prevU && !keys.u) {
        if (keys.s && (f.slashCharge | 0) >= 22 && canSpecial && f.orbCd <= 0) {
          f.atkIdx = f.charType === "archer" ? ATK_VOLLEY_ARCH : ATK_SLASH_WAR;
          f.attackPhase = 1;
          f.landedHitThisSwing = false;
          f._slashWaveSpawned = false;
          f._volleySpawned = false;
          f._slashPower = f.slashCharge | 0;
          f.slashCharge = 0;
          f.orbCd = ORB_CD_MS;
        } else if (!keys.s) {
          f.slashCharge = 0;
        } else {
          f.slashCharge = 0;
        }
      }
      if (keys.s && keys.u && canSpecial && f.orbCd <= 0) {
        f.slashCharge = Math.min(100, (f.slashCharge | 0) + 3);
      }

      const uPress = keys.u && !prevU;
      if (uPress && canSpecial && f.orbCd <= 0) {
        if (f.onGround && keys.w && (keys.a || keys.d)) {
          f.facing = keys.a ? -1 : 1;
          f.atkIdx = f.charType === "archer" ? ATK_SLANT_ARCH : ATK_SLANT_WAR;
          f.attackPhase = 1;
          f.landedHitThisSwing = false;
          f._slantSpawned = false;
          f.orbCd = ORB_CD_MS;
        } else if (!keys.s) {
          firePlayerOrbBlast();
        }
      }
      prevU = keys.u;
    }

    if (f.dashFrames > 0) {
      f.dashFrames -= 1;
      const dashMul = f.charType === "archer" ? ARCHER_DASH_SPEED_MUL : 1;
      f.vx = f.dashDir * DASH_SPEED_PLAYER * dashMul;
    }

    const ApillarAtk = ATTACKS[ATK_PILLAR_DROP];
    const pillarTrack =
      (f.atkIdx | 0) === ATK_PILLAR_DROP &&
      (f.attackPhase | 0) >= ApillarAtk.act0 &&
      (f.attackPhase | 0) <= ApillarAtk.act1;
    const prevFootPillar = pillarTrack ? f.y : 0;
    if ((f.atkIdx | 0) === ATK_PILLAR_DROP && f.attackPhase === ApillarAtk.act0 && f.onGround) {
      f.vy = 19;
      f.onGround = false;
    }

    const preGroundMove = f.onGround;
    applyPlatformPhysics(f);
    maybeSlamLandShock(f, preGroundMove);

    if (f.attackPhase > 0) {
      if ((f.atkIdx | 0) === ATK_AIR_STREAK && f._pendingAirStreakLand) {
        f._pendingAirStreakLand = false;
        f.attackPhase = ATTACKS[ATK_AIR_STREAK].total;
      }
      if (
        isPlayer &&
        f.atkIdx === ATK_QI_WINDUP &&
        f.attackPhase >= 3 &&
        f.attackPhase < 11 &&
        f.attackPhase % 3 === 0
      ) {
        spawnRedBurstParticles(f.x + f.w * 0.5, f.y - f.h * 0.58, 6, Math.PI * 1.05);
      }
      if (
        isPlayer &&
        (f.atkIdx | 0) === ATK_ARCHER_AIR_VOLLEY &&
        (f.attackPhase | 0) === ATTACKS[ATK_ARCHER_AIR_VOLLEY].act0 &&
        !f._archerAirShotSpawned
      ) {
        spawnArcherAirShotArrows(!!f._archerAirShotWide);
        f._archerAirShotSpawned = true;
      }
      if (
        isPlayer &&
        (f.atkIdx | 0) === ATK_AIR_STREAK &&
        f.charType === "warrior" &&
        !f.onGround &&
        (f.attackPhase | 0) >= ATTACKS[ATK_AIR_STREAK].act0 &&
        (f.attackPhase | 0) <= ATTACKS[ATK_AIR_STREAK].act1 &&
        (f.attackPhase & 1) === 0
      ) {
        const rd = f.facing >= 0 ? 1 : -1;
        spawnRedBurstParticles(f.x + f.w * 0.5 - rd * 16, f.y - f.h * 0.44, 5, Math.PI * 0.58);
      }
      if (isPlayer && f.atkIdx === ATK_QI_WINDUP && f.attackPhase === 11 && !f._uOrbSpawned) {
        const dir = f.facing >= 0 ? 1 : -1;
        const ox = f.x + f.w * 0.5 + dir * 38;
        const oy = f.y - f.h * 0.56;
        orbBlasts.push({
          x: ox,
          y: oy,
          vx: ORB_VX * dir,
          age: 0,
          life: ORB_LIFE_MS,
          fromPlayer: true,
        });
        f._uOrbSpawned = true;
        spawnParticles(ox - dir * 6, oy + 4, 20, dir > 0 ? 0.06 : Math.PI - 0.06);
      }
      if (isPlayer && f.atkIdx === ATK_SLANT_WAR && f.attackPhase === 7 && !f._slantSpawned) {
        spawnSlantBeam(player, ATK_SLANT_WAR);
        f._slantSpawned = true;
      }
      if (isPlayer && f.atkIdx === ATK_SLANT_ARCH && f.attackPhase === 6 && !f._slantSpawned) {
        spawnArcherFanArrows();
        f._slantSpawned = true;
      }
      if (isPlayer && f.atkIdx === ATK_SLASH_WAR && f.attackPhase === 7 && !f._slashWaveSpawned) {
        spawnSlashWave(player);
        f._slashWaveSpawned = true;
      }
      if (isPlayer && f.atkIdx === ATK_VOLLEY_ARCH && f.attackPhase === curAtk(f).act0 && !f._volleySpawned) {
        spawnArcherVolleyArrows();
        f._volleySpawned = true;
      }
      if (isPlayer && archerArrowStandSwing(f)) {
        const Ap = curAtk(f);
        const plan = archerStandRangedArrowPlan(f, Ap);
        let mask = f._archerArrowSpawnMask | 0;
        for (let si = 0; si < plan.length; si++) {
          const step = plan[si];
          if (f.attackPhase === step.phase && (mask & (1 << si)) === 0) {
            spawnPlayerArrow(step.opts);
            mask |= 1 << si;
          }
        }
        f._archerArrowSpawnMask = mask;
      }
      if (settings.mode === "dummy" && isPlayer) {
        tryHit(f, null, true);
        if ((f.atkIdx | 0) === ATK_AIR_STREAK && f.charType === "warrior") tryAirStreakWarriorHit(f, null, true);
      } else if (foe && isPlayer) {
        tryHit(f, foe, false);
        if ((f.atkIdx | 0) === ATK_AIR_STREAK && f.charType === "warrior") tryAirStreakWarriorHit(f, foe, false);
      } else if (foe && !isPlayer) {
        tryHit(f, player, false);
      }
      if (pillarTrack) tryPillarDropHits(f, prevFootPillar, isPlayer);
      if (f.atkIdx === 7 && f.attackPhase > 0) {
        const A7 = curAtk(f);
        const apR = f.attackPhase;
        if (apR === 7 && f.onGround) {
          f.onGround = false;
          f.vy = -11.6;
          f.vx += f.facing * 5.8;
          spawnParticles(f.x + f.w * 0.5 + f.facing * 10, f.y - 8, 18, f.facing > 0 ? Math.PI * 0.35 : Math.PI - Math.PI * 0.35);
        }
        if (apR >= 8 && apR <= A7.act1 && !f.onGround) {
          f.vy -= 0.52;
          f.vx += f.facing * 0.11;
        }
        if (apR > A7.act1 && apR <= A7.total && !f.onGround) {
          f.vx += f.facing * 0.06;
        }
      }
      if (f.atkIdx === 11 && !f.onGround) {
        const A11 = curAtk(f);
        if (f.attackPhase >= 2 && f.attackPhase <= A11.act1) {
          if (f.attackPhase === 2) f.vy += 5.2;
          f.vy += 1.25;
          if (f.vy > 24) f.vy = 24;
          f.vx += f.facing * 0.28;
        }
      }
      if ((f.atkIdx | 0) === ATK_PILLAR_DROP && pillarTrack) {
        f.vx *= 0.78;
      }
      const apNow = f.attackPhase;
      const Lu = curAtk(f).lunge;
      if (f.onGround && Lu && typeof Lu === "object") {
        for (const k of Object.keys(Lu)) {
          const fr = Number(k);
          if (apNow === fr) f.x += f.facing * Lu[k];
        }
      }
      if ((f.atkIdx | 0) === ATK_PILLAR_DROP && f._pillarForceRecover) {
        f.attackPhase = ApillarAtk.act1 + 1;
        f._pillarForceRecover = false;
      } else {
        f.attackPhase += 1;
      }
      const At = curAtk(f);
      const atkTotal = Number.isFinite(At.total) && At.total > 0 ? At.total : 26;
      if (f.attackPhase > atkTotal) {
        f.attackPhase = 0;
        f.atkIdx = 0;
        f._sDropShockDone = false;
      }
    }

    clampWorldX(f);
  }

  function aiInput() {
    if (!foe || settings.mode === "dummy") {
      return {
        a: false,
        d: false,
        s: false,
        w: false,
        j: false,
        k: false,
        l: false,
        jumpBuffer: 0,
        uCharge: false,
        slashChargeHold: false,
        pillarJ: false,
        dropK: false,
      };
    }
    const mul = difficultyMul() * foeAiAggroMul();
    const dx = player.x + player.w * 0.5 - (foe.x + foe.w * 0.5);
    const dist = Math.abs(dx);
    foe.facing = dx > 0 ? 1 : -1;
    const inp = {
      a: false,
      d: false,
      s: false,
      w: false,
      j: false,
      k: false,
      l: false,
      jumpBuffer: 0,
      uCharge: false,
      slashChargeHold: false,
      pillarJ: false,
      dropK: false,
    };
    if (foe.attackPhase > 0) return inp;
    if (foe.hitStun > 0) return inp;
    if (foe.guardRecoilStun > 0) return inp;

    const pA = curAtk(player);
    const pWind = player.attackPhase > 0 && player.attackPhase < pA.act0;
    const pAct = player.attackPhase > 0 && player.attackPhase >= pA.act0 && player.attackPhase <= pA.act1;
    const pRec = player.attackPhase > 0 && player.attackPhase > pA.act1;
    const punishWindow = player.hitStun > 0 || pRec || (pWind && dist < 132);
    const playerNeutral =
      player.attackPhase === 0 && player.hitStun <= 0 && !player.guarding && !pWind && !pAct && !pRec;
    const sc = 0.76 + mul * 0.15;

    const safeDist = (pAct ? 154 : 112) * mul * sc;
    const aggDist = player.hitStun > 0 ? 44 : pRec ? 52 : 62;

    if (dist > safeDist) {
      if (dx > 0) inp.d = true;
      else inp.a = true;
    } else if (dist < aggDist) {
      if (dx > 0) inp.a = true;
      else inp.d = true;
    } else if (pAct && dist < 122 && Math.random() < 0.34 * mul) {
      if (dx > 0) inp.a = true;
      else inp.d = true;
    }

    if (punishWindow && dist > 62 && dist < 178 && Math.random() < 0.48 * mul) {
      if (dx > 0) inp.d = true;
      else inp.a = true;
    }

    if (foe.onGround && pWind && dist < 142 && Math.random() < 0.44 * mul) {
      inp.s = true;
      if (Math.random() < 0.8) {
        inp.a = false;
        inp.d = false;
      }
    }

    if (
      player.onGround &&
      player.guarding &&
      foe.onGround &&
      dist < 98 &&
      Math.random() < 0.42 * mul
    ) {
      inp.s = true;
      if (dx > 0) inp.d = true;
      else inp.a = true;
      if (Math.random() < 0.62) inp.j = true;
    }

    if (Math.random() < (0.014 + (punishWindow ? 0.048 : 0)) * mul && foe.onGround) inp.jumpBuffer = 12;

    if (foe.onGround && dist > 200 && Math.random() < 0.052 * mul) inp.jumpBuffer = 14;

    const punchChance = (punishWindow ? 0.36 : 0.13) * mul;
    if (dist < 152 && Math.random() < punchChance) inp.j = true;

    if (playerNeutral && dist > 78 && dist < 142 && Math.random() < 0.1 * mul) inp.j = true;

    if (dist < 122 && foe.onGround && Math.random() < (0.028 + (punishWindow ? 0.052 : 0)) * mul) {
      inp.s = true;
      if (Math.random() < 0.52) {
        if (dx > 0) inp.a = true;
        else inp.d = true;
      }
    }

    if (!foe.onGround && player.y > foe.y + 28 && dist < 112 && Math.random() < 0.11 * mul) {
      inp.s = true;
      inp.j = true;
    }

    if (!player.onGround && player.attackPhase === 0 && dist < 112 && foe.onGround && Math.random() < 0.062 * mul) {
      if (Math.random() < 0.55) inp.jumpBuffer = 12;
    }

    if (
      !foe.onGround &&
      foe.coyote <= 0 &&
      (foe.airJumpsLeft | 0) > 0 &&
      foe.attackPhase === 0 &&
      Math.random() < 0.095 * mul &&
      (player.y < foe.y - 36 || dist > 130 || (punishWindow && dist < 100))
    ) {
      inp.jumpBuffer = Math.max(inp.jumpBuffer, 14);
    }

    if (Math.random() < 0.014 * mul) inp.w = true;

    if (foe.onGround && dist < 138 && pAct && Math.random() < 0.66 * mul) {
      inp.s = true;
      if (Math.random() < 0.7) {
        inp.a = false;
        inp.d = false;
      }
    }

    if (
      foe.orbCd <= 0 &&
      (foe.uChargeFrames | 0) <= 0 &&
      foe.attackPhase === 0 &&
      foe.onGround &&
      dist > 162 &&
      dist < 380 &&
      playerNeutral &&
      Math.random() < 0.042 * mul
    ) {
      inp.uCharge = true;
    }

    const hardP = settings.difficulty === "hard" ? 1.12 : settings.difficulty === "easy" ? 0.78 : 1;
    if (
      foe.onGround &&
      player.y > foe.y + 36 &&
      dist < 64 &&
      Math.random() < 0.052 * mul * hardP
    ) {
      inp.pillarJ = true;
      inp.s = true;
      inp.j = true;
      inp.a = false;
      inp.d = false;
    }
    if (foe.onGround && player.y > foe.y + 16 && dist < 86 && Math.random() < 0.038 * mul) {
      inp.dropK = true;
      inp.s = true;
      inp.k = true;
      inp.a = false;
      inp.d = false;
    }
    if (foe.onGround && dist < 108 && dist > 20 && player.y > foe.y - 4 && Math.random() < 0.055 * mul) {
      inp.w = true;
      inp.j = true;
    }
    if (!foe.onGround && player.y > foe.y + 18 && dist < 118 && Math.random() < 0.09 * mul) {
      inp.w = true;
      inp.j = true;
    }
    if (
      foe.dashCd <= 0 &&
      foe.attackPhase === 0 &&
      foe.onGround &&
      ((dist > 140 && dist < 320 && Math.random() < 0.024 * mul) || (pAct && dist < 150 && Math.random() < 0.05 * mul))
    ) {
      inp.l = true;
      if (dx > 0) inp.d = true;
      else inp.a = true;
    }
    return inp;
  }

  function tickFoeAI() {
    if (!foe) return;
    if ((foe.getupInvuln | 0) > 0) foe.getupInvuln--;
    if ((foe.downTimer | 0) > 0) {
      foe.downTimer--;
      foe.dashFrames = 0;
      foe.uChargeFrames = 0;
      foe.attackPhase = 0;
      foe.atkIdx = 0;
      foe.guarding = false;
      foe.crouchHeldDraw = false;
      foe.crouchMove = false;
      foe.blockFlash = 0;
      foe.vx *= 0.9;
      applyPlatformPhysics(foe);
      clampWorldX(foe);
      if (foe.downTimer <= 0) {
        foe.getupInvuln = GETUP_INVULN_FRAMES;
        foe.hitReactKind = "";
        foe.hitReactMax = 0;
        foe.hitPushDir = 0;
      }
      aiJPrev = false;
      aiKPrev = false;
      aiLPrev = false;
      return;
    }
    if (foe.guardRecoilStun > 0) {
      foe.guardRecoilStun -= 1;
      foe.dashFrames = 0;
      foe.vx *= 0.9;
      foe.uChargeFrames = 0;
      foe.attackPhase = 0;
      foe.atkIdx = 0;
      foe.guarding = false;
      foe.crouchHeldDraw = false;
      foe.crouchMove = false;
      foe.blockFlash = 0;
      foe._sDropShockDone = false;
      applyPlatformPhysics(foe);
      clampWorldX(foe);
      aiJPrev = false;
      aiKPrev = false;
      aiLPrev = false;
      return;
    }
    if (foe.hitStun > 0) {
      foe.hitStun -= 1;
      foe.dashFrames = 0;
      foe.vx *= 0.88;
      foe.uChargeFrames = 0;
      foe.attackPhase = 0;
      foe.atkIdx = 0;
      foe.guarding = false;
      foe.crouchHeldDraw = false;
      foe.crouchMove = false;
      foe.blockFlash = 0;
      foe._sDropShockDone = false;
      foe.guardRecoilStun = 0;
      applyPlatformPhysics(foe);
      clampWorldX(foe);
      if (foe.hitStun <= 0) {
        foe.hitReactKind = "";
        foe.hitReactMax = 0;
        foe.hitPushDir = 0;
      }
      aiJPrev = false;
      aiKPrev = false;
      aiLPrev = false;
      return;
    }
    if (foe._comboCd > 0) foe._comboCd -= 1;

    if (foe.dashCd > 0) foe.dashCd -= 1;

    const dxToP = player.x + player.w * 0.5 - (foe.x + foe.w * 0.5);

    if (foe.uChargeFrames > 0) {
      foe.uChargeFrames--;
      if (foe.uChargeFrames === 0) fireFoeOrbBlast();
      foe.facing = dxToP > 0 ? 1 : -1;
      foe.dashFrames = 0;
      foe.jumpBuffer = 0;
      syncFighterStance(foe, { a: false, d: false, s: false, w: false, j: false, k: false, jumpBuffer: 0 });
      foe.vx *= 0.52;
      const preGroundCharge = foe.onGround;
      applyPlatformPhysics(foe);
      maybeSlamLandShock(foe, preGroundCharge);
      clampWorldX(foe);
      aiJPrev = false;
      aiKPrev = false;
      aiLPrev = false;
      return;
    }

    const distF = Math.abs(dxToP);
    const pA0 = curAtk(player);
    const pActF = player.attackPhase > 0 && player.attackPhase >= pA0.act0 && player.attackPhase <= pA0.act1;
    const pWindF = player.attackPhase > 0 && player.attackPhase < pA0.act0;
    const dmDash = difficultyMul() * (settings.difficulty === "hard" ? 1.1 : settings.difficulty === "easy" ? 0.85 : 1);
    const dashEvadeAct =
      pActF &&
      distF < 140 &&
      Math.random() < 0.29 * dmDash;
    const dashEvadeWind =
      pWindF &&
      distF < 106 &&
      Math.random() < 0.18 * dmDash;
    const dashEvade =
      foe.dashCd <= 0 &&
      foe.dashFrames <= 0 &&
      foe.onGround &&
      foe.attackPhase === 0 &&
      foe.hitStun <= 0 &&
      (dashEvadeAct || dashEvadeWind);
    if (dashEvade) {
      foe.dashFrames = 14;
      foe.dashCd = 52;
      foe.dashDir = dxToP > 0 ? -1 : 1;
      foe.facing = foe.dashDir;
      spawnParticles(foe.x + foe.w * 0.5 - foe.dashDir * 8, foe.y - 26, 10, foe.dashDir > 0 ? 0.12 : Math.PI - 0.12);
    }

    const dashMoveFoe = foe.dashFrames > 0;
    if (dashMoveFoe) {
      foe.dashFrames -= 1;
      const foeDashMul = foe.charType === "archer" ? ARCHER_DASH_SPEED_MUL : 1;
      foe.vx = foe.dashDir * DASH_SPEED_FOE * foeDashMul;
    }

    const brain = aiInput();
    if (
      brain.l &&
      !aiLPrev &&
      foe.dashCd <= 0 &&
      foe.attackPhase === 0 &&
      foe.hitStun <= 0 &&
      foe.guardRecoilStun <= 0 &&
      !dashMoveFoe
    ) {
      foe.dashFrames = 14;
      foe.dashCd = 52;
      foe.dashDir = brain.d ? 1 : brain.a ? -1 : dxToP > 0 ? 1 : -1;
      foe.facing = foe.dashDir;
      spawnParticles(foe.x + foe.w * 0.5 - foe.dashDir * 8, foe.y - 26, 10, foe.dashDir > 0 ? 0.12 : Math.PI - 0.12);
    }
    aiLPrev = !!brain.l;
    if (brain.jumpBuffer) foe.jumpBuffer = Math.max(foe.jumpBuffer, brain.jumpBuffer);
    const wantOrbCharge =
      !!brain.uCharge &&
      foe.orbCd <= 0 &&
      foe.attackPhase === 0 &&
      foe.onGround &&
      foe.hitStun <= 0 &&
      foe.guardRecoilStun <= 0 &&
      foe.dashFrames <= 0 &&
      !dashMoveFoe;
    if (wantOrbCharge) {
      foe.uChargeFrames = BOSS_U_CHARGE_FRAMES;
      foe.facing = dxToP > 0 ? 1 : -1;
      foe.jumpBuffer = 0;
      syncFighterStance(foe, { a: false, d: false, s: false, w: false, j: false, k: false, jumpBuffer: 0 });
      foe.vx *= 0.48;
      const preWantOrb = foe.onGround;
      applyPlatformPhysics(foe);
      maybeSlamLandShock(foe, preWantOrb);
      clampWorldX(foe);
      aiJPrev = false;
      aiKPrev = false;
      aiLPrev = false;
      return;
    }

    const jNow = brain.j;
    const Ac = curAtk(foe);
    const inCancel =
      foe.attackPhase > 0 && foe.attackPhase >= Ac.cancel0 && foe.attackPhase <= Ac.cancel1;
    const wantsCombo =
      foe._comboCd <= 0 &&
      foe.onGround &&
      inCancel &&
      Math.random() < 0.17 * difficultyMul() * foeAiAggroMul() &&
      foe.atkIdx !== 6 &&
      foe.atkIdx !== 8 &&
      foe.atkIdx !== 11 &&
      foe.atkIdx !== 12 &&
      foe.atkIdx !== ATK_PILLAR_DROP;
    const comboForced = wantsCombo;
    const wSim = brain.w || (wantsCombo && foe.atkIdx >= 0 && foe.atkIdx <= 3 && Math.random() < 0.58);
    const jPressed = ((jNow && !aiJPrev) || wantsCombo) && !wantOrbCharge;
    aiJPrev = jNow;

    const moveMul = difficultyMul() * foeAiAggroMul();
    const moveAccel = 0.94 * moveMul;
    const maxRun = 5.45 * moveMul;
    const friction = 0.82;
    const ap = foe.attackPhase;
    const rooted = foe.onGround && ap >= 4 && ap <= Ac.rootedEnd;
    syncFighterStance(foe, brain);
    const crouchSlow = foe.onGround && brain.s;
    const runCap = crouchSlow ? maxRun * 0.48 : maxRun;
    if (!rooted && !dashMoveFoe) {
      if (brain.a) {
        foe.vx -= moveAccel * (crouchSlow ? 0.75 : 1);
        foe.facing = -1;
      }
      if (brain.d) {
        foe.vx += moveAccel * (crouchSlow ? 0.75 : 1);
        foe.facing = 1;
      }
      if (!brain.a && !brain.d) foe.vx *= friction;
      foe.vx = Math.max(-runCap, Math.min(runCap, foe.vx));
    } else if (rooted) {
      foe.vx *= 0.88;
    }
    if (!rooted && !dashMoveFoe && foe.guarding && foe.onGround) {
      foe.vx *= 0.88;
    }

    if (foe.onGround) foe.airJumpsLeft = EXTRA_AIR_JUMPS;
    const foeCanGroundJump = foe.onGround || foe.coyote > 0;
    const foeCanAirJump =
      !foeCanGroundJump &&
      (foe.airJumpsLeft | 0) > 0 &&
      foe.attackPhase === 0 &&
      foe.hitStun <= 0 &&
      foe.guardRecoilStun <= 0;
    if (foe.jumpBuffer > 0 && foeCanGroundJump) {
      foe.vy = -11.0;
      foe.onGround = false;
      foe.coyote = 0;
      foe.jumpBuffer = 0;
    } else if (foe.jumpBuffer > 0 && foeCanAirJump) {
      foe.vy = -9.65;
      foe.jumpBuffer = 0;
      foe.airJumpsLeft = Math.max(0, (foe.airJumpsLeft | 0) - 1);
      spawnParticles(foe.x + foe.w * 0.5 + foe.vx * 0.08, foe.y - 2, 6, Math.PI * 0.48);
    } else if (foe.jumpBuffer > 0) foe.jumpBuffer -= 1;

    const kPressAi = brain.k && !aiKPrev;
    if (kPressAi && crouchSlow && foe.attackPhase === 0) {
      if (!tryDropThroughPlatform(foe)) {
        foe.atkIdx = 6;
        foe.attackPhase = 1;
        foe.landedHitThisSwing = false;
        foe.vy = -8.0;
        foe.vx += foe.facing * 5.0;
        foe.onGround = false;
        foe.jumpBuffer = 0;
        spawnParticles(foe.x + foe.w * 0.5 + foe.facing * 8, foe.y - 4, 7, Math.PI * 0.5);
      }
    } else if (kPressAi && !crouchSlow && foe.attackPhase === 0) {
      foe.jumpBuffer = 12;
    }
    aiKPrev = !!brain.k;

    if (jPressed && foe.attackPhase === 0) {
      if (brain.pillarJ && foe.onGround && !foe.crouchMove) {
        foe.atkIdx = ATK_PILLAR_DROP;
        foe._sDropShockDone = false;
        foe._pillarHitDummy = false;
        foe._pillarHitFoe = false;
        foe._pillarHitPlayer = false;
        foe._pillarForceRecover = false;
      } else if (foe.crouchMove) foe.atkIdx = 4;
      else if (brain.s && !foe.onGround) {
        if ((foe.airCombatCd | 0) <= 0) {
          foe.atkIdx = 11;
          foe._sDropShockDone = false;
          foe.airCombatCd = AIR_COMBAT_SPECIAL_CD;
        } else {
          if (foe.atkIdx < 4) foe.atkIdx = 4;
          else if (foe.atkIdx === 4) foe.atkIdx = 5;
          else if (foe.atkIdx === 5) foe.atkIdx = 4;
          else foe.atkIdx = 4;
        }
      } else if (brain.w && !foe.onGround) foe.atkIdx = 8;
      else if (brain.w && foe.onGround) foe.atkIdx = 7;
      else foe.atkIdx = 0;
      foe.attackPhase = 1;
      foe.landedHitThisSwing = false;
    } else if (jPressed && inCancel) {
      if (comboForced) foe._comboCd = 34 + Math.floor(Math.random() * 40);
      foe.landedHitThisSwing = false;
      foe.attackPhase = 1;
      if (brain.s && !foe.onGround) {
        if ((foe.airCombatCd | 0) <= 0) {
          foe.atkIdx = 11;
          foe._sDropShockDone = false;
          foe.airCombatCd = AIR_COMBAT_SPECIAL_CD;
        } else {
          if (foe.atkIdx < 4) foe.atkIdx = 4;
          else if (foe.atkIdx === 4) foe.atkIdx = 5;
          else if (foe.atkIdx === 5) foe.atkIdx = 4;
          else foe.atkIdx = 4;
        }
      } else if (brain.s) {
        if (foe.atkIdx < 4) foe.atkIdx = 4;
        else if (foe.atkIdx === 4) foe.atkIdx = 5;
        else if (foe.atkIdx === 5) foe.atkIdx = 4;
        else foe.atkIdx = 4;
      } else {
        if (foe.atkIdx === 6) foe.atkIdx = 0;
        else if (foe.atkIdx === 4 || foe.atkIdx === 5) {
          foe.atkIdx = foe.atkIdx === 4 ? 5 : 4;
        } else {
          foe.atkIdx = nextStandCancel(foe.atkIdx, wSim);
        }
      }
    }

    const ApFoePillar = ATTACKS[ATK_PILLAR_DROP];
    const foePillarTrack =
      (foe.atkIdx | 0) === ATK_PILLAR_DROP &&
      (foe.attackPhase | 0) >= ApFoePillar.act0 &&
      (foe.attackPhase | 0) <= ApFoePillar.act1;
    const prevFootFoePillar = foePillarTrack ? foe.y : 0;
    if ((foe.atkIdx | 0) === ATK_PILLAR_DROP && foe.attackPhase === ApFoePillar.act0 && foe.onGround) {
      foe.vy = 19;
      foe.onGround = false;
    }

    const preGroundFoe = foe.onGround;
    applyPlatformPhysics(foe);
    maybeSlamLandShock(foe, preGroundFoe);

    if (foe.attackPhase > 0) {
      tryHit(foe, player, false);
      if (foePillarTrack) tryPillarDropHits(foe, prevFootFoePillar, false);
      if (foe.atkIdx === 7 && foe.attackPhase > 0) {
        const A7 = curAtk(foe);
        const apR = foe.attackPhase;
        if (apR === 7 && foe.onGround) {
          foe.onGround = false;
          foe.vy = -11.2;
          foe.vx += foe.facing * 5.4;
          spawnParticles(foe.x + foe.w * 0.5 + foe.facing * 10, foe.y - 8, 16, foe.facing > 0 ? Math.PI * 0.35 : Math.PI - Math.PI * 0.35);
        }
        if (apR >= 8 && apR <= A7.act1 && !foe.onGround) {
          foe.vy -= 0.48;
          foe.vx += foe.facing * 0.1;
        }
        if (apR > A7.act1 && apR <= A7.total && !foe.onGround) {
          foe.vx += foe.facing * 0.055;
        }
      }
      if (foe.atkIdx === 11 && !foe.onGround) {
        const A11 = curAtk(foe);
        if (foe.attackPhase >= 2 && foe.attackPhase <= A11.act1) {
          if (foe.attackPhase === 2) foe.vy += 4.8;
          foe.vy += 1.12;
          if (foe.vy > 23) foe.vy = 23;
          foe.vx += foe.facing * 0.26;
        }
      }
      if ((foe.atkIdx | 0) === ATK_PILLAR_DROP && foePillarTrack) {
        foe.vx *= 0.78;
      }
      const apNow = foe.attackPhase;
      const Lu = curAtk(foe).lunge;
      if (foe.onGround && Lu && typeof Lu === "object") {
        for (const k of Object.keys(Lu)) {
          const fr = Number(k);
          if (apNow === fr) foe.x += foe.facing * Lu[k];
        }
      }
      if ((foe.atkIdx | 0) === ATK_PILLAR_DROP && foe._pillarForceRecover) {
        foe.attackPhase = ApFoePillar.act1 + 1;
        foe._pillarForceRecover = false;
      } else {
        foe.attackPhase += 1;
      }
      const At = curAtk(foe);
      const atkTotal = Number.isFinite(At.total) && At.total > 0 ? At.total : 26;
      if (foe.attackPhase > atkTotal) {
        foe.attackPhase = 0;
        foe.atkIdx = 0;
        foe._sDropShockDone = false;
      }
    }
    clampWorldX(foe);
  }

  /** 最近距离下用于算 zoom 的最小跨度；max 压低减少「贴脸望远镜」感 */
  const CAMERA_ZOOM_MIN = 0.3;
  const CAMERA_ZOOM_MAX = 0.92;
  const CAMERA_SPAN_FLOOR = 480;

  function getCameraTarget() {
    if (!player) return { targetX: W / 2, targetY: H * 0.42, tz: 1 };
    const px = player.x + player.w * 0.5;
    const padX = 140;
    let targetX = px;
    let targetY = Math.min(player.y, H * 0.55) - 80;
    let span = 520;

    if (settings.mode === "dummy") {
      const dx = dummy.x + dummy.w * 0.5;
      span = Math.abs(px - dx) + player.w * 0.5 + dummy.w * 0.5 + padX;
      targetX = (px + dx) * 0.5;
      targetY = Math.min(player.y, dummy.y) - 100;
    } else if (foe) {
      const fx = foe.x + foe.w * 0.5;
      span = Math.abs(px - fx) + player.w * 0.5 + foe.w * 0.5 + padX + 40;
      targetX = (px + fx) * 0.5;
      targetY = Math.min(player.y, foe.y) - 90;
    }

    const spanClamped = Math.max(span, CAMERA_SPAN_FLOOR);
    const fit = (W * 0.86) / spanClamped;
    const tz = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, fit));
    return { targetX, targetY, tz };
  }

  /** 开局 / 切关时立刻对准，避免第一帧把角色甩出画面 */
  function snapCamera() {
    const t = getCameraTarget();
    camera.tx = t.targetX;
    camera.ty = t.targetY;
    camera.tz = t.tz;
    camera.x = camera.tx;
    camera.y = camera.ty;
    camera.zoom = camera.tz;
  }

  function updateCamera(dt) {
    const t = getCameraTarget();
    const smooth = Math.min(0.22, 0.08 + (dt || 16) * 0.00035);
    camera.tx += (t.targetX - camera.tx) * smooth;
    camera.ty += (t.targetY - camera.ty) * smooth;
    camera.tz += (t.tz - camera.tz) * smooth;
    camera.x = camera.tx;
    camera.y = camera.ty;
    camera.zoom = camera.tz;
  }

  function update(dt) {
    if (!player) return;
    if (gameState !== "playing") return;

    if (player.blockFlash > 0) player.blockFlash = Math.max(0, player.blockFlash - dt);
    if (foe && foe.blockFlash > 0) foe.blockFlash = Math.max(0, foe.blockFlash - dt);
    if (player.hitFlash > 0) player.hitFlash = Math.max(0, player.hitFlash - dt);
    if (foe && foe.hitFlash > 0) foe.hitFlash = Math.max(0, foe.hitFlash - dt);

    if (hitStopGlobal > 0) {
      hitStopGlobal -= 1;
      if (dummy.hitStop > 0) dummy.hitStop -= 1;
      return;
    }
    if (dummy.hitStop > 0) dummy.hitStop -= 1;

    if (dummy.flash > 0) dummy.flash -= dt;
    if (dummy.shake !== 0) {
      dummy.shake *= 0.72;
      if (Math.abs(dummy.shake) < 0.5) dummy.shake = 0;
    }
    if (screenShake > 0) screenShake *= 0.82;

    if (player.orbCd > 0) player.orbCd = Math.max(0, player.orbCd - dt);
    if (foe && foe.orbCd > 0) foe.orbCd = Math.max(0, foe.orbCd - dt);

    if (player.comboTimer > 0) {
      player.comboTimer -= dt;
      if (player.comboTimer <= 0) player.combo = 0;
    }
    if (foe && foe.comboTimer > 0) {
      foe.comboTimer -= dt;
      if (foe.comboTimer <= 0) foe.combo = 0;
    }

    const pIn = {
      a: keys.a,
      d: keys.d,
      s: keys.s,
      w: keys.w,
      j: false,
      k: keys.k,
      jumpBuffer: 0,
      slashChargeHold:
        !!(keys.s && keys.u && player.attackPhase === 0 && player.hitStun <= 0 && player.guardRecoilStun <= 0 && (player.downTimer | 0) <= 0),
    };
    tickFighter(player, pIn, true);
    tickOrbBlasts(dt);
    tickArrows(dt);
    tickSlantBeams(dt);
    tickSlashWaves(dt);

    if (settings.mode !== "dummy" && foe) {
      tickFoeAI();
      resolvePlayerFoeOverlap();
    }

    tryPitFall(player, map.spawnYou, true);
    if (settings.mode !== "dummy" && foe) tryPitFall(foe, map.spawnFoe, false);

    updateCamera(dt);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = shockRings.length - 1; i >= 0; i--) {
      const r = shockRings[i];
      r.age += dt;
      if (r.age >= r.life) shockRings.splice(i, 1);
    }
    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const t = floatTexts[i];
      t.age += dt;
      t.y += t.vy;
      t.vy *= 0.96;
      if (t.age > t.life) floatTexts.splice(i, 1);
    }

    updateHudHp();
  }

  function drawWorldBackdrop() {
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, map.skyTop);
    if (map.skyMid) grd.addColorStop(0.48, map.skyMid);
    grd.addColorStop(1, map.skyBot);
    ctx.fillStyle = grd;
    ctx.fillRect(-8000, -4000, 20000, 12000);

    const theme = map.backdrop || (map.forestBg ? "bamboo" : null);
    if (!theme) return;

    const px = camera.x;
    const z = Math.max(0.3, camera.zoom || 1);
    const span = W / z + 1600;
    const x0 = px - span * 0.52;
    const t = performance.now() * 0.001;
    const groundLine = H - 72;

    function bambooStalk(sx, baseY, bw, bh, segH, c1, c2) {
      for (let y = 0; y < bh; y += segH) {
        ctx.fillStyle = y % (segH * 2) < segH ? c1 : c2;
        const sh = Math.min(segH, bh - y);
        ctx.fillRect(sx, baseY - bh + y, bw, sh);
      }
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(sx, baseY - bh, Math.max(1, bw * 0.2), bh);
    }

    ctx.save();

    if (theme === "dojo") {
      const par = 0.035;
      const wallX = x0 - px * par;
      ctx.fillStyle = "rgba(250, 238, 220, 0.42)";
      ctx.fillRect(wallX, 0, span + 1400, H - 95);
      ctx.strokeStyle = "rgba(110, 90, 68, 0.28)";
      ctx.lineWidth = 1;
      for (let vx = wallX; vx < wallX + span + 1400; vx += 44) {
        ctx.beginPath();
        ctx.moveTo(vx, 36);
        ctx.lineTo(vx, H - 105);
        ctx.stroke();
      }
      for (let vy = 44; vy < H - 98; vy += 34) {
        ctx.beginPath();
        ctx.moveTo(wallX, vy);
        ctx.lineTo(wallX + span + 1400, vy);
        ctx.stroke();
      }
      const ceilG = ctx.createLinearGradient(0, 0, 0, 100);
      ceilG.addColorStop(0, "rgba(48, 36, 26, 0.55)");
      ceilG.addColorStop(1, "rgba(48, 36, 26, 0)");
      ctx.fillStyle = ceilG;
      ctx.fillRect(x0 - 400, 0, span + 2000, 100);
      ctx.fillStyle = "rgba(62, 48, 34, 0.5)";
      for (let i = 0; i < 16; i++) {
        const bx = wallX + i * 220 + ((px * 0.018) % 220);
        ctx.fillRect(bx, groundLine - 360, 12, 300);
      }
      ctx.fillStyle = "rgba(55, 42, 30, 0.2)";
      ctx.fillRect(x0 - 240, groundLine - 48, span + 900, 48);
    } else if (theme === "bamboo") {
      ctx.fillStyle = "rgba(32, 68, 48, 0.42)";
      ctx.beginPath();
      ctx.moveTo(x0 - 320, groundLine - 40);
      for (let i = 0; i < 28; i++) {
        ctx.lineTo(x0 + i * 135 - px * 0.015, groundLine - 95 - ((i * 41) % 75));
      }
      ctx.lineTo(x0 + span + 700, groundLine - 35);
      ctx.lineTo(x0 + span + 700, H);
      ctx.lineTo(x0 - 320, H);
      ctx.closePath();
      ctx.fill();

      const layers = [
        { par: 0.055, n: 40, w: 6, gap: 76, c1: "#1b402c", c2: "#275438", h0: 200, h1: 130 },
        { par: 0.1, n: 34, w: 8, gap: 92, c1: "#153528", c2: "#214832", h0: 240, h1: 150 },
        { par: 0.16, n: 28, w: 10, gap: 108, c1: "#0f2818", c2: "#183828", h0: 280, h1: 170 },
      ];
      for (const L of layers) {
        const lx = x0 - px * L.par;
        for (let i = 0; i < L.n; i++) {
          const sx = lx + ((i * L.gap + px * L.par * 2.5) % (span + 480));
          const bh = L.h0 + ((i * 19) % L.h1);
          bambooStalk(sx, groundLine, L.w, bh, 13, L.c1, L.c2);
        }
      }
      ctx.fillStyle = "rgba(10, 22, 14, 0.38)";
      ctx.fillRect(x0 - 200, groundLine - 78, span + 900, 78);
    } else if (theme === "sakura") {
      ctx.fillStyle = "rgba(130, 95, 140, 0.38)";
      ctx.beginPath();
      ctx.moveTo(x0 - 380, groundLine - 50);
      ctx.lineTo(x0 + span * 0.28, groundLine - 200);
      ctx.lineTo(x0 + span * 0.52, groundLine - 120);
      ctx.lineTo(x0 + span * 0.75, groundLine - 240);
      ctx.lineTo(x0 + span + 520, groundLine - 55);
      ctx.lineTo(x0 + span + 520, H);
      ctx.lineTo(x0 - 380, H);
      ctx.closePath();
      ctx.fill();

      const tx = x0 - px * 0.065;
      for (let i = 0; i < 24; i++) {
        const bx = tx + ((i * 158 + (px * 0.028) % 158) % (span + 520));
        const trunkW = 14 + (i % 5);
        const trunkH = 65 + (i * 11) % 48;
        ctx.fillStyle = "#4e342e";
        ctx.fillRect(bx + 38, groundLine - trunkH, trunkW, trunkH);
        ctx.fillStyle = "rgba(255, 182, 212, 0.88)";
        ctx.beginPath();
        ctx.ellipse(bx + 46, groundLine - trunkH - 26, 48 + (i % 4) * 10, 36, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 224, 235, 0.45)";
        ctx.beginPath();
        ctx.ellipse(bx + 28, groundLine - trunkH - 16, 32, 26, -0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255, 192, 218, 0.72)";
      for (let i = 0; i < 52; i++) {
        const drift = Math.sin(t * 0.9 + i * 0.7) * 36;
        const sx = x0 + ((i * 101 + drift + px * 0.06) % (span + 450));
        const sy = 32 + ((i * 67 + t * (22 + (i % 6))) % (H - 110));
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(t * 0.8 + i * 0.31);
        ctx.fillRect(-3.5, -1.5, 7, 3);
        ctx.restore();
      }
      ctx.fillStyle = "rgba(80, 45, 62, 0.14)";
      ctx.fillRect(x0 - 200, groundLine - 58, span + 900, 58);
    } else if (theme === "city") {
      ctx.fillStyle = "rgba(255, 252, 235, 0.14)";
      ctx.beginPath();
      ctx.arc(x0 + span * 0.7 - px * 0.012, 54, 32, 0, Math.PI * 2);
      ctx.fill();

      const farX = x0 - px * 0.045;
      ctx.fillStyle = "rgba(28, 22, 58, 0.52)";
      for (let i = 0; i < 42; i++) {
        const wx = farX + i * 84 + ((px * 0.035) % 84);
        const ww = 34 + (i * 13) % 42;
        const wh = 85 + (i * 17) % 95;
        ctx.fillRect(wx, groundLine - wh, ww, wh);
      }

      const midX = x0 - px * 0.095;
      for (let i = 0; i < 27; i++) {
        const wx = midX + i * 116 + ((px * 0.065) % 116);
        const ww = 50 + (i * 9) % 46;
        const wh = 115 + (i * 27) % 155;
        ctx.fillStyle = "rgba(16, 12, 38, 0.9)";
        ctx.fillRect(wx, groundLine - wh, ww, wh);
        const pick = i % 3;
        for (let ry = 0; ry < 5; ry++) {
          for (let rx = 0; rx < 3; rx++) {
            if (((i + rx + ry) >>> 0) % 3 === 0) continue;
            ctx.fillStyle =
              pick === 0
                ? "rgba(34, 211, 238, " + (0.28 + ((i + rx) % 4) * 0.08) + ")"
                : pick === 1
                  ? "rgba(250, 204, 21, " + (0.22 + ((i + ry) % 4) * 0.07) + ")"
                  : "rgba(244, 114, 182, " + (0.22 + ((i + rx + ry) % 4) * 0.07) + ")";
            ctx.fillRect(wx + 9 + rx * 16, groundLine - wh + 12 + ry * 25, 9, 15);
          }
        }
      }

      ctx.fillStyle = "rgba(5, 4, 16, 0.8)";
      ctx.fillRect(x0 - 420, groundLine - 205, span + 1900, 205);

      const glow = ctx.createLinearGradient(0, groundLine - 155, 0, groundLine - 32);
      glow.addColorStop(0, "rgba(124, 58, 237, 0)");
      glow.addColorStop(0.5, "rgba(219, 39, 119, 0.12)");
      glow.addColorStop(1, "rgba(59, 130, 246, 0.09)");
      ctx.fillStyle = glow;
      ctx.fillRect(x0 - 500, groundLine - 165, span + 2100, 135);
    }

    ctx.restore();
  }

  /** 折线按比例 u∈[0,1] 取点（用于冰锥左右棱边上的横向纹理） */
  function pointOnPolyline(chain, u) {
    if (!chain || chain.length < 2) return { x: 0, y: 0 };
    let total = 0;
    const lens = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const dx = chain[i + 1].x - chain[i].x;
      const dy = chain[i + 1].y - chain[i].y;
      lens.push(Math.hypot(dx, dy));
      total += lens[i];
    }
    if (total <= 0) return { x: chain[0].x, y: chain[0].y };
    let d = Math.max(0, Math.min(1, u)) * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) {
        const t = lens[i] > 0 ? d / lens[i] : 0;
        const a = chain[i];
        const b = chain[i + 1];
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      d -= lens[i];
    }
    const Lp = chain[chain.length - 1];
    return { x: Lp.x, y: Lp.y };
  }

  function draw() {
    if (!player) return;
    /* 菜单/暂停时 update 不跑镜头，这里仍跟随，避免人物在屏外 */
    if (gameState !== "playing") {
      snapCamera();
    }
    const sx = (Math.random() - 0.5) * screenShake * 2;
    const sy = (Math.random() - 0.5) * screenShake * 2;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    try {
      drawWorldBackdrop();
      Rend.drawPlatforms(ctx, platforms, map);

      const orbT = performance.now();
      for (const ob of orbBlasts) {
        const dir = ob.vx >= 0 ? 1 : -1;
        const pulse = 0.92 + Math.sin(orbT / 72 + ob.x * 0.04) * 0.08;
        ctx.save();
        ctx.translate(ob.x, ob.y);
        const nose = 34 * pulse;
        const tail = 22 * pulse;
        const thick = 12 * pulse;
        ctx.beginPath();
        ctx.moveTo(dir * nose, 0);
        ctx.lineTo(-dir * tail * 0.15, -thick * 0.85);
        ctx.lineTo(-dir * tail, -thick * 0.35);
        ctx.lineTo(-dir * tail, thick * 0.35);
        ctx.lineTo(-dir * tail * 0.15, thick * 0.85);
        ctx.closePath();
        const gx0 = -dir * tail;
        const gx1 = dir * nose;
        const lg = ctx.createLinearGradient(gx0, 0, gx1, 0);
        lg.addColorStop(0, "rgba(69,10,10,0.35)");
        lg.addColorStop(0.35, "rgba(185,28,28,0.82)");
        lg.addColorStop(0.62, "rgba(239,68,68,0.92)");
        lg.addColorStop(0.88, "rgba(254,202,202,0.96)");
        lg.addColorStop(1, "rgba(254,249,249,0.98)");
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.strokeStyle = "rgba(254,226,226,0.92)";
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.strokeStyle = "rgba(220,38,38,0.65)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(dir * nose * 0.92, 0);
        ctx.lineTo(-dir * tail * 0.55, 0);
        ctx.stroke();
        ctx.restore();
      }

      for (const sb of slantBeams) {
        if ((sb.atkIdx | 0) === ATK_SLANT_WAR) {
          const face = (sb.iceFacing | 0) >= 0 ? 1 : -1;
          const pulse = 0.9 + Math.sin(performance.now() / 58 + sb.age * 0.045) * 0.1;
          const pop = Math.min(1, sb.age / 170);
          ctx.save();
          ctx.translate(sb.x, sb.y);
          ctx.scale(face, 1);
          const coneAng = Math.PI / 4;
          const c = Math.cos(coneAng);
          const s = Math.sin(coneAng);
          const len = sb.h * 1.18 * (0.68 + pop * 0.32);
          const halfBase = sb.w * 0.246 * (0.74 + pop * 0.26);
          const ox = sb.w * 0.052;
          const tipX = ox + c * len;
          const tipY = -s * len;
          const pnX = -s;
          const pnY = -c;
          const yB = 5;
          const V0 = { x: -halfBase * 1.08, y: yB };
          const V1 = { x: halfBase * 0.38, y: yB };
          const V2 = { x: halfBase * 1.06, y: yB - 14 };
          const V3 = { x: ox + c * len * 0.66, y: tipY + s * len * 0.24 };
          const V4 = { x: tipX, y: tipY };
          const V5 = { x: ox + c * len * 0.41, y: tipY + s * len * 0.42 };
          const V6 = { x: -halfBase * 0.56, y: yB - len * s * 0.17 };
          const leftChain = [V0, V6, V5, V4];
          const rightChain = [V1, V2, V3, V4];
          let cx = 0;
          let cy = 0;
          const verts = [V0, V1, V2, V3, V4, V5, V6];
          for (let vi = 0; vi < verts.length; vi++) {
            cx += verts[vi].x;
            cy += verts[vi].y;
          }
          cx /= verts.length;
          cy /= verts.length;

          const prismPath = () => {
            ctx.moveTo(V0.x, V0.y);
            ctx.lineTo(V1.x, V1.y);
            ctx.lineTo(V2.x, V2.y);
            ctx.lineTo(V3.x, V3.y);
            ctx.lineTo(V4.x, V4.y);
            ctx.lineTo(V5.x, V5.y);
            ctx.lineTo(V6.x, V6.y);
            ctx.closePath();
          };

          ctx.globalCompositeOperation = "lighter";
          const rg = ctx.createRadialGradient(tipX, tipY, 4, tipX, tipY, len * 0.78);
          rg.addColorStop(0, "rgba(255,255,255," + 0.58 * pulse + ")");
          rg.addColorStop(0.32, "rgba(186,230,253," + 0.42 * pulse + ")");
          rg.addColorStop(0.62, "rgba(125,211,252," + 0.22 * pulse + ")");
          rg.addColorStop(1, "rgba(56,189,248,0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          prismPath();
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";

          ctx.beginPath();
          prismPath();
          const cg = ctx.createLinearGradient(ox * 0.5, yB, tipX, tipY);
          cg.addColorStop(0, "rgba(255,255,255,0.97)");
          cg.addColorStop(0.15, "rgba(236,254,255,0.93)");
          cg.addColorStop(0.34, "rgba(165,243,252,0.86)");
          cg.addColorStop(0.53, "rgba(56,189,248,0.64)");
          cg.addColorStop(0.72, "rgba(14,165,233,0.42)");
          cg.addColorStop(1, "rgba(8,145,178,0.13)");
          ctx.fillStyle = cg;
          ctx.fill();

          ctx.save();
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = "rgba(95,130,168,0.26)";
          ctx.beginPath();
          for (let vi = 0; vi < verts.length; vi++) {
            const p = verts[vi];
            const ix = cx + (p.x - cx) * 0.58;
            const iy = cy + (p.y - cy) * 0.58;
            if (vi === 0) ctx.moveTo(ix, iy);
            else ctx.lineTo(ix, iy);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();

          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 2.9;
          ctx.beginPath();
          prismPath();
          ctx.stroke();
          ctx.strokeStyle = "rgba(34,211,238,0.52)";
          ctx.lineWidth = 1.4;
          ctx.stroke();

          ctx.strokeStyle = "rgba(148,222,255,0.68)";
          ctx.lineWidth = 1.55;
          ctx.beginPath();
          ctx.moveTo(V0.x, V0.y);
          ctx.lineTo(V6.x, V6.y);
          ctx.lineTo(V5.x, V5.y);
          ctx.lineTo(V4.x * 0.98 + ox * 0.02, V4.y * 0.98);
          ctx.stroke();
          ctx.strokeStyle = "rgba(186,230,253,0.55)";
          ctx.lineWidth = 1.35;
          ctx.beginPath();
          ctx.moveTo(V1.x, V1.y);
          ctx.lineTo(V2.x, V2.y);
          ctx.lineTo(V3.x, V3.y);
          ctx.lineTo(V4.x * 0.99 + ox * 0.01, V4.y * 0.99);
          ctx.stroke();

          ctx.strokeStyle = "rgba(207,250,254,0.58)";
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo((V0.x + V6.x) * 0.5 + ox * 0.08, (V0.y + V6.y) * 0.5);
          ctx.lineTo(V5.x * 0.88 + tipX * 0.12, V5.y * 0.88 + tipY * 0.12);
          ctx.stroke();

          const perpX = c;
          const perpY = -s;
          for (let pass = 0; pass < 2; pass++) {
            const faint = pass === 1;
            ctx.strokeStyle = faint ? "rgba(230,248,255,0.22)" : "rgba(255,255,255,0.4)";
            ctx.lineWidth = faint ? 0.65 : 0.92;
            const off = faint ? 0.028 : 0;
            for (let r = 1; r <= 22; r++) {
              const u = r / 23 + off;
              if (u >= 0.97) continue;
              const P = pointOnPolyline(leftChain, u);
              const Q = pointOnPolyline(rightChain, u);
              const jag = Math.sin(r * 1.63 + sb.age * 0.018 + pass) * (faint ? 2.2 : 4.2);
              ctx.beginPath();
              ctx.moveTo(P.x + perpX * jag, P.y + perpY * jag);
              ctx.lineTo(Q.x - perpX * jag, Q.y - perpY * jag);
              ctx.stroke();
            }
          }

          ctx.strokeStyle = "rgba(191,232,255,0.32)";
          ctx.lineWidth = 0.7;
          for (let r = 1; r < 22; r++) {
            const u = (r + 0.5) / 23;
            const P = pointOnPolyline(leftChain, u);
            const Q = pointOnPolyline(rightChain, u);
            const mxp = (P.x + Q.x) * 0.5;
            const mxq = (P.y + Q.y) * 0.5;
            const dl = 10 + (r % 4) * 3;
            ctx.beginPath();
            ctx.moveTo(mxp, mxq);
            ctx.lineTo(mxp + c * dl * 0.35, mxq + s * dl * 0.35);
            ctx.stroke();
          }

          ctx.strokeStyle = "rgba(56,189,248,0.38)";
          ctx.lineWidth = 0.95;
          for (let e = 0; e < 5; e++) {
            const u = 0.14 + e * 0.168;
            const P = pointOnPolyline(leftChain, u);
            ctx.beginPath();
            ctx.moveTo(P.x, P.y);
            ctx.lineTo(P.x + pnX * (18 + e * 6), P.y + pnY * (18 + e * 6));
            ctx.stroke();
          }

          ctx.strokeStyle = "rgba(230,250,255,0.42)";
          ctx.lineWidth = 0.85;
          for (let k = 1; k <= 10; k++) {
            const u = k / 11 * 0.88;
            const P = pointOnPolyline(leftChain, u);
            const Q = pointOnPolyline(rightChain, u);
            const sx = P.x + (Q.x - P.x) * 0.35;
            const sy = P.y + (Q.y - P.y) * 0.35;
            ctx.beginPath();
            ctx.moveTo(sx - pnX * (9 - k * 0.45), sy - pnY * (9 - k * 0.45));
            ctx.lineTo(sx + pnX * (5 + (k % 5)), sy + pnY * (5 + (k % 5)));
            ctx.stroke();
          }

          ctx.fillStyle = "rgba(255,255,255," + (0.52 + pulse * 0.28) + ")";
          const sparkT = performance.now() / 220;
          for (let g = 0; g < 18; g++) {
            const u = 0.08 + ((g * 19 + sb.x * 0.09) % 82) * 0.01;
            if (u > 0.9) continue;
            const P = pointOnPolyline(leftChain, u);
            const Q = pointOnPolyline(rightChain, u);
            const wx = 0.35 + ((g * 13) % 31) * 0.01;
            const sx = P.x + (Q.x - P.x) * wx + Math.sin(sparkT + g) * 2.8;
            const sy = P.y + (Q.y - P.y) * wx + Math.cos(sparkT * 0.88 + g * 0.47) * 2.2;
            const ss = 1.6 + (g % 5) * 0.5;
            ctx.fillRect(sx - ss * 0.5, sy - ss * 0.5, ss, ss);
          }

          ctx.strokeStyle = "rgba(236,254,255," + 0.88 * pulse + ")";
          ctx.lineWidth = 2.75;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - c * 26, tipY + s * 26);
          ctx.stroke();
          ctx.restore();
          continue;
        }

        const ang = Math.atan2(sb.vy, sb.vx || 0.001);
        ctx.save();
        ctx.translate(sb.x, sb.y);
        ctx.rotate(ang);
        const L = sb.w;
        const Hh = sb.h * 0.5;
        const grd = ctx.createLinearGradient(0, -Hh, L, Hh);
        grd.addColorStop(0, "rgba(255,252,240,0.95)");
        grd.addColorStop(0.4, "rgba(186,230,253,0.75)");
        grd.addColorStop(1, "rgba(14,165,233,0.04)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, -Hh, L, sb.h);
        ctx.strokeStyle = "rgba(224,242,254,0.5)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, -Hh, L, sb.h);
        ctx.restore();
      }

      for (const sw of slashWaves) {
        const left = Math.min(sw.x0, sw.tip) - 10;
        const ww = Math.abs(sw.tip - sw.x0) + 36;
        const gy = sw.y;
        const grow = Math.min(1, sw.age / 300);
        const maxTip = Math.min(sw.h * 1.05, 48);
        ctx.fillStyle = "rgba(55,48,35,0.22)";
        ctx.fillRect(left - 4, gy - 3, ww + 8, 5);
        const step = 13;
        for (let px = left + 4; px < left + ww - 4; px += step) {
          const seed = Math.sin(px * 0.31 + sw.x0 * 0.07) * 0.5 + 0.5;
          const h = maxTip * (0.42 + seed * 0.58) * (0.28 + grow * 0.72);
          const halfW = 4.5 + seed * 5;
          const tipX = px + (seed - 0.5) * 4;
          const sh = ctx.createLinearGradient(tipX, gy - h, tipX, gy);
          sh.addColorStop(0, "rgba(212,175,95,0.95)");
          sh.addColorStop(0.45, "rgba(180,134,52,0.9)");
          sh.addColorStop(0.78, "rgba(120,83,32,0.88)");
          sh.addColorStop(1, "rgba(62,44,22,0.75)");
          ctx.fillStyle = sh;
          ctx.beginPath();
          ctx.moveTo(tipX, gy - h);
          ctx.lineTo(tipX - halfW, gy);
          ctx.lineTo(tipX + halfW, gy);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "rgba(41,37,24,0.55)";
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(92,74,42,0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(left, gy);
        ctx.lineTo(left + ww, gy);
        ctx.stroke();
      }

      if (settings.mode === "dummy") {
        Rend.drawDummy(ctx, dummy, map);
      } else if (foe) {
        Rend.drawFighterWorld(ctx, foe, foe.y, foe.crouchHeldDraw, foePalette);
      }

      Rend.drawFighterWorld(ctx, player, player.y, player.crouchHeldDraw, null);

      if ((player.getupInvuln | 0) > 8) {
        const u = Math.min(1, (player.getupInvuln | 0) / GETUP_INVULN_FRAMES);
        ctx.strokeStyle = "rgba(125,211,252," + (0.28 + u * 0.35) + ")";
        ctx.lineWidth = 3;
        ctx.strokeRect(player.x - 6, player.y - player.h - 8, player.w + 12, player.h + 14);
      }

      const Ad = curAtk(player);
      const attacking = player.attackPhase >= Ad.act0 && player.attackPhase <= Ad.act1;
      const hideArcherMeleeBox = archerArrowStandSwing(player);
      if (attacking && !hideArcherMeleeBox) {
        const box = Rend.getAttackBox(player);
        if (box) {
          ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
          ctx.fillRect(box.x, box.y, box.w, box.h);
          ctx.strokeStyle = "rgba(251, 191, 36, 0.65)";
          ctx.lineWidth = 2;
          ctx.strokeRect(box.x, box.y, box.w, box.h);
        }
      }

      ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
      ctx.lineWidth = 2;
      const arrowFat = player && player.charType === "archer";
      const arrLen = arrowFat ? 44 : 26;
      const arrShaft = arrowFat ? 4 : 2;
      for (const ar of arrows) {
        const heavy = arrowFat && ar.heavy;
        const volley = arrowFat && ar.volley;
        const duoLine = arrowFat && ar.duoLine;
        const fanV = arrowFat && ar.fanVolley;
        const airLaser = arrowFat && ar.airLaser;
        let shaftMul = 1;
        let headMul = 1;
        if (volley) {
          shaftMul = 2;
          headMul = 2;
        } else if (duoLine) {
          shaftMul = 1.72;
          headMul = 1.65;
        } else if (fanV) {
          shaftMul = 1.78;
          headMul = 1.72;
        }
        const ang = Math.atan2(ar.vy || 0, ar.vx || 0.001);
        const x1 = ar.x;
        const y1 = ar.y;

        if (airLaser) {
          const laserLen = arrLen * 1.52;
          const x2 = ar.x + Math.cos(ang) * laserLen;
          const y2 = ar.y + Math.sin(ang) * laserLen;
          const tNow = performance.now();
          const pulse = 0.88 + Math.sin(tNow / 55 + ar.x * 0.02) * 0.12;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = "rgba(56,189,248," + (0.42 * pulse) + ")";
          ctx.lineWidth = 14;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.strokeStyle = "rgba(125,211,252," + (0.55 * pulse) + ")";
          ctx.lineWidth = 7;
          ctx.stroke();
          ctx.restore();
          ctx.globalCompositeOperation = "source-over";

          const lg = ctx.createLinearGradient(x1, y1, x2, y2);
          lg.addColorStop(0, "rgba(14,165,233," + (0.85 * pulse) + ")");
          lg.addColorStop(0.45, "rgba(224,242,254," + (0.95 * pulse) + ")");
          lg.addColorStop(0.72, "rgba(186,230,253," + (0.92 * pulse) + ")");
          lg.addColorStop(1, "rgba(56,189,248," + (0.35 * pulse) + ")");
          ctx.strokeStyle = lg;
          ctx.lineWidth = 3.2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          ctx.strokeStyle = "rgba(255,255,255," + (0.72 * pulse) + ")";
          ctx.lineWidth = 1.15;
          ctx.beginPath();
          ctx.moveTo(x1 + Math.cos(ang) * 4, y1 + Math.sin(ang) * 4);
          ctx.lineTo(x2, y2);
          ctx.stroke();

          const bx = Math.cos(ang);
          const by = Math.sin(ang);
          const tipGlow = ctx.createRadialGradient(x2, y2, 0, x2, y2, 16 * pulse);
          tipGlow.addColorStop(0, "rgba(255,255,255,0.95)");
          tipGlow.addColorStop(0.4, "rgba(125,211,252,0.75)");
          tipGlow.addColorStop(1, "rgba(14,165,233,0)");
          ctx.fillStyle = tipGlow;
          ctx.beginPath();
          ctx.arc(x2, y2, 10 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255," + (0.9 * pulse) + ")";
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - bx * 9 - by * 4, y2 - by * 9 + bx * 4);
          ctx.lineTo(x2 - bx * 9 + by * 4, y2 - by * 9 - bx * 4);
          ctx.closePath();
          ctx.fill();
          continue;
        }

        const len = arrLen * (heavy ? 1.62 : 1);
        const shaftW = arrShaft * (heavy ? 1.42 : 1) * shaftMul;
        const x2 = ar.x + Math.cos(ang) * len;
        const y2 = ar.y + Math.sin(ang) * len;
        ctx.lineWidth = shaftW;
        ctx.strokeStyle = heavy
          ? "rgba(200,240,210,0.95)"
          : arrowFat
            ? "rgba(254,243,199,0.95)"
            : "rgba(251, 191, 36, 0.55)";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.strokeStyle = heavy ? "rgba(134, 239, 172, 0.75)" : "rgba(251, 191, 36, 0.55)";
        ctx.fillStyle = heavy ? "rgba(187, 247, 208, 0.95)" : "rgba(254, 243, 199, 0.9)";
        ctx.beginPath();
        const bx = Math.cos(ang);
        const by = Math.sin(ang);
        const hs = (arrowFat ? 12 : 8) * (heavy ? 1.48 : 1) * headMul;
        const hw = (arrowFat ? 5 : 3.5) * (heavy ? 1.38 : 1) * headMul;
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - bx * hs - by * hw, y2 - by * hs + bx * hw);
        ctx.lineTo(x2 - bx * hs + by * hw, y2 - by * hs - bx * hw);
        ctx.closePath();
        ctx.fill();
      }

      for (const p of particles) {
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.col;
        ctx.fillRect(p.x, p.y, p.s, p.s);
        ctx.globalAlpha = 1;
      }

      for (const r of shockRings) {
        const t = r.age / r.life;
        const rx = 26 + t * 210;
        const ry = 11 + t * 82;
        const a = (1 - t) * 0.52;
        ctx.strokeStyle = "rgba(224, 242, 254, " + a + ")";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(251, 191, 36, " + a * 0.48 + ")";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rx * 0.74, ry * 0.74, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.font = "700 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      for (const t of floatTexts) {
        const alpha = 1 - t.age / t.life;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = t.color;
        ctx.font = "800 " + Math.floor(16 * t.scale) + "px system-ui, sans-serif";
        ctx.fillText(t.text, t.x, t.y);
        ctx.globalAlpha = 1;
      }

      if (player.combo >= 2) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = "800 22px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = player.combo >= 10 ? "#f472b6" : "#6ee7b7";
        ctx.fillText("COMBO ×" + player.combo, 24, 42);
      }
    } catch (err) {
      console.error("[mini-fighter draw]", err);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "rgba(251,113,133,0.95)";
      ctx.fillRect(12, 12, W - 24, 72);
      ctx.fillStyle = "#0f172a";
      ctx.font = "14px system-ui,sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("绘制出错（请看控制台）。", 24, 52);
    }

    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const t = Number.isFinite(now) ? now : performance.now();
    const raw = t - last;
    last = t;
    /** 避免 raw≤0 / NaN 导致粒子、连击计时等异常 */
    const dt = !Number.isFinite(raw) || raw <= 0 ? 1000 / 60 : Math.min(raw, 48);
    try {
      update(dt);
      draw();
    } catch (err) {
      console.error("[mini-fighter frame]", err);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

  readSettings();
  map = MAPS[settings.mapIndex];
  platforms = map.platforms;
  resetPositions(true);
})();
