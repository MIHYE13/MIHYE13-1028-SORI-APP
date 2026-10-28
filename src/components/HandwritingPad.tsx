import { useCallback, useEffect, useRef, useState } from "react";
import type { Stroke, StrokePoint } from "../types";
import { recognizeKoreanText } from "../ocr";

// OCR은 굵고 진한 글자를 잘 읽으므로, 획을 글씨 크기에 맞는 굵은 선으로 다시 그리고
// 글씨가 있는 부분만 여백을 두고 잘라 낸다.
function renderForOcr(strokes: Stroke[], canvas: HTMLCanvasElement): HTMLCanvasElement {
  const rect = canvas.getBoundingClientRect();
  const points = strokes.flatMap((stroke) =>
    stroke.points.map((point) => ({ x: point.x * rect.width, y: point.y * rect.height })),
  );
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const inkHeight = Math.max(maxY - minY, 20);
  const scale = Math.min(4, Math.max(1, 120 / inkHeight));
  const padding = 24;

  const output = document.createElement("canvas");
  output.width = Math.ceil((maxX - minX) * scale + padding * 2);
  output.height = Math.ceil((maxY - minY) * scale + padding * 2);
  const context = output.getContext("2d");
  if (!context) return canvas;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.strokeStyle = "#000000";
  context.lineWidth = Math.max(6, Math.round(inkHeight * scale * 0.06));
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (!stroke.points.length) return;
    context.beginPath();
    stroke.points.forEach((point, index) => {
      const x = (point.x * rect.width - minX) * scale + padding;
      const y = (point.y * rect.height - minY) * scale + padding;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    if (stroke.points.length === 1) context.lineTo(
      (stroke.points[0].x * rect.width - minX) * scale + padding + 0.1,
      (stroke.points[0].y * rect.height - minY) * scale + padding,
    );
    context.stroke();
  });
  return output;
}

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
  const strokesRef = useRef<Stroke[]>([]);
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

  // 이벤트 처리 중에 좌표를 바로 계산한다. 상태 갱신 함수 안에서 계산하면
  // React가 event.currentTarget을 비운 뒤라 오류가 나고 화면 전체가 멈춘다.
  const commit = (next: Stroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
    onStrokesChange(next);
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    commit([...strokesRef.current, { points: [pointFromEvent(event)] }]);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = pointFromEvent(event);
    const current = strokesRef.current;
    const last = current[current.length - 1];
    if (!last) return;
    commit([...current.slice(0, -1), { points: [...last.points, point] }]);
  };

  const stop = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const clear = () => {
    commit([]);
    setStatus("");
  };

  const undo = () => {
    commit(strokesRef.current.slice(0, -1));
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
      const value = await recognizeKoreanText(
        renderForOcr(strokesRef.current, canvas),
        (_message, nextProgress) => {
          if (typeof nextProgress === "number") setProgress(nextProgress);
        },
        "handwriting",
      );
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
