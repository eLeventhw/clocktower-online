import { useEffect, useMemo, useRef, useState } from 'react';
import { TableEngine, type SeatView, type TableState, type PickResult } from './table3d/Table3DEngine';
import './table3d.css';

/** Structural subset of the server's per-player view that the 3D table actually reads. */
export type GameView = {
  code: string;
  phase: 'lobby' | 'night' | 'day' | 'ended';
  round: number;
  players: { id: string; name: string; seat?: number; alive: boolean; host: boolean }[];
  me: {
    id: string;
    alive: boolean;
    roleKey: string | null;
    role: { name: string; team: string; description: string } | null;
    canAct: boolean;
    actionSubmitted: boolean;
    butlerMasterId?: string | null;
  };
  day?: { speakerId?: string | null } | null;
  ballot?: {
    nominator: string;
    nominee: string;
    stage?: string;
    yes?: string[];
    no?: string[];
  } | null;
  leader?: { id: string; votes: number; tie: boolean } | null;
  readyDay?: { mine: boolean; count: number; total: number };
};

type Props = {
  game: GameView;
  selected: string[];
  playerTarget: (p: GameView['players'][number]) => boolean;
  onPickSeat: (id: string) => void;
  bookOpen: boolean;
  onToggleBook: () => void;
};

const DRAG_THRESHOLD = 6;

export default function Table3D({ game, selected, playerTarget, onPickSeat, bookOpen, onToggleBook }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TableEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'pointer' | 'default'>('grab');
  const [hint, setHint] = useState<string>('');

  const state = useMemo<TableState>(() => {
    const byName = new Map(game.players.map((p) => [p.name, p.id]));
    const voteOf = new Map<string, 'yes' | 'no'>();
    if (game.ballot) {
      for (const name of game.ballot.yes ?? []) {
        const id = byName.get(name);
        if (id) voteOf.set(id, 'yes');
      }
      for (const name of game.ballot.no ?? []) {
        const id = byName.get(name);
        if (id) voteOf.set(id, 'no');
      }
    }

    const seats: SeatView[] = game.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      seat: p.seat ?? i + 1,
      alive: p.alive,
      host: p.host,
      you: p.id === game.me.id,
      selected: selected.includes(p.id),
      targetable: playerTarget(p),
      ready: !!game.readyDay?.mine && p.id === game.me.id,
      speaker: game.day?.speakerId === p.id,
      leader: !!game.leader && !game.leader.tie && game.leader.id === p.id,
      vote: voteOf.get(p.id) ?? null,
    }));

    const role = game.me.role;
    const body: string[] = [];
    if (role) {
      body.push(`阵营：${role.team}`);
      body.push(role.description);
      const master = game.players.find((p) => p.id === game.me.butlerMasterId);
      if (game.me.roleKey === 'butler' && master) body.push(`你的主人：${master.name}。`);
      if (game.me.roleKey === 'scarlet') body.push('你已经继任为新一任小恶魔。');
    }

    return {
      code: game.code,
      phase: game.phase,
      round: game.round,
      players: seats,
      roleHeading: role?.name ?? '尚未开牌',
      roleBody: role ? body : ['游戏开始后，这一页会写上只属于你的身份。'],
      roleFooter: role ? '这一页只有你能看见' : '等待房主开始',
      hasRole: !!role,
      bookOpen,
      ballot: game.ballot
        ? { nominator: game.ballot.nominator, nominee: game.ballot.nominee, stage: game.ballot.stage ?? 'vote' }
        : null,
      myActionSubmitted: game.me.actionSubmitted,
      myCanAct: game.me.canAct,
    };
  }, [game, selected, bookOpen, playerTarget]);

  // Engine lifecycle. Kept in its own effect so state updates never rebuild the scene.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let engine: TableEngine;
    try {
      engine = new TableEngine(canvas);
    } catch {
      setFailed(true);
      return;
    }
    engineRef.current = engine;
    // Exposed so the screenshot harness can aim at a specific seat instead of guessing
    // coordinates. Harmless in production: it is the same object the component drives.
    (window as unknown as { __table3d?: TableEngine }).__table3d = engine;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      engine.setSize(rect.width, rect.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      engine.frame(dt);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setState(state);
  }, [state]);

  const drag = useRef({ active: false, moved: false, x: 0, y: 0, last: performance.now() });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { active: true, moved: false, x: e.clientX, y: e.clientY, last: performance.now() };
    engineRef.current?.orbitStart(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const d = drag.current;

    if (d.active) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true;
      const now = performance.now();
      engine.orbitMove(e.clientX, e.clientY, Math.max(1, now - d.last) / 1000);
      d.last = now;
      if (d.moved) setCursor('grabbing');
      return;
    }

    // Hover is throttled to the frame rate by the engine's own exponential smoothing.
    const result = engine.hoverAt(e.clientX, e.clientY);
    reportHover(result);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const d = drag.current;
    engine?.orbitEnd();
    d.active = false;
    setCursor('grab');
    if (!engine || d.moved) return;

    const result = engine.pick(e.clientX, e.clientY);
    if (!result) return;
    if (result.kind === 'book') {
      if (state.hasRole) onToggleBook();
      return;
    }
    const seat = state.players.find((p) => p.id === result.id);
    if (seat?.targetable) onPickSeat(result.id);
  };

  const onPointerLeave = () => {
    engineRef.current?.orbitEnd();
    drag.current.active = false;
    setCursor('grab');
    setHint('');
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    engineRef.current?.zoomBy(e.deltaY * 0.012);
  };

  const reportHover = (result: PickResult) => {
    if (result?.kind === 'book') {
      setCursor('pointer');
      setHint(state.hasRole ? '点击魔典 · 查看你的身份' : '魔典还是空的');
      return;
    }
    if (result?.kind === 'seat') {
      const seat = state.players.find((p) => p.id === result.id);
      if (seat?.targetable) {
        setCursor('pointer');
        setHint(`选中 ${seat.name}`);
        return;
      }
      setCursor('default');
      setHint(seat ? `${seat.name} · 现在不能选择` : '');
      return;
    }
    setCursor('grab');
    setHint('');
  };

  if (failed) {
    return (
      <div className="table-visual table3d-host">
        <div className="table3d-fallback">
          <b>这台设备无法渲染 3D 桌面</b>
          <p>浏览器没有可用的 WebGL。游戏本身不受影响，可以用左侧玩家列表和下方操作区继续。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-visual table3d-host" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="table3d-canvas"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
        onDoubleClick={() => engineRef.current?.resetView()}
      />
      <div className="table3d-legend">
        {hint || '拖动旋转 · 滚轮缩放 · 双击归位'}
      </div>
      {state.hasRole && (
        <button className="table3d-book" onClick={onToggleBook}>
          {bookOpen ? '合上魔典' : '翻开魔典'}
        </button>
      )}
    </div>
  );
}
