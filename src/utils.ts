import type {
  AnswerResult,
  DraftQuestion,
  LessonQuestion,
  ReadingAttempt,
} from "./types";

export function normalizeKoreanText(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalizeKoreanText(value);
  return normalized ? normalized.split(" ") : [];
}

export function readingScore(original: string, recognized: string) {
  const expected = tokenize(original);
  const actual = tokenize(recognized);
  const table = Array.from({ length: expected.length + 1 }, () =>
    Array<number>(actual.length + 1).fill(0),
  );
  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= actual.length; j += 1) {
      table[i][j] = expected[i - 1] === actual[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }

  const matchedExpected = new Set<number>();
  const matchedActual = new Set<number>();
  let i = expected.length;
  let j = actual.length;
  while (i > 0 && j > 0) {
    if (expected[i - 1] === actual[j - 1]) {
      matchedExpected.add(i - 1);
      matchedActual.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const missing = expected.filter((_, index) => !matchedExpected.has(index));
  const different = actual.filter((_, index) => !matchedActual.has(index));
  const matchedCount = table[expected.length][actual.length];

  const score = expected.length
    ? Math.round((matchedCount / expected.length) * 100)
    : 0;
  return { score, missingWords: missing, differentWords: different };
}

export function levenshteinSimilarity(a: string, b: string): number {
  const left = normalizeKoreanText(a);
  const right = normalizeKoreanText(b);
  if (!left && !right) return 1;
  if (!left || !right) return 0;

  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return Number(
    (1 - matrix[left.length][right.length] / Math.max(left.length, right.length)).toFixed(2),
  );
}

export function assessAnswer(
  question: LessonQuestion,
  value: string,
  inputType: AnswerResult["inputType"],
): Omit<AnswerResult, "questionId" | "rawValue" | "confirmedText"> {
  const normalized = normalizeKoreanText(value);
  const accepted = [question.answer, ...(question.acceptedAnswers ?? [])].map(
    normalizeKoreanText,
  );

  if (question.type !== "descriptive") {
    const correct = accepted.includes(normalized);
    return {
      inputType,
      correct,
      feedback: correct
        ? ["정확하게 답했어요."]
        : [question.feedbackHints?.[0] ?? "교과서의 핵심 문장을 다시 살펴보세요."],
    };
  }

  const keywords = question.keywords ?? [];
  const included = keywords.filter((word) => normalized.includes(normalizeKoreanText(word)));
  const keywordScore = keywords.length
    ? Number((included.length / keywords.length).toFixed(2))
    : 0;
  const similarityScore = levenshteinSimilarity(
    value,
    question.modelAnswer ?? question.answer,
  );
  const missing = keywords.filter((word) => !included.includes(word));
  const feedback = [
    included.length
      ? `핵심어 ${included.map((word) => `“${word}”`).join(", ")}를 잘 사용했어요.`
      : "교과서의 핵심 낱말을 한 가지 이상 넣어 보세요.",
  ];
  if (missing.length) {
    feedback.push(`“${missing[0]}”의 의미를 답에 더해 보세요.`);
  } else {
    feedback.push("중요한 내용을 빠짐없이 설명했어요.");
  }
  return {
    inputType,
    keywordScore,
    similarityScore,
    feedback,
  };
}

export function makePseudonymousId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function createReadingAttempt(
  original: string,
  recognized: string,
  attempt: number,
): ReadingAttempt {
  return {
    attempt,
    recognizedText: recognized.trim(),
    ...readingScore(original, recognized),
    createdAt: new Date().toISOString(),
  };
}

function uniqueWords(text: string): string[] {
  const ignored = new Set([
    "그리고",
    "그러나",
    "합니다",
    "있습니다",
    "이러한",
    "여러",
    "가지",
  ]);
  return Array.from(new Set(tokenize(text)))
    .filter((word) => word.length >= 2 && !ignored.has(word))
    .sort((a, b) => b.length - a.length);
}

export function generateQuestionsFromText(text: string): DraftQuestion[] {
  const sentences = text
    .split(/(?<=[.!?다요])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
  const words = uniqueWords(text);
  const first = sentences[0] ?? text.trim();
  const second = sentences[1] ?? first;
  const key = words[0] ?? "온도계";
  const alternatives = words.filter((word) => word !== key).slice(0, 3);
  while (alternatives.length < 3) alternatives.push(["자", "저울", "시계"][alternatives.length]);

  return [
    {
      questionId: "q1",
      type: "multiple",
      prompt: `다음 중 글의 핵심 낱말은 무엇인가요?`,
      options: [key, ...alternatives].slice(0, 4),
      answer: key,
      feedbackHints: ["본문에서 여러 번 사용된 낱말을 찾아보세요."],
      approved: false,
    },
    {
      questionId: "q2",
      type: "short",
      prompt: `빈칸에 들어갈 알맞은 낱말을 쓰세요. “${first.replace(key, "(        )")}"`,
      answer: key,
      acceptedAnswers: [key],
      feedbackHints: ["교과서 문장에서 빠진 낱말을 찾아보세요."],
      approved: false,
    },
    {
      questionId: "q3",
      type: "descriptive",
      prompt: "이 글에서 알 수 있는 내용을 한두 문장으로 설명하세요.",
      answer: second,
      modelAnswer: second,
      keywords: words.slice(0, 3),
      feedbackHints: ["핵심 낱말을 사용해 문장으로 설명해 보세요."],
      approved: false,
    },
  ];
}

export function browserName(): string {
  const agent = navigator.userAgent;
  if (agent.includes("Edg/")) return "Edge";
  if (agent.includes("Chrome/")) return "Chrome";
  if (agent.includes("Firefox/")) return "Firefox";
  if (agent.includes("Safari/")) return "Safari";
  return "기타 브라우저";
}

export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function isPuzzleSolved(order: number[]): boolean {
  return order.every((value, index) => value === index);
}

export function swapPuzzlePieces(order: number[], first: number, second: number): number[] {
  if (
    first < 0 ||
    second < 0 ||
    first >= order.length ||
    second >= order.length ||
    first === second
  ) {
    return [...order];
  }
  const next = [...order];
  [next[first], next[second]] = [next[second], next[first]];
  return next;
}

export function createPuzzleOrder(size: number, random: () => number = Math.random): number[] {
  const order = Array.from({ length: Math.max(2, size) }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  if (isPuzzleSolved(order)) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}
