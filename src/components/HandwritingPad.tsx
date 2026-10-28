import { useCallback, useEffect, useRef, useState } from "react";
import type { Stroke, StrokePoint } from "../types";
import { recognizeKoreanText } from "../ocr";

interface HandwritingPadProps {
  onRecognized: (text: string) => void;
  onStrokesChange: (strokes: Stroke[]) => void;
}

export default function HandwritingPad({
  onRecognized,
  onStrokesChange,
}: HandwritingPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);

  const redraw = useCallback((items: Stroke[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * scale));
    canvas.height = Math.max(1, Math.floor(rect.height * scale));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, rect.width, rect.height);
    context.strokeStyle = "#19324a";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    items.forEach((stroke) => {
      if (!stroke.points.length) return;
      context.beginPath();
      stroke.points.forEach((point, index) => {
        const x = point.x * rect.width;
        const y = point.y * rect.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    });
  }, []);

  useEffect(() => {
    redraw(strokes);
    const handleResize = () => redraw(strokes);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [redraw, strokes]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Number(((event.clientX - rect.left) / rect.width).toFixed(4)),
      y: Number(((event.clientY - rect.top) / rect.height).toFixed(4)),
      pressure: Number((event.pressure || 0.5).toFixed(2)),
      t: Date.now(),
    };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const next = [...strokes, { points: [pointFromEvent(event)] }];
    setStrokes(next);
    onStrokesChange(next);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    setStrokes((current) => {
      const next = current.map((stroke, index) =>
        index === current.length - 1
          ? { points: [...stroke.points, pointFromEvent(event)] }
          : stroke,
      );
      onStrokesChange(next);
      return next;
    });
  };

  const stop = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    setStrokes([]);
    onStrokesChange([]);
    setStatus("");
  };

  const undo = () => {
    const next = strokes.slice(0, -1);
    setStrokes(next);
    onStrokesChange(next);
  };

  const recognize = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !strokes.length) {
      setStatus("먼저 답을 써 주세요.");
      return;
    }
    setStatus("손글씨를 읽고 있어요.");
    setProgress(0);
    try {
      const value = await recognizeKoreanText(canvas, (_message, nextProgress) => {
        if (typeof nextProgress === "number") setProgress(nextProgress);
      });
      onRecognized(value);
      setStatus(value ? "읽힌 글자를 확인하고 필요하면 고쳐 주세요." : "글자를 읽지 못했어요. 키보드로 입력해 주세요.");
    } catch {
      setStatus("손글씨 인식을 불러오지 못했어요. 키보드로 입력해 주세요.");
    }
  };

  return (
    <div className="handwriting-pad">
      <canvas
        ref={canvasRef}
        className="writing-canvas"
        aria-label="손글씨 답안 입력 영역"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      />
      <div className="pad-actions">
        <button type="button" className="text-button" onClick={undo} disabled={!strokes.length}>
          한 획 지우기
        </button>
        <button type="button" className="text-button" onClick={clear} disabled={!strokes.length}>
          모두 지우기
        </button>
        <button type="button" className="secondary-button" onClick={recognize}>
          글자 읽기
        </button>
      </div>
      {status && (
        <p className="inline-status" role="status">
          {status} {progress > 0 && progress < 100 ? `${progress}%` : ""}
        </p>
      )}
    </div>
  );
}
