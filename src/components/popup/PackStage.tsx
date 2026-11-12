import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { assetUrl } from '@/lib/paths';
import { drawPackArt, loadLogo, loadPackFonts, PACK_HEIGHT, PACK_WIDTH } from './packArt';
import { FRAGMENT_SHADER, SNOW_FRAGMENT_SHADER, SNOW_VERTEX_SHADER, VERTEX_SHADER } from './packShader';
import styles from './PopupDialog.module.css';

export interface PackStageProps {
  title: string;
  edition: string;
  footer: string;
  /** Read aloud by screen readers (not shown): how to open the pack. Empty uses a plain default. */
  hint: string;
  /** How much the popup is scaled (PopupDialog's popupScale): the pack is drawn at that size, so it stays sharp. */
  scale: number;
  /** The pack is drawn and can be shown (its fonts and logo are in). */
  onReady: () => void;
  /** The visitor tore the pack open (drag, tap or keyboard). */
  onTorn: () => void;
  /** WebGL is not available (or the shader failed): the popup skips the pack. */
  onUnsupported: () => void;
}

/** The canvas is bigger than the pack so the torn strip has room to peel and fly. */
const CANVAS_WIDTH = 300;
const CANVAS_HEIGHT = 560;
const PACK_X = 35;
const PACK_Y = 150;
const TEAR_Y = PACK_Y + 46;

interface TearState {
  /** 0..1: how far the handle has been dragged along the tear line. */
  p: number;
  /** 0..1: the torn strip flying away. */
  fly: number;
  light: [number, number];
  lightTarget: [number, number];
  pointer: boolean;
  done: boolean;
  auto: boolean;
  moved: boolean;
  /** 0..1: where the finger of the idle demo is on the guide (the pack itself stays shut). */
  hint: number;
  /** When the idle demo may run (performance.now() time; Infinity while the handle is held). */
  demoAt: number;
  demoStart: number;
  drag: { id: number; x: number; p: number; scale: number } | null;
}

/**
 * The sealed foil pack, drawn by a fragment shader (see packShader.ts), with the dashed tear
 * guide and a fingertip handle. While nobody touches it, the finger slides along the guide and
 * back on its own (the pack stays shut) to show how to open it. The handle is dragged along the
 * guide; a tap, a click or Enter / the right arrow tears the pack by itself.
 * It reports onTorn() once, then keeps drawing the flying strip until the parent removes it.
 */
