// Room furniture, built from a handful of primitives. At a top-down camera the room is
// read from what stands ON the floor, not from the walls: anything taller than the frame
// is simply cropped away. So every prop here is deliberately low.
import * as THREE from 'three';

/** Matte, non-metallic by default. Nothing in this room has a specular highlight. */
export function matte(color: THREE.ColorRepresentation, roughness = 0.94) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
}

export function makeChair(wood: THREE.ColorRepresentation, cloth: THREE.ColorRepresentation) {
  const g = new THREE.Group();
  const legMat = matte(wood);
  const padMat = matte(cloth, 0.98);

  // Four legs, splayed slightly outward like a rounded wooden chair.
  for (const [x, z] of [[-0.34, -0.34], [0.34, -0.34], [-0.34, 0.34], [0.34, 0.34]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.52, 0.09), legMat);
    leg.position.set(x, 0.26, z);
    g.add(leg);
  }

  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 0.78), padMat);
  pad.position.y = 0.58;
  g.add(pad);

  // Low solid back panel between two short posts. Two earlier versions failed for opposite
  // reasons: one tall slab read as a folding screen standing next to the table, and an
  // open frame of four thin members read as scaffolding. The panel has to be small enough
  // to stay below the tabletop's visual weight and closed enough to read as one object.
  for (const x of [-0.33, 0.33]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), legMat);
    post.position.set(x, 0.84, -0.35);
    g.add(post);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, 0.055), legMat);
  back.position.set(0, 0.99, -0.35);
  g.add(back);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function makeBarrel(wood: THREE.ColorRepresentation, band: THREE.ColorRepresentation) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.95, 18, 1), matte(wood));
  body.position.y = 0.475;
  g.add(body);
  for (const y of [0.16, 0.48, 0.8]) {
    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.06, 18, 1, true), matte(band, 0.7));
    hoop.position.y = y;
    g.add(hoop);
  }
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 18), matte(wood));
  lid.position.y = 0.96;
  g.add(lid);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function makeCrate(wood: THREE.ColorRepresentation) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.66, 0.86), matte(wood));
  body.position.y = 0.33;
  g.add(body);
  const railMat = matte(wood, 0.86);
  for (const y of [0.08, 0.58]) {
    for (const [sx, sz, w, d] of [[0, 0.44, 0.9, 0.06], [0, -0.44, 0.9, 0.06], [0.44, 0, 0.06, 0.9], [-0.44, 0, 0.06, 0.9]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, d), railMat);
      rail.position.set(sx, y, sz);
      g.add(rail);
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/** A candlestick with a real point light — the only moving light in the room. */
export function makeCandle(metal: THREE.ColorRepresentation, flame: THREE.ColorRepresentation, intensity = 1.1) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 14), matte(metal, 0.55));
  base.position.y = 0.03;
  g.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 10), matte(metal, 0.55));
  stem.position.y = 0.27;
  g.add(stem);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.1, 12), matte(metal, 0.55));
  cup.position.y = 0.5;
  g.add(cup);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.3, 10), matte('#e8e0cc', 0.85));
  wax.position.y = 0.68;
  g.add(wax);

  // The flame is emissive: at this distance a lit candle that does not glow reads as
  // an unlit one, because the pool of light is invisible on a matte surface.
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.032, 8, 8),
    new THREE.MeshBasicMaterial({ color: flame }),
  );
  tip.position.y = 0.87;
  g.add(tip);

  // A cutoff distance turns each candle into a pool instead of a second room-wide fill:
  // with decay 0 and no distance the four candles summed to a flat value on every surface.
  const light = new THREE.PointLight(flame, intensity, 6, 0);
  light.position.y = 0.9;
  g.add(light);

  return g;
}

/** A hanging lantern; the key light of the night scene is hung inside it. */
export function makeLantern(metal: THREE.ColorRepresentation) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 16), matte(metal, 0.5));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.5;
  g.add(ring);
  const cage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.16, 0.34, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: metal, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }),
  );
  cage.position.y = 0.28;
  g.add(cage);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: '#ffd8a2' }),
  );
  core.position.y = 0.28;
  g.add(core);
  return g;
}

/** A low ruined wall: too short to leave the frame, tall enough to read as architecture. */
export function makeRuinedWall(count: number, radius: number, material: THREE.Material, from: number, to: number) {
  const g = new THREE.Group();
  const rand = (() => {
    let s = 8123;
    return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  for (let i = 0; i < count; i++) {
    const t = from + ((to - from) * i) / Math.max(1, count - 1);
    const a = t * Math.PI * 2;
    const h = 1.15 + rand() * 0.5;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.9 + rand() * 0.4, h, 0.55), material);
    block.position.set(Math.cos(a) * radius, h / 2, Math.sin(a) * radius);
    block.rotation.y = -a + (rand() - 0.5) * 0.22;
    block.castShadow = true;
    block.receiveShadow = true;
    g.add(block);
  }
  return g;
}

export function makeColumn(stone: THREE.ColorRepresentation, height: number) {
  const g = new THREE.Group();
  const material = matte(stone, 0.96);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, height, 12), material);
  shaft.position.y = height / 2;
  g.add(shaft);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.9), material);
  base.position.y = 0.11;
  g.add(base);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.86), material);
  cap.position.y = height - 0.1;
  g.add(cap);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

/**
 * Vote tokens: one disc per eligible player, dropped on the table during a ballot.
 * Yes is a warm struck coin, no is a dark slate — readable from directly above, which
 * is the only angle the camera ever really uses.
 */
/**
 * A single cast vote, lying on the table.
 *
 * The first version was a 0.15-radius disc, and the "no" face was #2b2419 — three units of
 * nearly-black on a brown tabletop, i.e. invisible at the ~12px this occupies on screen.
 * Two changes make it readable: the disc is bigger and self-lit, and both faces carry a
 * pale rim so the silhouette survives whatever the light is doing.
 */
export function makeVoteToken(yes: boolean) {
  const g = new THREE.Group();
  const color = yes ? 0xffd9a0 : 0x2a2620;
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.05, 20),
    new THREE.MeshStandardMaterial({
      color,
      roughness: yes ? 0.5 : 0.92,
      metalness: yes ? 0.3 : 0.02,
      emissive: color,
      emissiveIntensity: yes ? 0.34 : 0.1,
    }),
  );
  disc.castShadow = true;
  g.add(disc);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.017, 6, 22),
    new THREE.MeshStandardMaterial({
      color: yes ? 0xfff3dc : 0xb9a98f,
      emissive: yes ? 0xfff3dc : 0xb9a98f,
      emissiveIntensity: 0.3,
      metalness: 0.1,
      roughness: 0.6,
    }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.026;
  g.add(rim);

  return g;
}
