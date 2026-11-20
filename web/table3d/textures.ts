// Every texture in the table is generated on a canvas at runtime: no images, no fonts to
// download, no assets to cache-bust. The whole 3D layer stays a single JS bundle, which
// matters because the deployment gates subresources behind a sharecode.
import * as THREE from 'three';
import { NC, GL } from './palette';

const SEAT_NO = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'];
const TAU = Math.PI * 2;

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, repeat?: [number, number], linear = false) {
  const tex = new THREE.CanvasTexture(c);
  // AO / bump maps are data, not colour. Uploading them as sRGB bends the shadow
  // falloff and the surface normals, so those go up linear.
  tex.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

/** Deterministic noise so the same room code always produces the same grain. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------- table: the clock face
/**
 * The tabletop IS the clock face. Twelve numerals, three concentric rings, a centre
 * medallion. It reads as "a table in a clocktower" before a single card is placed on it,
 * which is what the game is called.
 */
export function makeClockTexture() {
  const S = 1024;
  const { c, ctx } = canvas(S);
  const R = S / 2;
  const rand = rng(7);

  ctx.fillStyle = '#4a3623';
  ctx.fillRect(0, 0, S, S);

  // The key light now sits at (-x, +z). The bright patch on the dial has to follow it,
  // otherwise the wood grain and the metal rim disagree about where the light is coming
  // from — which is exactly what made the old version read as a flat printed disc.
  const wg = ctx.createRadialGradient(R * 0.68, R * 0.62, 20, R, R, R);
  wg.addColorStop(0, 'rgba(158,114,66,0.34)');
  wg.addColorStop(0.44, 'rgba(96,66,38,0.10)');
  wg.addColorStop(1, 'rgba(0,0,0,0.30)');
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, S, S);

  // Growth rings instead of a grid of parallel planks: a dial cut from one trunk reads
  // as an object, a set of straight lines reads as a CSS gradient.
  ctx.save();
  ctx.translate(R, R);
  for (let r = 26; r < R; r += 9 + rand() * 7) {
    ctx.beginPath();
    for (let a = 0; a <= TAU + 0.1; a += 0.07) {
      const rr = r + Math.sin(a * 3 + r * 0.05) * 2.6 + Math.sin(a * 7 + r) * 1.1;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = rand() > 0.45 ? 'rgba(0,0,0,0.13)' : 'rgba(226,190,140,0.055)';
    ctx.lineWidth = 1 + rand() * 1.6;
    ctx.stroke();
  }
  // Short radial fibres keep the grain from looking perfectly concentric.
  for (let i = 0; i < 360; i++) {
    const a = rand() * TAU;
    const r = 40 + rand() * (R - 60);
    ctx.save();
    ctx.rotate(a);
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,220,170,0.05)';
    ctx.lineWidth = 0.6 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(r + 8 + rand() * 42, (rand() - 0.5) * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  const eg = ctx.createRadialGradient(R, R, R * 0.6, R, R, R);
  eg.addColorStop(0, 'rgba(0,0,0,0)');
  eg.addColorStop(0.86, 'rgba(0,0,0,0.10)');
  eg.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, S, S);

  ctx.save();
  ctx.translate(R, R);
  // Inlaid brass: a dark chisel cut plus a lit upper edge, never a single glowing stroke.
  const ring = (rad: number, dark: string, light: string, w: number) => {
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, TAU);
    ctx.strokeStyle = dark;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, rad - w * 0.7, 0, TAU);
    ctx.strokeStyle = light;
    ctx.lineWidth = Math.max(1, w * 0.35);
    ctx.stroke();
  };
  ring(R * 0.965, 'rgba(10,8,6,0.85)', 'rgba(226,190,132,0.42)', 7);
  ring(R * 0.905, 'rgba(8,6,5,0.70)', 'rgba(214,178,122,0.28)', 2.5);
  ring(R * 0.615, 'rgba(8,6,5,0.50)', 'rgba(214,178,122,0.16)', 1.5);

  // Etched Roman hours: a dark cut with one pale lip on the light side. Upright text,
  // because the dial is read from above rather than from the rim.
  const HOURS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 12;
    ctx.save();
    ctx.rotate(a);
    ctx.strokeStyle = 'rgba(6,5,4,0.8)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.888);
    ctx.lineTo(0, -R * 0.835);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(232,198,142,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1, -R * 0.888);
    ctx.lineTo(-1, -R * 0.835);
    ctx.stroke();
    ctx.font = '600 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(0, -R * 0.79);
    ctx.rotate(-a);
    ctx.fillStyle = 'rgba(10,8,6,0.8)';
    ctx.fillText(HOURS[i], 2, 2);
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = NC.primary;
    ctx.fillText(HOURS[i], 0, 0);
    ctx.restore();
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // Centre moon-window.
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.118, 0, TAU);
  ctx.fillStyle = 'rgba(8,6,5,0.55)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,198,142,0.65)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.100, 0, TAU);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f0d6a4';
  ctx.font = '500 46px "Songti SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('夜', 0, 3);
  ctx.restore();

  return toTexture(c);
}

