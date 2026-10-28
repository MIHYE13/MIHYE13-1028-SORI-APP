import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import JSZip from "jszip";
import { saveRecord } from "../db";
import type { DraftQuestion, Lesson, QuestionType } from "../types";
import { generateQuestionsFromText } from "../utils";
import { recognizeKoreanText } from "../ocr";

const DEMO_PASSWORD = "teacher";

function safeFilename(name: string): string {
  return name.replace(/[^0-9a-zA-Z가-힣._-]/g, "-");
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^0-9a-z가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || `lesson-${Date.now()}`;
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function extractPdfText(
  file: File,
  onProgress: (message: string) => void,
  requestedStart: number,
  requestedEnd: number,
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  const start = Math.max(1, Math.min(requestedStart, document.numPages));
  const end = Math.max(start, Math.min(requestedEnd, document.numPages));
  for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
    onProgress(`PDF ${pageNumber}쪽을 읽고 있어요. 선택 범위 ${start}~${end}쪽`);
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(`[${pageNumber}쪽]\n${text}`);
  }
  return pages.join("\n\n");
}

async function extractImageText(file: File, onProgress: (message: string) => void): Promise<string> {
  return recognizeKoreanText(file, (_message, progress) => {
    onProgress(`이미지 글자를 읽고 있어요.${typeof progress === "number" ? ` ${progress}%` : ""}`);
  });
}

function TeacherHeader() {
  return (
    <header className="teacher-header">
      <Link to="/" className="brand small">
        <span className="brand-mark" aria-hidden="true">소</span>
        <span>소리책방</span>
      </Link>
      <div>
        <span>교사용 제작실</span>
        <Link to="/">학생 화면 보기</Link>
      </div>
    </header>
  );
}

