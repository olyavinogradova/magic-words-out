// players.js — mom & daughter. Real art (per-pose files) when present,
// cute procedural placeholders otherwise.
// While walking, positions/poses come from walk.js (girl leads, mom follows)
// in SCREEN coordinates (camera already applied in walk.actorVisual);
// pos === null falls back to the fixed encounter layout and internal poses
// (set by encounter.setPoses).
import { art } from './art.js';
import { GROUND_Y, PLANT_PX } from './util.js';

// shared size fractions — walk.js uses these for reach/collect math
export const MOM_H_FRAC = 0.34;
export const DAU_H_FRAC = 0.24;

// Natural pose heights, measured from the sheets (pose crop height ÷ idle
// crop height). Drawing each pose at its own height keeps the body
// proportions identical to the art — a crouch drawn at standing height
// inflates the whole figure (~40% for the daughter's pick). The daughter's
// hold pose (stone raised) is set EQUAL to idle by eye, not by the sheet
// ratio. Tune here if sheets change.
const POSE_H = {
  mom: { idle: 1, walk1: 0.893, walk2: 0.893, jump: 0.904, land: 0.845, happy: 1.011, shield: 1.016 },
  daughter: { idle: 1, walk1: 0.91, walk2: 0.91, jump: 0.91, land: 0.886, happy: 1.012, pick: 0.725, hold: 1, peek: 1 },
};

// Sheet poses drawn facing LEFT although characters travel right (the
// talk/gesture poses break the face-right convention). Like the monster
// mirror: files stay canonical, we flip at draw time when facing right.
const LEFT_FACING = { mom: ['happy'], daughter: ['happy'] };

export class Players {
  constructor() {
    this.momPose = 'idle';
    this.daughterPose = 'idle';
  }

  setPoses(mom, daughter) {
    if (mom) this.momPose = mom;
    if (daughter) this.daughterPose = daughter;
  }

// frame order mirrors art.js DEFS
  momFrame(pose) {
    switch (pose) {
      case 'walk1': case 'walk2': return 1;
      case 'jump': return 2;
      case 'land': return 3;
      case 'happy': return 4;
      case 'shield': return 5;
      default: return 0;
    }
  }

  girlFrame(pose) {
    switch (pose) {
      case 'walk1': case 'walk2': return 1;
      case 'jump': return 2;
      case 'land': return 3;
      case 'happy': return 4;
      case 'pick': return 5;
      case 'hold': return 6;
      default: return 0; // idle, peek
    }
  }

  draw(ctx, W, H, t, pos) {
    const groundY = H * GROUND_Y + PLANT_PX;
    let momX, dauX, momAirY = 0, dauAirY = 0, momDir = 1, dauDir = 1, momPose, dauPose;
    if (pos) {
      momX = pos.momX; dauX = pos.girlX;
      momAirY = pos.momAirY || 0; dauAirY = pos.girlAirY || 0;
      momDir = pos.momDir || 1; dauDir = pos.girlDir || 1;
      momPose = pos.momPose != null ? pos.momPose : this.momPose;          // null pose → encounter's
      dauPose = pos.girlPose != null ? pos.girlPose : this.daughterPose;   // setPoses state
    } else {
      momX = W * 0.31; dauX = momX - Math.min(W, H) * 0.075;               // M1 encounter marks
      momPose = this.momPose; dauPose = this.daughterPose;
    }
    const momH0 = H * MOM_H_FRAC, dauH0 = H * DAU_H_FRAC;
    const momH = momH0 * (POSE_H.mom[momPose] || 1);
    const dauH = dauH0 * (POSE_H.daughter[dauPose] || 1);

// the encounter's shield visual: the mom+kid peeking pair (momkid_peek1 —
// the kid tucked behind mom's back); mom_shield art also contains the
// daughter — either way don't draw her separately
    const pairArt = momPose === 'shield' && art.has('momkid', 0);
    const shieldArt = momPose === 'shield' && !pairArt && art.has('mom', 5);

    if (!pairArt && !shieldArt) {
      const dauJump = dauPose === 'happy' ? Math.abs(Math.sin(t * 5.5)) * 14 : 0;
      const walkBob = dauPose === 'walk1' ? Math.abs(Math.sin(t * 9)) * 4 : 0;
      shadow(ctx, dauX, groundY, dauH * 0.22, dauAirY);
      const feetY = groundY - dauAirY - dauJump - walkBob;
      const dauFlip = dauDir < 0 !== LEFT_FACING.daughter.includes(dauPose);
      if (!art.drawFrame(ctx, 'daughter', this.girlFrame(dauPose), dauX, feetY, dauH, { flip: dauFlip })) {
        this.drawProcedural(ctx, 'girl', dauPose, dauX, feetY, dauH, t, dauDir);
      }
    }
// idle mom stands perfectly still (a breathing bob reads as levitation);
// only the walk pose keeps its gait bounce
    const momBob = (pairArt || shieldArt || momPose !== 'walk1') ? 0
      : Math.abs(Math.sin(t * 8)) * 3.5;
    shadow(ctx, momX, groundY, momH * 0.26, momAirY);
    const momFlip = momDir < 0 !== LEFT_FACING.mom.includes(momPose);
    let drawn = false;
    if (pairArt) drawn = art.drawFrame(ctx, 'momkid', 0, momX, groundY - momAirY, momH);
    if (!drawn && !art.drawFrame(ctx, 'mom', this.momFrame(momPose), momX, groundY - momAirY - momBob, momH, { flip: momFlip })) {
      this.drawProcedural(ctx, 'mom', momPose, momX, groundY - momAirY - momBob, momH, t, momDir);
    }
  }

