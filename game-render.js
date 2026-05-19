/* 依赖 window.MiniFighterData.ATTACKS */
(function () {
  /** 美术设计格（旧 18×30 坐标系，所有 R.push 仍写在此空间内） */
  const LEG_W = 18;
  /** 略矮于旧 30 行，脚底对齐后整体更紧凑 */
  const LEG_H = 27;
  /**
   * 设计格 → 输出格细分倍数（越大越精细）。
   * PIX_SCALE = 4/GRID_S → 屏上约 72×120，与最早 18×30@4 一致，便于对齐手感与镜头。
   * GRID_S=10 时单轴约为「一格拆成 10 份」；LEG_H=27 略压缩身高。
   */
  const GRID_S = 10;
  const PIX_W = LEG_W * GRID_S;
  const PIX_H = LEG_H * GRID_S;
  const PIX_SCALE = 4 / GRID_S;
  /** 全身受击框与会重叠推开逻辑：宽高应为 PIX_W*PIX_SCALE × PIX_H*PIX_SCALE（见 MiniFighterData.FIGHTER_BODY_HURT_*） */
  /** 气弧线宽系数，使屏上粗细接近早期 PIX_SCALE=8/3 时的观感 */
  const ARC_LINE_K = 8 / 9;
  const PX_DEF = {
    coat: "#a8a2b8",
    coatHi: "#cec8dc",
    coatSh: "#6e657c",
    trim: "#4a1482",
    trimHi: "#9333ea",
    trimDark: "#3d0f6e",
    skin: "#f3ebe4",
    skinSh: "#d4bba8",
    hair: "#14121c",
    hairMid: "#252030",
    hairHi: "#3d3848",
    brow: "#4a3f3c",
    lipLine: "#78716c",
    pants: "#080e1c",
    pantsHi: "#121c30",
    boot: "#050810",
    bootHi: "#1a2438",
    fist: "#ebe6e0",
    armWrap: "#0f1f38",
    armWrapHi: "#1c3552",
    scabbard: "#12141c",
    hilt: "#252030",
    outline: "#0c0c10",
    sharingan: "#e11d48",
    sharinganCore: "#fecdd3",
  };

  /** 弓手：绿色cloak系女性配色（与武者像素逻辑共用结构） */
  const ARCHER_PALETTE = {
    coat: "#2f4d38",
    coatHi: "#4a7058",
    coatSh: "#1a2e22",
    trim: "#c9a227",
    trimHi: "#fde68a",
    trimDark: "#3d3518",
    skin: "#e8c4b0",
    skinSh: "#c49a82",
    hair: "#d8ccb0",
    hairMid: "#b8aa88",
    hairHi: "#f5edd8",
    brow: "#5c4a3e",
    lipLine: "#9a7868",
    pants: "#1e3228",
    pantsHi: "#2d4838",
    boot: "#2a261c",
    bootHi: "#4a5248",
    fist: "#f5ebe4",
    armWrap: "#3d5c48",
    armWrapHi: "#5f8f72",
    scabbard: "#1a2820",
    hilt: "#c9a227",
    outline: "#0f1812",
    sharingan: "#5c4a38",
    sharinganCore: "#d4c8a8",
  };

  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function finalizePose(p, onGround) {
    if (onGround) return p;
    return {
      ...p,
      crouch: 0,
      stance: p.stance * 0.62,
      lean: p.lean * 0.58,
      spd: p.spd * 0.65,
      ghost: p.ghost * 0.45,
      rearLen: p.rearLen * 0.85,
    };
  }

  function ampPose(p, atkKey) {
    const k = atkKey || "jab";
    const m =
      k === "hook" || k === "riseElbow"
        ? 1.38
        : k === "palm" || k === "dive" || k === "sDrop"
          ? 1.28
          : k === "cross" || k === "spinBack"
            ? 1.24
            : k === "low"
              ? 1.2
              : k === "sweep"
                ? 1.24
                : k === "skick" || k === "knee"
                  ? 1.26
                  : 1.2;
    return {
      ...p,
      lean: p.lean * m,
      crouch: p.crouch * (0.86 + m * 0.14),
      stance: p.stance * (0.9 + m * 0.1),
      punchLen: p.punchLen * (k === "hook" || k === "riseElbow" ? 1.14 : k === "palm" || k === "dive" || k === "sDrop" ? 1.1 : 1.16),
      rearLen: p.rearLen * (k === "cross" || k === "spinBack" ? 1.14 : 1.06),
      spd: Math.min(1.58, p.spd * 1.52),
      ghost: Math.min(0.95, p.ghost * 1.45),
      tilt: p.tilt * m,
      fist: p.fist * 1.18,
    };
  }

  /** vy 影响轻微「滞空拧转」 */
  function getPunchPose(ap, onGround, atkKey, vy) {
    const k = atkKey || "jab";
    const airTwist = !onGround ? Math.max(-1, Math.min(1, (vy || 0) * 0.07)) : 0;
    const out = (body) => {
      const b = ampPose(finalizePose(body, onGround), k);
      if (!airTwist) return b;
      return { ...b, lean: b.lean + airTwist * 9, tilt: b.tilt + airTwist * 0.16 };
    };
    const idle = {
      lean: 0,
      crouch: 0,
      punchLen: 26,
      punchAng: -0.22,
      rearLen: 24,
      rearAng: 2.55,
      stance: 12,
      spd: 0,
      ghost: 0,
      fist: 0.36,
      tilt: 0,
    };
    if (ap <= 0) return idle;

    if (k === "riseElbow") {
      const airTwist = !onGround ? Math.max(-1, Math.min(1, (vy || 0) * 0.09)) : 0;
      const fin = (body) => {
        const b = ampPose(finalizePose(body, onGround), k);
        if (!airTwist) return b;
        return { ...b, lean: b.lean + airTwist * 15, tilt: b.tilt + airTwist * 0.28 };
      };
      if (ap <= 3) {
        const t = ap / 3;
        return fin({
          lean: -5 - 16 * t,
          crouch: 9 + 14 * t,
          punchLen: 11 + 9 * t,
          punchAng: -1.26 + 0.12 * t,
          rearLen: 24 + 12 * t,
          rearAng: 2.32 + 0.18 * t,
          stance: 20 + 28 * t,
          spd: 0,
          ghost: 0.08 + 0.1 * t,
          fist: 0.18 + 0.1 * t,
          tilt: -0.26 * t,
        });
      }
      if (ap <= 7) {
        const t = easeOutQuad((ap - 3) / 4);
        return fin({
          lean: -21 - 30 * t,
          crouch: 23 - 13 * t,
          punchLen: 20 + 26 * t,
          punchAng: -1.14 + 1.42 * t,
          rearLen: 36 - 8 * t,
          rearAng: 2.5 - 0.52 * t,
          stance: 48 + 16 * t,
          spd: 0.28 + 1.12 * t,
          ghost: 0.18 + 0.68 * t,
          fist: 0.28 + 0.32 * t,
          tilt: -0.26 - 0.48 * t,
        });
      }
      if (ap <= 12) {
        const t = easeOutQuad((ap - 7) / 5);
        return fin({
          lean: -51 + 58 * t,
          crouch: 10 - 6 * t,
          punchLen: 46 + 52 * t,
          punchAng: 0.28 - 0.78 * t,
          rearLen: 28 + 8 * t,
          rearAng: 1.98 + 0.72 * t,
          stance: 64 - 26 * t,
          spd: 1.4 + 0.72 * t,
          ghost: 0.86 - 0.32 * t,
          fist: 0.6 + 0.2 * t,
          tilt: -0.74 + 0.66 * t,
        });
      }
      const t = Math.min(1, (ap - 12) / 14);
      const u = easeOutQuad(t);
      return fin({
        lean: 7 - 7 * u,
        crouch: 4 * (1 - u),
        punchLen: 98 - 52 * u,
        punchAng: -0.5 + 0.26 * (1 - u),
        rearLen: 36 - 10 * u,
        rearAng: 2.7 - 0.38 * u,
        stance: 38 - 20 * u,
        spd: 2.12 * (1 - u),
        ghost: 0.54 * (1 - u),
        fist: 0.8 - 0.32 * u,
        tilt: -0.08 - 0.1 * u,
      });
    }

    if (ap <= 2) {
      const t = ap / 2;
      return out({
        lean: -2.8 * t,
        crouch: 3.2 * t,
        punchLen: 17 + 4 * t,
        punchAng: -0.88 - 0.22 * t,
        rearLen: 24 + 5 * t,
        rearAng: 2.55 - 0.12 * t,
        stance: 12 + 8 * t,
        spd: 0,
        ghost: 0,
        fist: 0.36,
        tilt: -0.09 * t,
      });
    }
    if (ap <= 5) {
      const t = easeOutQuad((ap - 2) / 3);
      return out({
        lean: -2.8 - 19 * t,
        crouch: 3.2 + 6.5 * t,
        punchLen: 20 - 9 * t,
        punchAng: -1.02 + 2.0 * t,
        rearLen: 28 + 14 * t,
        rearAng: 2.42 - 0.72 * t,
        stance: 18 + 20 * t,
        spd: 0,
        ghost: 0,
        fist: 0.3,
        tilt: -0.09 - 0.18 * t,
      });
    }
    if (ap === 6) {
      return out({
        lean: -21,
        crouch: 9,
        punchLen: 14,
        punchAng: 0.78,
        rearLen: 46,
        rearAng: 1.78,
        stance: 38,
        spd: 1.18,
        ghost: 0.32,
        fist: 0.48,
        tilt: -0.22,
      });
    }
    if (ap <= 10) {
      const t = easeInOutCubic((ap - 6) / 4);
      return out({
        lean: -21 + 36 * t,
        crouch: 9 - 6 * t,
        punchLen: 14 + 58 * t,
        punchAng: 0.78 - 0.88 * t,
        rearLen: 46 - 12 * t,
        rearAng: 1.78 + 0.7 * t,
        stance: 38 - 10 * t,
        spd: ap <= 8 ? 1.22 : 0.62,
        ghost: ap <= 9 ? 0.56 : 0.32,
        fist: 0.48 + 0.16 * (ap >= 8 && ap <= 9 ? 1 : 0),
        tilt: -0.22 + 0.24 * t,
      });
    }
    if (ap <= 14) {
      const t = (ap - 10) / 4;
      const u = easeOutQuad(t);
      return out({
        lean: 15 - 15 * u,
        crouch: 3 + 3 * (1 - u),
        punchLen: 70 - 40 * u,
        punchAng: -0.08 + 0.48 * u,
        rearLen: 34 + 5 * (1 - u),
        rearAng: 2.47 - 0.14 * u,
        stance: 28 - 12 * u,
        spd: 0,
        ghost: 0.18 * (1 - u),
        fist: 0.58 - 0.16 * u,
        tilt: 0.04 - 0.1 * u,
      });
    }
    const t = Math.min(1, (ap - 14) / 10);
    const u = easeOutQuad(t);
    return out({
      lean: 0,
      crouch: 3 * (1 - u),
      punchLen: 32 - 13 * u,
      punchAng: -0.92 + 0.08 * (1 - u),
      rearLen: 24,
      rearAng: 2.55,
      stance: 16 - 6 * u,
      spd: 0,
      ghost: 0,
      fist: 0.4,
      tilt: 0,
    });
  }

  function drawSpeedLines(ctx, sx, sy, dir, len) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = Math.max(2, Math.round((8 / 3) * 0.55));
    for (let i = 0; i < 5; i++) {
      const off = (i - 2) * 5;
      ctx.beginPath();
      ctx.moveTo(sx - dir * 6 + off * 0.3, sy - 4 + off);
      ctx.lineTo(sx - dir * (6 + len) + off * 0.3, sy - 10 + off * 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function cellWorldRect(left, top, dir, x, y, w, h) {
    const xs = Math.round(x * GRID_S);
    const ys = Math.round(y * GRID_S);
    const ws = Math.max(1, Math.round(w * GRID_S));
    const hs = Math.max(1, Math.round(h * GRID_S));
    const lx = dir === 1 ? xs : PIX_W - xs - ws;
    return { x: left + lx * PIX_SCALE, y: top + ys * PIX_SCALE, w: ws * PIX_SCALE, h: hs * PIX_SCALE };
  }

  function drawPixelCells(ctx, left, top, dir, rects) {
    for (const q of rects) {
      const r = cellWorldRect(left, top, dir, q.x, q.y, q.w, q.h);
      ctx.fillStyle = q.c;
      ctx.fillRect(Math.floor(r.x), Math.floor(r.y), Math.ceil(r.w), Math.ceil(r.h));
    }
  }

  function drawFighterWorld(ctx, f, footY, crouchHeld, palette) {
    const ATTACKS = window.MiniFighterData && window.MiniFighterData.ATTACKS;
    if (!ATTACKS || !ATTACKS.length || !f) return;
    const PX =
      palette || (f.charType === "archer" ? Object.assign({}, PX_DEF, ARCHER_PALETTE) : PX_DEF);
    if ((f.downTimer | 0) > 0) {
      const fyD = Math.round(footY);
      const dirD = f.facing >= 0 ? 1 : -1;
      const cx = f.x + f.w * 0.5;
      const cy = fyD - 14;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(cx, cy);
      ctx.rotate(-dirD * 1.31);
      const cloak = PX.coat || "#2f4d38";
      const cloHi = PX.coatHi || "#4a7058";
      const cloSh = PX.coatSh || "#1a2e22";
      const leg = PX.pants || "#1e3228";
      const boot = PX.boot || "#2a261c";
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(-54, 14, 108, 8);
      ctx.fillStyle = cloSh;
      ctx.fillRect(-50, 4, 100, 12);
      ctx.fillStyle = cloak;
      ctx.fillRect(-46, -10, 92, 28);
      ctx.fillStyle = cloHi;
      ctx.fillRect(-40, -14, 80, 8);
      ctx.fillStyle = cloak;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(-52, -6, 22, 20);
      ctx.fillRect(34, -4, 24, 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = leg;
      ctx.fillRect(-36, -4, 26, 14);
      ctx.fillRect(12, -2, 28, 12);
      ctx.fillStyle = boot;
      ctx.fillRect(-48, 10, 22, 10);
      ctx.fillRect(28, 10, 24, 10);
      ctx.fillStyle = PX.skin || "#e8c4b0";
      ctx.fillRect(34, -22, 20, 18);
      ctx.fillStyle = PX.hair || "#d8ccb0";
      ctx.fillRect(40, -32, 16, 14);
      ctx.fillRect(44, -36, 10, 8);
      ctx.fillStyle = PX.trim || "#c9a227";
      ctx.fillRect(42, -26, 8, 2);
      ctx.restore();
      return;
    }
    const fy = Math.round(footY);
    const dir = f.facing >= 0 ? 1 : -1;
    const ap = f.attackPhase > 1 ? f.attackPhase - 1 : Math.max(0, f.attackPhase);
    const atk = Math.max(0, Math.min(f.atkIdx | 0, ATTACKS.length - 1));
    const MiniD = window.MiniFighterData;
    const A =
      MiniD && typeof MiniD.resolveAttackForFighter === "function"
        ? MiniD.resolveAttackForFighter(f, atk)
        : ATTACKS[atk];
    if (!A || !A.peakAp) return;
    const pose = getPunchPose(ap, f.onGround, A.key, f.vy);
    const archF = f.charType === "archer";
    const ATK_PD = window.MiniFighterData && window.MiniFighterData.ATK_PILLAR_DROP;
    const ATK_AST = window.MiniFighterData && window.MiniFighterData.ATK_AIR_STREAK;
    const diveAtk = atk === 8 || atk === 11 || (ATK_PD != null && atk === ATK_PD) || (ATK_AST != null && atk === ATK_AST);
    const footCenter = f.x + f.w * 0.5 + pose.lean * dir * 0.44;
    const wind = ap >= 3 && ap < A.act0;
    const strike = ap >= A.act0 && ap <= A.act1;
    const recover = ap > A.act1 && ap <= A.act1 + 5;
    const strikePeak = ap >= A.peakAp[0] && ap <= A.peakAp[1];
    const hurting = (f.hitStun | 0) > 0;
    const hurtMax = Math.max(1, f.hitReactMax | 0);
    const hurtT = hurting ? f.hitStun / hurtMax : 0;
    const hurtKind = hurting ? String(f.hitReactKind || "tap") : "";
    const guardingDraw = !!(f.guarding && f.onGround && !hurting);
    /** 弓手远程普攻：整段前摇都要可见拉弓（不共用 ap>=3 的 wind，否则 ap=1~2 无姿势） */
    const archDraw = archF && atk <= 3 && !f._archerJMelee && ap > 0 && !hurting && !guardingDraw;
    const archWind = archDraw && ap < A.act0;
    const archStrike = archDraw && ap >= A.act0 && ap <= A.act1;
    const archRec = archDraw && ap > A.act1;
    /** 弓手贴身四连：专用短打像素，与远程拉弓完全区分 */
    const archMelee = archF && atk <= 3 && !!f._archerJMelee && ap > 0 && !hurting && !guardingDraw;
    const legCrouch = !!(crouchHeld && f.onGround && !guardingDraw && !hurting);
    const hurtSquat =
      hurting && f.onGround
        ? hurtKind === "low" || hurtKind === "sweep"
          ? 13
          : hurtKind === "gut" || hurtKind === "slam"
            ? 11
            : hurtKind === "launch"
              ? 6
              : 0
        : 0;
    const bodyNudge =
      Math.round((wind ? -6 : strike ? 9 : recover ? 3 : 0) * dir) +
      (guardingDraw ? -6 : 0) * dir +
      (hurting ? Math.round(-(f.hitPushDir | 0) * dir * (5 + 13 * hurtT)) : 0) +
      (archDraw
        ? Math.round((archWind ? -5 : archStrike ? 12 : archRec ? 2 : 0) * dir)
        : archMelee
          ? Math.round((wind ? -2 : strike ? 6 : recover ? 2 : 0) * dir)
          : 0) +
      (atk === 7 ? (strike ? -3 : wind ? -2 : 0) * dir : diveAtk ? (strike ? 5 : 2) * dir : atk === 9 ? (strike ? 4 : 1) * dir : atk === 10 ? (wind ? -3 : strike ? 4 : 0) * dir : 0);
    const squatPx =
      hurtSquat +
      (guardingDraw ? 11 : legCrouch ? (ap === 0 ? 14 : atk >= 4 && atk <= 5 ? 16 : 9) : 0) +
      (f.onGround && atk === 9 ? (strike ? 5 : wind ? 3 : 2) : 0) +
      (f.onGround && diveAtk && strike ? 4 : 0) +
      (f.onGround && archDraw && archWind ? 4 : 0) +
      (f.onGround && archMelee && strike ? 2 : 0);
    const left = Math.floor(footCenter - (PIX_W * PIX_SCALE) / 2 + bodyNudge);
    const top = Math.floor(fy - PIX_H * PIX_SCALE + squatPx);

    const runPhase = performance.now() / 82 + footCenter * 0.015;
    const runBob =
      f.onGround && ap === 0 && !guardingDraw && !hurting ? Math.sin(runPhase) * 1.55 : 0;
    const walk =
      f.onGround &&
      ap === 0 &&
      !guardingDraw &&
      !hurting &&
      (Math.abs(f.vx) > 0.28 ? Math.sin(runPhase * 1.5) * 1.65 : 0);
    let bobAtk =
      atk === 1
        ? strike
          ? -7
          : wind
            ? 3
            : 0
        : atk === 2
          ? strike
            ? -6
            : wind
              ? 0
              : 2
          : atk === 3
            ? strike
              ? -3
              : wind
                ? 1
                : 0
            : atk === 7
              ? strike
                ? -14
                : wind
                  ? -5
                  : 0
              : atk === 11
                ? strike
                  ? 11
                  : wind
                    ? 4
                    : 0
              : diveAtk
                ? strike
                  ? 8
                  : wind
                    ? 3
                    : 0
                : atk === 9
                  ? strike
                    ? -8
                    : wind
                      ? -2
                      : 0
                  : atk === 10
                    ? strike
                      ? -6
                      : wind
                        ? 4
                        : 0
                    : strike
                      ? -4
                      : wind
                        ? 2
                      : 0;
    if (archDraw) {
      if (archWind) bobAtk = 1 + Math.min(5, Math.floor((ap - 1) * 0.65));
      else if (archStrike) bobAtk = -6;
      else if (archRec) bobAtk = -1;
    } else if (archMelee) {
      if (wind) bobAtk = 0;
      else if (strike) bobAtk = -5;
      else if (recover) bobAtk = 0;
    }
    const hurtShake = hurting ? Math.round(Math.sin(performance.now() / 21) * (2.2 + 5 * hurtT)) : 0;
    let bob = Math.round(runBob) + bobAtk + hurtShake;
    const stride = Math.round(walk);
    const idleSway = ap === 0 ? Math.round(Math.sin(runPhase * 0.75) * 3.6) : 0;
    const stw = Math.round(Math.max(0, pose.stance - 10) * 0.28);

    const extSc =
      atk === 1
        ? 1.12
        : atk === 2
          ? 0.82
          : atk === 3
            ? 0.9
            : atk === 4
              ? 0.96
              : atk === 5
                ? 1.12
                : atk === 6
                  ? 1.02
                  : atk === 7
                    ? 0.68
            : atk === 11
              ? 1.24
              : diveAtk
              ? 1.18
              : atk === 9
                        ? 0.55
                        : atk === 10
                          ? 1.05
                          : 1;
    const ext = Math.min(14, Math.max(0, Math.round((pose.punchLen / 2.35) * extSc)));
    const hiCombo = f.combo >= 7;
    const coatMain = hiCombo ? "#5b21b6" : PX.coat;
    const trim = hiCombo ? "#f0abfc" : PX.trim;

    const fistCellX =
      atk === 10
        ? Math.min(LEG_W - 2, wind ? 5 : strike ? 14 : 8)
        : atk === 9
          ? Math.min(LEG_W - 2, strike ? 12 : 9)
          : atk === 7
            ? Math.min(LEG_W - 2, strike ? 11 : wind ? 7 : 9)
            : atk === 11
              ? Math.min(LEG_W - 1, strike ? 15 : wind ? 11 : 12)
            : diveAtk
              ? Math.min(LEG_W - 2, strike ? 15 : 10)
              : Math.min(LEG_W - 2, 9 + ext);
    const fistCellY =
      12 +
      (wind ? 1 : 0) +
      (strike ? -1 : 0) +
      (recover ? 1 : 0) +
      (atk === 2
        ? 2
        : atk === 7
          ? strike
            ? -3
            : 0
          : atk === 11
            ? strike
              ? 10
              : wind
                ? 5
                : 7
            : diveAtk
              ? 6
              : atk === 9
                ? strike
                  ? 5
                  : 2
                : atk === 10
                  ? strike
                    ? 3
                    : wind
                      ? -2
                      : 0
                  : 0);
    const fistWorld = cellWorldRect(left, top, dir, fistCellX, fistCellY, 2, 2);
    const fistCX = fistWorld.x + fistWorld.w * 0.5;
    const fistCY = fistWorld.y + fistWorld.h * 0.5;

    ctx.save();
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    if (pose.ghost > 0 && !hurting && ap >= A.act0 - 2 && ap <= A.act1 + 1) {
      ctx.globalAlpha = pose.ghost * 0.38;
      drawPixelCells(ctx, left - dir * 5, top + bob + 1, dir, [{ x: 1, y: 15, w: 16, h: 14, c: coatMain }]);
      ctx.globalAlpha = pose.ghost * 0.5;
      drawPixelCells(ctx, left - dir * 2, top + bob, dir, [{ x: 2, y: 16, w: 14, h: 12, c: coatMain }]);
      ctx.globalAlpha = 1;
    }

    if (pose.spd > 0 && atk !== 9 && atk !== 11 && !hurting && !(archDraw && archStrike)) {
      const slLen = atk === 7 ? 52 : diveAtk ? 52 : atk === 10 ? 40 : 24 + pose.spd * 30;
      drawSpeedLines(ctx, fistCX, fistCY, dir, slLen);
    }

    if (strikePeak && !hurting && archDraw && archStrike) {
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = "#86efac";
      ctx.lineWidth = 2.2 * ARC_LINE_K;
      ctx.beginPath();
      ctx.moveTo(fistCX - dir * 22, fistCY);
      ctx.lineTo(fistCX + dir * 28, fistCY - 1);
      ctx.lineTo(fistCX + dir * 34, fistCY + 1);
      ctx.stroke();
      ctx.restore();
    } else if (strikePeak && !hurting) {
      ctx.save();
      ctx.globalAlpha = 0.38;
      const arcCol =
        diveAtk
          ? atk === 11
            ? "#fbbf24"
            : "#fb923c"
          : atk === 7
            ? "#a78bfa"
            : atk === 9
              ? "#f472b6"
              : atk === 10
                ? "#4ade80"
                : atk === 3
                  ? "#fde68a"
                  : "#7dd3fc";
      ctx.strokeStyle = arcCol;
      ctx.lineWidth = Math.min(9, Math.max(1.4, (atk === 9 ? 5 : atk === 10 ? 3 : 4) * ARC_LINE_K));
      ctx.beginPath();
      if (atk === 7) {
        ctx.moveTo(fistCX - dir * 18, fistCY - 36);
        ctx.quadraticCurveTo(fistCX + dir * 6, fistCY - 28, fistCX + dir * 14, fistCY - 6);
        ctx.lineTo(fistCX + dir * 12, fistCY + 10);
      } else if (atk === 11) {
        ctx.moveTo(fistCX - dir * 6, fistCY - 32);
        ctx.lineTo(fistCX + dir * 22, fistCY + 8);
        ctx.lineTo(fistCX + dir * 26, fistCY + 26);
      } else if (atk === 8) {
        ctx.moveTo(fistCX - dir * 28, fistCY - 8);
        ctx.quadraticCurveTo(fistCX, fistCY + 18, fistCX + dir * 22, fistCY + 6);
      } else if (atk === 9) {
        ctx.arc(fistCX - dir * 6, fistCY + 2, 14, -0.35 * Math.PI, 0.55 * Math.PI, false);
      } else if (atk === 10) {
        ctx.moveTo(fistCX - dir * 22, fistCY - 6);
        ctx.quadraticCurveTo(fistCX + dir * 8, fistCY - 20, fistCX + dir * 18, fistCY + 2);
      } else {
        const ax = fistCX - dir * 4;
        ctx.moveTo(fistCX - dir * 26, fistCY - 2);
        ctx.quadraticCurveTo(ax, fistCY - 26, fistCX + dir * 8, fistCY - 4);
      }
      ctx.stroke();
      ctx.restore();
    }

    const ox = stride + (ap > 0 ? Math.min(4, stw) : 0);
    const sWalk = Math.round(stride * 0.55);

    /** 空中坠踢：支撑腿上收、前腿向下蹬直 */
    function pushAxeKickLegs(R0) {
      const po = PX.outline || "rgba(0,0,0,0.55)";
      const ptHi = PX.pantsHi || PX.pants;
      const kneeDim = PX.boot || "#050810";
      R0.push({ x: 1, y: LEG_H - 1, w: 16, h: 1, c: "rgba(0,0,0,0.42)" });
      R0.push({ x: 3, y: LEG_H - 13, w: 5, h: 7, c: PX.pants });
      R0.push({ x: 4, y: LEG_H - 14, w: 4, h: 2, c: kneeDim });
      R0.push({ x: 5, y: LEG_H - 11, w: 3, h: 4, c: PX.skinSh });
      R0.push({ x: 6, y: LEG_H - 10, w: 1, h: 2, c: ptHi });
      R0.push({ x: 4, y: LEG_H - 6, w: 5, h: 3, c: PX.boot });
      R0.push({ x: 5, y: LEG_H - 7, w: 3, h: 2, c: PX.bootHi });
      R0.push({ x: 6, y: LEG_H - 6, w: 2, h: 2, c: PX.skin });
      R0.push({ x: 9, y: LEG_H - 15, w: 9, h: 5, c: PX.pants });
      R0.push({ x: 11, y: LEG_H - 12, w: 7, h: 4, c: PX.pants });
      R0.push({ x: 13, y: LEG_H - 10, w: 5, h: 2, c: kneeDim });
      R0.push({ x: 12, y: LEG_H - 11, w: 6, h: 4, c: PX.skinSh });
      R0.push({ x: 14, y: LEG_H - 8, w: 5, h: 4, c: PX.boot });
      R0.push({ x: 15, y: LEG_H - 9, w: 4, h: 3, c: PX.bootHi });
      R0.push({ x: 16, y: LEG_H - 8, w: 3, h: 3, c: PX.skin });
      R0.push({ x: 3, y: LEG_H - 8, w: 1, h: 4, c: po });
      R0.push({ x: 17, y: LEG_H - 11, w: 2, h: 5, c: po });
    }

    function pushStandLegs(R0) {
      const po = PX.outline || "rgba(0,0,0,0.55)";
      const ptHi = PX.pantsHi || PX.pants;
      const kneeDim = PX.boot || "#050810";

      R0.push({ x: 3, y: LEG_H - 1, w: 12, h: 1, c: "rgba(0,0,0,0.38)" });
      /* 裆臀衔接 */
      R0.push({ x: 7, y: LEG_H - 11, w: 4, h: 2, c: PX.pants });

      /* 左腿：髋大腿略宽 → 膝褶 → 小腿渐收 → 踝骨一带 → 露趾鞋底 */
      R0.push({ x: 4 + ox, y: LEG_H - 12, w: 3, h: 3, c: PX.pants });
      R0.push({ x: 5 + ox, y: LEG_H - 11, w: 1, h: 2, c: ptHi });
      R0.push({ x: 4 + ox, y: LEG_H - 9, w: 3, h: 1, c: kneeDim });
      R0.push({ x: 5 + ox, y: LEG_H - 8, w: 2, h: 3, c: PX.pants });
      R0.push({ x: 6 + ox, y: LEG_H - 7, w: 1, h: 2, c: ptHi });
      R0.push({ x: 5 + ox, y: LEG_H - 5, w: 2, h: 1, c: PX.skinSh });
      R0.push({ x: 4 + ox, y: LEG_H - 3, w: 4, h: 1, c: PX.boot });
      R0.push({ x: 5 + ox, y: LEG_H - 4, w: 3, h: 2, c: PX.boot });
      R0.push({ x: 5 + ox, y: LEG_H - 5, w: 2, h: 1, c: PX.bootHi });
      R0.push({ x: 6 + ox, y: LEG_H - 4, w: 1, h: 1, c: PX.skin });

      /* 右腿对称 */
      R0.push({ x: 11 - ox, y: LEG_H - 12, w: 3, h: 3, c: PX.pants });
      R0.push({ x: 12 - ox, y: LEG_H - 11, w: 1, h: 2, c: ptHi });
      R0.push({ x: 11 - ox, y: LEG_H - 9, w: 3, h: 1, c: kneeDim });
      R0.push({ x: 12 - ox, y: LEG_H - 8, w: 2, h: 3, c: PX.pants });
      R0.push({ x: 12 - ox, y: LEG_H - 7, w: 1, h: 2, c: ptHi });
      R0.push({ x: 12 - ox, y: LEG_H - 5, w: 2, h: 1, c: PX.skinSh });
      R0.push({ x: 11 - ox, y: LEG_H - 3, w: 4, h: 1, c: PX.boot });
      R0.push({ x: 11 - ox, y: LEG_H - 4, w: 3, h: 2, c: PX.boot });
      R0.push({ x: 12 - ox, y: LEG_H - 5, w: 2, h: 1, c: PX.bootHi });
      R0.push({ x: 12 - ox, y: LEG_H - 4, w: 1, h: 1, c: PX.skin });

      R0.push({ x: 4 + ox, y: LEG_H - 4, w: 1, h: 2, c: po });
      R0.push({ x: 8 + ox, y: LEG_H - 4, w: 1, h: 2, c: po });
      R0.push({ x: 11 - ox, y: LEG_H - 4, w: 1, h: 2, c: po });
      R0.push({ x: 14 - ox, y: LEG_H - 4, w: 1, h: 2, c: po });
    }

    /** 格挡：大开马步；大腿外张、膝弯、小腿内收撑地 */
    function pushGuardLegs(R0) {
      const kneeDim = PX.boot || "#050810";
      const ptHi = PX.pantsHi || PX.pants;
      R0.push({ x: 0, y: LEG_H - 1, w: LEG_W, h: 1, c: "rgba(0,0,0,0.42)" });
      R0.push({ x: 1, y: LEG_H - 8, w: 4, h: 3, c: PX.pants });
      R0.push({ x: 13, y: LEG_H - 8, w: 4, h: 3, c: PX.pants });
      R0.push({ x: 2, y: LEG_H - 9, w: 3, h: 1, c: kneeDim });
      R0.push({ x: 13, y: LEG_H - 9, w: 3, h: 1, c: kneeDim });
      R0.push({ x: 3, y: LEG_H - 10, w: 2, h: 2, c: PX.pants });
      R0.push({ x: 13, y: LEG_H - 10, w: 2, h: 2, c: PX.pants });
      R0.push({ x: 3, y: LEG_H - 12, w: 3, h: 3, c: PX.skinSh });
      R0.push({ x: 12, y: LEG_H - 12, w: 3, h: 3, c: PX.skinSh });
      R0.push({ x: 4, y: LEG_H - 11, w: 1, h: 2, c: ptHi });
      R0.push({ x: 13, y: LEG_H - 11, w: 1, h: 2, c: ptHi });
      R0.push({ x: 0, y: LEG_H - 4, w: 5, h: 2, c: PX.boot });
      R0.push({ x: 13, y: LEG_H - 4, w: 5, h: 2, c: PX.boot });
      R0.push({ x: 1, y: LEG_H - 6, w: 4, h: 2, c: PX.boot });
      R0.push({ x: 13, y: LEG_H - 6, w: 4, h: 2, c: PX.boot });
      R0.push({ x: 2, y: LEG_H - 5, w: 2, h: 1, c: PX.skin });
      R0.push({ x: 14, y: LEG_H - 5, w: 2, h: 1, c: PX.skin });
      R0.push({ x: 6, y: LEG_H - 14, w: 5, h: 3, c: PX.skinSh });
      R0.push({ x: 7, y: LEG_H - 15, w: 4, h: 2, c: PX.skin });
    }

    /** 待机深蹲：髋膝踝连贯弯曲，小腿斜向前撑 */
    function pushCrouchIdleLegs(R0) {
      const kneeDim = PX.boot || "#050810";
      const ptHi = PX.pantsHi || PX.pants;
      R0.push({ x: 1, y: LEG_H - 1, w: 16, h: 1, c: "rgba(0,0,0,0.42)" });
      const s = sWalk;
      R0.push({ x: 2 + s, y: LEG_H - 8, w: 3, h: 2, c: PX.pants });
      R0.push({ x: 3 + s, y: LEG_H - 10, w: 2, h: 2, c: PX.pants });
      R0.push({ x: 3 + s, y: LEG_H - 11, w: 2, h: 3, c: PX.skinSh });
      R0.push({ x: 3 + s, y: LEG_H - 9, w: 2, h: 1, c: kneeDim });
      R0.push({ x: 4 + s, y: LEG_H - 11, w: 1, h: 3, c: PX.skin });
      R0.push({ x: 4 + s, y: LEG_H - 12, w: 1, h: 2, c: ptHi });
      R0.push({ x: 4 + s, y: LEG_H - 13, w: 2, h: 2, c: PX.skin });
      R0.push({ x: 1 + s, y: LEG_H - 3, w: 3, h: 3, c: PX.boot });
      R0.push({ x: 2 + s, y: LEG_H - 4, w: 2, h: 2, c: PX.bootHi });

      R0.push({ x: 13 - s, y: LEG_H - 8, w: 3, h: 2, c: PX.pants });
      R0.push({ x: 13 - s, y: LEG_H - 10, w: 2, h: 2, c: PX.pants });
      R0.push({ x: 13 - s, y: LEG_H - 11, w: 2, h: 3, c: PX.skinSh });
      R0.push({ x: 13 - s, y: LEG_H - 9, w: 2, h: 1, c: kneeDim });
      R0.push({ x: 12 - s, y: LEG_H - 11, w: 1, h: 3, c: PX.skin });
      R0.push({ x: 13 - s, y: LEG_H - 12, w: 1, h: 2, c: ptHi });
      R0.push({ x: 11 - s, y: LEG_H - 13, w: 2, h: 2, c: PX.skin });
      R0.push({ x: 13 - s, y: LEG_H - 3, w: 3, h: 3, c: PX.boot });
      R0.push({ x: 13 - s, y: LEG_H - 4, w: 2, h: 2, c: PX.bootHi });

      R0.push({ x: 7, y: LEG_H - 12, w: 4, h: 2, c: PX.pants });
      R0.push({ x: 8, y: LEG_H - 13, w: 2, h: 2, c: PX.skinSh });
      R0.push({ x: 5, y: LEG_H - 14, w: 2, h: 1, c: PX.bootHi });
      R0.push({ x: 11, y: LEG_H - 14, w: 2, h: 1, c: PX.bootHi });
    }

    /** 下段/扫踢：支撑腿屈膝承重，扫腿髋带动小腿伸展 */
    function pushCrouchCombatLegs(R0) {
      const kneeDim = PX.boot || "#050810";
      const ptHi = PX.pantsHi || PX.pants;
      R0.push({ x: 0, y: LEG_H - 1, w: LEG_W, h: 1, c: "rgba(0,0,0,0.45)" });
      /* 左：跪撑腿 */
      R0.push({ x: 3, y: LEG_H - 5, w: 4, h: 3, c: PX.pants });
      R0.push({ x: 4, y: LEG_H - 6, w: 3, h: 1, c: kneeDim });
      R0.push({ x: 4, y: LEG_H - 8, w: 3, h: 3, c: PX.skinSh });
      R0.push({ x: 5, y: LEG_H - 9, w: 1, h: 2, c: ptHi });
      R0.push({ x: 5, y: LEG_H - 12, w: 2, h: 4, c: PX.skin });
      R0.push({ x: 2, y: LEG_H - 3, w: 5, h: 2, c: PX.boot });
      R0.push({ x: 4, y: LEG_H - 4, w: 2, h: 1, c: PX.skin });
      /* 右：扫伸腿 */
      R0.push({ x: 9, y: LEG_H - 11, w: 7, h: 2, c: PX.pants });
      R0.push({ x: 11, y: LEG_H - 9, w: 5, h: 2, c: PX.pants });
      R0.push({ x: 12, y: LEG_H - 8, w: 3, h: 1, c: kneeDim });
      R0.push({ x: 12, y: LEG_H - 10, w: 3, h: 2, c: PX.skinSh });
      R0.push({ x: 13, y: LEG_H - 10, w: 1, h: 2, c: ptHi });
      R0.push({ x: 10, y: LEG_H - 4, w: 6, h: 2, c: PX.boot });
      R0.push({ x: 12, y: LEG_H - 5, w: 2, h: 1, c: PX.skin });
    }

    /** 半蹲出招：双膝约九十度，小腿前倾 */
    function pushCrouchMidLegs(R0) {
      const kneeDim = PX.boot || "#050810";
      const ptHi = PX.pantsHi || PX.pants;
      R0.push({ x: 2, y: LEG_H - 1, w: 14, h: 1, c: "rgba(0,0,0,0.38)" });
      R0.push({ x: 4 + ox, y: LEG_H - 9, w: 3, h: 3, c: PX.pants });
      R0.push({ x: 11 - ox, y: LEG_H - 9, w: 3, h: 3, c: PX.pants });
      R0.push({ x: 5 + ox, y: LEG_H - 10, w: 2, h: 1, c: kneeDim });
      R0.push({ x: 12 - ox, y: LEG_H - 10, w: 2, h: 1, c: kneeDim });
      R0.push({ x: 5 + ox, y: LEG_H - 7, w: 2, h: 3, c: PX.skinSh });
      R0.push({ x: 12 - ox, y: LEG_H - 7, w: 2, h: 3, c: PX.skinSh });
      R0.push({ x: 6 + ox, y: LEG_H - 7, w: 1, h: 2, c: ptHi });
      R0.push({ x: 13 - ox, y: LEG_H - 7, w: 1, h: 2, c: ptHi });
      R0.push({ x: 7, y: LEG_H - 10, w: 4, h: 2, c: PX.pants });
      R0.push({ x: 8, y: LEG_H - 11, w: 2, h: 2, c: PX.skin });
      R0.push({ x: 2 + ox, y: LEG_H - 3, w: 4, h: 3, c: PX.boot });
      R0.push({ x: 11 - ox, y: LEG_H - 3, w: 4, h: 3, c: PX.boot });
      R0.push({ x: 3 + ox, y: LEG_H - 5, w: 2, h: 2, c: PX.bootHi });
      R0.push({ x: 12 - ox, y: LEG_H - 5, w: 2, h: 2, c: PX.bootHi });
      R0.push({ x: 5 + ox, y: LEG_H - 5, w: 1, h: 1, c: PX.skin });
      R0.push({ x: 12 - ox, y: LEG_H - 5, w: 1, h: 1, c: PX.skin });
    }

    const R = [];
    if (guardingDraw) {
      pushGuardLegs(R);
    } else if (hurting && f.onGround && (hurtKind === "low" || hurtKind === "sweep")) {
      pushCrouchCombatLegs(R);
    } else if (hurting && f.onGround && (hurtKind === "gut" || hurtKind === "slam")) {
      pushCrouchMidLegs(R);
    } else if (legCrouch && f.onGround) {
      if (ap === 0) pushCrouchIdleLegs(R);
      else if (atk === 4 || atk === 5) pushCrouchCombatLegs(R);
      else pushCrouchMidLegs(R);
    } else if (!f.onGround && atk === 11 && ap > 0 && !hurting) {
      pushAxeKickLegs(R);
    } else {
      pushStandLegs(R);
    }

    const archerBow = archF;
    const backWeapon =
      ap === 0 &&
      !guardingDraw &&
      !hurting &&
      !(legCrouch && f.onGround) &&
      (archerBow || (PX.scabbard && PX.hilt));
    if (backWeapon) {
      if (archerBow) {
        R.push({ x: 11, y: 2, w: 5, h: 6, c: "#c2410c" });
        R.push({ x: 12, y: 1, w: 3, h: 8, c: "#ea580c" });
        R.push({ x: 10, y: 4, w: 2, h: 4, c: "#fde68a" });
        R.push({ x: 0, y: 6, w: 16, h: 6, c: "#3d2818" });
        R.push({ x: 1, y: 5, w: 14, h: 5, c: "#5c4030" });
        R.push({ x: 13, y: 2, w: 5, h: 18, c: "#6b5344" });
        R.push({ x: 14, y: 4, w: 3, h: 14, c: "#c9a227" });
        R.push({ x: 2, y: 10, w: 14, h: 2, c: "rgba(253,224,71,0.42)" });
      } else {
        R.push({ x: 1, y: 13, w: 11, h: 2, c: PX.scabbard });
        R.push({ x: 2, y: 12, w: 8, h: 1, c: PX.scabbard });
        R.push({ x: 1, y: 11, w: 4, h: 3, c: PX.hilt });
        R.push({ x: 1, y: 10, w: 2, h: 2, c: PX.outline || "#0c0c10" });
      }
    }

    const flare =
      (wind ? 2 : strike ? 3 : recover ? 1 : 0) +
      (atk === 7 ? (strike ? 3 : wind ? 2 : 0) : diveAtk ? (strike ? 4 : 1) : atk === 10 ? (wind ? 2 : strike ? 2 : 0) : 0);
    const td = PX.trimDark || trim;
    /* 下摆收窄 */
    R.push({ x: 4 - flare, y: LEG_H - 10, w: 9 + flare * 2, h: 2, c: coatMain });
    R.push({ x: 3 - flare, y: LEG_H - 11, w: 2, h: 2, c: PX.coatSh });
    R.push({ x: 12 + flare, y: LEG_H - 11, w: 2, h: 2, c: PX.coatSh });
    R.push({ x: 7, y: LEG_H - 12, w: 4, h: 1, c: PX.coatHi });

    let twist =
      (wind ? 1 : strike ? -1 : 0) +
      (archDraw && archStrike ? 2 : archMelee && strike ? -2 : 0) +
      (atk === 1 ? (strike ? 1 : wind ? -1 : 0) : atk === 2 ? (strike ? -2 : 0) : atk === 7 ? (strike ? -2 : wind ? 1 : 0) : diveAtk ? (strike ? 2 : 0) : atk === 9 ? (strike ? 2 : 0) : atk === 10 ? (wind ? -2 : strike ? 3 : 0) : 0);
    if (hurting) {
      twist += Math.round(-(f.hitPushDir | 0) * dir * (1 + 3 * hurtT));
      if (hurtKind === "hooked") twist += Math.round(2 * hurtT);
      if (hurtKind === "spin") twist += Math.round(Math.sin(performance.now() / 38) * 2.5 * hurtT);
    }
    /* 窄躯干：整体向内收约一格 */
    R.push({ x: 6 + twist, y: 15, w: 6, h: 2, c: coatMain });
    R.push({ x: 6 + twist, y: 17, w: 6, h: 3, c: coatMain });
    R.push({ x: 7 + twist, y: 20, w: 4, h: 3, c: coatMain });
    R.push({ x: 4 + twist, y: 16, w: 1, h: 5, c: PX.coatSh });
    R.push({ x: 13 + twist, y: 16, w: 1, h: 5, c: PX.coatSh });
    R.push({ x: 5 + twist, y: 16, w: 1, h: 4, c: PX.coatSh });
    R.push({ x: 12 + twist, y: 16, w: 1, h: 4, c: PX.coatSh });
    R.push({ x: 8 + twist, y: 16, w: 2, h: 3, c: PX.skin });
    R.push({ x: 8 + twist, y: 17, w: 2, h: 2, c: PX.skinSh });
    R.push({ x: 6 + twist, y: 11, w: 1, h: 4, c: PX.coatHi });
    R.push({ x: 11 + twist, y: 11, w: 1, h: 4, c: PX.coatHi });
    R.push({ x: 7 + twist, y: 12, w: 4, h: 2, c: PX.coat });
    R.push({ x: 8 + twist, y: 11, w: 2, h: 1, c: PX.coatSh });
    R.push({ x: 6 + twist, y: 19, w: 6, h: 2, c: td });
    R.push({ x: 6 + twist, y: 18, w: 6, h: 1, c: trim });
    R.push({ x: 7 + twist, y: 20, w: 4, h: 1, c: trim });
    R.push({ x: 8 + twist, y: 21, w: 2, h: 2, c: trim });
    R.push({ x: 8 + twist, y: 22, w: 2, h: 3, c: td });
    R.push({ x: 7 + twist, y: 23, w: 1, h: 2, c: PX.trimHi });
    R.push({ x: 10 + twist, y: 23, w: 1, h: 2, c: PX.trimHi });
    R.push({ x: 4 + twist, y: 20, w: 2, h: 3, c: trim });
    R.push({ x: 12 + twist, y: 20, w: 2, h: 3, c: trim });
    R.push({ x: 11 + twist, y: 14, w: 1, h: 3, c: PX.coatHi });
    R.push({ x: 12 + twist, y: 15, w: 2, h: 6, c: coatMain });
    R.push({ x: 13 + twist, y: 16, w: 1, h: 4, c: PX.trimHi });
    R.push({ x: 3 + twist, y: 15, w: 2, h: 5, c: PX.coatSh });
    R.push({ x: 5 + twist, y: 14, w: 1, h: 3, c: PX.coatSh });

    if ((wind || archWind || (archMelee && wind)) && !hurting) {
      const qi =
        atk === 7
          ? "#e879f9"
          : diveAtk
            ? atk === 11
              ? "#f59e0b"
              : "#38bdf8"
            : atk === 9
              ? "#fb7185"
              : atk === 10
                ? "#fbbf24"
                : atk === 2
                  ? "#fbbf24"
                  : archWind
                    ? "#86efac"
                    : archMelee
                      ? "#fcd34d"
                      : "#38bdf8";
      R.push({ x: 7, y: 12, w: 1, h: 1, c: qi });
      R.push({ x: 10, y: 11, w: 1, h: 1, c: qi });
      R.push({ x: 8, y: 10, w: 1, h: 1, c: qi });
      if (atk === 7 || atk === 10 || atk === 11 || archWind) {
        R.push({ x: 9, y: 9, w: 1, h: 1, c: qi });
        R.push({ x: 6, y: 11, w: 1, h: 1, c: qi });
      }
      if (archWind && ap <= 3) {
        R.push({ x: 5, y: 13, w: 1, h: 1, c: qi });
        R.push({ x: 12, y: 13, w: 1, h: 1, c: qi });
      }
    }

    function segH(x0, x1, y, col) {
      if (!Number.isFinite(x0) || !Number.isFinite(x1) || !Number.isFinite(y)) return;
      const a = Math.min(x0, x1);
      const b = Math.max(x0, x1);
      if (b - a > 48) return;
      for (let x = a; x < b; x++) R.push({ x, y, w: 1, h: 1, c: col });
    }
    function segV(x, y0, y1, col) {
      if (!Number.isFinite(x) || !Number.isFinite(y0) || !Number.isFinite(y1)) return;
      const a = Math.min(y0, y1);
      const b = Math.max(y0, y1);
      if (b - a > 48) return;
      for (let y = a; y < b; y++) R.push({ x, y, w: 1, h: 1, c: col });
    }

    function armsJabLike() {
      const wuX = wind ? 3 : 5;
      const wuY = wind ? 8 : 10;
      const wuH = wind ? 7 : 5;
      R.push({ x: wuX, y: wuY, w: 2, h: wuH, c: PX.skinSh });
      R.push({ x: wuX, y: wuY, w: 1, h: wuH, c: PX.skin });
      const elbowX = wind ? 7 : strike ? 8 : 7;
      const elbowY = wind ? 12 : strike ? 11 : 11;
      R.push({ x: 7, y: 11, w: Math.max(1, elbowX - 6), h: 2, c: coatMain });
      R.push({ x: elbowX, y: elbowY, w: 2, h: 2, c: PX.skinSh });
      const x0 = Math.min(elbowX + 1, fistCellX);
      const x1 = Math.max(elbowX + 1, fistCellX);
      const x1Cap = Math.min(x1, x0 + 48);
      for (let x = x0; x < x1Cap; x++) R.push({ x, y: fistCellY, w: 1, h: 1, c: coatMain });
      R.push({ x: fistCellX, y: fistCellY, w: 2, h: 2, c: PX.fist });
      R.push({ x: fistCellX, y: fistCellY, w: 1, h: 1, c: PX.skin });
    }

    /** 弓手远程：起弓 → 拉满 → 水平射出 → 收弓（与近战拳脚完全不同的剪影） */
    function armsArcherBowDraw(apBow, act0Bow, wPh, sPh, rPh, fistCX, coat, PX0, segHF) {
      const bowWood = "#4a3728";
      const bowHi = "#c9a227";
      const strCol = "#fde68a";
      const shaft = "#fefce8";
      const tip = "#ea580c";
      if (wPh) {
        if (apBow <= 2) {
          R.push({ x: 6, y: 12, w: 8, h: 4, c: coat });
          R.push({ x: 10, y: 7, w: 3, h: 13, c: bowWood });
          R.push({ x: 11, y: 9, w: 2, h: 9, c: bowHi });
          R.push({ x: 4, y: 11, w: 2, h: 5, c: PX0.skinSh });
          R.push({ x: 13, y: 12, w: 2, h: 4, c: PX0.skinSh });
          R.push({ x: 7, y: 14, w: 7, h: 2, c: shaft });
          R.push({ x: 14, y: 13, w: 2, h: 2, c: tip });
        } else {
          const pull = Math.min(1, (apBow - 2) / Math.max(2, act0Bow - 4));
          const bx = Math.round(10 + pull * 3);
          R.push({ x: 4, y: 13, w: 9, h: 4, c: coat });
          R.push({ x: bx, y: 8, w: 4, h: 13, c: bowWood });
          R.push({ x: bx + 1, y: 10, w: 2, h: 9, c: bowHi });
          R.push({ x: 2, y: 9, w: 3, h: 6, c: PX0.skinSh });
          R.push({ x: 3, y: 8, w: 2, h: 5, c: PX0.skin });
          segHF(4, Math.max(5, bx - 1), 12, strCol);
          R.push({ x: 7, y: 12, w: Math.max(5, bx - 3), h: 2, c: shaft });
          R.push({ x: bx + 2, y: 11, w: 2, h: 2, c: tip });
          R.push({ x: 5, y: 7, w: 3, h: 4, c: PX0.skinSh });
          R.push({ x: 6, y: 6, w: 2, h: 3, c: PX0.skin });
        }
      } else if (sPh) {
        R.push({ x: 7, y: 11, w: 8, h: 4, c: coat });
        R.push({ x: 15, y: 8, w: 4, h: 12, c: bowWood });
        R.push({ x: 16, y: 10, w: 2, h: 8, c: bowHi });
        const tipX = Math.min(22, Math.round(fistCX) + 6);
        segHF(8, tipX, 12, shaft);
        segHF(9, tipX + 1, 13, "rgba(254,243,199,0.5)");
        R.push({ x: Math.min(20, Math.round(fistCX) + 2), y: 11, w: 3, h: 3, c: tip });
        R.push({ x: 4, y: 11, w: 3, h: 5, c: PX0.skinSh });
        R.push({ x: 5, y: 10, w: 2, h: 3, c: PX0.skin });
        R.push({ x: 9, y: 12, w: 5, h: 3, c: coat });
      } else if (rPh) {
        R.push({ x: 7, y: 11, w: 8, h: 5, c: coat });
        R.push({ x: 12, y: 9, w: 3, h: 10, c: bowWood });
        R.push({ x: 4, y: 12, w: 2, h: 5, c: PX0.skinSh });
        R.push({ x: 13, y: 12, w: 2, h: 4, c: PX0.skinSh });
      }
    }

    /** 弓手贴身四连：护腕短打、无弓、小幅度出拳 */
    function armsArcherMeleeCompact(atkM, wM, sM, rM, fcX, fcY, coat, PX0, segHF, segVF) {
      const wrap = PX0.armWrap || PX0.coatSh;
      const wHi = PX0.armWrapHi || PX0.coatHi;
      const y0 = atkM === 2 ? 1 : 0;
      R.push({ x: 6, y: 12 + y0, w: 7, h: 3, c: coat });
      R.push({ x: 3, y: 11 + y0, w: 2, h: 4, c: wrap });
      R.push({ x: 3, y: 12 + y0, w: 1, h: 2, c: wHi });
      if (wM) {
        R.push({ x: 8, y: 10 + y0, w: 3, h: 3, c: PX0.skinSh });
        R.push({ x: 12, y: 12 + y0, w: 2, h: 4, c: PX0.skinSh });
        R.push({ x: 9, y: 12 + y0, w: 4, h: 2, c: coat });
      } else if (sM) {
        const fx = Math.min(fcX, LEG_W - 2);
        segHF(8, fx, fcY + y0, coat);
        segVF(fx, fcY + y0 - 1, fcY + y0 + 2, wrap);
        R.push({ x: fx, y: fcY + y0, w: 2, h: 2, c: PX0.fist });
        R.push({ x: fx, y: fcY + y0, w: 1, h: 1, c: PX0.skin });
        R.push({ x: 4, y: 12 + y0, w: 2, h: 3, c: PX0.skinSh });
        if (atkM === 1) {
          R.push({ x: 2, y: 10 + y0, w: 2, h: 3, c: PX0.skinSh });
        } else if (atkM === 3) {
          R.push({ x: 5, y: 10 + y0, w: 4, h: 3, c: coat });
        }
      } else {
        R.push({ x: 8, y: 11 + y0, w: 5, h: 3, c: coat });
        R.push({ x: 13, y: 12 + y0, w: 2, h: 4, c: PX0.skinSh });
      }
    }

    /** 升龙肘：蓄力深蹲 → 引导臂垂直向上窜出 */
    function armsRiseElbow() {
      if (wind) {
        R.push({ x: 5, y: 15, w: 8, h: 4, c: coatMain });
        R.push({ x: 6, y: 14, w: 6, h: 2, c: PX.coatHi });
        R.push({ x: 4, y: 11, w: 3, h: 7, c: PX.skinSh });
        R.push({ x: 11, y: 12, w: 3, h: 6, c: PX.skinSh });
        R.push({ x: 7, y: 10, w: 4, h: 4, c: PX.skin });
        R.push({ x: 8, y: 12, w: 2, h: 2, c: PX.trimHi || PX.trim });
      } else if (strike) {
        R.push({ x: 2, y: 7, w: 3, h: 9, c: PX.skinSh });
        R.push({ x: 2, y: 7, w: 2, h: 9, c: PX.skin });
        segV(7, 5, 12, coatMain);
        R.push({ x: 7, y: 2, w: 5, h: 6, c: PX.fist });
        R.push({ x: 8, y: 1, w: 4, h: 4, c: PX.skin });
        R.push({ x: 10, y: 6, w: 5, h: 5, c: coatMain });
        R.push({ x: 12, y: 10, w: 3, h: 6, c: PX.skinSh });
        R.push({ x: 13, y: 9, w: 2, h: 5, c: PX.skin });
      } else {
        R.push({ x: 5, y: 11, w: 8, h: 5, c: coatMain });
        R.push({ x: 7, y: 9, w: 4, h: 5, c: PX.skin });
        R.push({ x: 12, y: 11, w: 3, h: 6, c: PX.skinSh });
      }
    }

    /** 坠踢：双臂稳住上身，踢击由腿部像素表达 */
    function armsAxeKick() {
      R.push({ x: 4, y: 11, w: 5, h: 5, c: coatMain });
      R.push({ x: 5, y: 10, w: 4, h: 3, c: PX.coatHi });
      R.push({ x: 3, y: 12, w: 2, h: 6, c: PX.skinSh });
      R.push({ x: 11, y: 12, w: 3, h: 6, c: PX.skinSh });
      if (strike) {
        R.push({ x: 6, y: 13, w: 9, h: 4, c: coatMain });
        const fx = Math.min(fistCellX, LEG_W - 3);
        segH(8, fx, fistCellY - 2, coatMain);
        R.push({ x: fx, y: fistCellY - 2, w: 4, h: 5, c: PX.boot });
        R.push({ x: fx + 1, y: fistCellY - 1, w: 3, h: 4, c: PX.bootHi });
        R.push({ x: fx + 1, y: fistCellY - 2, w: 2, h: 2, c: PX.skin });
      } else if (wind) {
        R.push({ x: 7, y: 12, w: 6, h: 4, c: coatMain });
        R.push({ x: 8, y: 11, w: 5, h: 3, c: PX.skinSh });
      } else {
        R.push({ x: 7, y: 13, w: 6, h: 4, c: coatMain });
      }
    }

    /** 俯冲劈掌：身体压低，双臂并拢前伸如箭头 */
    function armsDiveChop() {
      R.push({ x: 5, y: 13, w: 8, h: 3, c: coatMain });
      R.push({ x: 6, y: 12, w: 6, h: 2, c: PX.coatHi });
      if (strike) {
        segH(4, 16, 11, coatMain);
        R.push({ x: 15, y: 10, w: 2, h: 3, c: PX.fist });
        R.push({ x: 16, y: 9, w: 2, h: 2, c: PX.fist });
        R.push({ x: 4, y: 12, w: 2, h: 2, c: PX.skinSh });
      } else {
        R.push({ x: 8, y: 11, w: 4, h: 2, c: PX.skinSh });
        R.push({ x: 9, y: 10, w: 3, h: 2, c: coatMain });
      }
    }

    /** 膝撞：一膝顶起、另一臂后摆平衡 */
    function armsKneeStrike() {
      R.push({ x: 2, y: 11, w: 2, h: 5, c: PX.skinSh });
      R.push({ x: 2, y: 11, w: 1, h: 5, c: PX.skin });
      if (strike) {
        R.push({ x: 10, y: 18, w: 4, h: 4, c: PX.boot });
        R.push({ x: 11, y: 17, w: 3, h: 3, c: PX.fist });
        segH(8, 12, 15, coatMain);
        R.push({ x: 12, y: 13, w: 2, h: 3, c: PX.skin });
      } else {
        R.push({ x: 9, y: 15, w: 3, h: 3, c: coatMain });
        R.push({ x: 10, y: 14, w: 2, h: 2, c: PX.skinSh });
      }
      R.push({ x: 12, y: 9, w: 2, h: 4, c: coatMain });
      R.push({ x: 13, y: 8, w: 2, h: 2, c: PX.skin });
    }

    /** 回旋肘：后手大抡臂，上身明显拧转 */
    function armsSpinBack() {
      R.push({ x: 3, y: 9, w: 2, h: 6, c: PX.skinSh });
      R.push({ x: 3, y: 9, w: 1, h: 6, c: PX.skin });
      if (wind) {
        R.push({ x: 5, y: 12, w: 4, h: 3, c: coatMain });
        R.push({ x: 6, y: 11, w: 3, h: 2, c: PX.skinSh });
      } else if (strike) {
        segH(4, fistCellX, 10, coatMain);
        segV(fistCellX, 10, fistCellY + 1, coatMain);
        R.push({ x: fistCellX, y: fistCellY, w: 3, h: 3, c: PX.fist });
        R.push({ x: fistCellX + 1, y: fistCellY - 1, w: 2, h: 2, c: PX.skin });
        R.push({ x: 11, y: 14, w: 3, h: 2, c: coatMain });
      } else {
        R.push({ x: 8, y: 11, w: 4, h: 3, c: coatMain });
      }
      R.push({ x: 14, y: 12, w: 2, h: 3, c: PX.skinSh });
      R.push({ x: 15, y: 11, w: 1, h: 3, c: PX.skin });
    }

    function pushHurtIdleUpper(R0, kind, t, q, coat, trimC, skinPX) {
      const p = 1 - t;
      const s = Math.round(q * 0.2 * p);
      const h = Math.round(2 * p);
      if (kind === "tap") {
        R0.push({ x: 3 + s, y: 10 + h, w: 2, h: 5, c: skinPX.skinSh });
        R0.push({ x: 12 + s, y: 11 + h, w: 2, h: 4, c: skinPX.skinSh });
        R0.push({ x: 7 + s, y: 11 + h, w: 6, h: 3, c: coat });
        R0.push({ x: 8 + s, y: 12 + h, w: 4, h: 2, c: trimC });
      } else if (kind === "strike" || kind === "wide") {
        R0.push({ x: 2 + s, y: 9 + h, w: 3, h: 6, c: skinPX.skinSh });
        R0.push({ x: 12 + s, y: 10 + h, w: 3, h: 5, c: skinPX.skinSh });
        R0.push({ x: 6 + s, y: 10 + h, w: 8, h: 4, c: coat });
        R0.push({ x: 7 + s, y: 12 + h, w: 6, h: 2, c: trimC });
        R0.push({ x: 5 + s, y: 11 + h, w: 2, h: 2, c: skinPX.fist });
        R0.push({ x: 11 + s, y: 11 + h, w: 2, h: 2, c: skinPX.fist });
      } else if (kind === "hooked") {
        R0.push({ x: 4 + s, y: 10 + h, w: 2, h: 5, c: skinPX.skinSh });
        R0.push({ x: 11 + s, y: 9 + h, w: 3, h: 5, c: skinPX.skinSh });
        R0.push({ x: 7 + s, y: 10 + h, w: 6, h: 4, c: coat });
        R0.push({ x: 12 + s, y: 11 + h, w: 2, h: 3, c: skinPX.skin });
        R0.push({ x: 3 + s, y: 12 + h, w: 2, h: 2, c: skinPX.fist });
      } else if (kind === "low" || kind === "sweep") {
        R0.push({ x: 5 + s, y: 12 + h, w: 2, h: 4, c: skinPX.skinSh });
        R0.push({ x: 11 + s, y: 12 + h, w: 2, h: 4, c: skinPX.skinSh });
        R0.push({ x: 7 + s, y: 12 + h, w: 5, h: 3, c: coat });
        R0.push({ x: 8 + s, y: 13 + h, w: 3, h: 2, c: trimC });
        R0.push({ x: 9 + s, y: 10 + h, w: 2, h: 2, c: skinPX.skin });
      } else if (kind === "launch") {
        R0.push({ x: 4 + s, y: 7 + h, w: 2, h: 6, c: skinPX.skinSh });
        R0.push({ x: 11 + s, y: 8 + h, w: 2, h: 5, c: skinPX.skinSh });
        R0.push({ x: 6 + s, y: 9 + h, w: 7, h: 4, c: coat });
        R0.push({ x: 8 + s, y: 6 + h, w: 3, h: 2, c: skinPX.skin });
        R0.push({ x: 7 + s, y: 11 + h, w: 4, h: 2, c: trimC });
      } else if (kind === "slam" || kind === "gut") {
        R0.push({ x: 5 + s, y: 13 + h, w: 8, h: 3, c: coat });
        R0.push({ x: 6 + s, y: 12 + h, w: 6, h: 2, c: skinPX.skinSh });
        R0.push({ x: 8 + s, y: 11 + h, w: 3, h: 3, c: skinPX.skin });
        R0.push({ x: 4 + s, y: 12 + h, w: 2, h: 3, c: skinPX.skinSh });
        R0.push({ x: 12 + s, y: 12 + h, w: 2, h: 3, c: skinPX.skinSh });
        R0.push({ x: 7 + s, y: 14 + h, w: 4, h: 1, c: trimC });
      } else if (kind === "spin") {
        R0.push({ x: 3 + s, y: 9 + h, w: 2, h: 6, c: skinPX.skinSh });
        R0.push({ x: 13 + s, y: 10 + h, w: 2, h: 5, c: skinPX.skinSh });
        R0.push({ x: 5 + s, y: 10 + h, w: 9, h: 4, c: coat });
        R0.push({ x: 7 + s, y: 12 + h, w: 5, h: 2, c: trimC });
        R0.push({ x: 14 + s, y: 11 + h, w: 2, h: 2, c: skinPX.fist });
      } else {
        R0.push({ x: 3 + s, y: 10 + h, w: 2, h: 5, c: skinPX.skinSh });
        R0.push({ x: 12 + s, y: 11 + h, w: 2, h: 4, c: skinPX.skinSh });
        R0.push({ x: 7 + s, y: 11 + h, w: 6, h: 3, c: coat });
        R0.push({ x: 8 + s, y: 12 + h, w: 4, h: 2, c: trimC });
      }
    }

    if (ap === 0) {
      const q = idleSway;
      if (hurting) {
        pushHurtIdleUpper(R, hurtKind, hurtT, q, coatMain, trim, PX);
      } else if (guardingDraw) {
        const g = Math.round(q * 0.28);
        const gd = PX.trimDark || trim;
        R.push({ x: 5 + g, y: 8, w: 8, h: 5, c: coatMain });
        R.push({ x: 6 + g, y: 7, w: 2, h: 3, c: PX.coatHi });
        R.push({ x: 11 + g, y: 7, w: 2, h: 3, c: PX.coatHi });
        R.push({ x: 8 + g, y: 10, w: 2, h: 2, c: PX.skin });
        R.push({ x: 6 + g, y: 9, w: 2, h: 6, c: PX.skinSh });
        R.push({ x: 11 + g, y: 9, w: 2, h: 6, c: PX.skinSh });
        R.push({ x: 7 + g, y: 10, w: 2, h: 5, c: PX.skin });
        R.push({ x: 11 + g, y: 10, w: 2, h: 5, c: PX.skin });
        R.push({ x: 7 + g, y: 13, w: 5, h: 2, c: gd });
        R.push({ x: 8 + g, y: 12, w: 3, h: 2, c: trim });
        R.push({ x: 7 + g, y: 14, w: 2, h: 2, c: PX.fist });
        R.push({ x: 11 + g, y: 14, w: 2, h: 2, c: PX.fist });
        R.push({ x: 8 + g, y: 10, w: 1, h: 2, c: "#f0f9ff" });
        R.push({ x: 10 + g, y: 10, w: 1, h: 2, c: "#bae6fd" });
        R.push({ x: 9 + g, y: 9, w: 2, h: 1, c: "rgba(186,230,253,0.85)" });
        R.push({ x: 7 + g, y: 11, w: 6, h: 1, c: "rgba(56,189,248,0.35)" });
      } else {
        const aq = Math.round(q * 0.85);
        R.push({ x: 2 + aq, y: 11, w: 2, h: 2, c: coatMain });
        R.push({ x: 2 + aq, y: 13, w: 2, h: 5, c: PX.armWrap || PX.coatSh });
        R.push({ x: 3 + aq, y: 13, w: 1, h: 4, c: PX.armWrapHi || PX.coatHi });
        R.push({ x: 2 + aq, y: 17, w: 2, h: 2, c: PX.skin });
        R.push({ x: 12 + aq, y: 12, w: 2, h: 2, c: coatMain });
        R.push({ x: 13 + aq, y: 14, w: 2, h: 4, c: PX.skinSh });
        R.push({ x: 14 + aq, y: 14, w: 1, h: 4, c: PX.skin });
        if (PX.armWrap) {
          R.push({ x: 13 + aq, y: 15, w: 2, h: 3, c: PX.armWrap });
          R.push({ x: 13 + aq, y: 15, w: 1, h: 2, c: PX.armWrapHi || PX.armWrap });
        }
        R.push({ x: 14 + aq, y: 17, w: 2, h: 2, c: PX.fist });
        R.push({ x: 14 + aq, y: 17, w: 1, h: 1, c: PX.skin });
      }
    } else if (archDraw) {
      armsArcherBowDraw(ap, A.act0, archWind, archStrike, archRec, fistCellX, coatMain, PX, segH);
    } else if (archMelee) {
      armsArcherMeleeCompact(atk, wind, strike, recover, fistCellX, fistCellY, coatMain, PX, segH, segV);
    } else if (atk === 0) {
      armsJabLike();
    } else if (atk === 9) {
      armsKneeStrike();
    } else if (atk === 1) {
      R.push({ x: 9, y: 10, w: 3, h: 3, c: PX.skinSh });
      R.push({ x: 10, y: 10, w: 2, h: 3, c: PX.skin });
      R.push({ x: 8, y: 11, w: 2, h: 2, c: coatMain });
      const rex = wind ? 4 : strike ? 3 : 5;
      const rey = wind ? 11 : strike ? 10 : 12;
      R.push({ x: rex, y: rey, w: 2, h: 2, c: PX.skinSh });
      const xa0 = Math.min(rex + 2, fistCellX);
      const xa1 = Math.max(rex + 2, fistCellX);
      const xa1Cap = Math.min(xa1, xa0 + 48);
      for (let x = xa0; x < xa1Cap; x++) R.push({ x, y: fistCellY, w: 1, h: 1, c: coatMain });
      segV(rex + 1, rey + 2, fistCellY, coatMain);
      R.push({ x: fistCellX, y: fistCellY, w: 2, h: 2, c: PX.fist });
      R.push({ x: fistCellX, y: fistCellY, w: 1, h: 1, c: PX.skin });
    } else if (atk === 10) {
      armsSpinBack();
    } else if (atk === 2) {
      R.push({ x: 3, y: 12, w: 2, h: 5, c: PX.skinSh });
      R.push({ x: 3, y: 12, w: 1, h: 5, c: PX.skin });
      R.push({ x: 4, y: 11, w: 2, h: 4, c: PX.skinSh });
      R.push({ x: 4, y: 11, w: 1, h: 4, c: PX.skin });
      const elbowX = wind ? 9 : strike ? 8 : 7;
      const elbowY = wind ? 10 : strike ? 9 : 10;
      R.push({ x: elbowX, y: elbowY, w: 2, h: 2, c: PX.skinSh });
      segH(elbowX + 1, fistCellX, fistCellY, coatMain);
      segV(elbowX + 1, elbowY + 2, fistCellY - 1, coatMain);
      R.push({ x: fistCellX, y: fistCellY, w: 2, h: 2, c: PX.fist });
      R.push({ x: fistCellX, y: fistCellY, w: 1, h: 1, c: PX.skin });
    } else if (atk === 7) {
      armsRiseElbow();
    } else if (atk === 11) {
      armsAxeKick();
    } else if (atk === 3) {
      const cx0 = wind ? 7 : strike ? 6 : 8;
      const cy0 = wind ? 13 : strike ? 11 : 12;
      R.push({ x: cx0 - 1, y: cy0, w: 5, h: 4, c: coatMain });
      R.push({ x: cx0, y: cy0 - 2, w: 4, h: 3, c: PX.skinSh });
      const fx1 = Math.min(LEG_W - 2, fistCellX - 1);
      const fx2 = Math.min(LEG_W - 2, fistCellX + 1);
      if (strike) {
        segH(cx0 + 1, fx1, fistCellY, coatMain);
        segH(cx0 + 2, fx2, fistCellY + 1, coatMain);
        R.push({ x: fx1, y: fistCellY, w: 2, h: 2, c: PX.fist });
        R.push({ x: fx2, y: fistCellY, w: 2, h: 2, c: PX.fist });
        R.push({ x: fx1, y: fistCellY, w: 1, h: 1, c: PX.skin });
        R.push({ x: fx2, y: fistCellY, w: 1, h: 1, c: PX.skin });
      } else {
        const elbowX = 7;
        const elbowY = 11;
        R.push({ x: elbowX, y: elbowY, w: 3, h: 2, c: coatMain });
        R.push({ x: elbowX + 1, y: elbowY + 1, w: 2, h: 2, c: PX.skinSh });
      }
    } else if (atk === 8) {
      armsDiveChop();
    } else if (atk === 4) {
      R.push({ x: 4, y: 11, w: 2, h: 5, c: PX.skinSh });
      R.push({ x: 4, y: 11, w: 1, h: 5, c: PX.skin });
      const elbowX = wind ? 7 : strike ? 8 : 7;
      const elbowY = wind ? 13 : strike ? 13 : 13;
      R.push({ x: 7, y: 12, w: Math.max(1, elbowX - 6), h: 2, c: coatMain });
      R.push({ x: elbowX, y: elbowY, w: 2, h: 2, c: PX.skinSh });
      const xb0 = Math.min(elbowX + 1, fistCellX);
      const xb1 = Math.max(elbowX + 1, fistCellX);
      const xb1Cap = Math.min(xb1, xb0 + 48);
      for (let x = xb0; x < xb1Cap; x++) R.push({ x, y: fistCellY, w: 1, h: 1, c: coatMain });
      R.push({ x: fistCellX, y: fistCellY, w: 2, h: 2, c: PX.fist });
      R.push({ x: fistCellX, y: fistCellY, w: 1, h: 1, c: PX.skin });
    } else if (atk === 5) {
      R.push({ x: 5, y: 10, w: 2, h: 5, c: PX.skinSh });
      R.push({ x: 5, y: 10, w: 1, h: 5, c: PX.skin });
      R.push({ x: 7, y: 12, w: 4, h: 2, c: coatMain });
      if (strike) {
        segH(3, 14, LEG_H - 6, coatMain);
        R.push({ x: 3, y: LEG_H - 7, w: 12, h: 2, c: PX.bootHi });
        R.push({ x: fistCellX, y: fistCellY - 1, w: 3, h: 2, c: PX.fist });
      } else {
        R.push({ x: 8, y: 13, w: 3, h: 2, c: coatMain });
      }
    } else if (atk === 6) {
      R.push({ x: 3, y: 11, w: 2, h: 4, c: PX.skinSh });
      R.push({ x: 3, y: 11, w: 1, h: 4, c: PX.skin });
      if (strike) {
        segV(10, 14, LEG_H - 8, coatMain);
        R.push({ x: 10, y: LEG_H - 9, w: 3, h: 3, c: PX.fist });
        R.push({ x: 11, y: LEG_H - 10, w: 2, h: 2, c: PX.skin });
      } else {
        R.push({ x: 7, y: 12, w: 4, h: 3, c: coatMain });
      }
    } else {
      R.push({ x: 7, y: 11, w: 3, h: 2, c: coatMain });
      R.push({ x: 8, y: 12, w: 2, h: 2, c: PX.skinSh });
    }

    const hm = PX.hairMid || PX.hairHi || PX.hair;
    const hh = PX.hairHi || PX.hair;
    /* 后发：加宽颅顶，避免两侧「黑柱子」鬓角 */
    R.push({ x: 5 + twist, y: 0, w: 8, h: 2, c: PX.hair });
    R.push({ x: 4 + twist, y: 2, w: 10, h: 2, c: PX.hair });
    R.push({ x: 3 + twist, y: 4, w: 2, h: 2, c: PX.hair });
    R.push({ x: 13 + twist, y: 4, w: 2, h: 2, c: PX.hair });
    R.push({ x: 7 + twist, y: 1, w: 4, h: 1, c: hm });
    R.push({ x: 8 + twist, y: 2, w: 2, h: 1, c: hh });

    /* 颈、额头与脸型（split shading，减轻方块脸） */
    R.push({ x: 7 + twist, y: 13, w: 4, h: 1, c: PX.skin });
    R.push({ x: 7 + twist, y: 7, w: 4, h: 1, c: PX.skin });
    R.push({ x: 8 + twist, y: 8, w: 2, h: 2, c: PX.skin });
    R.push({ x: 7 + twist, y: 9, w: 4, h: 4, c: PX.skin });
    R.push({ x: 6 + twist, y: 10, w: 1, h: 3, c: PX.skinSh });
    R.push({ x: 11 + twist, y: 10, w: 1, h: 3, c: PX.skinSh });
    R.push({ x: 7 + twist, y: 12, w: 1, h: 1, c: PX.skinSh });
    R.push({ x: 10 + twist, y: 12, w: 1, h: 1, c: PX.skinSh });

    const browCol = PX.brow || PX.skinSh || "#4a3f3c";
    R.push({ x: 7 + twist, y: 8, w: 2, h: 1, c: browCol });

    const shareFront = PX.sharingan || "#e11d48";
    const shareCore = PX.sharinganCore || "#fecdd3";
    if (!archF) {
      R.push({ x: 10 + twist, y: 9, w: 1, h: 1, c: shareFront });
      R.push({ x: 10 + twist, y: 8, w: 1, h: 1, c: shareCore });
      R.push({ x: 9 + twist, y: 9, w: 1, h: 1, c: "#8b2942" });
      R.push({ x: 8 + twist, y: 9, w: 1, h: 1, c: "#f4f4f5" });
    } else {
      R.push({ x: 8 + twist, y: 9, w: 1, h: 1, c: "#4a4038" });
      R.push({ x: 10 + twist, y: 9, w: 1, h: 1, c: "#4a4038" });
      R.push({ x: 9 + twist, y: 9, w: 1, h: 1, c: "#faf6ef" });
      R.push({ x: 9 + twist, y: 8, w: 1, h: 1, c: shareCore });
    }
    const lip = PX.lipLine || "#78716c";
    R.push({ x: 8 + twist, y: 11, w: 2, h: 1, c: lip });

    /* 刘海与鬓角（盖住发际线，高光打破扁平） */
    R.push({ x: 6 + twist, y: 3, w: 6, h: 2, c: PX.hair });
    R.push({ x: 7 + twist, y: 5, w: 4, h: 2, c: PX.hair });
    R.push({ x: 7 + twist, y: 6, w: 2, h: 1, c: hm });
    R.push({ x: 9 + twist, y: 6, w: 2, h: 1, c: hm });
    R.push({ x: 8 + twist, y: 5, w: 2, h: 2, c: hh });
    R.push({ x: 5 + twist, y: 5, w: 2, h: 3, c: PX.hair });
    R.push({ x: 4 + twist, y: 7, w: 2, h: 2, c: PX.hair });
    R.push({ x: 11 + twist, y: 5, w: 2, h: 3, c: PX.hair });
    R.push({ x: 12 + twist, y: 7, w: 2, h: 2, c: PX.hair });
    if (archF) {
      R.push({ x: 5 + twist, y: 0, w: 2, h: 6, c: PX.hair });
      R.push({ x: 13 + twist, y: 0, w: 2, h: 6, c: PX.hair });
      R.push({ x: 8 + twist, y: 2, w: 2, h: 2, c: PX.hairHi || PX.hair });
    }

    if (archF && atk === 12 && ap >= 7 && ap <= 38) {
      const bowFwd = ap >= A.act0 && ap <= A.act1;
      if (bowFwd) {
        R.push({ x: 9, y: 11, w: 22, h: 6, c: "#4a3428" });
        R.push({ x: 10, y: 10, w: 20, h: 4, c: "#6b5344" });
        R.push({ x: 28, y: 8, w: 5, h: 16, c: "#5c4030" });
        R.push({ x: 11, y: 12, w: 18, h: 3, c: "rgba(253,224,71,0.55)" });
      } else if (ap < A.act0) {
        R.push({ x: 7, y: 13, w: 8, h: 12, c: "#5c4030" });
      }
    }

    if (strike) {
      const dust = ["#94a3b8", "#cbd5e1", "#e2e8f0"];
      for (let i = 0; i < 7; i++) {
        R.push({
          x: 2 + ((i * 5 + ap) % 12),
          y: LEG_H - 2 - (i % 2),
          w: 1,
          h: 1,
          c: dust[i % 3],
        });
      }
    }

    drawPixelCells(ctx, left, top + bob, dir, R);

    if (archF && atk === 12 && strikePeak && !hurting) {
      ctx.save();
      ctx.strokeStyle = "rgba(253,224,71,0.55)";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      const bx = footCenter + dir * 28;
      const by = fy - f.h * 0.4 + bob;
      ctx.beginPath();
      ctx.arc(bx, by, 58, dir > 0 ? -0.72 : Math.PI - 0.72, dir > 0 ? 0.22 : Math.PI + 0.22);
      ctx.stroke();
      ctx.strokeStyle = "rgba(186,230,253,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 50, dir > 0 ? -0.62 : Math.PI - 0.62, dir > 0 ? 0.15 : Math.PI + 0.15);
      ctx.stroke();
      ctx.restore();
    }

    if (guardingDraw) {
      const pulse = 0.38 + Math.sin(performance.now() / 68) * 0.2;
      const fx0 = footCenter + dir * 20;
      const y0 = fy - f.h * 0.5 + bob;
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = `rgba(125, 211, 252, ${pulse * (0.28 + i * 0.07)})`;
        ctx.lineWidth = 2 + (i % 3);
        ctx.beginPath();
        ctx.moveTo(fx0 - dir * 2, y0 - 16 + i * 5);
        ctx.lineTo(fx0 + dir * (26 + i * 2), y0 - 12 + i * 4);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(224, 242, 254, ${pulse * 0.48})`;
      ctx.lineWidth = 2;
      const ax = footCenter + dir * 16;
      const ay = fy - f.h * 0.48 + bob;
      ctx.beginPath();
      ctx.arc(ax, ay, 28, dir > 0 ? -Math.PI * 0.32 : Math.PI - Math.PI * 0.32, dir > 0 ? Math.PI * 0.32 : Math.PI + Math.PI * 0.32, false);
      ctx.stroke();
      ctx.restore();
    }

    const bfv = f.blockFlash | 0;
    if (bfv > 0) {
      const u = Math.min(1, bfv / 220);
      const px = footCenter + dir * 8;
      const py = fy - f.h * 0.42 + bob;
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(224, 242, 254, ${0.2 + u * 0.75})`;
      ctx.lineWidth = 3 + u * 6;
      ctx.beginPath();
      ctx.arc(px, py, 22 + (1 - u) * 36, -Math.PI * 0.42, Math.PI * 0.42);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 + u * 0.55})`;
      ctx.lineWidth = 1.5 + u * 3;
      for (let i = 0; i < 14; i++) {
        const t = i / 13;
        const ang = -0.65 * Math.PI + t * Math.PI * 1.3 + (dir < 0 ? Math.PI : 0);
        const len = 28 + u * 44;
        ctx.beginPath();
        ctx.moveTo(px + dir * 4, py - 4 + t * 8);
        ctx.lineTo(px + dir * 4 + Math.cos(ang) * len, py + Math.sin(ang) * len * 0.55);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(186, 230, 253, ${0.08 + u * 0.22})`;
      ctx.beginPath();
      ctx.arc(px, py, 18 + u * 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const hf = f.hitFlash | 0;
    if (hf > 0) {
      const hu = Math.min(1, hf / 220);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + hu * 0.38})`;
      const bw = PIX_W * PIX_SCALE;
      const bh = PIX_H * PIX_SCALE;
      ctx.fillRect(Math.floor(left - 3), Math.floor(top + bob - 3), Math.ceil(bw + 6), Math.ceil(bh + 6));
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();
    }

    if (ap > 0) {
      ctx.font = "800 " + Math.round(11 + 8 / 3) + "px system-ui, 'PingFang SC', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = strikePeak ? "#fef9c3" : "rgba(250, 250, 250, 0.75)";
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.lineWidth = 3;
      const lx = left + (PIX_W * PIX_SCALE) / 2;
      const ly = top + bob - 10;
      ctx.strokeText(A.label, lx, ly);
      ctx.fillText(A.label, lx, ly);
    }

    if (strikePeak && !hurting) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(
        Math.floor(fistWorld.x - 2),
        Math.floor(fistWorld.y - 2),
        Math.ceil(fistWorld.w + 4),
        Math.ceil(fistWorld.h + 4)
      );
      if (atk === 3 || diveAtk) {
        const fw2 = cellWorldRect(left, top, dir, Math.min(LEG_W - 2, fistCellX + 1), fistCellY, 2, 2);
        ctx.fillRect(Math.floor(fw2.x - 2), Math.floor(fw2.y - 2), Math.ceil(fw2.w + 4), Math.ceil(fw2.h + 4));
      }
    }

    ctx.imageSmoothingEnabled = prevSmooth;
    ctx.restore();
  }

  function drawDummy(ctx, dummy, map) {
    const ox = dummy.x + (dummy.shake | 0);
    const oy = dummy.y - dummy.h;
    if (dummy.flash > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(ox - 4, oy - 8, dummy.w + 8, dummy.h + 16);
    }
    const wood1 = "#78350f";
    const wood2 = "#92400e";
    ctx.fillStyle = wood1;
    ctx.fillRect(ox, oy + dummy.h - 28, dummy.w, 28);
    ctx.fillStyle = wood2;
    ctx.fillRect(ox + 6, oy + 20, dummy.w - 12, dummy.h - 48);
    ctx.fillStyle = "#451a03";
    ctx.fillRect(ox + dummy.w * 0.5 - 16, oy - 6, 32, 18);
    ctx.fillStyle = wood2;
    ctx.fillRect(ox + 8, oy + 8, 8, dummy.h - 60);
    ctx.fillRect(ox + dummy.w - 16, oy + 14, 8, dummy.h - 74);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, dummy.w, dummy.h);
  }

  function drawPlatforms(ctx, plats, map) {
    for (const p of plats) {
      ctx.fillStyle = map.accent || "#334155";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = "rgba(15,23,42,0.45)";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    }
  }

  window.MiniFighterRender = {
    drawFighterWorld,
    drawDummy,
    drawPlatforms,
    getAttackBox,
  };

  /** f 脚底 y；返回世界坐标 hitbox */
  function getAttackBox(f) {
    const MiniD = window.MiniFighterData;
    const ATTACKS = MiniD && MiniD.ATTACKS;
    if (!ATTACKS || !ATTACKS.length || !f) return null;
    const atkIdx = Math.min(Math.max(0, f.atkIdx | 0), ATTACKS.length - 1);
    const PD = MiniD && MiniD.ATK_PILLAR_DROP;
    const AST = MiniD && MiniD.ATK_AIR_STREAK;
    const AV = MiniD && MiniD.ATK_ARCHER_AIR_VOLLEY;
    if (PD != null && atkIdx === PD) return null;
    if (AST != null && atkIdx === AST) return null;
    if (AV != null && atkIdx === AV) return null;
    if (f.charType === "archer" && atkIdx >= 0 && atkIdx <= 3 && !f._archerJMelee) return null;
    const ap = f.attackPhase;
    const A =
      MiniD && typeof MiniD.resolveAttackForFighter === "function"
        ? MiniD.resolveAttackForFighter(f, atkIdx)
        : ATTACKS[atkIdx];
    if (!A || !A.peakAp || ap < A.act0 || ap > A.act1) return null;
    const inPeak = ap >= A.peakAp[0] && ap <= A.peakAp[1] ? 1 : A.peakMul;
    const reach = Math.floor(A.reachPeak[0] + (A.reachPeak[1] - A.reachPeak[0]) * inPeak);
    if (!Number.isFinite(reach)) return null;
    const chestY = f.y + A.cyOff - (ap >= A.peakAp[0] ? 3 : 0);
    let w =
      A.key === "palm" || A.key === "dive" || A.key === "sDrop"
        ? Math.floor(reach * 1.08)
        : A.key === "spinBack"
          ? Math.floor(reach * 1.18)
          : A.key === "sweep"
            ? Math.floor(reach * 1.12)
            : reach;
    if (!Number.isFinite(w)) return null;
    w = Math.min(200, Math.max(8, w));
    const h = Number.isFinite(A.ah) ? Math.min(120, Math.max(4, A.ah)) : 26;
    return {
      x: f.facing === 1 ? f.x + 4 : f.x + f.w - w,
      y: chestY,
      w,
      h,
    };
  }
})();
