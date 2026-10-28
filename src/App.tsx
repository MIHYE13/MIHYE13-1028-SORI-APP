import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import StudentExperience from "./student/StudentExperience";
import TeacherStudio from "./teacher/TeacherStudio";
import type { LessonIndexItem } from "./types";

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="소리책방 첫 화면">
      <span className="brand-mark" aria-hidden="true">소</span>
      <span>소리책방</span>
    </Link>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Brand />
        <nav aria-label="주요 메뉴">
          <Link to="/teacher" className="teacher-link">교사용</Link>
        </nav>
      </header>
      {children}
      <footer className="site-footer">
        <p>이름은 수집하지 않습니다. 수업 결과는 학생이 직접 내려받습니다.</p>
      </footer>
    </div>
  );
}

function Home() {
  const [lessons, setLessons] = useState<LessonIndexItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("./lessons/index.json")
      .then((response) => {
        if (!response.ok) throw new Error("수업 목록을 열 수 없습니다.");
        return response.json() as Promise<LessonIndexItem[]>;
      })
      .then(setLessons)
      .catch(() => setError("수업 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
  }, []);

  return (
    <Layout>
      <main>
        <section className="home-hero">
          <div className="notebook-rule" aria-hidden="true" />
          <div className="hero-copy">
            <p className="unit-note">읽고, 생각하고, 손으로 답해요</p>
            <h1>오늘 읽을 교과서를<br />소리 내어 읽어 볼까요?</h1>
            <p>
              교과서 문장을 정확히 읽고 문제를 풀어 보세요. 손글씨가 다르게
              읽히면 직접 고칠 수 있어요.
            </p>
          </div>
          <div className="reading-demo" aria-label="소리책방 학습 순서">
            <span>교과서 읽기</span>
            <strong>70%</strong>
            <span>문제 풀기</span>
          </div>
        </section>

        <section className="lesson-section" aria-labelledby="lesson-heading">
          <div className="section-heading">
            <div>
              <h2 id="lesson-heading">수업을 골라 시작하세요</h2>
              <p>교사가 공유한 차시만 목록에 나타납니다.</p>
            </div>
            <span className="lesson-count">{lessons.length}개 수업</span>
          </div>
          {error && <div className="notice error">{error}</div>}
          <div className="lesson-list">
            {lessons.map((lesson) => (
              <article className="lesson-row" key={lesson.lessonId}>
                <div className="lesson-number" aria-hidden="true">{String(lesson.version).padStart(2, "0")}</div>
                <div>
                  <p>{lesson.grade}학년 {lesson.subject} · {lesson.unit}</p>
                  <h3>{lesson.title}</h3>
                </div>
                <Link className="primary-button" to={`/lesson/${lesson.lessonId}`}>
                  이 수업 시작하기
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
}

function NotFound() {
  return (
    <Layout>
      <main className="center-page">
        <h1>페이지를 찾지 못했어요</h1>
        <p>공유받은 수업 링크가 맞는지 확인해 주세요.</p>
        <Link className="primary-button" to="/">첫 화면으로</Link>
      </main>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/lesson/:lessonId" element={<StudentExperience />} />
      <Route path="/teacher" element={<TeacherStudio />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
