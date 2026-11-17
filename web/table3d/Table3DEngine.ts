// The 3D table. Everything here is driven by the server's per-player view: no local game
// state lives in this file, so the 3D layer can never disagree with the rules.
//
// Two rules shape the whole thing:
//  1. Cards are fixed objects, never billboards. If every card turned to face the camera,
//     every orbit would render identical pixels and the room would stop existing.
//  2. Depth comes from light, not from drop shadows: one key light, four falloff steps.
import * as THREE from 'three';
import {
  makeClockTexture, makeCardFront, makeCardBack, makePage, makeBookCover,
  makeFloorTexture, makeStoneTexture,
} from './textures';
import { makeChair, makeBarrel, makeCrate, makeCandle, makeLantern, makeRuinedWall, makeColumn, matte, makeVoteToken } from './props';
import { roomForCode, lightFor, type PhaseKey } from './presets';

export type SeatView = {
  id: string;
  name: string;
  seat: number;
  alive: boolean;
  host: boolean;
  you: boolean;
  selected: boolean;
  targetable: boolean;
  ready: boolean;
  speaker: boolean;
  leader: boolean;
  vote: 'yes' | 'no' | null;
};

export type TableState = {
  code: string;
  phase: PhaseKey;
  round: number;
  players: SeatView[];
  roleHeading: string;
  roleBody: string[];
  roleFooter: string;
  hasRole: boolean;
  bookOpen: boolean;
  ballot: { nominator: string; nominee: string; stage: string } | null;
  myActionSubmitted: boolean;
  myCanAct: boolean;
};

export type PickResult = { kind: 'seat'; id: string } | { kind: 'book' } | null;

type SeatRig = {
  id: string;
  root: THREE.Group;
  chair: THREE.Group;
  card: THREE.Mesh;
  cardMats: THREE.MeshStandardMaterial[];
  ring: THREE.Mesh;
  glow: THREE.Mesh;
  hold: THREE.Group; // card holder, so lean/lift can be animated independently
  hover: number;
  lean: number;
  lift: number;
  dead: number;
  face: number; // current yaw toward the camera, in radians
  ringLevel: number;
  targetable: boolean;
  textureKey: string;
};

const TAU = Math.PI * 2;
const TABLE_R = 4.3;
const TABLE_TOP = 0.78;
const CARD_W = 1.46;
const CARD_H = 1.84;

