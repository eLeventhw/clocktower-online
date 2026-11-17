// Every texture in the table is generated on a canvas at runtime: no images, no fonts to
// download, no assets to cache-bust. The whole 3D layer stays a single JS bundle, which
// matters because the deployment gates subresources behind a sharecode.
import * as THREE from 'three';

const SEAT_NO = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ'];

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, repeat?: [number, number]) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
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

  ctx.fillStyle = '#4d3720';
  ctx.fillRect(0, 0, S, S);

  // Wood grain: fine vertical strokes, then a few long arcs for the planks.
  const rand = rng(7);
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 700; i++) {
    ctx.strokeStyle = rand() > 0.5 ? '#6b4d2c' : '#241a10';
    ctx.lineWidth = 0.6 + rand() * 1.4;
    const x = rand() * S;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 24, S * 0.33, x + (rand() - 0.5) * 24, S * 0.66, x, S);
    ctx.stroke();
  }
  // Radial darkening: the table is lit from above, so the rim falls off.
  ctx.globalAlpha = 1;
  const vign = ctx.createRadialGradient(R, R, R * 0.2, R, R, R);
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(0.75, 'rgba(0,0,0,0.16)');
  vign.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, S, S);

  const ring = (r: number, w: number, color: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(R, R, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  ring(R * 0.965, 5, '#b08a4e', 0.7);
  ring(R * 0.945, 1.6, '#e2c89a', 0.5);
  ring(R * 0.70, 1.4, '#e2c89a', 0.3);
  ring(R * 0.46, 1.2, '#e2c89a', 0.22);

  // Minute ticks between the two outer rings.
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const long = i % 5 === 0;
    const r1 = R * 0.735;
    const r2 = R * (long ? 0.70 : 0.718);
    ctx.globalAlpha = long ? 0.5 : 0.22;
    ctx.strokeStyle = '#e2c89a';
    ctx.lineWidth = long ? 2.4 : 1.2;
    ctx.beginPath();
    ctx.moveTo(R + Math.cos(a) * r1, R + Math.sin(a) * r1);
    ctx.lineTo(R + Math.cos(a) * r2, R + Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Roman numerals, upright rather than rotated with the dial: the table is read from
  // above, so every numeral should face the reader, not the rim.
  ctx.fillStyle = '#e8cfa0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(S * 0.052)}px "Songti SC", "STSong", Georgia, serif`;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const r = R * 0.825;
    ctx.globalAlpha = 0.82;
    ctx.fillText(SEAT_NO[i % 10] ?? String(i + 1), R + Math.cos(a) * r, R + Math.sin(a) * r);
  }
  ctx.globalAlpha = 1;

  // Centre medallion: a moon-window motif with the room's idea of "night" in it.
  ctx.save();
  ctx.translate(R, R);
  const med = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.20);
  med.addColorStop(0, 'rgba(201,172,120,0.16)');
  med.addColorStop(1, 'rgba(201,172,120,0)');
  ctx.fillStyle = med;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9ac78';
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.155, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#e2c89a';
  ctx.font = `500 ${Math.round(S * 0.075)}px "Songti SC", "STSong", Georgia, serif`;
  ctx.fillText('夜', 0, 0);
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
    ctx.fillStyle = '#e8b76a';
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
  ctx.fillStyle = dead ? '#8a7d68' : '#efe6d5';
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
  ctx.fillStyle = dead ? '#7a6c59' : info.host ? '#e8b76a' : '#a99a82';
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
/** Flagstone floor: irregular slabs, each with its own brightness. */
export function makeFloorTexture(tint: string) {
  const S = 1024;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#0a0908';
  ctx.fillRect(0, 0, S, S);

  const rand = rng(29);
  const cell = 128;
  for (let gy = -1; gy < S / cell + 1; gy++) {
    for (let gx = -1; gx < S / cell + 1; gx++) {
      const jx = (rand() - 0.5) * 26;
      const jy = (rand() - 0.5) * 26;
      const x = gx * cell + jx;
      const y = gy * cell + jy;
      const w = cell - 6 + rand() * 10;
      const h = cell - 6 + rand() * 10;
      const bright = 0.72 + rand() * 0.56;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((rand() - 0.5) * 0.06);
      ctx.fillStyle = tint;
      ctx.globalAlpha = bright;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 5);
      ctx.fill();
      // Slabs are not matte-flat: a faint diagonal face highlight.
      ctx.globalAlpha = bright * 0.16;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, -h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
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
