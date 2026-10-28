import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import HandwritingPad from "../components/HandwritingPad";
import ImagePuzzle from "../components/ImagePuzzle";
import { deleteRecord, saveRecord } from "../db";
import type {
  AnswerResult,
  Lesson,
  PointerRecord,
  ReadingAttempt,
  Stroke,
  StudentProfile,
  StudentResult,
} from "../types";
import {
  assessAnswer,
  browserName,
  createReadingAttempt,
  downloadJson,
  makePseudonymousId,
} from "../utils";

type Stage = "setup" | "reading" | "quiz" | "result";

const emptyProfile: StudentProfile = {
  className: "",
  number: 0,
  pseudonymousId: "",
};

function StudentHeader({ title }: { title?: string }) {
  return (
    <header className="student-header">
      <Link to="/" className="brand small">
        <span className="brand-mark" aria-hidden="true">소</span>
        <span>소리책방</span>
      </Link>
      {title && <p>{title}</p>}
    </header>
  );
}

export default function StudentExperience() {
  const { lessonId = "" } = useParams();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loadError, setLoadError] = useState("");
  const [stage, setStage] = useState<Stage>("setup");
  const [profile, setProfile] = useState<StudentProfile>(emptyProfile);
  const [className, setClassName] = useState("5-2");
  const [number, setNumber] = useState("1");
  const [noticeChecked, setNoticeChecked] = useState(false);
  const [pointerChecked, setPointerChecked] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [attempts, setAttempts] = useState<ReadingAttempt[]>([]);
  const [lastAttempt, setLastAttempt] = useState<ReadingAttempt | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [inputMode, setInputMode] = useState<"handwriting" | "keyboard">("handwriting");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [answers, setAnswers] = useState<AnswerResult[]>([]);
  const [feedback, setFeedback] = useState<string[]>([]);
  const [pointerEvents, setPointerEvents] = useState<PointerRecord[]>([]);
  const [exportStatus, setExportStatus] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const celebrateRef = useRef<HTMLDialogElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const quizRef = useRef<HTMLDivElement>(null);
  const lastMoveRef = useRef(0);
  const startedAtRef = useRef(new Date().toISOString());

  const SpeechRecognitionApi =
    typeof window !== "undefined"
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition
      : undefined;
  const speechSupported = Boolean(SpeechRecognitionApi);

  useEffect(() => {
    fetch(`./lessons/${lessonId}/lesson.json`)
      .then((response) => {
        if (!response.ok) throw new Error("수업을 찾을 수 없습니다.");
        return response.json() as Promise<Lesson>;
      })
      .then((value) => {
        setLesson(value);
        setPointerChecked(value.pointerTrackingEnabled);
      })
      .catch(() => setLoadError("수업 자료를 열지 못했어요. 링크를 다시 확인해 주세요."));
  }, [lessonId]);

  useEffect(() => {
    const dialog = celebrateRef.current;
    if (stage === "result" && celebrating && dialog && !dialog.open) dialog.showModal();
  }, [stage, celebrating]);

  useEffect(() => {
    if (!lesson || !profile.pseudonymousId) return;
    void saveRecord(`progress:${lesson.lessonId}:${profile.pseudonymousId}`, {
      savedAt: new Date().toISOString(),
      stage,
      profile,
      attempts,
      answers,
      questionIndex,
    });
  }, [answers, attempts, lesson, profile, questionIndex, stage]);

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  const currentQuestion = lesson?.questions[questionIndex];
  const progress = lesson ? Math.round(((questionIndex + 1) / lesson.questions.length) * 100) : 0;

  const result = useMemo<StudentResult | null>(() => {
    if (!lesson || !profile.pseudonymousId) return null;
    return {
      schemaVersion: "1.0",
      lessonId: lesson.lessonId,
      lessonVersion: lesson.lessonVersion,
      contentHash: lesson.contentHash,
      student: profile,
      startedAt: startedAtRef.current,
      completedAt: new Date().toISOString(),
      client: {
        browser: browserName(),
        speechRecognitionSupported: speechSupported,
        pointerTrackingEnabled: pointerChecked,
      },
      reading: {
        threshold: lesson.readingThreshold,
        attempts,
      },
      answers,
      pointerEvents,
    };
  }, [answers, attempts, lesson, pointerChecked, pointerEvents, profile, speechSupported]);

  const startLesson = (event: React.FormEvent) => {
    event.preventDefault();
    const parsedNumber = Number(number);
    if (!className.trim() || !Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > 99) {
      setLoadError("반과 번호를 올바르게 입력해 주세요.");
      return;
    }
    if (!noticeChecked) {
      setLoadError("음성 처리와 가명 정보 안내를 먼저 확인해 주세요.");
      return;
    }
    setLoadError("");
    setProfile({
      className: className.trim(),
      number: parsedNumber,
      pseudonymousId: makePseudonymousId(),
    });
    startedAtRef.current = new Date().toISOString();
    setStage("reading");
  };

  const startListening = () => {
    if (!SpeechRecognitionApi) {
      setSpeechError("이 브라우저는 음성 인식을 지원하지 않아요. 아래 칸에 읽힌 문장을 직접 입력해 주세요.");
      return;
    }
    setSpeechError("");
    setTranscript("");
    const recognition = new SpeechRecognitionApi();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let value = "";
      for (let i = 0; i < event.results.length; i += 1) {
        value += `${event.results[i][0].transcript} `;
      }
      setTranscript(value.trim());
    };
    recognition.onerror = (event) => {
      setListening(false);
      setSpeechError(
        event.error === "not-allowed"
          ? "마이크 권한이 꺼져 있어요. 브라우저 주소창에서 권한을 허용하거나 직접 입력해 주세요."
          : "음성을 인식하지 못했어요. 다시 읽거나 직접 입력해 주세요.",
      );
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const finishReading = () => {
    if (!lesson || !transcript.trim()) {
      setSpeechError("인식된 문장이 없어요. 한 번 읽거나 문장을 직접 입력해 주세요.");
      return;
    }
    stopListening();
    const next = createReadingAttempt(lesson.readingText, transcript, attempts.length + 1);
    const nextAttempts = [...attempts, next];
    setAttempts(nextAttempts);
    setLastAttempt(next);
    if (next.score >= lesson.readingThreshold || nextAttempts.length >= lesson.maxReadingAttempts) {
      window.setTimeout(() => setStage("quiz"), 900);
    }
  };

  const retryReading = () => {
    setTranscript("");
    setLastAttempt(null);
    setSpeechError("");
  };

  const recordPointer = (event: React.PointerEvent, type: PointerRecord["type"]) => {
    if (!lesson?.pointerTrackingEnabled || !pointerChecked || !currentQuestion) return;
    const now = Date.now();
    if (type === "move" && now - lastMoveRef.current < 200) return;
    if (pointerEvents.length >= 12000 && type === "move") return;
    if (type === "move") lastMoveRef.current = now;
    const rect = quizRef.current?.getBoundingClientRect();
    if (!rect) return;
    const record: PointerRecord = {
      questionId: currentQuestion.questionId,
      type,
      x: Number(((event.clientX - rect.left) / rect.width).toFixed(3)),
      y: Number(((event.clientY - rect.top) / rect.height).toFixed(3)),
      t: now,
      pointerType: event.pointerType,
    };
    setPointerEvents((current) => [...current, record]);
  };

  const confirmAnswer = () => {
    if (!currentQuestion) return;
    const value = currentQuestion.type === "multiple" ? selectedOption : answerText;
    if (!value.trim()) {
      setFeedback(["답을 고르거나 입력해 주세요."]);
      return;
    }
    const resultPart = assessAnswer(
      currentQuestion,
      value,
      currentQuestion.type === "multiple" ? "choice" : inputMode,
    );
    const answer: AnswerResult = {
      questionId: currentQuestion.questionId,
      rawValue: value,
      confirmedText: value,
      ...(ocrText ? { ocrText } : {}),
      ...(inputMode === "handwriting" ? { strokes } : {}),
      ...resultPart,
    };
    setAnswers((current) => [...current, answer]);
    setFeedback(answer.feedback);
  };

  const nextQuestion = () => {
    if (!lesson) return;
    if (questionIndex >= lesson.questions.length - 1) {
      setStage("result");
      setCelebrating(true);
      return;
    }
    setQuestionIndex((current) => current + 1);
    setAnswerText("");
    setSelectedOption("");
    setStrokes([]);
    setOcrText("");
    setFeedback([]);
    setInputMode("handwriting");
  };

  const completePuzzle = (puzzle: {
    moves: number;
    hintViews: number;
    restarts: number;
    finalOrder: number[];
  }) => {
    if (!currentQuestion) return;
    if (answers.some((answer) => answer.questionId === currentQuestion.questionId)) return;
    const answer: AnswerResult = {
      questionId: currentQuestion.questionId,
      inputType: "puzzle",
      rawValue: "completed",
      confirmedText: "completed",
      correct: true,
      puzzleMoves: puzzle.moves,
      puzzleHintViews: puzzle.hintViews,
      puzzleRestarts: puzzle.restarts,
      puzzleFinalOrder: puzzle.finalOrder,
      feedback: ["그림을 원래 모습으로 완성했어요."],
    };
    setAnswers((current) => [...current, answer]);
    setFeedback(answer.feedback);
  };

  const exportResult = () => {
    if (!lesson || !result) return;
    downloadJson(
      result,
      `${lesson.lessonId}_${profile.className}-${profile.number}_${profile.pseudonymousId}.json`,
    );
    setExportStatus("결과 파일을 내려받았어요. 제출하기 전에 파일을 확인해 주세요.");
  };

  const copyResult = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setExportStatus("JSON 내용을 클립보드에 복사했어요.");
    } catch {
      setExportStatus("복사 권한이 꺼져 있어요. 파일 내려받기를 이용해 주세요.");
    }
  };

  const clearProgress = async () => {
    if (!lesson) return;
    await deleteRecord(`progress:${lesson.lessonId}:${profile.pseudonymousId}`);
    setExportStatus("이 기기에 저장된 진행 데이터를 지웠어요. 내려받은 JSON 파일은 유지됩니다.");
  };

  if (loadError && !lesson) {
    return (
      <div className="student-shell">
        <StudentHeader />
        <main className="center-page">
          <div className="notice error">{loadError}</div>
          <Link to="/" className="primary-button">첫 화면으로</Link>
        </main>
      </div>
    );
  }

  if (!lesson) {
    return <div className="loading-page">수업 자료를 펼치고 있어요…</div>;
  }

  if (stage === "setup") {
    return (
      <div className="student-shell">
        <StudentHeader title={`${lesson.grade}학년 ${lesson.subject}`} />
        <main className="setup-page">
          <section className="setup-intro">
            <p>{lesson.unit}</p>
            <h1>{lesson.title}</h1>
            <p className="reading-summary">교과서를 읽고 {lesson.questions.length}문제를 풀어요.</p>
          </section>
          <form className="setup-form" onSubmit={startLesson}>
            <h2>학습 정보를 입력하세요</h2>
            <div className="field-grid">
              <label>
                반
                <input value={className} onChange={(event) => setClassName(event.target.value)} placeholder="예: 5-2" />
              </label>
              <label>
                번호
                <input type="number" min="1" max="99" value={number} onChange={(event) => setNumber(event.target.value)} />
              </label>
            </div>
            <div className="privacy-note">
              <strong>시작하기 전에 확인하세요</strong>
              <p>이름은 받지 않지만 반·번호로 학생을 구분할 수 있어 완전한 익명은 아닙니다.</p>
              <p>앱은 음성 파일을 저장하지 않지만 브라우저의 음성 인식 서비스에서 처리될 수 있습니다.</p>
              <label className="check-row">
                <input type="checkbox" checked={noticeChecked} onChange={(event) => setNoticeChecked(event.target.checked)} />
                안내 내용을 확인했습니다.
              </label>
              {lesson.pointerTrackingEnabled && (
                <label className="check-row">
                  <input type="checkbox" checked={pointerChecked} onChange={(event) => setPointerChecked(event.target.checked)} />
                  문제 화면의 마우스·터치 이동 기록에 동의합니다. 선택하지 않아도 학습할 수 있습니다.
                </label>
              )}
            </div>
            {loadError && <div className="notice error">{loadError}</div>}
            <div className="capability-row">
              <span className={speechSupported ? "status-good" : "status-warn"}>
                {speechSupported ? "● 음성 인식 사용 가능" : "▲ 음성 인식 미지원 · 직접 입력 가능"}
              </span>
              <span>● 손글씨·키보드 입력 가능</span>
            </div>
            <button className="primary-button wide" type="submit">학습 시작하기</button>
          </form>
        </main>
      </div>
    );
  }

  if (stage === "reading") {
    const page = lesson.pages[lesson.pages.length - 1];
    return (
      <div className="student-shell">
        <StudentHeader title={`읽기 ${attempts.length + 1}/${lesson.maxReadingAttempts}`} />
        <main className="reading-page">
          <section className="book-panel">
            <div className="book-toolbar">
              <span>{lesson.subject} {page.pageNumber}쪽</span>
              <span>노란 문장을 읽어 보세요</span>
            </div>
            {page.asset.toLowerCase().endsWith(".pdf") ? (
              <object
                className="pdf-page"
                data={`./${page.asset}#page=${page.pageNumber}`}
                type="application/pdf"
                aria-label={`${lesson.title} 교과서 PDF`}
              >
                <p>PDF를 표시할 수 없어요. 교사가 제공한 원문을 읽어 주세요.</p>
              </object>
            ) : (
              <img src={`./${page.asset}`} alt={`${lesson.title} 교과서 ${page.pageNumber}쪽`} />
            )}
          </section>
          <section className="voice-panel">
            <div className="voice-state">
              <span className={listening ? "mic-dot active" : "mic-dot"} aria-hidden="true" />
              <div>
                <strong>{listening ? "듣고 있어요" : "읽을 준비가 됐어요"}</strong>
                <p>음성 파일은 앱에 저장하지 않아요.</p>
              </div>
            </div>
            <blockquote>{lesson.readingText}</blockquote>
            <div className="voice-actions">
              {!listening ? (
                <button className="primary-button" type="button" onClick={startListening}>읽기 시작</button>
              ) : (
                <button className="stop-button" type="button" onClick={stopListening}>읽기 멈추기</button>
              )}
            </div>
            <label className="transcript-field">
              지금까지 읽힌 내용
              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                placeholder="음성 인식 결과가 여기에 나타납니다. 다르게 인식되면 직접 고칠 수 있어요."
              />
            </label>
            {speechError && <div className="notice warning">{speechError}</div>}
            {lastAttempt ? (
              <div className={lastAttempt.score >= lesson.readingThreshold ? "score-card pass" : "score-card retry"}>
                <strong>{lastAttempt.score}%</strong>
                <p>
                  {lastAttempt.score >= lesson.readingThreshold
                    ? "기준을 넘었어요. 문제로 이동합니다."
                    : "70%보다 낮아요. 빠진 부분을 보고 한 번 더 읽어 보세요."}
                </p>
                {lastAttempt.missingWords.length > 0 && (
                  <p className="missing-words">다시 볼 낱말: {lastAttempt.missingWords.slice(0, 8).join(", ")}</p>
                )}
                {lastAttempt.score < lesson.readingThreshold && attempts.length < lesson.maxReadingAttempts && (
                  <button type="button" className="secondary-button" onClick={retryReading}>한 번 더 읽기</button>
                )}
              </div>
            ) : (
              <button type="button" className="secondary-button wide" onClick={finishReading}>읽기 결과 확인</button>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (stage === "quiz" && currentQuestion) {
    const alreadyAnswered = answers.some((answer) => answer.questionId === currentQuestion.questionId);
    return (
      <div className="student-shell">
        <StudentHeader title={`문제 ${questionIndex + 1}/${lesson.questions.length}`} />
        <main
          ref={quizRef}
          className="quiz-page"
          onPointerMove={(event) => recordPointer(event, "move")}
          onPointerDown={(event) => recordPointer(event, "down")}
          onPointerUp={(event) => recordPointer(event, "up")}
        >
          <div className="progress-line" aria-label={`진행률 ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <section className="question-panel">
            <div className="question-meta">
              <span>
                {currentQuestion.type === "multiple"
                  ? "객관식"
                  : currentQuestion.type === "short"
                    ? "단답형"
                    : currentQuestion.type === "puzzle"
                      ? "이미지 퍼즐"
                      : "서술형"}
              </span>
              <span>{progress}% 진행</span>
            </div>
            <h1>{currentQuestion.prompt}</h1>
            {currentQuestion.type === "puzzle" ? (
              currentQuestion.puzzleImage ? (
                <ImagePuzzle
                  image={`./${currentQuestion.puzzleImage}`}
                  alt={currentQuestion.puzzleAlt ?? "교과서 그림"}
                  rows={currentQuestion.puzzleRows}
                  columns={currentQuestion.puzzleColumns}
                  onComplete={completePuzzle}
                />
              ) : (
                <div className="notice error">퍼즐 이미지가 없어요. 교사에게 알려 주세요.</div>
              )
            ) : currentQuestion.type === "multiple" ? (
              <div className="option-list">
                {currentQuestion.options?.map((option) => (
                  <label className={selectedOption === option ? "option selected" : "option"} key={option}>
                    <input
                      type="radio"
                      name="answer"
                      value={option}
                      checked={selectedOption === option}
                      onChange={(event) => setSelectedOption(event.target.value)}
                      disabled={alreadyAnswered}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="answer-workspace">
                <div className="mode-tabs" role="tablist" aria-label="답안 입력 방법">
                  <button type="button" className={inputMode === "handwriting" ? "active" : ""} onClick={() => setInputMode("handwriting")}>손글씨</button>
                  <button type="button" className={inputMode === "keyboard" ? "active" : ""} onClick={() => setInputMode("keyboard")}>키보드</button>
                </div>
                {inputMode === "handwriting" && !alreadyAnswered && (
                  <HandwritingPad
                    onStrokesChange={setStrokes}
                    onRecognized={(text) => {
                      setOcrText(text);
                      setAnswerText(text);
                    }}
                  />
                )}
                <label className="confirmed-answer">
                  {inputMode === "handwriting" ? "읽힌 답을 확인하고 고쳐 주세요" : "답을 입력하세요"}
                  <textarea
                    value={answerText}
                    onChange={(event) => setAnswerText(event.target.value)}
                    disabled={alreadyAnswered}
                    placeholder="한두 문장으로 작성해도 좋아요."
                  />
                </label>
              </div>
            )}
            {feedback.length > 0 && (
              <div className="feedback-box" role="status">
                <strong>답을 살펴봤어요</strong>
                {feedback.map((item) => <p key={item}>{item}</p>)}
              </div>
            )}
            <div className="question-actions">
              {currentQuestion.type === "puzzle" && !alreadyAnswered ? null : !alreadyAnswered ? (
                <button type="button" className="primary-button" onClick={confirmAnswer}>답 확인하기</button>
              ) : (
                <button type="button" className="primary-button" onClick={nextQuestion}>
                  {questionIndex === lesson.questions.length - 1 ? "학습 결과 보기" : "다음 문제"}
                </button>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="student-shell">
      <StudentHeader title="학습 완료" />
      <main className="result-page">
        <section className="result-sheet">
          <div className="completion-mark" aria-hidden="true">✓</div>
          <p>{profile.className}반 {profile.number}번 · {profile.pseudonymousId}</p>
          <h1>오늘 학습을 마쳤어요</h1>
          <div className="result-summary">
            <div><strong>{Math.max(...attempts.map((item) => item.score), 0)}%</strong><span>가장 높은 읽기 일치율</span></div>
            <div><strong>{answers.length}</strong><span>완료한 문제</span></div>
            <div><strong>{pointerEvents.length}</strong><span>저장된 위치 기록</span></div>
          </div>
          <div className="result-notice">
            결과는 이 기기에만 있습니다. 파일을 내려받거나 JSON 내용을 복사해 교사가 안내한 곳에 제출하세요.
          </div>
          <div className="export-actions">
            <button type="button" className="primary-button" onClick={exportResult}>JSON 파일 내려받기</button>
            <button type="button" className="secondary-button" onClick={copyResult}>JSON 내용 복사</button>
            <button type="button" className="text-button" onClick={clearProgress}>기기 임시 데이터 지우기</button>
          </div>
          {exportStatus && <p className="inline-status" role="status">{exportStatus}</p>}
          <Link to="/" className="back-link">다른 수업 보기</Link>
        </section>
      </main>
      <dialog
        ref={celebrateRef}
        className="celebrate-dialog"
        aria-labelledby="celebrate-title"
        onClose={() => setCelebrating(false)}
      >
        <div className="celebrate-burst" aria-hidden="true">🎉</div>
        <h2 id="celebrate-title">학습을 다 마쳤습니다.</h2>
        <p>축하합니다!</p>
        <form method="dialog">
          <button type="submit" className="primary-button" autoFocus>
            확인
          </button>
        </form>
      </dialog>
    </div>
  );
}
