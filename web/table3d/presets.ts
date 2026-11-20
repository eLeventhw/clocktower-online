// One layout, four lights. The room is chosen from the room code, so every match looks
// like a different place but never changes halfway through a game; the phase then decides
// whether that room is lit for day or for night.
import { NC, GL } from './palette';
export type RoomPreset = {
  id: string;
  name: string;
  sub: string;
  key: number;
  amb: number;
  fog: number;
  floor: string;
  stone: string;
  wood: string;
  cloth: string;
  flame: string;
};

export const ROOMS: RoomPreset[] = [
  {
    id: 'attic',
    name: '阁楼',
    sub: 'THE ATTIC',
    key: 0xffd8a2,
    amb: 0x53422e,
    fog: 0x14100b,
    floor: '#6d655c',
    stone: '#5a4732',
    wood: '#4c3a29',
    cloth: '#3a2d22',
    flame: NC.primary,
  },
  {
    id: 'cellar',
    name: '地窖',
    sub: 'THE CELLAR',
    key: 0x9fd8bd,
    amb: 0x2e3f37,
    fog: 0x0c1210,
    floor: '#4e5a52',
    stone: '#33463d',
    wood: '#3b2f24',
    cloth: '#28332c',
    flame: '#84c4a6',
  },
  {
    id: 'chapel',
    name: '礼拜堂',
    sub: 'THE CHAPEL',
    key: 0x9dbcf5,
    amb: 0x2f3550,
    fog: 0x0a0d18,
    floor: '#575b68',
    stone: '#333a5c',
    wood: '#3a3020',
    cloth: '#2a2f42',
    flame: '#9dbcf5',
  },
  {
    id: 'belfry',
    name: '钟室',
    sub: 'THE BELFRY',
    key: 0xb6bfdb,
    amb: 0x3a3f4c,
    fog: 0x0f1116,
    floor: '#5e6068',
    stone: '#3d4152',
    wood: '#42362a',
    cloth: '#2f323b',
    flame: '#b6bfdb',
  },
];

/** Stable hash: the same room code always yields the same room. */
export function roomForCode(code: string | undefined): RoomPreset {
  if (!code) return ROOMS[0];
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ROOMS[h % ROOMS.length];
}

export type PhaseKey = 'lobby' | 'night' | 'day' | 'ended';

export type LightState = {
  key: number;
  keyIntensity: number;
  /** Cone width of the one key light. Night narrows the cone instead of dimming the room. */
  keyAngle: number;
  amb: number;
  ambIntensity: number;
  /** Background colour of the fog and the clear colour. Previously read from a field
   *  that did not exist, so the room fell back to a broken black. */
  fog: number;
  fogDensity: number;
  /** Warm bounce colour for the rim of the table. */
  rim: number;
  /** Whether the room's candles are the dominant light. */
  candles: boolean;
  /**
   * The lantern over the table. Separate from `key` on purpose: the key light is the
   * room — walls, floor, long shadows — and it is allowed to be cold. The lantern is the
   * only light that reaches the working surface, so it stays warm in every room. A single
   * average of the two is what makes a night scene read as "uniformly dark" instead of
   * "one lit thing in a dark room".
   */
  lamp: number;
  lampIntensity: number;
};

/**
 * The phase is the single biggest visual signal in the game, so it gets the light:
 * night is one cold lamp, day is warm and much flatter, the lobby is dim because nobody
 * has started yet, and the end is drained of colour because the story is over.
 */
export function lightFor(room: RoomPreset, phase: PhaseKey): LightState {
  if (phase === 'night') {
    return {
      key: 0x9fb2e0,
      keyIntensity: 2.8,
      keyAngle: 0.34,
      amb: 0x161c2e,
      ambIntensity: 0.20,
      fog: 0x06070c,
      fogDensity: 0.032,
      rim: 0x6d7fa8,
      candles: true,
      lamp: 0xffcf9a,
      lampIntensity: 3.6,
    };
  }
  if (phase === 'day') {
    return {
      // Daylight is warm in every room. Using `room.key` here made three of the four rooms
      // cast a cold blue "day", which read as a floodlit stage at night rather than as
      // morning; the room still keeps its identity through floor, stone and wood colour.
      key: 0xffe9cb,
      keyIntensity: 5.6,
      keyAngle: 0.50,
      amb: room.amb,
      ambIntensity: 0.32,
      fog: room.fog,
      fogDensity: 0.010,
      rim: 0xffd8a2,
      candles: false,
      lamp: 0xffd8a2,
      lampIntensity: 0.8,
    };
  }
  if (phase === 'ended') {
    return {
      key: 0xb9a98f,
      keyIntensity: 3.4,
      keyAngle: 0.44,
      amb: 0x33302b,
      ambIntensity: 0.32,
      fog: 0x1a1815,
      fogDensity: 0.024,
      rim: 0x9a8f7d,
      candles: false,
      lamp: 0xd8c8ae,
      lampIntensity: 0.7,
    };
  }
  // lobby
  return {
    key: room.key,
    keyIntensity: 4.4,
    keyAngle: 0.46,
    amb: room.amb,
    ambIntensity: 0.24,
    fog: room.fog,
    fogDensity: 0.028,
    rim: 0xd8c39c,
    candles: true,
    lamp: 0xffcf9a,
    lampIntensity: 1.8,
  };
}