export class TableEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pickables: THREE.Object3D[] = [];

  private roomKeyMesh?: THREE.Mesh;
  private floor!: THREE.Mesh;
  private furniture!: THREE.Group;
  private ambient!: THREE.AmbientLight;
  private hemi!: THREE.HemisphereLight;
  private keyLight!: THREE.SpotLight;
  private rimLight!: THREE.PointLight;
  private speakerLight!: THREE.SpotLight;
  private lanternLight!: THREE.PointLight;
  private tableMat!: THREE.MeshStandardMaterial;

  private seats = new Map<string, SeatRig>();
  private seatOrder: string[] = [];
  private bookGroup!: THREE.Group;
  private bookPivot!: THREE.Group;
  private coverPivot!: THREE.Group;
  private bookStart = new THREE.Vector3();
  private bookStartQuat = new THREE.Quaternion();
  private bookHandQuat = new THREE.Quaternion();
  private bookLamp!: THREE.PointLight;
  private bookOpenK = 0;
  private bookVisible = false;
  private bookMats: THREE.MeshStandardMaterial[] = [];
  private pageMatL!: THREE.MeshStandardMaterial;
  private pageMatR!: THREE.MeshStandardMaterial;
  private bookSignature = '';
  private ballotSignature = '';

  private ballotArc?: THREE.Mesh;
  private voteTokens: THREE.Object3D[] = [];
  private leaderMark?: THREE.Mesh;

  // Camera: spherical around the table, with damped targets and release inertia.
  private cam = { az: 0.3, el: 0.68, r: 16, azT: 0.3, elT: 0.68, rT: 16 };
  private vel = { az: 0, el: 0 };
  /** Cleared framing is re-derived from the viewport until the player orbits. */
  private framed = false;
  private userMoved = false;
  private lastPointer = { x: 0, y: 0 };
  private dragging = false;
  private state: TableState | null = null;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x14100b, 0.03);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.build();
    this.applyCamera(1);
  }

  // ------------------------------------------------------------------ build
  private build() {
    this.ambient = new THREE.AmbientLight(0x53422e, 0.58);
    this.scene.add(this.ambient);
    this.hemi = new THREE.HemisphereLight(0x8fa6d8, 0x1a1510, 0.35);
    this.scene.add(this.hemi);

    // decay = 0: three r155+ defaults to physical falloff (candela, 1/r²), which leaves
    // nothing beyond a few units and renders an almost black frame. Turning falloff off
    // keeps the intensity numbers readable while the fog and the surface tiers carry the
    // sense of distance.
    this.keyLight = new THREE.SpotLight(0xffd8a2, 3.2, 0, 0.82, 0.85, 0);
    this.keyLight.position.set(1.6, 13, 5.2);
    this.keyLight.target.position.set(0, 0, 0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 40;
    this.keyLight.shadow.bias = -0.0012;
    this.scene.add(this.keyLight, this.keyLight.target);

    this.rimLight = new THREE.PointLight(0xffd8a2, 0.55, 0, 0);
    this.rimLight.position.set(-5, 3.4, -4.4);
    this.scene.add(this.rimLight);

    this.speakerLight = new THREE.SpotLight(0xfff0cf, 0, 0, 0.34, 0.7, 0);
    this.speakerLight.castShadow = false;
    this.scene.add(this.speakerLight, this.speakerLight.target);

    // Hangs inside the lantern prop. `distance` works as a soft cutoff even with decay 0
    // (three windows the attenuation by (1 - (d/cutoff)^4)^2), so the lamp has a radius
    // instead of flooding the whole room at one flat value.
    this.lanternLight = new THREE.PointLight(0xffcf9a, 0, 15, 0);
    this.lanternLight.position.set(0, 5.88, 0);
    this.scene.add(this.lanternLight);

    // Table: a cylinder so the edge has thickness, with the clock face on top.
    const tableGeo = new THREE.CylinderGeometry(TABLE_R, TABLE_R * 0.985, TABLE_TOP, 72);
    const side = matte('#241a12', 0.96);
    this.tableMat = new THREE.MeshStandardMaterial({
      map: makeClockTexture(),
      roughness: 0.9,
      metalness: 0.02,
    });
    const table = new THREE.Mesh(tableGeo, [side, this.tableMat, side]);
    table.position.y = TABLE_TOP / 2;
    table.receiveShadow = true;
    this.scene.add(table);
    this.roomKeyMesh = table;

    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(26, 64),
      new THREE.MeshStandardMaterial({ map: makeFloorTexture('#6d655c'), roughness: 1, metalness: 0 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.furniture = new THREE.Group();
    this.scene.add(this.furniture);

    // Grimoire: parented to the scene so it can leave the table and fly to the camera.
    this.bookGroup = new THREE.Group();
    this.buildBook();
    this.scene.add(this.bookGroup);
    this.bookGroup.visible = false;
  }

  private buildBook() {
    this.bookPivot = new THREE.Group();
    this.bookGroup.add(this.bookPivot);

    // Recto and verso get separate materials. Sharing one made the spread print the same
    // paragraph twice, which reads as a rendering bug rather than as a book: an open
    // grimoire shows an identity on the left and the ability on the right.
    const makePageMat = (spec: Parameters<typeof makePage>[0]) => {
      const m = new THREE.MeshStandardMaterial({
        map: makePage(spec),
        roughness: 0.94,
        metalness: 0,
        // Held in front of the lens the book leaves the key light entirely; without
        // self-illumination it is two black boards.
        emissive: 0xffffff,
        emissiveIntensity: 0.34,
      });
      m.emissiveMap = m.map;
      return m;
    };
    this.pageMatL = makePageMat({ heading: '你的身份', body: ['这一页还没有内容。'] });
    this.pageMatR = makePageMat({ heading: '你的能力', body: ['这一页还没有内容。'] });
    this.bookMats.push(this.pageMatL, this.pageMatR);

    // Two pages in a spread. The spine runs along local x = 0.
    for (const side of [-1, 1]) {
      const page = new THREE.Mesh(
        new THREE.PlaneGeometry(0.74, 0.98),
        side < 0 ? this.pageMatL : this.pageMatR,
      );
      page.position.set(side * 0.375, 0, 0);
      page.receiveShadow = true;
      this.bookPivot.add(page);
    }

    // Cover, hinged on the spine, closed until the book opens.
    this.coverPivot = new THREE.Group();
    this.coverPivot.position.set(-0.75, 0.002, 0);
    const coverMat = new THREE.MeshStandardMaterial({
      map: makeBookCover(),
      roughness: 0.85,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveIntensity: 0.18,
    });
    coverMat.emissiveMap = coverMat.map;
    this.bookMats.push(coverMat);
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.98), coverMat);
    cover.position.set(0.375, 0, 0.004);
    this.coverPivot.add(cover);
    this.bookPivot.add(this.coverPivot);

    // Border/backing so the book reads as a solid object when lying on the table.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.54, 1.0), matte('#1d150e', 0.9));
    back.rotation.y = Math.PI;
    back.position.z = -0.006;
    this.bookPivot.add(back);

    this.bookLamp = new THREE.PointLight(0xffd9a8, 0, 0, 0);
    this.bookLamp.position.set(0, 0, 0.9);
    this.bookGroup.add(this.bookLamp);
  }

  /** Rebuilds the room when the table's identity changes (code, head count or phase). */
  private rebuildRoom(state: TableState) {
    const room = roomForCode(state.code);
    const light = lightFor(room, state.phase);

    (this.scene.fog as THREE.FogExp2).color.setHex(light.fog);
    (this.scene.fog as THREE.FogExp2).density = light.fogDensity;
    this.renderer.setClearColor(light.fog, 1);
    this.ambient.color.setHex(light.amb);
    this.ambient.intensity = light.ambIntensity;
    this.keyLight.color.setHex(light.key);
    this.keyLight.intensity = light.keyIntensity;
    this.rimLight.color.setHex(light.rim);
    this.rimLight.intensity = light.candles ? 0.75 : 0.4;
    this.lanternLight.color.setHex(light.lamp);
    this.lanternLight.intensity = light.lampIntensity;
    // The hemisphere light was previously fixed at its build value, which left a cold blue
    // sky term in the green cellar and the warm attic alike — every room got the same
    // wrong rim. Tinting it from the room keeps the four rooms actually distinct.
    this.hemi.color.setHex(light.key);
    this.hemi.groundColor.setHex(light.fog);
    this.hemi.intensity = light.candles ? 0.12 : 0.3;

    const floorMat = this.floor.material as THREE.MeshStandardMaterial;
    floorMat.map?.dispose();
    floorMat.map = makeFloorTexture(room.floor);
    // One 1024px texture stretched over a 26-unit disc makes each flagstone roughly eight
    // chairs wide — it reads as a jigsaw, not as a floor. Five repeats put a stone at about
    // 1.3 units, which is the size a chair's footprint implies.
    floorMat.map.wrapS = floorMat.map.wrapT = THREE.RepeatWrapping;
    floorMat.map.repeat.set(5, 5);
    // A light floor kills the whole effect: the room reads as a bright tiled stage and
    // the table stops being the only lit thing in the frame.
    floorMat.color.setHex(light.candles ? 0x3c3c46 : 0x5c5850);
    floorMat.needsUpdate = true;

    // Furniture is cheap to rebuild and only changes with the room, not with every frame.
    for (const child of [...this.furniture.children]) {
      this.furniture.remove(child);
      disposeTree(child);
    }

    const stone = makeStoneTexture(room.stone);
    // Stone is the darkest surface in the room: it exists to frame the table, not to
    // compete with it. Anything brighter and the eye goes to the rubble.
    const stoneMat = new THREE.MeshStandardMaterial({ map: stone, roughness: 1, metalness: 0 });
    // Near-black on purpose. Stone is the farthest and darkest surface in the room, so it
    // must read as a silhouette that breaks the void behind the table — not as a lit wall.
    // Anything lighter and the eye goes to the rubble instead of the table.
    stoneMat.color.setHex(0x141418);

    // Low ruined wall behind the table: tall enough to read as architecture, short enough
    // to stay inside the frame of a 40 degree camera looking slightly down.
    const wall = makeRuinedWall(30, 14.6, stoneMat, 0.14, 0.86);
    this.furniture.add(wall);

    for (const a of [0.1, 0.4, 0.62, 0.92]) {
      const col = makeColumn(room.stone, 5.2);
      col.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && m.color) m.color.multiplyScalar(0.62);
      });
      col.position.set(Math.cos(a * TAU) * 13, 0, Math.sin(a * TAU) * 13);
      this.furniture.add(col);
    }

    // Props are placed on a ring, tucked between seats so they never block a card.
    const props: [number, THREE.Object3D][] = [
      [0.06, makeBarrel(room.wood, '#2b2118')],
      [0.115, makeBarrel(room.wood, '#2b2118')],
      [0.165, makeCrate(room.wood)],
      [0.52, makeCrate(room.wood)],
      [0.585, makeBarrel(room.wood, '#2b2118')],
      [0.72, makeCrate(room.wood)],
      [0.775, makeBarrel(room.wood, '#2b2118')],
      [0.9, makeCrate(room.wood)],
    ];
    for (const [t, prop] of props) {
      const a = t * TAU;
      const rad = 8.4 + (t % 0.2) * 3;
      prop.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      prop.rotation.y = -a + 0.4;
      this.furniture.add(prop);
    }

    // Candles: the only warm points in a night scene, and a scale reference.
    for (const t of [0.02, 0.27, 0.5, 0.735]) {
      const a = t * TAU;
      const candle = makeCandle('#4a3a28', room.flame, 0.6);
      candle.position.set(Math.cos(a) * 6.9, 0, Math.sin(a) * 6.9);
      candle.visible = light.candles;
      this.furniture.add(candle);
    }

    const lantern = makeLantern('#3a3024');
    lantern.position.set(0, 5.6, 0);
    // Always present: a lantern that pops into existence when the phase flips reads as a
    // rendering glitch. Only its light is switched off during the day.
    this.furniture.add(lantern);

  }

  // ------------------------------------------------------------------ seats
  private ensureSeats(state: TableState) {
    const ids = state.players.map((p) => p.id);
    const same = ids.length === this.seatOrder.length && ids.every((id, i) => this.seatOrder[i] === id);
    if (same) return;

    for (const rig of this.seats.values()) {
      for (const obj of [rig.root, rig.hold, rig.ring, rig.glow]) {
        this.scene.remove(obj);
        disposeTree(obj);
      }
    }
    this.seats.clear();
    this.pickables = this.pickables.filter((o) => o.userData.kind !== 'seat');
    this.seatOrder = ids;

    const room = roomForCode(state.code);
    const n = Math.max(state.players.length, 5);
    const rCard = TABLE_R * 0.9;
    const rChair = TABLE_R + 0.66;

    state.players.forEach((p, i) => {
      // Seat 0 sits nearest the default camera, so "you" are in front of you.
      const a = (i / n) * TAU + Math.PI / 2 + TAU / (n * 4);
      const root = new THREE.Group();
      root.position.set(Math.cos(a) * rChair, 0, Math.sin(a) * rChair);
      root.rotation.y = Math.PI / 2 - a; // local +z points away from the table centre

      const chair = makeChair(room.wood, room.cloth);
      chair.position.set(0, 0, 0.1);
      root.add(chair);

      // Card holder sits on the table rim.
      // The card holder is parented to the scene, not to the seat group: a child's offset
      // is expressed in the parent's rotated frame, and the seat group can opt out of
      // that with one multiplication instead of three.
      const hold = new THREE.Group();
      const cardX = Math.cos(a) * rCard;
      const cardZ = Math.sin(a) * rCard;
      hold.position.set(cardX, TABLE_TOP, cardZ);
      hold.rotation.y = Math.PI / 2 - a;
      this.scene.add(hold);

      const front = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.02 });
      const back = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02 });
      const edge = matte('#120d09', 0.95);
      const card = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_H, 0.035), [edge, edge, edge, edge, front, back]);
      card.position.y = CARD_H / 2 + 0.02;
      card.castShadow = true;
      card.receiveShadow = true;
      card.userData = { kind: 'seat', id: p.id };
      hold.add(card);
      this.pickables.push(card);

      // Selection / state ring flat on the table under the card.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 40),
        new THREE.MeshBasicMaterial({ color: 0xe8b76a, transparent: true, opacity: 0, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cardX, TABLE_TOP + 0.012, cardZ);
      this.scene.add(ring);

      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.62, 32),
        new THREE.MeshBasicMaterial({ color: 0xe8b76a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(cardX, TABLE_TOP + 0.008, cardZ);
      this.scene.add(glow);

      this.scene.add(root);
      this.seats.set(p.id, {
        id: p.id, root, chair, card,
        cardMats: [front, back],
        ring, glow, hold,
        hover: 0, lean: 0, lift: 0, dead: p.alive ? 0 : 1, face: 0,
        ringLevel: 0, targetable: p.targetable,
        textureKey: '',
      });
    });
  }

  // ------------------------------------------------------------------ state
  setState(state: TableState) {
    const first = this.state === null;
    const prev = this.state;
    this.state = state;

    const roomChanged =
      first ||
      !prev ||
      prev.code !== state.code ||
      prev.phase !== state.phase ||
      prev.players.length !== state.players.length;
    if (roomChanged) this.rebuildRoom(state);

    this.ensureSeats(state);

    for (const p of state.players) {
      const rig = this.seats.get(p.id);
      if (!rig) continue;
      rig.targetable = p.targetable;

      // Card faces are baked per state; only rebuild when something visible changed.
      const key = `${p.name}|${p.seat}|${p.alive}|${p.host}|${p.you}|${p.ready}`;
      if (rig.textureKey !== key) {
        rig.textureKey = key;
        const front = makeCardFront({ name: p.name, seat: p.seat, alive: p.alive, host: p.host, you: p.you, ready: p.ready });
        const back = makeCardBack(p.seat, p.name);
        for (const m of rig.cardMats) m.map?.dispose();
        rig.cardMats[0].map = front;
        rig.cardMats[1].map = back;
        for (const m of rig.cardMats) {
          m.needsUpdate = true;
        }
      }
    }

    this.updateBook(state);
    this.updateBallot(state);
    this.updateSpeaker(state);
    this.updateLeader(state);
  }

  private updateBook(state: TableState) {
    const me = state.players.find((p) => p.you);
    if (!me) {
      this.bookGroup.visible = false;
      return;
    }
    const rig = this.seats.get(me.id);
    if (!rig) {
      this.bookGroup.visible = false;
      return;
    }
    this.bookGroup.visible = true;

    // Rest position: flat on the table in front of my own card.
    const cardWorld = new THREE.Vector3();
    rig.hold.getWorldPosition(cardWorld);
    const inward = cardWorld.clone().setY(0).normalize().multiplyScalar(-1);
    this.bookStart.copy(cardWorld).addScaledVector(inward, 1.55).setY(TABLE_TOP + 0.02);

    // Spine toward the table centre, page top toward its owner, so the open spread reads
    // the right way round from that seat.
    this.bookGroup.rotation.set(0, Math.atan2(inward.x, inward.z), 0);
    this.bookStartQuat.setFromEuler(this.bookGroup.rotation);

    // Redrawing a 760x1000 page on every server push would cost more than the whole
    // scene, so the page is only regenerated when its text actually changes.
    const signature = state.hasRole ? `${state.roleHeading}\u0000${state.roleBody.join('\u0001')}\u0000${state.roleFooter}` : '';
    if (signature !== this.bookSignature) {
      this.bookSignature = signature;
      const swap = (mat: THREE.MeshStandardMaterial, spec: Parameters<typeof makePage>[0]) => {
        const tex = makePage(spec);
        mat.map?.dispose();
        mat.map = tex;
        mat.emissiveMap = tex;
        mat.needsUpdate = true;
      };
      swap(
        this.pageMatL,
        state.hasRole
          ? { heading: '你的身份', body: [state.roleHeading], footer: state.roleFooter }
          : { heading: '你的身份', body: [state.roleHeading] },
      );
      swap(this.pageMatR, {
        heading: '你的能力',
        body: state.roleBody,
        footer: state.hasRole ? '只有你能看见这一页' : undefined,
      });
    }
    this.bookOpenK = state.bookOpen ? 1 : 0;
  }

  private updateSpeaker(state: TableState) {
    const speaker = state.players.find((p) => p.speaker);
    const rig = speaker ? this.seats.get(speaker.id) : undefined;
    if (!speaker || !rig) {
      this.speakerLight.intensity = 0;
      return;
    }
    const pos = new THREE.Vector3();
    rig.hold.getWorldPosition(pos);
    this.speakerLight.position.set(pos.x * 1.18, 7.4, pos.z * 1.18);
    this.speakerLight.target.position.set(pos.x, TABLE_TOP, pos.z);
    this.speakerLight.intensity = 2.6;
    this.speakerLight.target.updateMatrixWorld();
  }

  private updateLeader(state: TableState) {
    const leader = state.players.find((p) => p.leader);
    const rig = leader ? this.seats.get(leader.id) : undefined;
    if (!rig) {
      if (this.leaderMark) this.leaderMark.visible = false;
      return;
    }
    if (!this.leaderMark) {
      this.leaderMark = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.035, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xe8b76a, transparent: true, opacity: 0.75 }),
      );
      this.leaderMark.rotation.x = -Math.PI / 2;
      this.scene.add(this.leaderMark);
    }
    const pos = new THREE.Vector3();
    rig.hold.getWorldPosition(pos);
    this.leaderMark.position.set(pos.x, TABLE_TOP + 0.016, pos.z);
    this.leaderMark.visible = true;
  }

  /** During a ballot: an arc between the two chairs, and one token per cast vote. */
  private updateBallot(state: TableState) {
    const b = state.ballot;
    const signature = b
      ? `${b.nominator}|${b.nominee}|${b.stage}|${state.players.map((p) => p.vote ?? '-').join('')}`
      : '';
    if (signature === this.ballotSignature) return;
    this.ballotSignature = signature;

    for (const token of this.voteTokens) {
      this.scene.remove(token);
      disposeTree(token);
    }
    this.voteTokens = [];
    if (this.ballotArc) {
      this.scene.remove(this.ballotArc);
      this.ballotArc.geometry.dispose();
      this.ballotArc = undefined;
    }
    if (!b) return;

    const from = this.seats.get(b.nominator);
    const to = this.seats.get(b.nominee);
    if (!from || !to) return;

    const a = new THREE.Vector3();
    const c = new THREE.Vector3();
    from.hold.getWorldPosition(a);
    to.hold.getWorldPosition(c);
    const mid = a.clone().add(c).multiplyScalar(0.5);
    // A high arc reads as a ribbon floating over the room; a low one reads as a line
    // drawn between two players and stays attached to the table it belongs to.
    mid.y = TABLE_TOP + 0.6;
    const curve = new THREE.CatmullRomCurve3([a.clone().setY(TABLE_TOP + 0.3), mid, c.clone().setY(TABLE_TOP + 0.3)]);
    const arc = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, 0.055, 8, false),
      new THREE.MeshStandardMaterial({
        // A 0.022 tube in gold on a gold-brown table read as a stray hair. The arc is the
        // only clue that a nomination is running, so it gets thickness and a little glow.
        color: b.stage === 'vote' ? 0xffd9a0 : 0xe4572e,
        emissive: b.stage === 'vote' ? 0xffd9a0 : 0xe4572e,
        emissiveIntensity: 0.55,
        roughness: 0.5,
        metalness: 0.15,
        transparent: true,
        opacity: 0.92,
      }),
    );
    this.scene.add(arc);
    this.ballotArc = arc;

    // One token per player who has already voted, dropped around the nominee's card:
    // yes to their left, no to their right. Readable straight down from the camera.
    let yesCount = 0;
    let noCount = 0;
    for (const p of state.players) {
      if (!p.vote) continue;
      const yes = p.vote === 'yes';
      const idx = yes ? yesCount++ : noCount++;
      const token = makeVoteToken(yes);
      const ang = (yes ? 0.62 : -0.62) + (yes ? 1 : -1) * idx * 0.3;
      token.position.set(c.x + Math.cos(ang) * 1.12, TABLE_TOP + 0.03, c.z + Math.sin(ang) * 1.12);
      token.rotation.y = ang;
      this.scene.add(token);
      this.voteTokens.push(token);
    }
  }

  // ------------------------------------------------------------------ camera
  private applyCamera(dt: number) {
    const k = 1 - Math.exp(-9 * dt);
    this.cam.az += (this.cam.azT - this.cam.az) * k;
    this.cam.el += (this.cam.elT - this.cam.el) * k;
    this.cam.r += (this.cam.rT - this.cam.r) * k;
    const ce = Math.cos(this.cam.el);
    this.camera.position.set(
      this.cam.r * ce * Math.sin(this.cam.az),
      this.cam.r * Math.sin(this.cam.el),
      this.cam.r * ce * Math.cos(this.cam.az),
    );
    // Aim below the tabletop: with the HUD occupying the top and bottom edges, a centred
    // disc reads as too low and its near rim disappears under the action panel.
    this.camera.lookAt(0, -0.8, 0);
  }

  orbitStart(x: number, y: number) {
    this.dragging = true;
    this.userMoved = true;
    this.lastPointer.x = x;
    this.lastPointer.y = y;
    this.vel.az = 0;
    this.vel.el = 0;
  }

  orbitMove(x: number, y: number, dt: number) {
    if (!this.dragging) return;
    const dx = x - this.lastPointer.x;
    const dy = y - this.lastPointer.y;
    this.lastPointer.x = x;
    this.lastPointer.y = y;
    const dAz = -dx * 0.0055;
    const dEl = dy * 0.0038;
    this.cam.azT += dAz;
    this.cam.elT = clamp(this.cam.elT + dEl, 0.3, 1.2);
    // Remember the instantaneous speed so the release keeps spinning for a moment.
    if (dt > 0) {
      this.vel.az = dAz / dt;
      this.vel.el = dEl / dt;
    }
  }

  orbitEnd() {
    this.dragging = false;
  }

  zoomBy(delta: number) {
    this.userMoved = true;
    this.cam.rT = clamp(this.cam.rT + delta, 8.5, 34);
  }

  /** Applies release inertia; called every frame. */
  private inertia(dt: number) {
    if (this.dragging) return;
    if (Math.abs(this.vel.az) < 0.02 && Math.abs(this.vel.el) < 0.02) return;
    this.cam.azT += this.vel.az * dt;
    this.cam.elT = clamp(this.cam.elT + this.vel.el * dt, 0.3, 1.2);
    const decay = Math.exp(-4.2 * dt);
    this.vel.az *= decay;
    this.vel.el *= decay;
  }

  // ------------------------------------------------------------------ picking
  pick(x: number, y: number): PickResult {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    // Book first: it is small and sits inside the table, so it must win over the tabletop.
    if (this.bookGroup.visible) {
      const hits = this.raycaster.intersectObject(this.bookGroup, true);
      if (hits.length) return { kind: 'book' };
    }
    const hits = this.raycaster.intersectObjects(this.pickables, false);
    for (const hit of hits) {
      const id = hit.object.userData.id as string | undefined;
      const rig = id ? this.seats.get(id) : undefined;
      if (id && !rig?.dead) return { kind: 'seat', id };
      // A dead player's card is face down and cannot be picked: they are out.
      if (id && rig?.dead) return null;
    }
    return null;
  }

  hoverAt(x: number, y: number) {    const result = this.pick(x, y);
    const hoveredId = result?.kind === 'seat' ? result.id : null;
    for (const rig of this.seats.values()) {
      const target = rig.id === hoveredId ? 1 : 0;
      rig.hover += (target - rig.hover) * 0.25;
    }
    return result;
  }

  /** Where a seat's card lands on screen, in CSS pixels. Used by the screenshot harness. */
  seatScreenPoint(id: string): { x: number; y: number } | null {
    const rig = this.seats.get(id);
    if (!rig) return null;
    const world = new THREE.Vector3();
    rig.card.getWorldPosition(world);
    world.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((world.x + 1) / 2) * rect.width,
      y: rect.top + ((-world.y + 1) / 2) * rect.height,
    };
  }

  // ------------------------------------------------------------------ frame
  frame(dt: number) {
    if (this.disposed) return;
    this.inertia(dt);
    this.applyCamera(dt);
    this.animateSeats(dt);
    this.animateBook(dt);
    if (this.leaderMark?.visible) {
      const s = 1 + Math.sin(performance.now() * 0.0022) * 0.03;
      this.leaderMark.scale.setScalar(s);
    }
    this.renderer.render(this.scene, this.camera);
  }

  private animateSeats(dt: number) {
    const state = this.state;
    if (!state) return;
    const byId = new Map(state.players.map((p) => [p.id, p]));
    for (const rig of this.seats.values()) {
      const p = byId.get(rig.id);
      if (!p) continue;

      // Dead: the card goes face down and the chair is pushed back out of the circle.
      const deadTarget = p.alive ? 0 : 1;
      rig.dead += (deadTarget - rig.dead) * Math.min(1, dt * 5);

      // Hover: lean toward the viewer and lift a little. Only when the seat is actionable
      // does it lean further, so the affordance matches what a click will actually do.
      const leanTarget = rig.hover * (rig.targetable ? 0.5 : 0.24);
      const liftTarget = rig.hover * (rig.targetable ? 0.1 : 0.05);
      rig.lean += (leanTarget - rig.lean) * Math.min(1, dt * 8);
      rig.lift += (liftTarget - rig.lift) * Math.min(1, dt * 8);

      // Name tents are flat plates, so a plate whose normal is perpendicular to the view
      // degenerates into an unreadable sliver — on a six-seat table that is always two
      // players, and you cannot tell who you are looking at. Turn each card toward the
      // camera instead. The hold still owns position and tilt, so the tent stays on the
      // rim and still leans back; only its yaw follows the viewer.
      const dx = this.camera.position.x - rig.hold.position.x;
      const dz = this.camera.position.z - rig.hold.position.z;
      let want = Math.atan2(dx, dz) - rig.hold.rotation.y;
      want = ((want + Math.PI) % TAU + TAU) % TAU - Math.PI; // shortest arc
      rig.face += (want - rig.face) * Math.min(1, dt * 5);
      rig.card.rotation.y = rig.face;

      // Base tilt: a name tent leans back 13 degrees so it reads from above.
      const baseTilt = -0.23;
      rig.hold.rotation.x = baseTilt - rig.lean - rig.dead * (Math.PI / 2 - 0.02);
      rig.hold.position.y = TABLE_TOP + rig.lift - rig.dead * (TABLE_TOP - 0.03);

      // Dead cards also flatten their vertical offset: they are lying on the table.
      rig.card.position.y = CARD_H / 2 + 0.02;

      // Chair: pulled back and turned away once the player is out.
      rig.chair.position.z = 0.1 + rig.dead * 0.62;
      rig.chair.rotation.y = rig.dead * 0.42;

      // Rings: selection is a warm ring, a ballot vote tints it.
      let ringTarget = 0;
      let ringColor = 0xe8b76a;
      if (p.selected) ringTarget = 0.9;
      else if (p.vote === 'yes') {
        ringTarget = 0.75;
        ringColor = 0xe8b76a;
      } else if (p.vote === 'no') {
        ringTarget = 0.6;
        ringColor = 0x6f6455;
      } else if (p.speaker) {
        ringTarget = 0.55;
        ringColor = 0xfff0cf;
      } else if (rig.targetable && rig.hover > 0.3) {
        ringTarget = 0.35;
      }
      rig.ringLevel += (ringTarget - rig.ringLevel) * Math.min(1, dt * 7);
      const ringMat = rig.ring.material as THREE.MeshBasicMaterial;
      ringMat.opacity = rig.ringLevel * (p.alive ? 1 : 0.3);
      ringMat.color.setHex(ringColor);
      const glowMat = rig.glow.material as THREE.MeshBasicMaterial;
      glowMat.opacity = p.selected ? 0.16 + Math.sin(performance.now() * 0.003) * 0.04 : 0;

      // The card's own brightness tracks how lit it is: selected and speaking cards are
      // pulled toward the key light, dead ones fade into the table.
      const emissive = 0.045 + (p.selected ? 0.075 : p.speaker ? 0.06 : 0);
      for (const m of rig.cardMats) {
        m.emissive.setHex(0xe8b76a);
        m.emissiveIntensity = emissive;
        m.opacity = 1;
        m.transparent = false;
      }
    }
  }

  private animateBook(dt: number) {
    if (!this.bookGroup.visible) return;
    const target = this.state?.bookOpen ? 1 : 0;
    const speed = this.state?.bookOpen ? 2.1 : 2.8;
    this.bookOpenK += (target - this.bookOpenK) * Math.min(1, dt * speed);

    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const handPos = this.camera.position.clone().addScaledVector(fwd, 2.05).add(new THREE.Vector3(0, -0.12, 0));
    // The page normal is local +z, and the camera's local +z points back at the viewer,
    // so the plain camera orientation already faces the pages forward.
    this.bookHandQuat
      .copy(this.camera.quaternion)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, -0.03)));

    const k = ease(this.bookOpenK);
    this.bookGroup.position.copy(this.bookStart).lerp(handPos, k);
    this.bookGroup.quaternion.copy(this.bookStartQuat).slerp(this.bookHandQuat, k);
    // The book stands up as it leaves the table.
    this.bookPivot.rotation.x = -Math.PI / 2 * (1 - k);
    this.coverPivot.rotation.y = -Math.PI * 0.99 * ease(clamp((this.bookOpenK - 0.45) / 0.55, 0, 1));
    this.bookLamp.intensity = k * 1.6;
  }

  // ------------------------------------------------------------------ lifecycle
  setSize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Keep a wider frame readable on short panels by widening the field of view a little.
    this.camera.fov = width / height < 1.2 ? 46 : 40;
    this.camera.updateProjectionMatrix();
    // The table should occupy the same share of the frame in a 287px panel and on a 27"
    // monitor. A fixed distance cannot do that, so it is derived until the player takes
    // over the camera — after that their choice wins.
    if (!this.userMoved) {
      const r = this.defaultRadius(width, height);
      this.cam.rT = r;
      if (!this.framed) {
        this.cam.r = r;
        this.framed = true;
      }
    }
  }

  /** Distance that puts the table at roughly 58% of the frame's short side. */
  private defaultRadius(width: number, height: number) {
    const fov = (this.camera.fov * Math.PI) / 180;
    const table = TABLE_R * 2 * 1.08;
    const byHeight = table / (0.58 * 2 * Math.tan(fov / 2));
    const aspect = width / Math.max(1, height);
    // In portrait the width is the binding constraint, so back off proportionally.
    return Math.max(9, Math.min(34, aspect < 1 ? byHeight / aspect : byHeight));
  }

  resetView() {
    const el = this.renderer.domElement;
    this.cam.azT = 0.3;
    this.cam.elT = 0.68;
    this.cam.rT = this.defaultRadius(el.clientWidth || el.width, el.clientHeight || el.height);
    this.vel.az = 0;
    this.vel.el = 0;
    this.userMoved = false;
  }

  dispose() {
    this.disposed = true;
    for (const rig of this.seats.values()) disposeTree(rig.root);
    this.seats.clear();
    disposeTree(this.scene);
    this.renderer.dispose();
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        m.dispose();
      }
    }
  });
}