  // procedural placeholders — mirror the character around her x when walking left
  drawProcedural(ctx, who, pose, x, footY, h, t, dir) {
    ctx.save();
    ctx.translate(x, footY);
    if (dir < 0) ctx.scale(-1, 1);
    ctx.translate(-x, -footY);
    if (who === 'mom') this.drawMom(ctx, x, footY, h, t);
    else this.drawDaughter(ctx, x, footY, h, t);
    ctx.restore();
  }

  drawMom(ctx, x, footY, h, t) {
    const s = h / 320; // unit scale — draw code designed at 320px height
    const skin = '#ffd9b3', hair = '#5d4037', dress = '#e07a5f', dressDark = '#c9684e';
    ctx.save();
    ctx.translate(x, footY);
    ctx.lineCap = 'round';

    // legs
    ctx.strokeStyle = skin; ctx.lineWidth = 11 * s;
    line(ctx, -10 * s, -52 * s, -12 * s, 0);
    line(ctx, 10 * s, -52 * s, 12 * s, 0);
    ctx.fillStyle = '#8a5a44';
    ellipse(ctx, -14 * s, 0, 14 * s, 7 * s); ellipse(ctx, 14 * s, 0, 14 * s, 7 * s);

    // dress
    ctx.fillStyle = dress;
    ctx.beginPath();
    ctx.moveTo(-16 * s, -160 * s); ctx.quadraticCurveTo(-52 * s, -60 * s, -46 * s, -50 * s);
    ctx.lineTo(46 * s, -50 * s); ctx.quadraticCurveTo(52 * s, -60 * s, 16 * s, -160 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dressDark; ellipse(ctx, 0, -55 * s, 45 * s, 6 * s);

    // arms
    ctx.strokeStyle = skin; ctx.lineWidth = 10 * s;
    if (this.momPose === 'shield') {
      line(ctx, -14 * s, -150 * s, -26 * s, -120 * s);                 // back arm down
      line(ctx, 14 * s, -150 * s, 74 * s, -138 * s);                   // front arm toward monster
      ctx.fillStyle = skin; ellipse(ctx, 78 * s, -138 * s, 9 * s, 9 * s);
    } else if (this.momPose === 'happy') {
      const wig = Math.sin(t * 8) * 6 * s;
      line(ctx, -14 * s, -150 * s, -40 * s, -196 * s + wig);
      line(ctx, 14 * s, -150 * s, 40 * s, -196 * s - wig);
    } else {
      line(ctx, -14 * s, -150 * s, -24 * s, -104 * s);
      line(ctx, 14 * s, -150 * s, 24 * s, -104 * s);
    }

    // head
    ctx.fillStyle = skin; ellipse(ctx, 0, -196 * s, 30 * s, 32 * s);
    // hair
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(0, -206 * s, 31 * s, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    ellipse(ctx, 0, -232 * s, 17 * s, 14 * s); // bun
    // face
    ctx.fillStyle = '#3a2e2a';
    ellipse(ctx, -10 * s, -196 * s, 3.2 * s, 4 * s); ellipse(ctx, 10 * s, -196 * s, 3.2 * s, 4 * s);
    ctx.strokeStyle = '#3a2e2a'; ctx.lineWidth = 2.4 * s;
    ctx.beginPath(); ctx.arc(0, -188 * s, 8 * s, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.fillStyle = 'rgba(255,138,128,.4)';
    ellipse(ctx, -18 * s, -189 * s, 5 * s, 3 * s); ellipse(ctx, 18 * s, -189 * s, 5 * s, 3 * s);
    ctx.restore();
  }

  drawDaughter(ctx, x, footY, h, t) {
    const s = h / 250;
    const skin = '#ffe0c2', hair = '#8a5a3b', dress = '#7fb8e6', dressDark = '#68a3d6';
    const peek = this.daughterPose === 'peek';
    ctx.save();
    ctx.translate(x, footY);
    if (peek) ctx.rotate(-0.06);
    ctx.lineCap = 'round';

    // legs
    ctx.strokeStyle = skin; ctx.lineWidth = 9 * s;
    line(ctx, -7 * s, -38 * s, -9 * s, 0);
    line(ctx, 7 * s, -38 * s, 9 * s, 0);
    ctx.fillStyle = '#f0567a';
    ellipse(ctx, -11 * s, 0, 11 * s, 6 * s); ellipse(ctx, 11 * s, 0, 11 * s, 6 * s);

    // dress
    ctx.fillStyle = dress;
    ctx.beginPath();
    ctx.moveTo(-12 * s, -118 * s); ctx.quadraticCurveTo(-38 * s, -44 * s, -33 * s, -36 * s);
    ctx.lineTo(33 * s, -36 * s); ctx.quadraticCurveTo(38 * s, -44 * s, 12 * s, -118 * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = dressDark; ellipse(ctx, 0, -40 * s, 32 * s, 5 * s);

    // arms
    ctx.strokeStyle = skin; ctx.lineWidth = 8 * s;
    if (this.daughterPose === 'happy') {
      const wig = Math.sin(t * 9) * 5 * s;
      line(ctx, -10 * s, -108 * s, -30 * s, -144 * s + wig);
      line(ctx, 10 * s, -108 * s, 30 * s, -144 * s - wig);
    } else if (peek) {
      line(ctx, -10 * s, -108 * s, -6 * s, -78 * s);  // hands close to chest
      line(ctx, 10 * s, -108 * s, 8 * s, -80 * s);
    } else {
      line(ctx, -10 * s, -108 * s, -18 * s, -76 * s);
      line(ctx, 10 * s, -108 * s, 18 * s, -76 * s);
    }

    // head
    ctx.fillStyle = skin; ellipse(ctx, 0, -144 * s, 24 * s, 25 * s);
    // pigtails + bows
    ctx.fillStyle = hair;
    ctx.beginPath(); ctx.arc(0, -152 * s, 25 * s, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    const wig2 = Math.sin(t * 4) * 2 * s;
    ellipse(ctx, -27 * s, -140 * s + wig2, 9 * s, 12 * s); ellipse(ctx, 27 * s, -140 * s - wig2, 9 * s, 12 * s);
    ctx.fillStyle = '#ff6b9d';
    ellipse(ctx, -27 * s, -152 * s + wig2, 6 * s, 4 * s); ellipse(ctx, 27 * s, -152 * s - wig2, 6 * s, 4 * s);
    // face — bigger curious eyes when peeking
    const eye = peek ? 4.4 : 3.6;
    ctx.fillStyle = '#3a2e2a';
    ellipse(ctx, -8 * s, -144 * s, eye * s * 0.85, eye * s); ellipse(ctx, 8 * s, -144 * s, eye * s * 0.85, eye * s);
    ctx.strokeStyle = '#3a2e2a'; ctx.lineWidth = 2.2 * s;
    ctx.beginPath(); ctx.arc(0, -137 * s, 7 * s, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.fillStyle = 'rgba(255,138,128,.45)';
    ellipse(ctx, -15 * s, -138 * s, 4.5 * s, 3 * s); ellipse(ctx, 15 * s, -138 * s, 4.5 * s, 3 * s);
    ctx.restore();
  }
}

function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function ellipse(ctx, x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function shadow(ctx, x, y, r, airY = 0) {
  ctx.save(); ctx.fillStyle = 'rgba(40,60,40,.18)';
  const k = Math.max(0.55, 1 - airY / 280); // smaller and lighter while airborne
  ctx.globalAlpha = 0.18 + 0.12 * k;
  ctx.beginPath(); ctx.ellipse(x, y + 4, r * k, r * 0.28 * k, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