export function PackStage({ title, edition, footer, hint, scale, onReady, onTorn, onUnsupported }: PackStageProps) {
  // The size it is first drawn at; a later window resize only rescales the picture.
  const drawScale = useRef(scale);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onTorn, onUnsupported });
  callbacks.current = { onReady, onTorn, onUnsupported };
  const state = useRef<TearState>({
    p: 0,
    fly: 0,
    light: [0.35, 0.25],
    lightTarget: [0.35, 0.25],
    pointer: false,
    done: false,
    auto: false,
    moved: false,
    hint: 0,
    demoAt: 0,
    demoStart: 0,
    drag: null,
  });
  const tearRef = useRef<() => void>(() => {});
  const completeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const handle = handleRef.current;
    const guide = guideRef.current;
    if (!canvas || !handle || !guide) return;
    const s = state.current;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) {
      callbacks.current.onUnsupported();
      return;
    }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      callbacks.current.onUnsupported();
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      callbacks.current.onUnsupported();
      return;
    }
    gl.useProgram(program);

    // Snow: a second, tiny program drawing one point per flake over the pack. Optional: without it
    // the pack is simply shown without snow.
    const snowVertex = compile(gl.VERTEX_SHADER, SNOW_VERTEX_SHADER);
    const snowFragment = compile(gl.FRAGMENT_SHADER, SNOW_FRAGMENT_SHADER);
    let snowProgram: WebGLProgram | null = gl.createProgram();
    if (snowProgram && snowVertex && snowFragment) {
      gl.attachShader(snowProgram, snowVertex);
      gl.attachShader(snowProgram, snowFragment);
      gl.linkProgram(snowProgram);
      if (!gl.getProgramParameter(snowProgram, gl.LINK_STATUS)) snowProgram = null;
    } else {
      snowProgram = null;
    }
    const snowBuffer = snowProgram ? gl.createBuffer() : null;
    const snowAttr = snowProgram ? gl.getAttribLocation(snowProgram, 'a') : -1;
    const snowU = snowProgram
      ? {
          res: gl.getUniformLocation(snowProgram, 'uRes'),
          dpr: gl.getUniformLocation(snowProgram, 'uDpr'),
          fade: gl.getUniformLocation(snowProgram, 'uFade'),
          time: gl.getUniformLocation(snowProgram, 'uTime'),
        }
      : null;
    // The printed area between the foil crimps, where the snow falls.
    const snowTop = PACK_Y + 22;
    const snowHeight = PACK_HEIGHT - 44;
    const flakes = Array.from({ length: 26 }, (_, index) => ({
      x: Math.random() * PACK_WIDTH,
      y: Math.random() * snowHeight,
      size: index % 7 === 0 ? 8 : 3.6 + Math.random() * 3.2,
      kind: (index % 7 === 0 ? -1 : 1) * (0.65 + Math.random() * 0.35),
      speed: 10 + Math.random() * 16,
      sway: 4 + Math.random() * 6,
      phase: Math.random() * Math.PI * 2,
    }));
    const snowData = new Float32Array(flakes.length * 4);
    if (snowProgram) canvas.setAttribute('data-popup-snow', 'on');
    gl.useProgram(program);

    // Drawn at the size it is shown: the popup may be scaled up on a wide screen (popupScale).
    const dpr = Math.min(3, (window.devicePixelRatio || 1) * drawScale.current);
    canvas.width = CANVAS_WIDTH * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const U = {
      res: uniform('uRes'),
      dpr: uniform('uDpr'),
      art: uniform('uArt'),
      pack: uniform('uPack'),
      tearY: uniform('uTearY'),
      cut: uniform('uCut'),
      theta: uniform('uTheta'),
      fly: uniform('uFly'),
      light: uniform('uLight'),
      time: uniform('uTime'),
    };
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 24, 30, 255]));

    let alive = true;
    let ready = false;
    let frameId = 0;
    const started = performance.now();
    let lastFrame = started;

    // The artwork needs the fonts and the logo: the pack is drawn (and shown) once they are in.
    void Promise.all([loadPackFonts(), loadLogo(assetUrl('/images/popup-pack-santa.png'), false)]).then(([, logo]) => {
      if (!alive) return;
      const art = drawPackArt({ title, edition, footer }, logo);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, art);
      ready = true;
      canvas.setAttribute('data-ready', 'true');
      callbacks.current.onReady();
    });

    const draw = (now: number) => {
      if (!alive) return;
      const t = (now - started) / 1000;
      if (!s.pointer) s.lightTarget = [Math.sin(t * 0.7) * 0.7, Math.cos(t * 0.45) * 0.4 + 0.15];
      s.light[0] += (s.lightTarget[0] - s.light[0]) * 0.12;
      s.light[1] += (s.lightTarget[1] - s.light[1]) * 0.12;
      const cut = PACK_X + s.p * PACK_WIDTH;
      const theta = s.p <= 0 ? 0 : 0.1 + 0.9 * Math.pow(s.p, 0.8);
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      if (ready) {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.res, canvas.width, canvas.height);
        gl.uniform1f(U.dpr, dpr);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(U.art, 0);
        gl.uniform4f(U.pack, PACK_X, PACK_Y, PACK_WIDTH, PACK_HEIGHT);
        gl.uniform1f(U.tearY, TEAR_Y);
        gl.uniform1f(U.cut, cut);
        gl.uniform1f(U.theta, theta);
        gl.uniform1f(U.fly, s.fly);
        gl.uniform2f(U.light, s.light[0], s.light[1]);
        gl.uniform1f(U.time, t);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        // The snow: it falls and sways inside the printed area, and fades out as the strip flies off.
        const fade = s.done ? Math.max(0, 1 - s.fly * 3) : 1;
        if (snowProgram && snowU && fade > 0) {
          flakes.forEach((flake, index) => {
            flake.y += flake.speed * dt;
            flake.phase += dt * 1.3;
            if (flake.y > snowHeight + 6) {
              flake.y = -6;
              flake.x = Math.random() * PACK_WIDTH;
            }
            snowData[index * 4] = PACK_X + flake.x + Math.sin(flake.phase) * flake.sway;
            snowData[index * 4 + 1] = snowTop + flake.y;
            snowData[index * 4 + 2] = flake.size;
            snowData[index * 4 + 3] = flake.kind;
          });
          gl.disableVertexAttribArray(position);
          gl.useProgram(snowProgram);
          gl.bindBuffer(gl.ARRAY_BUFFER, snowBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, snowData, gl.DYNAMIC_DRAW);
          gl.enableVertexAttribArray(snowAttr);
          gl.vertexAttribPointer(snowAttr, 4, gl.FLOAT, false, 0, 0);
          gl.uniform2f(snowU.res, canvas.width, canvas.height);
          gl.uniform1f(snowU.dpr, dpr);
          gl.uniform1f(snowU.fade, fade);
          gl.uniform1f(snowU.time, t);
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(PACK_X * dpr, (CANVAS_HEIGHT - snowTop - snowHeight) * dpr, PACK_WIDTH * dpr, snowHeight * dpr);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.drawArrays(gl.POINTS, 0, flakes.length);
          gl.disable(gl.BLEND);
          gl.disable(gl.SCISSOR_TEST);
          gl.disableVertexAttribArray(snowAttr);
        }
      }
      // Idle demo: only the finger moves, along the guide and back; the pack stays shut. It stops
      // while the handle is held and starts again 2.5s after a release.
      if (!s.done && !s.auto && !s.drag && now >= s.demoAt) {
        if (s.demoStart === 0) s.demoStart = now;
        const d = ((now - s.demoStart) / 1000) % 3.6;
        const ease = (x: number) => x * x * (3 - 2 * x);
        s.hint = 0.8 * (d < 1.8 ? ease(d / 1.8) : d < 2.1 ? 1 : d < 2.7 ? 1 - ease((d - 2.1) / 0.6) : 0);
      } else {
        s.hint = 0;
      }
      handle.style.transform = `translateX(${(s.p + s.hint) * PACK_WIDTH}px)`;
      guide.style.clipPath = `inset(-8px -8px -8px ${s.p * PACK_WIDTH}px)`;
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);

    const complete = () => {
      if (s.done) return;
      s.done = true;
      s.p = 1;
      handle.disabled = true;
      const start = performance.now();
      const fly = (now: number) => {
        s.fly = Math.min(1, (now - start) / 650);
        if (s.fly < 1 && alive) requestAnimationFrame(fly);
      };
      requestAnimationFrame(fly);
      callbacks.current.onTorn();
    };
    tearRef.current = () => {
      if (s.done || s.auto) return;
      s.auto = true;
      const from = s.p;
      const start = performance.now();
      const step = (now: number) => {
        if (!alive) return;
        const k = Math.min(1, (now - start) / 650);
        s.p = from + (1 - from) * k;
        if (k < 1) requestAnimationFrame(step);
        else complete();
      };
      requestAnimationFrame(step);
    };
    completeRef.current = complete;

    // The foil follows the pointer while it is over the popup.
    const dialog = canvas.closest('dialog');
    const onMove = (event: globalThis.PointerEvent) => {
      if (s.done) return;
      const rect = (dialog ?? canvas).getBoundingClientRect();
      s.pointer = true;
      s.lightTarget = [((event.clientX - rect.left) / rect.width - 0.5) * 2, ((event.clientY - rect.top) / rect.height - 0.5) * 1.4];
    };
    const onLeave = () => {
      if (!s.drag) s.pointer = false;
    };
    dialog?.addEventListener('pointermove', onMove);
    dialog?.addEventListener('pointerleave', onLeave);

    return () => {
      alive = false;
      cancelAnimationFrame(frameId);
      dialog?.removeEventListener('pointermove', onMove);
      dialog?.removeEventListener('pointerleave', onLeave);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      if (snowProgram) gl.deleteProgram(snowProgram);
      if (snowBuffer) gl.deleteBuffer(snowBuffer);
    };
  }, [title, edition, footer]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const s = state.current;
    if (s.done || s.auto) return;
    // Pointer movement is in screen pixels; the popup may be scaled (zoom), so take the ratio.
    const parent = handleRef.current?.offsetParent;
    const scale = parent instanceof HTMLElement && parent.offsetWidth > 0 ? parent.getBoundingClientRect().width / parent.offsetWidth : 1;
    s.moved = false;
    s.demoAt = Infinity;
    s.drag = { id: event.pointerId, x: event.clientX, p: s.p, scale: scale || 1 };
    s.pointer = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not supported: the drag still works while the pointer stays over the handle.
    }
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const s = state.current;
    const drag = s.drag;
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.abs(event.clientX - drag.x) > 6) s.moved = true;
    s.p = Math.max(0, Math.min(1, drag.p + (event.clientX - drag.x) / drag.scale / PACK_WIDTH));
    if (s.p >= 0.97) {
      s.drag = null;
      s.pointer = false;
      completeRef.current();
    }
  };
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    const s = state.current;
    if (!s.drag || event.pointerId !== s.drag.id) return;
    s.drag = null;
    s.pointer = false;
    s.demoAt = performance.now() + 2500;
    s.demoStart = 0;
    if (s.done) return;
    // Let go early: the strip springs back.
    const from = s.p;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 280);
      s.p = from * (1 - (1 - Math.pow(1 - k, 3)));
      if (k < 1 && !s.pointer && !s.done) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const onClick = () => {
    const s = state.current;
    if (s.moved) {
      s.moved = false;
      return;
    }
    tearRef.current();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      tearRef.current();
    }
  };

  return (
    <>
      <div className={styles.pack} aria-hidden="true">
        <canvas ref={canvasRef} className={styles.packCanvas} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} data-popup-pack />
      </div>
      <div ref={guideRef} className={styles.guide} aria-hidden="true" />
      <button
        ref={handleRef}
        type="button"
        className={styles.handle}
        aria-label={hint.trim() !== '' ? `${hint.trim()}: drag right, or press Enter` : 'Tear the pack open: drag right, or press Enter'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={release}
        onPointerCancel={release}
        onClick={onClick}
        onKeyDown={onKeyDown}
        data-popup-tear
      >
        <span className={styles.touch} aria-hidden="true" />
        <svg className={styles.finger} aria-hidden="true" viewBox="0 0 24 24" fill="#ffffff" stroke="#0a1744" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          <path d="M22 14a8 8 0 0 1-8 8" />
          <path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
          <path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1" />
          <path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10" />
          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
        </svg>
      </button>
    </>
  );
}