// ---------------------------------------------------------------- seat cards
export type CardInfo = {
  name: string;
  seat: number;
  alive: boolean;
  host: boolean;
  you: boolean;
  ready?: boolean;
  npc?: boolean;
};

/**
 * Front face of a seat card: seat numeral, name, one line of state.
 * Kept deliberately sparse — at 1440x900 a card is roughly 100px wide on screen, and
 * anything smaller than the name turns to mush.
 */
export function makeCardFront(info: CardInfo) {
  const W = 512;
  const H = 680;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const dead = !info.alive;
  const base = dead ? '#1b1712' : '#2b2016';
  const grad = ctx.createLinearGradient(0, 0, W * 0.35, H);
  grad.addColorStop(0, dead ? '#241d16' : '#3a2b1d');
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, dead ? '#120e0a' : '#1a130c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Paper fibre, barely visible: it stops the card looking like flat vector art.
  const rand = rng(info.seat * 977 + info.name.length);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 220; i++) {
    ctx.strokeStyle = rand() > 0.5 ? '#efe0c4' : '#0a0704';
    ctx.lineWidth = 1;
    const x = rand() * W;
    const y = rand() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 46, y + (rand() - 0.5) * 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Double hairline frame; the inner rule is what makes it read as a printed card.
  const ink = dead ? 'rgba(150,132,106,0.28)' : 'rgba(232,183,106,0.42)';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.strokeStyle = dead ? 'rgba(150,132,106,0.16)' : 'rgba(232,183,106,0.20)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  // A dark cut plus one lit top edge: the card is a physical plate, not a printed rect.
  ctx.strokeStyle = 'rgba(6,5,4,0.7)';
  ctx.lineWidth = 3;
  ctx.strokeRect(13, 13, W - 26, H - 26);
  ctx.strokeStyle = dead ? 'rgba(150,140,128,0.20)' : 'rgba(255,226,178,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(22, 16);
  ctx.lineTo(W - 22, 16);
  ctx.stroke();

  // Seat numeral: deliberately small. On screen a card is about 60px wide, and the only
  // thing that has to survive that is the name.
  ctx.fillStyle = dead ? 'rgba(150,132,106,0.34)' : 'rgba(232,183,106,0.55)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `600 ${Math.round(W * 0.095)}px "Songti SC", "STSong", Georgia, serif`;
  ctx.fillText(String(info.seat), 46, 46);

  // "YOU" ribbon — the one card that must never be confused with the others.
  if (info.you) {
    ctx.fillStyle = 'rgba(232,183,106,0.16)';
    ctx.fillRect(W - 152, 46, 106, 40);
    ctx.strokeStyle = 'rgba(232,183,106,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W - 152, 46, 106, 40);
    ctx.fillStyle = NC.primary;
    ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round(W * 0.052)}px "PingFang SC", sans-serif`;
    ctx.fillText('你', W - 99, 57);
  }

  // Name: the only element allowed to be large. Two short names fit on one line; anything
  // longer wraps into two lines of two or three characters rather than shrinking.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...info.name];
  const lines = chars.length <= 4 ? [info.name] : [
    chars.slice(0, Math.ceil(chars.length / 2)).join(''),
    chars.slice(Math.ceil(chars.length / 2)).join(''),
  ];
  const longest = Math.max(...lines.map((l) => [...l].length));
  const nameSize = Math.min(W * 0.30, (W * 0.78) / Math.max(1, longest));
  ctx.font = `600 ${Math.round(nameSize)}px "Songti SC", "STSong", Georgia, serif`;
  ctx.fillStyle = dead ? NC.inkFaint : NC.ink;
  lines.slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, W / 2, H * 0.47 + (i - (lines.length - 1) / 2) * nameSize * 1.18);
  });

  // Divider.
  ctx.strokeStyle = dead ? 'rgba(150,132,106,0.20)' : 'rgba(232,183,106,0.24)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.3, H * 0.72);
  ctx.lineTo(W * 0.7, H * 0.72);
  ctx.stroke();

  // State line.
  const state = dead ? '已死亡' : info.host ? '房主' : '存活';
  ctx.font = `500 ${Math.round(W * 0.062)}px "PingFang SC", sans-serif`;
  ctx.fillStyle = dead ? NC.inkFaint : info.host ? NC.primary : NC.inkMuted;
  ctx.fillText(state, W / 2, H * 0.79);

  if (!dead && info.ready) {
    ctx.fillStyle = 'rgba(232,183,106,0.75)';
    ctx.font = `500 ${Math.round(W * 0.05)}px "PingFang SC", sans-serif`;
    ctx.fillText('已准备', W / 2, H * 0.88);
  }

  // Dead cards get the whole face chalked down: a flat wash, no outline.
  if (dead) {
    ctx.fillStyle = 'rgba(8,7,5,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(180,160,130,0.20)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(40, H - 40);
    ctx.lineTo(W - 40, 40);
    ctx.stroke();
  }

  return toTexture(c);
}

/**
 * Back of a card. With fixed orientation this is what you see from outside the table,
 * and it is the reason the scene reads as a real place: to identify a seat you must
 * move the camera, not just read a label.
 */
export function makeCardBack(seat: number, name: string) {
  const W = 512;
  const H = 680;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1d1610');
  grad.addColorStop(0.5, '#241a12');
  grad.addColorStop(1, '#150f0a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(201,172,120,0.30)';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, W - 36, H - 36);

  // A lattice of thin diagonals, denser toward the centre.
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = '#c9ac78';
  ctx.lineWidth = 1;
  for (let i = -H; i < W; i += 26) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + H, 0);
    ctx.lineTo(i, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Centre lozenge with the seat numeral.
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#241a12';
  ctx.fillRect(-92, -92, 184, 184);
  ctx.strokeStyle = 'rgba(232,183,106,0.5)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(-92, -92, 184, 184);
  ctx.restore();

  ctx.fillStyle = '#c9ac78';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(W * 0.26)}px "Songti SC", "STSong", Georgia, serif`;
  ctx.fillText(SEAT_NO[(seat - 1) % 10] ?? String(seat), W / 2, H * 0.46);

  // The name appears on this side too. A card that is only readable from one direction
  // makes the far half of the table anonymous, and identifying players is not the
  // puzzle — the puzzle is who is lying.
  ctx.fillStyle = 'rgba(233,222,203,0.7)';
  const backSize = Math.min(W * 0.19, (W * 0.66) / Math.max(1, [...name].length));
  ctx.font = `600 ${Math.round(backSize)}px "Songti SC", Georgia, serif`;
  ctx.fillText([...name].slice(0, 5).join(''), W / 2, H * 0.66);

  return toTexture(c);
}

