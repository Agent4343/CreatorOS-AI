"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Minimal signature pad. Captures touch and mouse strokes on a canvas
 * and exports a PNG data URL that the server stores on the signature
 * row. Not the prettiest pad in the world; designed for field use on
 * phones — works with finger or stylus.
 */
export default function SignaturePad({
  onSign,
}: {
  onSign: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    // Match canvas pixel grid to its CSS size for crisp lines.
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  function getPoint(e: PointerEvent | React.PointerEvent) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent) {
    drawing.current = true;
    last.current = getPoint(e);
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = getPoint(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setHasInk(true);
  }
  function end() {
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  }

  function submit() {
    if (!hasInk || submitting) return;
    setSubmitting(true);
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    Promise.resolve(onSign(dataUrl)).finally(() => setSubmitting(false));
  }

  return (
    <div className="mt-1 space-y-2">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-md border border-ink/30 bg-white"
        style={{ height: 140 }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!hasInk || submitting}
          className="rounded-md bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50"
        >
          {submitting ? "Signing…" : "Sign"}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="rounded-md border border-ink/20 px-3 py-2 text-sm text-ink disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
