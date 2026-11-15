import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenTool, Trash2 } from 'lucide-react';

interface WhiteboardCanvasProps {
  sessionKey: string;
}

type ToolType = 'pen' | 'eraser';

const PEN_COLORS = [
  { color: '#111827', label: 'Caneta preta' },
  { color: '#1769d2', label: 'Caneta azul' },
  { color: '#d62828', label: 'Caneta vermelha' },
];

const PEN_THICKNESSES = [
  { label: 'Fina', value: 1.5 },
  { label: 'Média', value: 2.8 },
  { label: 'Grossa', value: 4.8 },
];

export const WhiteboardCanvas: React.FC<WhiteboardCanvasProps> = ({ sessionKey }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<ToolType>('pen');
  const [penColor, setPenColor] = useState<string>('#111827');
  const [baseThickness, setBaseThickness] = useState<number>(2.8);

  const drawingRef = useRef<{
    active: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
    lastW: number;
    strokeWidth: number;
    snapshot: ImageData | null;
  }>({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    lastW: 2.8,
    strokeWidth: 2.8,
    snapshot: null,
  });

  const fillWhiteBackground = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }, []);

  const syncCanvasResolution = useCallback(
    (preserveDrawing: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(300, Math.round(rect.width * dpr));
      const height = Math.max(240, Math.round(rect.height * dpr));
      if (canvas.width === width && canvas.height === height && preserveDrawing) return;

      const prevCanvas = document.createElement('canvas');
      let hasPrev = false;
      if (preserveDrawing && canvas.width > 0 && canvas.height > 0) {
        prevCanvas.width = canvas.width;
        prevCanvas.height = canvas.height;
        prevCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
        hasPrev = true;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      fillWhiteBackground(ctx, width, height);
      if (hasPrev) {
        ctx.drawImage(prevCanvas, 0, 0, width, height);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    },
    [fillWhiteBackground],
  );

  // Clear board cleanly on question / session transition
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current.snapshot = null;
    syncCanvasResolution(false);
  }, [sessionKey, syncCanvasResolution]);

  useEffect(() => {
    const onResize = () => syncCanvasResolution(true);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [syncCanvasResolution]);

  const toLocalPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const pressureWidth = (ev: PointerEvent | React.PointerEvent<HTMLCanvasElement>) => {
    const p = ev.pointerType === 'pen' && ev.pressure > 0 ? ev.pressure : 0.55;
    if (tool === 'eraser') {
      return 16 + p * 12;
    }
    return baseThickness * (0.65 + p * 0.7);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    syncCanvasResolution(true);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer capture error
    }

    const pt = toLocalPoint(e.clientX, e.clientY);
    const w = pressureWidth(e);
    drawingRef.current = {
      active: true,
      pointerId: e.pointerId,
      lastX: pt.x,
      lastY: pt.y,
      lastW: w,
      strokeWidth: w,
      snapshot: drawingRef.current.snapshot,
    };

    ctx.fillStyle = tool === 'eraser' ? '#ffffff' : penColor;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drawingRef.current;
    if (!state.active || state.pointerId !== e.pointerId) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const native = e.nativeEvent;
    const events: Array<PointerEvent | React.PointerEvent<HTMLCanvasElement>> =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const list = events.length ? events : [e];

    for (const item of list) {
      const pt = toLocalPoint(item.clientX, item.clientY);
      const targetW = pressureWidth(item);
      state.strokeWidth += (targetW - state.strokeWidth) * 0.35;
      const w = state.strokeWidth;
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : penColor;
      ctx.lineWidth = (state.lastW + w) / 2;
      ctx.beginPath();
      ctx.moveTo(state.lastX, state.lastY);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      state.lastX = pt.x;
      state.lastY = pt.y;
      state.lastW = w;
    }
  };

  const finishStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drawingRef.current;
    if (!state.active || state.pointerId !== e.pointerId) return;
    state.active = false;
    state.pointerId = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    fillWhiteBackground(ctx, canvas.width, canvas.height);
  };

  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--panel-soft)] p-3.5 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--line)]">
        <div className="flex items-center gap-1.5">
          <PenTool className="w-3.5 h-3.5 text-[var(--accent)]" />
          <strong className="text-[12.5px] font-bold text-[var(--text)]">Quadro branco</strong>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Colors */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Cores da caneta">
            {PEN_COLORS.map((swatch) => {
              const active = tool === 'pen' && penColor === swatch.color;
              return (
                <button
                  key={swatch.color}
                  type="button"
                  onClick={() => {
                    setTool('pen');
                    setPenColor(swatch.color);
                  }}
                  aria-label={swatch.label}
                  title={swatch.label}
                  style={{ backgroundColor: swatch.color }}
                  className={`w-[22px] h-[22px] rounded-full border-2 transition-transform ${
                    active
                      ? 'scale-110 ring-2 ring-[var(--accent)] border-white'
                      : 'border-white/40 hover:scale-105'
                  }`}
                />
              );
            })}
          </div>

          {/* Stroke thickness selector */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] p-0.5">
            {PEN_THICKNESSES.map((th) => {
              const active = tool === 'pen' && baseThickness === th.value;
              return (
                <button
                  key={th.value}
                  type="button"
                  onClick={() => {
                    setTool('pen');
                    setBaseThickness(th.value);
                  }}
                  className={`px-2 py-0.5 rounded text-[10.5px] font-bold transition-colors ${
                    active
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {th.label}
                </button>
              );
            })}
          </div>

          {/* Eraser */}
          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors whitespace-nowrap ${
              tool === 'eraser'
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--line-strong)] bg-[var(--panel-raised)] text-[var(--text)] hover:border-[var(--accent)]'
            }`}
          >
            <Eraser className="w-3 h-3" />
            Borracha
          </button>

          {/* Clear canvas */}
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--line-strong)] bg-[var(--panel-raised)] text-[11px] font-bold text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3 h-3" />
            Limpar tela
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        className="whiteboard-canvas"
      />
      <div className="flex items-center justify-between text-[11.5px] text-[var(--muted)] mt-2">
        <span>Rascunho com mouse ou mesa digitalizadora (canetas preta, azul e vermelha + borracha).</span>
        <span className="font-semibold text-[var(--subtle)]">Limpeza automática ao avançar</span>
      </div>
    </div>
  );
};
