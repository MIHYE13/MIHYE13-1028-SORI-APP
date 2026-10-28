export type QuestionType = "multiple" | "short" | "descriptive" | "puzzle";

export interface LessonPage {
  pageId: string;
  pageNumber: number;
  asset: string;
  text: string;
}

export interface LessonQuestion {
  questionId: string;
  type: QuestionType;
  prompt: string;
  options?: string[];
  answer: string;
  acceptedAnswers?: string[];
  modelAnswer?: string;
  keywords?: string[];
  feedbackHints?: string[];
  puzzleImage?: string;
  puzzleAlt?: string;
  puzzleRows?: number;
  puzzleColumns?: number;
}

export interface Lesson {
  schemaVersion: "1.0";
  lessonId: string;
  lessonVersion: number;
  contentHash: string;
  title: string;
  subject: string;
  grade: number;
  unit: string;
  status: "draft" | "published" | "archived";
  readingThreshold: number;
  maxReadingAttempts: number;
  pointerTrackingEnabled: boolean;
  pages: LessonPage[];
  readingText: string;
  questions: LessonQuestion[];
}

export interface LessonIndexItem {
  lessonId: string;
  title: string;
  subject: string;
  grade: number;
  unit: string;
  version: number;
  status: "published";
  path: string;
}

export interface ReadingAttempt {
  attempt: number;
  recognizedText: string;
  score: number;
  missingWords: string[];
  differentWords: string[];
  createdAt: string;
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  t: number;
}

export interface Stroke {
  points: StrokePoint[];
}

export interface PointerRecord {
  questionId: string;
  type: "move" | "down" | "up";
  x: number;
  y: number;
  t: number;
  pointerType: string;
}

export interface AnswerResult {
  questionId: string;
  inputType: "choice" | "handwriting" | "keyboard" | "puzzle";
  rawValue: string;
  ocrText?: string;
  confirmedText: string;
  strokes?: Stroke[];
  correct?: boolean;
  keywordScore?: number;
  similarityScore?: number;
  feedback: string[];
  puzzleMoves?: number;
  puzzleHintViews?: number;
  puzzleRestarts?: number;
  puzzleFinalOrder?: number[];
}

export interface StudentProfile {
  className: string;
  number: number;
  pseudonymousId: string;
}

export interface StudentResult {
  schemaVersion: "1.0";
  lessonId: string;
  lessonVersion: number;
  contentHash: string;
  student: StudentProfile;
  startedAt: string;
  completedAt: string;
  client: {
    browser: string;
    speechRecognitionSupported: boolean;
    pointerTrackingEnabled: boolean;
  };
  reading: {
    threshold: number;
    attempts: ReadingAttempt[];
  };
  answers: AnswerResult[];
  pointerEvents: PointerRecord[];
}

export interface DraftQuestion extends LessonQuestion {
  approved: boolean;
}
