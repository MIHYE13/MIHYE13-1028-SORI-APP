import { useEffect, useMemo, useRef, useState } from "react";
import { createPuzzleOrder, isPuzzleSolved, swapPuzzlePieces } from "../utils";

interface PuzzleResult {
  moves: number;
  hintViews: number;
  restarts: number;
  finalOrder: number[];
}

interface ImagePuzzleProps {
  image: string;
  alt: string;
  rows?: number;
  columns?: number;
  onComplete: (result: PuzzleResult) => void;
}

export default function ImagePuzzle({
  image,
  alt,
  rows = 2,
  columns = 3,
  onComplete,
}: ImagePuzzleProps) {
  const safeRows = Math.min(3, Math.max(2, rows));
  const safeColumns = Math.min(3, Math.max(2, columns));
  const size = safeRows * safeColumns;
  const [order, setOrder] = useState<number[]>(() => createPuzzleOrder(size));
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [hintViews, setHintViews] = useState(0);
  const [restarts, setRestarts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("3 / 4");
  const draggedIndex = useRef<number | null>(null);
  const reportedComplete = useRef(false);

  useEffect(() => {
    setOrder(createPuzzleOrder(size));
    setSelected(null);
    setMoves(0);
    setHintViews(0);
    setRestarts(0);
    reportedComplete.current = false;
  }, [image, size]);

  useEffect(() => {
    if (!showHint) return;
    const timer = window.setTimeout(() => setShowHint(false), 3000);
    return () => window.clearTimeout(timer);
  }, [showHint]);

  const solved = useMemo(() => isPuzzleSolved(order), [order]);

  useEffect(() => {
    if (!solved || moves === 0 || reportedComplete.current) return;
    reportedComplete.current = true;
    onComplete({ moves, hintViews, restarts, finalOrder: order });
  }, [hintViews, moves, onComplete, order, restarts, solved]);

  const exchange = (first: number, second: number) => {
    if (first === second || solved) {
      setSelected(null);
      return;
    }
    setOrder((current) => swapPuzzlePieces(current, first, second));
    setMoves((current) => current + 1);
    setSelected(null);
  };

  const choosePiece = (index: number) => {
    if (selected === null) {
      setSelected(index);
      return;
    }
    exchange(selected, index);
  };

  const restart = () => {
    setOrder(createPuzzleOrder(size));
    setSelected(null);
    setMoves(0);
    setRestarts((current) => current + 1);
    reportedComplete.current = false;
  };

  const viewHint = () => {
    setShowHint(true);
    setHintViews((current) => current + 1);
  };

  return (
    <div className={solved ? "image-puzzle solved" : "image-puzzle"}>
      <img
        className="puzzle-preload"
        src={image}
        alt=""
        onLoad={(event) => {
          const node = event.currentTarget;
          if (node.naturalWidth && node.naturalHeight) {
            setAspectRatio(`${node.naturalWidth} / ${node.naturalHeight}`);
          }
        }}
      />
      <div className="puzzle-toolbar">
        <button type="button" className="secondary-button" onClick={viewHint}>
          원본 그림 3초 보기
        </button>
        <span>이동 {moves}회</span>
      </div>
      <div
        className="puzzle-board"
        style={{
          gridTemplateColumns: `repeat(${safeColumns}, 1fr)`,
          aspectRatio,
        }}
        aria-label={`${alt} 이미지 퍼즐. ${size}개 조각`}
      >
        {order.map((tile, position) => {
          const originalRow = Math.floor(tile / safeColumns);
          const originalColumn = tile % safeColumns;
          const positionX = safeColumns === 1 ? 0 : (originalColumn / (safeColumns - 1)) * 100;
          const positionY = safeRows === 1 ? 0 : (originalRow / (safeRows - 1)) * 100;
          return (
            <button
              type="button"
              key={`${tile}-${position}`}
              className={selected === position ? "puzzle-piece selected" : "puzzle-piece"}
              style={{
                backgroundImage: `url("${image}")`,
                backgroundSize: `${safeColumns * 100}% ${safeRows * 100}%`,
                backgroundPosition: `${positionX}% ${positionY}%`,
              }}
              aria-label={`${position + 1}번째 위치의 그림 조각${selected === position ? ", 선택됨" : ""}`}
              aria-pressed={selected === position}
              draggable={!solved}
              onClick={() => choosePiece(position)}
              onDragStart={() => {
                draggedIndex.current = position;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedIndex.current !== null) exchange(draggedIndex.current, position);
                draggedIndex.current = null;
              }}
            >
              <span className="visually-hidden">그림 조각</span>
            </button>
          );
        })}
        {showHint && (
          <div className="puzzle-hint" role="status">
            <img src={image} alt={`원본 보기: ${alt}`} />
            <span>원본 그림은 3초 뒤 닫혀요.</span>
          </div>
        )}
      </div>
      <div className="puzzle-status" role="status" aria-live="polite">
        {solved ? (
          <strong>그림을 원래 모습으로 완성했어요.</strong>
        ) : selected === null ? (
          <span>두 조각을 차례로 누르거나 끌어서 위치를 바꿔 보세요.</span>
        ) : (
          <span>{selected + 1}번째 조각을 선택했어요. 바꿀 조각을 선택하세요.</span>
        )}
      </div>
      {!solved && (
        <button type="button" className="text-button" onClick={restart}>
          다시 섞기
        </button>
      )}
    </div>
  );
}
