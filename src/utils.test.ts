import { describe, expect, it } from "vitest";
import {
  assessAnswer,
  createPuzzleOrder,
  generateQuestionsFromText,
  isPuzzleSolved,
  levenshteinSimilarity,
  normalizeKoreanText,
  readingScore,
  swapPuzzlePieces,
} from "./utils";
import type { LessonQuestion } from "./types";

describe("normalizeKoreanText", () => {
  it("문장부호와 중복 공백을 제거한다", () => {
    expect(normalizeKoreanText("온도계는,  정확합니다! ")).toBe("온도계는 정확합니다");
  });
});

describe("readingScore", () => {
  it("같은 문장은 100점이다", () => {
    expect(readingScore("물체의 온도를 측정합니다.", "물체의 온도를 측정합니다").score).toBe(100);
  });

  it("네 어절 중 하나가 빠지면 75점이다", () => {
    const result = readingScore("온도계로 물체의 온도를 정확하게", "온도계로 물체의 온도를");
    expect(result.score).toBe(75);
    expect(result.missingWords).toEqual(["정확하게"]);
  });

  it("단어 순서를 바꾸면 정확하게 읽은 것으로 보지 않는다", () => {
    expect(readingScore("가 나 다 라", "라 다 나 가").score).toBe(25);
  });
});

describe("answer assessment", () => {
  it("단답형의 허용 답안을 채점한다", () => {
    const question: LessonQuestion = {
      questionId: "q1",
      type: "short",
      prompt: "물체의 따뜻한 정도는?",
      answer: "온도",
      acceptedAnswers: ["온도"],
    };
    expect(assessAnswer(question, "온도!", "keyboard").correct).toBe(true);
  });

  it("서술형 핵심어 비율과 유사도를 반환한다", () => {
    const question: LessonQuestion = {
      questionId: "q2",
      type: "descriptive",
      prompt: "설명하세요",
      answer: "정확하고 안전하게 측정합니다",
      modelAnswer: "정확하고 안전하게 측정합니다",
      keywords: ["정확", "안전"],
    };
    const result = assessAnswer(question, "정확하고 안전하게 측정합니다", "keyboard");
    expect(result.keywordScore).toBe(1);
    expect(result.similarityScore).toBe(1);
  });
});

describe("question generation", () => {
  it("세 가지 유형의 초안을 만든다", () => {
    const questions = generateQuestionsFromText(
      "온도계는 물체의 온도를 정확하게 측정합니다. 상황에 맞는 온도계를 사용하면 안전합니다.",
    );
    expect(questions).toHaveLength(3);
    expect(questions.map((question) => question.type)).toEqual([
      "multiple",
      "short",
      "descriptive",
    ]);
    expect(questions.every((question) => question.approved === false)).toBe(true);
  });
});

describe("levenshteinSimilarity", () => {
  it("같은 문장의 유사도는 1이다", () => {
    expect(levenshteinSimilarity("생활이 안전합니다.", "생활이 안전합니다")).toBe(1);
  });
});

describe("image puzzle", () => {
  it("처음부터 완성된 배열을 만들지 않는다", () => {
    const order = createPuzzleOrder(6, () => 0.99);
    expect(order).toHaveLength(6);
    expect(isPuzzleSolved(order)).toBe(false);
  });

  it("두 조각의 위치를 교환한다", () => {
    expect(swapPuzzlePieces([0, 1, 2, 3], 0, 3)).toEqual([3, 1, 2, 0]);
  });

  it("모든 조각이 제자리이면 완성이다", () => {
    expect(isPuzzleSolved([0, 1, 2, 3])).toBe(true);
    expect(isPuzzleSolved([0, 2, 1, 3])).toBe(false);
  });
});
