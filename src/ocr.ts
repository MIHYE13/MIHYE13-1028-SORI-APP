import type { Worker } from "tesseract.js";

type OcrSource = Parameters<Worker["recognize"]>[0];
type ProgressListener = (message: string, progress?: number) => void;

let workerPromise: Promise<Worker> | null = null;
let currentListener: ProgressListener | null = null;
let idleTimer: number | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) =>
      createWorker("kor+eng", undefined, {
        logger: (message) => {
          currentListener?.(
            message.status || "글자를 읽고 있어요.",
            typeof message.progress === "number" ? Math.round(message.progress * 100) : undefined,
          );
        },
      }),
    );
  }
  return workerPromise;
}

function scheduleRelease(worker: Worker) {
  if (idleTimer !== null) window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    void worker.terminate();
    workerPromise = null;
    idleTimer = null;
  }, 120_000);
}

export async function recognizeKoreanText(
  source: OcrSource,
  listener?: ProgressListener,
): Promise<string> {
  currentListener = listener ?? null;
  const worker = await getWorker();
  if (idleTimer !== null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
  try {
    const result = await worker.recognize(source);
    return result.data.text.replace(/\s+/g, " ").trim();
  } finally {
    currentListener = null;
    scheduleRelease(worker);
  }
}
