# 소리책방 GitHub Pages 배포 안내

이 프로젝트는 GitHub 저장소에 올리면 Actions가 자동으로 테스트·빌드·배포하도록 준비되어 있습니다.

## 1. 공개 전 확인

현재 샘플 수업에는 제공된 과학 교과서 62~63쪽 이미지가 포함되어 있습니다.

- 공개 배포 권한이 있는 자료인지 확인하세요.
- GitHub Pages에 게시한 교재 이미지와 정답은 누구나 주소나 개발자 도구로 확인할 수 있습니다.
- 원본 `science_5-2-3.pdf`는 `.gitignore`로 제외되어 저장소에 올라가지 않습니다.
- 학생 이름·실제 결과 JSON은 저장소에 올리지 마세요.

## 2. GitHub 웹사이트에서 저장소 만들기

1. GitHub에 로그인합니다.
2. `New repository`를 선택합니다.
3. 저장소 이름을 `sori-bookroom`처럼 입력합니다.
4. GitHub Pages로 학생에게 공유하려면 저장소 공개 범위를 `Public`으로 설정합니다.
5. README·`.gitignore`·라이선스를 GitHub에서 새로 만들지 않고 빈 저장소로 생성합니다.

## 3. 현재 폴더를 Git으로 올리는 방법

GitHub가 표시한 저장소 주소가 다음과 같다고 가정합니다.

```text
https://github.com/사용자이름/sori-bookroom.git
```

현재 폴더에서 다음 명령을 실행합니다.

```powershell
git remote add origin https://github.com/사용자이름/sori-bookroom.git
git push -u origin main
```

현재 프로젝트는 `main` 브랜치의 로컬 Git 저장소로 준비됩니다. 아직 커밋이 없다면 다음을 먼저 실행합니다.

```powershell
git add .
git commit -m "Create Sori Bookroom learning app"
```

## 4. ZIP으로 업로드하는 방법

`sori-bookroom-github.zip`의 압축을 푼 뒤 GitHub의 `uploading an existing file` 화면으로 파일을 올릴 수 있습니다.

단, GitHub 웹 업로드에서는 `.github`처럼 점으로 시작하는 폴더를 빠뜨리기 쉽습니다. 가능하면 Git 명령 또는 GitHub Desktop을 사용하세요.

## 5. GitHub Pages 켜기

1. 저장소의 `Settings`를 엽니다.
2. 왼쪽에서 `Pages`를 선택합니다.
3. `Build and deployment`의 `Source`를 `GitHub Actions`로 선택합니다.
4. `Actions` 탭에서 `Deploy GitHub Pages` 작업이 완료될 때까지 기다립니다.
5. 완료되면 다음 형태의 주소가 표시됩니다.

```text
https://사용자이름.github.io/sori-bookroom/
```

학생용 샘플 수업 주소는 다음 형태입니다.

```text
https://사용자이름.github.io/sori-bookroom/#/lesson/science5-lesson01-temperature
```

교사용 제작실 주소는 다음 형태입니다.

```text
https://사용자이름.github.io/sori-bookroom/#/teacher
```

초기 데모 비밀번호는 `teacher`입니다. 이 비밀번호는 화면 구분용이며 보안 기능이 아닙니다.

## 6. 다음 차시 올리기

1. 새 원본을 로컬 `교과서_원본/{차시}` 폴더에 둡니다.
2. 교사용 제작실에서 파일을 선택하고 문제를 검토합니다.
3. 내보낸 ZIP을 `public/lessons/{lesson-id}`에 풉니다.
   - 이미지 퍼즐을 사용한다면 퍼즐용 JPG·PNG가 `assets`에 포함됐는지 확인합니다.
4. `public/lessons/index.json`에 수업 항목을 추가합니다.
5. `npm run check`로 검증합니다.
6. 변경 사항을 커밋하고 `main` 브랜치에 푸시합니다.

기존 차시는 덮어쓰지 말고 새 `lessonId`를 사용합니다. 같은 차시 수정은 `lessonVersion`을 올립니다.

## 7. 배포 문제 확인

- Actions가 실패하면 `Actions → Deploy GitHub Pages`에서 실패한 단계를 확인합니다.
- Pages 주소에서 빈 화면이 나오면 브라우저 캐시를 지우고 다시 엽니다.
- 수업이 목록에 없으면 `public/lessons/index.json`의 경로와 JSON 문법을 확인합니다.
- 교재 이미지가 보이지 않으면 `lesson.json`의 `asset` 경로와 실제 파일명을 비교합니다.