// ---------------------------------------------------------------- grimoire pages
export type PageSpec = { heading: string; body: string[]; footer?: string };

/**
 * One book page. The book is the only place private information is shown in 3D
 * (your role), so the page has to be genuinely readable when it flies to the camera.
 */
export function makePage(spec: PageSpec) {
  const W = 760;
  const H = 1000;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  grad.addColorStop(0, '#3b3122');
  grad.addColorStop(0.55, '#2f2719');
  grad.addColorStop(1, '#241d13');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const rand = rng(131);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = rand() > 0.5 ? '#efe0c4' : '#120c08';
    ctx.lineWidth = 1;
    const x = rand() * W;
    const y = rand() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 10);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Binding shadow on the inner edge.
  const bind = ctx.createLinearGradient(0, 0, 70, 0);
  bind.addColorStop(0, 'rgba(0,0,0,0.55)');
  bind.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bind;
  ctx.fillRect(0, 0, 70, H);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#eccd93';
  ctx.font = `600 ${Math.round(W * 0.085)}px "Songti SC", "STSong", Georgia, serif`;
  ctx.fillText(spec.heading, 70, 76);

  ctx.strokeStyle = 'rgba(236,205,147,0.30)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(70, 170);
  ctx.lineTo(W - 70, 170);
  ctx.stroke();

  ctx.fillStyle = '#ddccae';
  ctx.font = `400 ${Math.round(W * 0.048)}px "PingFang SC", "Hiragino Sans GB", sans-serif`;
  let y = 210;
  for (const paragraph of spec.body) {
    // Naive wrap: Chinese body text has no spaces, so break on measured width.
    let line = '';
    for (const ch of paragraph) {
      if (ctx.measureText(line + ch).width > W - 150) {
        ctx.fillText(line, 70, y);
        y += W * 0.048 * 1.72;
        line = ch;
        if (y > H - 180) break;
      } else line += ch;
    }
    if (line) {
      ctx.fillText(line, 70, y);
      y += W * 0.048 * 1.72;
    }
    y += W * 0.03;
    if (y > H - 170) break;
  }

  if (spec.footer) {
    ctx.fillStyle = 'rgba(236,205,147,0.55)';
    ctx.font = `400 ${Math.round(W * 0.036)}px "PingFang SC", sans-serif`;
    ctx.fillText(spec.footer, 70, H - 92);
  }

  return toTexture(c);
}

