/* global: 地图、招式表、共用轻量工具（由 game-main / game-render 使用） */
(function () {
  window.MiniFighterData = window.MiniFighterData || {};

  const H = 480;
  const WORLD_W = 3200;

  /**
   * 全身受击框（世界像素），与 game-render.js 中小人外廓一致：
   * PIX_W * PIX_SCALE = LEG_W * GRID_S * (4 / GRID_S) = 18 * 4 = 72，高同理 27 * 4 = 108。
   */
  const FIGHTER_BODY_HURT_W = 72;
  const FIGHTER_BODY_HURT_H = 108;

  /** 脚底可站立的矩形平台 {x,y,w,h}，y 为顶边；backdrop 由 game-main 绘制主题背景 */
  const MAPS = [
    {
      id: "dojo",
      name: "木榻道场",
      worldW: WORLD_W,
      spawnYou: 400,
      spawnFoe: 2050,
      dummyX: 2320,
      backdrop: "dojo",
      skyTop: "#e8dcc8",
      skyMid: "#c4b49a",
      skyBot: "#6b5344",
      accent: "#8b6914",
      platforms: [
        { x: 0, y: H - 72, w: WORLD_W, h: 140 },
        { x: 140, y: H - 72 - 56, w: 110, h: 14 },
        { x: 340, y: H - 72 - 102, w: 190, h: 14 },
        { x: 620, y: H - 72 - 68, w: 130, h: 14 },
        { x: 840, y: H - 72 - 128, w: 260, h: 14 },
        { x: 1180, y: H - 72 - 82, w: 95, h: 14 },
        { x: 1360, y: H - 72 - 148, w: 220, h: 14 },
        { x: 1680, y: H - 72 - 54, w: 145, h: 14 },
        { x: 1920, y: H - 72 - 112, w: 200, h: 14 },
        { x: 2220, y: H - 72 - 76, w: 120, h: 14 },
        { x: 2420, y: H - 72 - 138, w: 280, h: 14 },
        { x: 2780, y: H - 72 - 92, w: 160, h: 14 },
        { x: 3020, y: H - 72 - 62, w: 140, h: 14 },
        { x: 60, y: H - 72 - 34, w: 220, h: 12 },
        { x: 520, y: H - 72 - 44, w: 180, h: 12 },
        { x: 1540, y: H - 72 - 38, w: 240, h: 12 },
        { x: 2860, y: H - 72 - 42, w: 260, h: 12 },
      ],
    },
    {
      id: "bamboo",
      name: "竹海忍径",
      worldW: WORLD_W,
      spawnYou: 440,
      spawnFoe: 2080,
      dummyX: 2340,
      backdrop: "bamboo",
      skyTop: "#b8dce8",
      skyMid: "#3d6b58",
      skyBot: "#0d1810",
      accent: "#2d5a40",
      platforms: [
        { x: 0, y: H - 72, w: WORLD_W, h: 140 },
        { x: 100, y: H - 72 - 48, w: 90, h: 13 },
        { x: 260, y: H - 72 - 88, w: 170, h: 13 },
        { x: 520, y: H - 72 - 58, w: 110, h: 13 },
        { x: 720, y: H - 72 - 118, w: 240, h: 13 },
        { x: 1040, y: H - 72 - 72, w: 100, h: 13 },
        { x: 1220, y: H - 72 - 132, w: 200, h: 13 },
        { x: 1500, y: H - 72 - 64, w: 130, h: 13 },
        { x: 1720, y: H - 72 - 108, w: 180, h: 13 },
        { x: 1980, y: H - 72 - 52, w: 95, h: 13 },
        { x: 2160, y: H - 72 - 96, w: 220, h: 13 },
        { x: 2460, y: H - 72 - 78, w: 115, h: 13 },
        { x: 2660, y: H - 72 - 142, w: 300, h: 13 },
        { x: 3020, y: H - 72 - 66, w: 150, h: 13 },
        { x: 40, y: H - 72 - 30, w: 280, h: 11 },
        { x: 880, y: H - 72 - 36, w: 160, h: 11 },
        { x: 1880, y: H - 72 - 32, w: 200, h: 11 },
        { x: 2920, y: H - 72 - 40, w: 220, h: 11 },
      ],
    },
    {
      id: "sakura",
      name: "樱庭满开",
      worldW: WORLD_W,
      spawnYou: 420,
      spawnFoe: 2060,
      dummyX: 2310,
      backdrop: "sakura",
      skyTop: "#ffd6e8",
      skyMid: "#e8a0c8",
      skyBot: "#5c3d52",
      accent: "#9d4a6f",
      platforms: [
        { x: 0, y: H - 72, w: WORLD_W, h: 140 },
        { x: 120, y: H - 72 - 52, w: 125, h: 14 },
        { x: 360, y: H - 72 - 98, w: 210, h: 14 },
        { x: 660, y: H - 72 - 62, w: 115, h: 14 },
        { x: 880, y: H - 72 - 122, w: 250, h: 14 },
        { x: 1200, y: H - 72 - 74, w: 105, h: 14 },
        { x: 1380, y: H - 72 - 138, w: 230, h: 14 },
        { x: 1700, y: H - 72 - 56, w: 155, h: 14 },
        { x: 1940, y: H - 72 - 106, w: 190, h: 14 },
        { x: 2220, y: H - 72 - 84, w: 125, h: 14 },
        { x: 2440, y: H - 72 - 152, w: 270, h: 14 },
        { x: 2800, y: H - 72 - 68, w: 145, h: 14 },
        { x: 3040, y: H - 72 - 96, w: 130, h: 14 },
        { x: 80, y: H - 72 - 36, w: 260, h: 12 },
        { x: 580, y: H - 72 - 42, w: 170, h: 12 },
        { x: 1580, y: H - 72 - 38, w: 210, h: 12 },
        { x: 2580, y: H - 72 - 44, w: 240, h: 12 },
      ],
    },
    {
      id: "city",
      name: "霓虹天台",
      worldW: WORLD_W,
      spawnYou: 380,
      spawnFoe: 2020,
      dummyX: 2290,
      backdrop: "city",
      skyTop: "#1a1040",
      skyMid: "#2d1f58",
      skyBot: "#0a0618",
      accent: "#4c3d6b",
      platforms: [
        { x: 0, y: H - 72, w: 1540, h: 140 },
        { x: 1660, y: H - 72, w: WORLD_W - 1660, h: 140 },
        { x: 160, y: H - 72 - 60, w: 100, h: 15 },
        { x: 340, y: H - 72 - 110, w: 220, h: 15 },
        { x: 640, y: H - 72 - 70, w: 125, h: 15 },
        { x: 860, y: H - 72 - 135, w: 270, h: 15 },
        { x: 1220, y: H - 72 - 86, w: 90, h: 15 },
        { x: 1380, y: H - 72 - 155, w: 240, h: 15 },
        { x: 1720, y: H - 72 - 58, w: 150, h: 15 },
        { x: 1960, y: H - 72 - 118, w: 195, h: 15 },
        { x: 2260, y: H - 72 - 78, w: 118, h: 15 },
        { x: 2460, y: H - 72 - 145, w: 290, h: 15 },
        { x: 2840, y: H - 72 - 64, w: 135, h: 15 },
        { x: 3060, y: H - 72 - 100, w: 120, h: 15 },
        { x: 50, y: H - 72 - 32, w: 240, h: 13 },
        { x: 960, y: H - 72 - 40, w: 180, h: 13 },
        { x: 2100, y: H - 72 - 36, w: 200, h: 13 },
        { x: 2880, y: H - 72 - 46, w: 270, h: 13 },
      ],
    },
  ];

  /**
   * 0~3 站立四连；4 下段；5 扫踢；6 蹲跳踢；
   * 7 W+J 地面升龙肘；8 W+J 空中下劈；
   * 9 第五段膝撞；10 第六段回旋肘；11 空中 S+J 坠踢（落地/命中震荡）
   * 18 空中 S+A/D+J 武者定向俯冲至最底层可走面（红冲）
   * 19 弓手空中 S+J / S+A/D+J：向指定方向射箭并腾空（无俯冲）
   * 20 地面蹲姿 S+J 贯落（穿透中层台面直至最底层，沿途命中）
   *
   * hitStun：基础僵直帧（再按伤害在 main 里缩放）
   * hitReact：受击演出类型（渲染用）
   * hitKnock：击退力度系数（乘在基础击退上）
   */
  const ATTACKS = [
    {
      key: "jab",
      label: "刺拳",
      hitStun: 7,
      hitReact: "tap",
      hitKnock: 0.85,
      total: 32,
      act0: 7,
      act1: 10,
      cancel0: 17,
      cancel1: 26,
      rootedEnd: 11,
      dmg: 1,
      reachPeak: [36, 70],
      ah: 26,
      cyOff: -56,
      peakAp: [8, 9],
      peakMul: 0.72,
      lunge: { 6: 4.2, 7: 2.2, 8: 1 },
    },
    {
      key: "cross",
      label: "后手直拳",
      hitStun: 10,
      hitReact: "strike",
      hitKnock: 1.05,
      total: 32,
      act0: 7,
      act1: 10,
      cancel0: 17,
      cancel1: 26,
      rootedEnd: 11,
      dmg: 1.12,
      reachPeak: [34, 72],
      ah: 26,
      cyOff: -58,
      peakAp: [8, 9],
      peakMul: 0.78,
      lunge: { 6: 5.0, 7: 2.8, 8: 1.2 },
    },
    {
      key: "hook",
      label: "勾拳",
      hitStun: 9,
      hitReact: "hooked",
      hitKnock: 0.95,
      total: 32,
      act0: 6,
      act1: 8,
      cancel0: 15,
      cancel1: 26,
      rootedEnd: 10,
      dmg: 1.05,
      reachPeak: [28, 52],
      ah: 30,
      cyOff: -48,
      peakAp: [7, 7],
      peakMul: 0.88,
      lunge: { 5: 2.2, 6: 1.6, 7: 0.9 },
    },
    {
      key: "palm",
      label: "双推掌",
      hitStun: 12,
      hitReact: "wide",
      hitKnock: 1.25,
      total: 32,
      act0: 7,
      act1: 10,
      cancel0: 17,
      cancel1: 26,
      rootedEnd: 11,
      dmg: 1.18,
      reachPeak: [32, 58],
      ah: 22,
      cyOff: -54,
      peakAp: [8, 9],
      peakMul: 0.72,
      lunge: { 6: 3.2, 7: 2.0, 8: 1.0 },
    },
    {
      key: "low",
      label: "下段刺",
      hitStun: 8,
      hitReact: "low",
      hitKnock: 0.75,
      total: 28,
      act0: 5,
      act1: 8,
      cancel0: 15,
      cancel1: 22,
      rootedEnd: 9,
      dmg: 1.08,
      reachPeak: [32, 58],
      ah: 18,
      cyOff: -36,
      peakAp: [6, 7],
      peakMul: 0.8,
      lunge: { 4: 2.4, 5: 1.8, 6: 1 },
    },
    {
      key: "sweep",
      label: "扫踢",
      hitStun: 13,
      hitReact: "sweep",
      hitKnock: 1.35,
      total: 30,
      act0: 6,
      act1: 9,
      cancel0: 16,
      cancel1: 24,
      rootedEnd: 10,
      dmg: 1.15,
      reachPeak: [38, 72],
      ah: 16,
      cyOff: -28,
      peakAp: [7, 8],
      peakMul: 0.75,
      lunge: { 5: 3.0, 6: 2.2, 7: 1.2 },
    },
    {
      key: "skick",
      label: "蹲跳踢",
      hitStun: 14,
      hitReact: "launch",
      hitKnock: 1.45,
      total: 24,
      act0: 4,
      act1: 7,
      cancel0: 14,
      cancel1: 18,
      rootedEnd: 8,
      dmg: 1.28,
      reachPeak: [34, 62],
      ah: 20,
      cyOff: -40,
      peakAp: [5, 6],
      peakMul: 0.82,
      lunge: { 3: 2.5, 4: 3.5, 5: 2.0, 6: 1 },
    },
    {
      key: "riseElbow",
      label: "升龙肘",
      hitStun: 16,
      hitReact: "launch",
      hitKnock: 1.45,
      total: 34,
      act0: 8,
      act1: 12,
      cancel0: 19,
      cancel1: 28,
      rootedEnd: 12,
      dmg: 1.38,
      reachPeak: [34, 72],
      ah: 34,
      cyOff: -68,
      peakAp: [9, 11],
      peakMul: 0.82,
      lunge: { 6: 2.2, 7: 3.8, 8: 5.2, 9: 3.4, 10: 1.8 },
    },
    {
      key: "dive",
      label: "俯冲劈掌",
      hitStun: 18,
      hitReact: "slam",
      hitKnock: 1.55,
      total: 28,
      act0: 5,
      act1: 9,
      cancel0: 16,
      cancel1: 22,
      rootedEnd: 10,
      dmg: 1.42,
      reachPeak: [40, 78],
      ah: 28,
      cyOff: -40,
      peakAp: [6, 8],
      peakMul: 0.78,
      lunge: { 4: 2.0, 5: 5.5, 6: 4.2, 7: 2.4 },
    },
    {
      key: "knee",
      label: "膝撞",
      hitStun: 15,
      hitReact: "gut",
      hitKnock: 1.2,
      total: 30,
      act0: 6,
      act1: 9,
      cancel0: 16,
      cancel1: 24,
      rootedEnd: 10,
      dmg: 1.22,
      reachPeak: [26, 48],
      ah: 28,
      cyOff: -44,
      peakAp: [7, 8],
      peakMul: 0.85,
      lunge: { 5: 2.8, 6: 3.6, 7: 2.0 },
    },
    {
      key: "spinBack",
      label: "回旋肘",
      hitStun: 17,
      hitReact: "spin",
      hitKnock: 1.4,
      total: 32,
      act0: 7,
      act1: 11,
      cancel0: 18,
      cancel1: 26,
      rootedEnd: 11,
      dmg: 1.3,
      reachPeak: [34, 68],
      ah: 26,
      cyOff: -52,
      peakAp: [8, 10],
      peakMul: 0.76,
      lunge: { 6: 3.0, 7: 2.4, 8: 4.0, 9: 2.2 },
    },
    {
      key: "sDrop",
      label: "坠踢",
      hitStun: 17,
      hitReact: "slam",
      hitKnock: 1.52,
      total: 30,
      act0: 5,
      act1: 10,
      cancel0: 17,
      cancel1: 22,
      rootedEnd: 10,
      dmg: 1.38,
      reachPeak: [48, 92],
      ah: 28,
      cyOff: -14,
      peakAp: [6, 9],
      peakMul: 0.82,
      lunge: { 4: 1.2, 5: 3.6, 6: 8.2, 7: 6.2, 8: 3.4, 9: 1.6 },
    },
    /** 弓手：<kbd>U</kbd> 抡弓横扫 — 大范围、极强击退、伤害更低、长后摇（仅 charType=archer） */
    {
      key: "spinBack",
      label: "抡弓横扫",
      hitStun: 11,
      hitReact: "wide",
      hitKnock: 20,
      total: 42,
      act0: 11,
      act1: 17,
      cancel0: 39,
      cancel1: 41,
      rootedEnd: 22,
      dmg: 0.32,
      reachPeak: [92, 124],
      ah: 40,
      cyOff: -44,
      peakAp: [13, 15],
      peakMul: 0.78,
      lunge: { 8: 4.5, 9: 5.5, 10: 4.8, 11: 3.4, 12: 2.2, 13: 1.4 },
    },
    /** 武者：原地 <kbd>U</kbd> 聚气推弹（命中框极弱，气弹在峰值帧由逻辑生成） */
    {
      key: "palm",
      label: "聚气推弹",
      hitStun: 6,
      hitReact: "tap",
      hitKnock: 0.45,
      total: 28,
      act0: 18,
      act1: 21,
      cancel0: 24,
      cancel1: 26,
      rootedEnd: 15,
      dmg: 0.42,
      reachPeak: [24, 34],
      ah: 16,
      cyOff: -50,
      peakAp: [11, 13],
      peakMul: 0.55,
      lunge: { 7: 2.4, 8: 2.0, 9: 1.4, 10: 1 },
    },
    /** 武者：<kbd>W</kbd>+<kbd>A</kbd>/<kbd>D</kbd>+<kbd>U</kbd> 斜上短光柱起手 */
    {
      key: "palm",
      label: "斜光柱",
      hitStun: 9,
      hitReact: "strike",
      hitKnock: 1.05,
      total: 22,
      act0: 12,
      act1: 14,
      cancel0: 18,
      cancel1: 20,
      rootedEnd: 11,
      dmg: 1.02,
      reachPeak: [28, 40],
      ah: 22,
      cyOff: -56,
      peakAp: [7, 9],
      peakMul: 0.72,
      lunge: { 6: 2.2, 7: 1.8, 8: 1.2 },
    },
    /** 弓手：<kbd>W</kbd>+<kbd>A</kbd>/<kbd>D</kbd>+<kbd>U</kbd> 扇形三连射起手 */
    {
      key: "jab",
      label: "扇形箭",
      hitStun: 7,
      hitReact: "tap",
      hitKnock: 0.62,
      total: 20,
      act0: 11,
      act1: 13,
      cancel0: 16,
      cancel1: 18,
      rootedEnd: 10,
      dmg: 0.80,
      reachPeak: [26, 36],
      ah: 20,
      cyOff: -52,
      peakAp: [6, 8],
      peakMul: 0.68,
      lunge: { 5: 1.8, 6: 1.4, 7: 1 },
    },
    /** 武者：<kbd>S</kbd> 蓄力松 <kbd>U</kbd> 裂地斩收尾动作 */
    {
      key: "sweep",
      label: "裂地斩",
      hitStun: 14,
      hitReact: "slam",
      hitKnock: 1.38,
      total: 26,
      act0: 5,
      act1: 12,
      cancel0: 18,
      cancel1: 23,
      rootedEnd: 13,
      dmg: 1.22,
      reachPeak: [36, 72],
      ah: 22,
      cyOff: -38,
      peakAp: [7, 10],
      peakMul: 0.68,
      lunge: { 5: 4.2, 6: 5.5, 7: 4.0, 8: 2.4 },
    },
    /** 弓手：<kbd>S</kbd> 蓄力松 <kbd>U</kbd> 三矢齐射（水平） */
    {
      key: "cross",
      label: "三连平射",
      hitStun: 9,
      hitReact: "strike",
      hitKnock: 0.95,
      total: 26,
      act0: 7,
      act1: 12,
      cancel0: 17,
      cancel1: 22,
      rootedEnd: 13,
      dmg: 0.94,
      reachPeak: [30, 48],
      ah: 22,
      cyOff: -46,
      peakAp: [7, 9],
      peakMul: 0.7,
      lunge: { 5: 2.0, 6: 2.4, 7: 1.6 },
    },
    /** 空中 <kbd>S</kbd>+<kbd>A</kbd>/<kbd>D</kbd>+<kbd>J</kbd>：武者俯冲至脚下最底层可走面（贴身红冲判定） */
    {
      key: "dive",
      label: "空俯冲",
      hitStun: 12,
      hitReact: "slam",
      hitKnock: 1.32,
      total: 96,
      act0: 3,
      act1: 88,
      cancel0: 90,
      cancel1: 94,
      rootedEnd: 88,
      dmg: 1.15,
      reachPeak: [42, 58],
      ah: 38,
      cyOff: -44,
      peakAp: [3, 88],
      peakMul: 0.82,
      lunge: {},
    },
    /** 弓手空中：<kbd>S</kbd>+<kbd>J</kbd> 向下散射并腾空；<kbd>S</kbd>+<kbd>A</kbd>/<kbd>D</kbd>+<kbd>J</kbd> 面向斜下约 45° 三矢并腾空 */
    {
      key: "cross",
      label: "空射箭",
      hitStun: 8,
      hitReact: "strike",
      hitKnock: 1.02,
      total: 22,
      act0: 4,
      act1: 11,
      cancel0: 14,
      cancel1: 18,
      rootedEnd: 11,
      dmg: 0.95,
      reachPeak: [26, 38],
      ah: 22,
      cyOff: -52,
      peakAp: [5, 7],
      peakMul: 0.72,
      lunge: {},
    },
    /** 地面蹲姿 <kbd>S</kbd>+<kbd>J</kbd>：纵向贯穿落至当前 x 下最底层可走面，沿途扫判定 */
    {
      key: "sDrop",
      label: "贯落",
      hitStun: 16,
      hitReact: "slam",
      hitKnock: 1.48,
      total: 34,
      act0: 7,
      act1: 26,
      cancel0: 28,
      cancel1: 31,
      rootedEnd: 10,
      dmg: 1.22,
      reachPeak: [44, 72],
      ah: 32,
      cyOff: -36,
      peakAp: [7, 26],
      peakMul: 0.74,
      lunge: { 5: 1.4, 6: 2.2 },
    },
  ];

  /** 与 game-main 一致：武者俯冲 / 弓手空射 / 贯落（末项） */
  const ATK_AIR_STREAK = ATTACKS.length - 3;
  const ATK_ARCHER_AIR_VOLLEY = ATTACKS.length - 2;
  const ATK_PILLAR_DROP = ATTACKS.length - 1;

  /** 弓手站位射箭（J 0~3、非贴身）：更长前摇 / 出手略晚，与 resolveAttackForFighter 一致 */
  const ARCHER_RANGED_FRAME = {
    act0: 5,
    act1: 6,
    total: 11,
    cancel0: 7,
    cancel1: 7,
    rootedEnd: 4,
    peak0: 4,
    peak1: 4,
  };

  /** 弓手贴身四连伤害倍率（相对武者同招） */
  const ARCHER_MELEE_DMG_MUL = 0.74;

  /** 弓手箭矢：削弱箭（普攻射出的 weak）与整体命中加成 */
  const ARCHER_ARROW_WEAK_MUL = 0.67;
  const ARCHER_ARROW_STRONG_MUL = 1.13;

  function shiftLungeFrames(lunge, delta) {
    if (!lunge || typeof lunge !== "object" || !delta) return lunge;
    const o = {};
    for (const k of Object.keys(lunge)) {
      const fr = Number(k);
      if (!Number.isFinite(fr)) continue;
      o[String(fr + delta)] = lunge[k];
    }
    return o;
  }

  const _archerRangedResolved = [];
  const _archerMeleeResolved = [];

  function resolveAttackForFighter(f, atkIdx) {
    const i = Math.min(Math.max(0, atkIdx | 0), ATTACKS.length - 1);
    const base = ATTACKS[i];
    if (!base || !f || f.charType !== "archer" || i > 3) return base;
    if (f._archerJMelee) {
      if (!_archerMeleeResolved[i]) {
        const rp = base.reachPeak;
        _archerMeleeResolved[i] = Object.assign({}, base, {
          reachPeak: [Math.round(rp[0] * 1.2), Math.round(rp[1] * 1.2)],
        });
      }
      return _archerMeleeResolved[i];
    }
    if (!_archerRangedResolved[i]) {
      const R = ARCHER_RANGED_FRAME;
      const p0 = base.peakAp && base.peakAp.length >= 2 ? base.peakAp[0] : 8;
      const p1 = base.peakAp && base.peakAp.length >= 2 ? base.peakAp[1] : 9;
      _archerRangedResolved[i] = Object.assign({}, base, {
        act0: base.act0 + R.act0,
        act1: base.act1 + R.act1,
        total: base.total + R.total,
        cancel0: base.cancel0 + R.cancel0,
        cancel1: base.cancel1 + R.cancel1,
        rootedEnd: base.rootedEnd + R.rootedEnd,
        peakAp: [p0 + R.peak0, p1 + R.peak1],
        lunge: shiftLungeFrames(base.lunge, R.act0),
      });
    }
    return _archerRangedResolved[i];
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  MiniFighterData.H = H;
  MiniFighterData.WORLD_W = WORLD_W;
  MiniFighterData.FIGHTER_BODY_HURT_W = FIGHTER_BODY_HURT_W;
  MiniFighterData.FIGHTER_BODY_HURT_H = FIGHTER_BODY_HURT_H;
  MiniFighterData.MAPS = MAPS;
  MiniFighterData.ATTACKS = ATTACKS;
  MiniFighterData.ATK_AIR_STREAK = ATK_AIR_STREAK;
  MiniFighterData.ATK_ARCHER_AIR_VOLLEY = ATK_ARCHER_AIR_VOLLEY;
  MiniFighterData.ATK_PILLAR_DROP = ATK_PILLAR_DROP;
  MiniFighterData.resolveAttackForFighter = resolveAttackForFighter;
  MiniFighterData.ARCHER_MELEE_DMG_MUL = ARCHER_MELEE_DMG_MUL;
  MiniFighterData.ARCHER_ARROW_WEAK_MUL = ARCHER_ARROW_WEAK_MUL;
  MiniFighterData.ARCHER_ARROW_STRONG_MUL = ARCHER_ARROW_STRONG_MUL;
  MiniFighterData.rectsOverlap = rectsOverlap;
})();
