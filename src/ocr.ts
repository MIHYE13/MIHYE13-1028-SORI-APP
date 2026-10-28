import type { Worker } from "tesseract.js";

type OcrSource = Parameters<Worker["recognize"]>[0];
type ProgressListener = (message: string, progress?: number) => void;

// handwriting: 손글씨는 한국어 모델만 써서 획이 영어 글자로 읽히지 않게 한다.
// document: 교재에는 단위·영어가 섞일 수 있어 한국어를 먼저, 영어를 보조로 쓴다.
export type OcrMode = "handwriting" | "document";

const LANGUAGES: Record<OcrMode, string> = {
  handwriting: "kor",
  document: "kor+eng",
};

const workerPromises = new Map<OcrMode, Promise<Worker>>();
const idleTimers = new Map<OcrMode, number>();
let currentListener: ProgressListener | null = null;

async function getWorker(mode: OcrMode): Promise<Worker> {
  let workerPromise = workerPromises.get(mode);
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(async ({ createWorker, PSM }) => {
      const worker = await createWorker(LANGUAGES[mode], undefined, {
        logger: (message) => {
          currentListener?.(
            message.status || "글자를 읽고 있어요.",
            typeof message.progress === "number" ? Math.round(message.progress * 100) : undefined,
          );
        },
      });
      if (mode === "handwriting") {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          preserve_interword_spaces: "1",
        });
      }
      return worker;
    });
    workerPromises.set(mode, workerPromise);
  }
  return workerPromise;
}

function scheduleRelease(mode: OcrMode, worker: Worker) {
  const existing = idleTimers.get(mode);
  if (existing !== undefined) window.clearTimeout(existing);
  idleTimers.set(
    mode,
    window.setTimeout(() => {
      void worker.terminate();
      workerPromises.delete(mode);
      idleTimers.delete(mode);
    }, 120_000),
  );
}

const HANGUL = /[ㄱ-ㆎ가-힣]/;

function cleanText(text: string, mode: OcrMode): string {
  let value = text.replace(/\s+/g, " ").trim();
  // 한글이 하나라도 읽혔으면 함께 섞여 나온 영어 글자는 잘못 읽힌 획으로 보고 지운다.
  if (mode === "handwriting" && HANGUL.test(value)) {
    value = value.replace(/[A-Za-z]+/g, "").replace(/\s+/g, " ").trim();
  }
  return value;
}

export async function recognizeKoreanText(
  source: OcrSource,
  listener?: ProgressListener,
  mode: OcrMode = "document",
): Promise<string> {
  currentListener = listener ?? null;
  const worker = await getWorker(mode);
  const timer = idleTimers.get(mode);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    idleTimers.delete(mode);
  }
  try {
    const result = await worker.recognize(source);
    return cleanText(result.data.text, mode);
  } finally {
    currentListener = null;
    scheduleRelease(mode, worker);
  }
}