/** Cover of the grimoire: leather, tooled border, no title text at small sizes. */
export function makeBookCover() {
  const S = 512;
  const { c, ctx } = canvas(S);
  const grad = ctx.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, '#2a1f16');
  grad.addColorStop(0.5, '#1d150e');
  grad.addColorStop(1, '#241a12');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = 'rgba(201,172,120,0.42)';
  ctx.lineWidth = 3;
  ctx.strokeRect(26, 26, S - 52, S - 52);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(42, 42, S - 84, S - 84);

  ctx.strokeStyle = 'rgba(201,172,120,0.26)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.19, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(201,172,120,0.55)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(S * 0.14)}px "Songti SC", Georgia, serif`;
  ctx.fillText('魔', S / 2, S / 2);

  return toTexture(c);
}

// ---------------------------------------------------------------- room surfaces
/** Grey noise shared by every bump map in the room. */
export function makeGrainTexture() {
  const S = 512;
  const { c, ctx } = canvas(S);
  const rand = rng(71);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.floor(rand() * 90);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 3, 1 + rand() * 2);
  }
  const t = toTexture(c, undefined, true);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/** Radial falloff for fake contact shadows; software WebGL has no SSAO budget. */
export function makeAOTexture() {
  const S = 128;
  const { c, ctx } = canvas(S);
  const rg = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(0,0,0,0.78)');
  rg.addColorStop(0.42, 'rgba(0,0,0,0.36)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c);
}

/** Warm pool under a candle — a point light alone leaves no mark on a matte floor. */
export function makeGlowTexture() {
  const S = 128;
  const { c, ctx } = canvas(S);
  const rg = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(255,190,110,0.55)');
  rg.addColorStop(0.45, 'rgba(255,170,90,0.16)');
  rg.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c);
}

/**
 * Flagstone floor: a deep joint behind every slab, an upper edge that catches the same
 * key light as the table rim, and enough grain that the dark end of the room still reads
 * as stone. Doubles as its own bump and emissive map so the joints stay black at night.
 */
export function makeFloorTexture(tint: string) {
  const S = 1024;
  const { c, ctx } = canvas(S);
  const rand = rng(29);
  ctx.fillStyle = '#100d0a';
  ctx.fillRect(0, 0, S, S);

  let y = 0;
  while (y < S) {
    const h = 58 + rand() * 48;
    let x = -rand() * 140;
    while (x < S) {
      const w = 100 + rand() * 130;
      const v = 24 + Math.floor(rand() * 20);
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(x, y, w, h);
      const sg = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
      sg.addColorStop(0, `rgb(${v + 18},${v + 13},${v + 7})`);
      sg.addColorStop(0.55, `rgb(${v + 8},${v + 5},${v + 2})`);
      sg.addColorStop(1, `rgb(${v},${v - 2},${v - 4})`);
      ctx.fillStyle = sg;
      ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
      ctx.strokeStyle = 'rgba(220,190,145,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 3);
      ctx.lineTo(x + w - 4, y + 3);
      ctx.stroke();
      ctx.globalAlpha = 0.05;
      for (let k = 0; k < 26; k++) {
        ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
        ctx.fillRect(x + 5 + rand() * (w - 10), y + 5 + rand() * (h - 10), 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
      x += w;
    }
    y += h;
  }
  // Room identity survives as a faint wash; the material colour in rebuildRoom does most
  // of the work, so this stays well below a hue shift.
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);
  ctx.globalAlpha = 1;
  const vg = ctx.createRadialGradient(S / 2, S / 2, S * 0.12, S / 2, S / 2, S * 0.5);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, S, S);
  return toTexture(c, [5, 5]);
}

/** Rough stone wall for the bits of the room that sit below eye level. */
export function makeStoneTexture(tint: string) {
  const S = 512;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, S, S);
  const rand = rng(53);
  for (let row = 0; row < 9; row++) {
    const y = (row / 9) * S;
    const h = S / 9 - 3;
    let x = (row % 2) * -34;
    while (x < S) {
      const w = 70 + rand() * 60;
      ctx.globalAlpha = 0.10 + rand() * 0.14;
      ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      x += w;
    }
  }
  ctx.globalAlpha = 1;
  return toTexture(c, [3, 2]);
}

/** Warm dust motes carried in the light shaft; used as the fog/fibre layer. */
export function makeDustTexture() {
  const S = 256;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, S, S);
  const rand = rng(97);
  for (let i = 0; i < 220; i++) {
    const x = rand() * S;
    const y = rand() * S;
    const r = rand() * 1.6 + 0.4;
    const a = 0.10 + rand() * 0.35;
    ctx.fillStyle = `rgba(232,200,154,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}