export default function TeacherStudio() {
  const [unlocked, setUnlocked] = useState(sessionStorage.getItem("teacher-unlocked") === "yes");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [title, setTitle] = useState("새 과학 수업");
  const [subject, setSubject] = useState("과학");
  const [grade, setGrade] = useState("5");
  const [unit, setUnit] = useState("새 차시");
  const [lessonId, setLessonId] = useState("science5-new-lesson");
  const [files, setFiles] = useState<File[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [pointerTracking, setPointerTracking] = useState(false);
  const [rightsChecked, setRightsChecked] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [pdfPageStart, setPdfPageStart] = useState("1");
  const [pdfPageEnd, setPdfPageEnd] = useState("12");

  useEffect(() => {
    if (!unlocked) return;
    void saveRecord("teacher:draft", {
      savedAt: new Date().toISOString(),
      title,
      subject,
      grade,
      unit,
      lessonId,
      extractedText,
      questions,
      pointerTracking,
    });
  }, [extractedText, grade, lessonId, pointerTracking, questions, subject, title, unit, unlocked]);

  const approvedCount = questions.filter((question) => question.approved).length;
  const puzzleQuestionsReady = questions.every(
    (question) =>
      question.type !== "puzzle" ||
      Boolean(
        question.puzzleImage &&
          question.puzzleAlt?.trim() &&
          question.puzzleRows &&
          question.puzzleColumns,
      ),
  );
  const canExport = useMemo(
    () =>
      rightsChecked &&
      files.length > 0 &&
      extractedText.trim().length > 20 &&
      questions.length > 0 &&
      approvedCount === questions.length &&
      puzzleQuestionsReady,
    [approvedCount, extractedText, files.length, puzzleQuestionsReady, questions.length, rightsChecked],
  );

  const unlock = (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== DEMO_PASSWORD) {
      setLoginError("비밀번호가 맞지 않아요.");
      return;
    }
    sessionStorage.setItem("teacher-unlocked", "yes");
    setUnlocked(true);
  };

  const chooseFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const allowed = selected.filter((file) => /\.(pdf|png|jpe?g)$/i.test(file.name));
    const oversized = allowed.filter((file) => file.size > 30 * 1024 * 1024);
    if (oversized.length) {
      setStatus(`30MB를 넘는 파일은 제외했어요: ${oversized.map((file) => file.name).join(", ")}`);
    }
    const accepted = allowed.filter((file) => file.size <= 30 * 1024 * 1024);
    setFiles(accepted);
    if (accepted[0]) {
      const base = accepted[0].name.replace(/\.[^.]+$/, "");
      setLessonId(slugify(`${subject}${grade}-${base}`));
    }
    setActiveStep(2);
  };

  const extractText = async () => {
    if (!files.length) {
      setStatus("먼저 PDF 또는 이미지 파일을 선택해 주세요.");
      return;
    }
    setBusy(true);
    setStatus("교재를 확인하고 있어요.");
    try {
      const chunks: string[] = [];
      for (const file of files) {
        setStatus(`${file.name}을(를) 처리하고 있어요.`);
        const text = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
          ? await extractPdfText(
              file,
              setStatus,
              Math.max(1, Number(pdfPageStart) || 1),
              Math.max(1, Number(pdfPageEnd) || 12),
            )
          : await extractImageText(file, setStatus);
        chunks.push(`[파일: ${file.name}]\n${text}`);
      }
      setExtractedText(chunks.join("\n\n"));
      setStatus("글자를 읽었어요. 잘못 읽힌 부분을 직접 고쳐 주세요.");
      setActiveStep(3);
    } catch {
      setStatus("글자를 읽지 못했어요. 교재 본문을 아래 칸에 직접 붙여 넣어 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const createQuestions = () => {
    if (extractedText.trim().length < 20) {
      setStatus("문제를 만들 본문을 20자 이상 입력해 주세요.");
      return;
    }
    setQuestions(generateQuestionsFromText(extractedText));
    setActiveStep(4);
    setStatus("문제 초안을 만들었어요. 모든 문제를 확인하고 승인해 주세요.");
  };

  const addPuzzleQuestion = () => {
    const image = files.find((file) => /\.(png|jpe?g)$/i.test(file.name));
    if (!image) {
      setStatus("이미지 퍼즐에는 JPG·JPEG·PNG 파일이 필요해요. 교재 선택에서 그림 파일을 추가해 주세요.");
      return;
    }
    setQuestions((current) => [
      ...current,
      {
        questionId: `q${current.length + 1}`,
        type: "puzzle",
        prompt: "교과서 그림을 원래 모습으로 맞춰 보세요.",
        answer: "completed",
        puzzleImage: `assets/${safeFilename(image.name)}`,
        puzzleAlt: "",
        puzzleRows: 2,
        puzzleColumns: 3,
        feedbackHints: ["그림의 선과 색이 이어지는 부분을 찾아보세요."],
        approved: false,
      },
    ]);
    setStatus("이미지 퍼즐 문제를 추가했어요. 그림 설명과 난이도를 확인해 주세요.");
    setActiveStep(4);
  };

  const updateQuestion = <K extends keyof DraftQuestion>(
    index: number,
    key: K,
    value: DraftQuestion[K],
  ) => {
    setQuestions((current) =>
      current.map((question, questionIndex) =>
        questionIndex === index
          ? {
              ...question,
              [key]: value,
              approved: key === "approved" ? Boolean(value) : false,
            }
          : question,
      ),
    );
  };

  const exportPackage = async () => {
    if (!canExport) {
      setStatus("자료 사용 권한, 본문, 문제 승인 상태를 모두 확인해 주세요.");
      return;
    }
    setBusy(true);
    setStatus("수업 패키지를 만들고 있어요.");
    try {
      const hashes = await Promise.all(files.map(sha256));
      const cleanQuestions = questions.map(({ approved: _approved, ...question }) =>
        question.type === "puzzle" && question.puzzleImage
          ? {
              ...question,
              puzzleImage: `lessons/${lessonId}/${question.puzzleImage}`,
            }
          : question,
      );
      const contentHash = hashes.join("-").slice(0, 64);
      const lesson: Lesson = {
        schemaVersion: "1.0",
        lessonId,
        lessonVersion: 1,
        contentHash,
        title,
        subject,
        grade: Number(grade),
        unit,
        status: "published",
        readingThreshold: 70,
        maxReadingAttempts: 2,
        pointerTrackingEnabled: pointerTracking,
        pages: files.map((file, index) => ({
          pageId: `p${index + 1}`,
          pageNumber: index + 1,
          asset: `lessons/${lessonId}/assets/${safeFilename(file.name)}`,
          text: extractedText,
        })),
        readingText: extractedText
          .replace(/^\[.*?\]\s*/gm, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 600),
        questions: cleanQuestions,
      };

      const zip = new JSZip();
      zip.file("lesson.json", JSON.stringify(lesson, null, 2));
      const assets = zip.folder("assets");
      files.forEach((file) => assets?.file(safeFilename(file.name), file));
      zip.file(
        "업로드_안내.txt",
        `이 폴더를 public/lessons/${lessonId}/에 업로드하세요.\n원본 전체가 공개될 수 있으므로 배포 권한을 다시 확인하세요.`,
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${lessonId}-v1.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus("수업 패키지를 내려받았어요. GitHub의 해당 차시 폴더에 올려 주세요.");
      setActiveStep(5);
    } catch {
      setStatus("패키지를 만들지 못했어요. 파일 크기와 브라우저 저장 공간을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (!unlocked) {
    return (
      <div className="teacher-shell">
        <TeacherHeader />
        <main className="teacher-login">
          <form onSubmit={unlock}>
            <p className="unit-note">교사용 화면 구분</p>
            <h1>수업 제작실 열기</h1>
            <p>이 비밀번호는 화면을 구분할 뿐, 실제 보안 기능은 아닙니다.</p>
            <label>
              교사용 비밀번호
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
            </label>
            {loginError && <div className="notice error">{loginError}</div>}
            <button className="primary-button wide" type="submit">제작실 열기</button>
            <p className="demo-hint">초기 데모 비밀번호: <code>teacher</code></p>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="teacher-shell">
      <TeacherHeader />
      <main className="studio-page">
        <aside className="studio-sidebar">
          <h1>수업 만들기</h1>
          <ol>
            {["수업 정보", "교재 선택", "본문 확인", "문제 검토", "내보내기"].map((label, index) => (
              <li key={label} className={activeStep === index + 1 ? "active" : activeStep > index + 1 ? "done" : ""}>
                <span>{activeStep > index + 1 ? "✓" : index + 1}</span>{label}
              </li>
            ))}
          </ol>
          <div className="studio-warning">
            <strong>공개 전 확인</strong>
            <p>GitHub Pages에 올린 교재와 정답은 누구나 볼 수 있습니다.</p>
            <p>문제 생성은 브라우저에서 실행되어 AI API 크레딧을 사용하지 않습니다.</p>
          </div>
        </aside>

        <div className="studio-content">
          <section className="studio-section">
            <div className="studio-section-heading"><span>1</span><div><h2>수업 정보</h2><p>차시를 구분할 이름을 정하세요.</p></div></div>
            <div className="form-grid">
              <label>수업 제목<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label>단원<input value={unit} onChange={(event) => setUnit(event.target.value)} /></label>
              <label>과목<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
              <label>학년<input type="number" min="1" max="12" value={grade} onChange={(event) => setGrade(event.target.value)} /></label>
              <label className="span-two">수업 ID<input value={lessonId} onChange={(event) => setLessonId(slugify(event.target.value))} /><small>영문·숫자·하이픈 사용을 권장합니다.</small></label>
            </div>
          </section>

          <section className="studio-section">
            <div className="studio-section-heading"><span>2</span><div><h2>교재 선택</h2><p>현재 폴더에서 PDF·JPG·PNG를 선택하세요.</p></div></div>
            <label className="file-drop">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple onChange={chooseFiles} />
              <strong>{files.length ? `${files.length}개 파일을 선택했어요` : "교재 파일 고르기"}</strong>
              <span>파일당 최대 30MB · 원본은 자동 게시되지 않아요</span>
            </label>
            {files.length > 0 && (
              <ul className="file-list">
                {files.map((file) => <li key={`${file.name}-${file.size}`}><span>{file.name}</span><small>{(file.size / 1024 / 1024).toFixed(1)}MB</small></li>)}
              </ul>
            )}
            {files.some((file) => /\.pdf$/i.test(file.name)) && (
              <div className="pdf-range-fields">
                <label>
                  PDF 시작쪽
                  <input
                    type="number"
                    min="1"
                    value={pdfPageStart}
                    onChange={(event) => setPdfPageStart(event.target.value)}
                  />
                </label>
                <label>
                  PDF 끝쪽
                  <input
                    type="number"
                    min="1"
                    value={pdfPageEnd}
                    onChange={(event) => setPdfPageEnd(event.target.value)}
                  />
                </label>
                <p>필요한 쪽만 처리하면 OCR 시간과 메모리 사용을 줄일 수 있어요. 기본값은 1~12쪽입니다.</p>
              </div>
            )}
            <label className="check-row rights-check">
              <input type="checkbox" checked={rightsChecked} onChange={(event) => setRightsChecked(event.target.checked)} />
              이 자료를 학생에게 배포할 권한이 있으며 필요한 최소 분량만 포함했습니다.
            </label>
            <button type="button" className="secondary-button" onClick={extractText} disabled={busy || !files.length}>교재 글자 읽기</button>
          </section>

          <section className="studio-section">
            <div className="studio-section-heading"><span>3</span><div><h2>본문 확인</h2><p>잘못 읽힌 글자를 고친 뒤 문제를 만드세요.</p></div></div>
            <textarea className="source-editor" value={extractedText} onChange={(event) => setExtractedText(event.target.value)} placeholder="교재에서 읽힌 글자가 여기에 나타납니다. OCR이 실패하면 본문을 직접 붙여 넣을 수 있어요." />
            <div className="editor-footer"><span>{extractedText.length.toLocaleString()}자</span><button type="button" className="secondary-button" onClick={createQuestions} disabled={busy}>문제 초안 만들기</button></div>
          </section>

          <section className="studio-section">
            <div className="studio-section-heading"><span>4</span><div><h2>문제 검토</h2><p>자동 생성된 문제는 교사가 모두 확인해야 합니다.</p></div></div>
            <div className="question-editor-tools">
              <button type="button" className="secondary-button" onClick={addPuzzleQuestion}>
                이미지 퍼즐 문제 추가
              </button>
              <span>JPG·PNG 교재 그림이 필요합니다.</span>
            </div>
            {questions.length === 0 ? (
              <div className="empty-state">본문을 확인한 뒤 문제 초안을 만들어 주세요.</div>
            ) : (
              <div className="question-editor-list">
                {questions.map((question, index) => (
                  <article className={question.approved ? "question-editor approved" : "question-editor"} key={question.questionId}>
                    <div className="question-editor-head">
                      <select value={question.type} onChange={(event) => updateQuestion(index, "type", event.target.value as QuestionType)}>
                        <option value="multiple">객관식</option>
                        <option value="short">단답형</option>
                        <option value="descriptive">서술형</option>
                        <option value="puzzle">이미지 퍼즐</option>
                      </select>
                      <label className="check-row"><input type="checkbox" checked={question.approved} onChange={(event) => updateQuestion(index, "approved", event.target.checked)} />검토 완료</label>
                    </div>
                    <label>질문<textarea value={question.prompt} onChange={(event) => updateQuestion(index, "prompt", event.target.value)} /></label>
                    {question.type !== "puzzle" && (
                      <label>정답 또는 모범 답안<textarea value={question.answer} onChange={(event) => updateQuestion(index, "answer", event.target.value)} /></label>
                    )}
                    {question.type === "multiple" && (
                      <label>보기(쉼표로 구분)<input value={question.options?.join(", ") ?? ""} onChange={(event) => updateQuestion(index, "options", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label>
                    )}
                    {question.type === "descriptive" && (
                      <label>핵심어(쉼표로 구분)<input value={question.keywords?.join(", ") ?? ""} onChange={(event) => updateQuestion(index, "keywords", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label>
                    )}
                    {question.type === "puzzle" && (
                      <div className="puzzle-editor-fields">
                        <label>
                          퍼즐 이미지
                          <select
                            value={question.puzzleImage ?? ""}
                            onChange={(event) => updateQuestion(index, "puzzleImage", event.target.value)}
                          >
                            <option value="">이미지를 선택하세요</option>
                            {files
                              .filter((file) => /\.(png|jpe?g)$/i.test(file.name))
                              .map((file) => (
                                <option value={`assets/${safeFilename(file.name)}`} key={file.name}>
                                  {file.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          그림 대체 설명
                          <input
                            value={question.puzzleAlt ?? ""}
                            onChange={(event) => updateQuestion(index, "puzzleAlt", event.target.value)}
                            placeholder="예: 여러 온도계로 온도를 측정하는 그림"
                          />
                        </label>
                        <label>
                          난이도
                          <select
                            value={`${question.puzzleRows ?? 2}x${question.puzzleColumns ?? 3}`}
                            onChange={(event) => {
                              const [rows, columns] = event.target.value.split("x").map(Number);
                              setQuestions((current) =>
                                current.map((item, questionIndex) =>
                                  questionIndex === index
                                    ? { ...item, puzzleRows: rows, puzzleColumns: columns, approved: false }
                                    : item,
                                ),
                              );
                            }}
                          >
                            <option value="2x2">쉬움 · 2×2</option>
                            <option value="2x3">보통 · 2×3</option>
                            <option value="3x3">어려움 · 3×3</option>
                          </select>
                        </label>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
            <p className="approval-count">문제 승인 {approvedCount}/{questions.length}</p>
          </section>

          <section className="studio-section export-section">
            <div className="studio-section-heading"><span>5</span><div><h2>수업 내보내기</h2><p>학생에게 공유할 수업 패키지를 만듭니다.</p></div></div>
            <label className="check-row"><input type="checkbox" checked={pointerTracking} onChange={(event) => setPointerTracking(event.target.checked)} />문제 화면에서 포인터 이동을 기록합니다.</label>
            <div className="export-checks">
              <span className={rightsChecked ? "ok" : ""}>{rightsChecked ? "✓" : "·"} 자료 권한 확인</span>
              <span className={files.length ? "ok" : ""}>{files.length ? "✓" : "·"} 교재 선택</span>
              <span className={extractedText.length > 20 ? "ok" : ""}>{extractedText.length > 20 ? "✓" : "·"} 본문 확인</span>
              <span className={questions.length > 0 && approvedCount === questions.length ? "ok" : ""}>{questions.length > 0 && approvedCount === questions.length ? "✓" : "·"} 문제 승인</span>
              <span className={puzzleQuestionsReady ? "ok" : ""}>{puzzleQuestionsReady ? "✓" : "·"} 퍼즐 이미지·설명</span>
            </div>
            <button type="button" className="primary-button wide" disabled={!canExport || busy} onClick={exportPackage}>수업 패키지 ZIP 내려받기</button>
            {status && <p className="inline-status" role="status">{status}</p>}
          </section>
        </div>
      </main>
    </div>
  );
}
