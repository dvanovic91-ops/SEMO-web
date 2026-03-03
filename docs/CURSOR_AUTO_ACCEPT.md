# Cursor — 매번 Accept 누르지 않고 자동 실행하기

요청할 때마다 "Accept" / "Allow"를 누르지 않고, 에이전트가 제안한 동작(파일 수정, 터미널 실행 등)을 **자동으로 실행**되게 하는 방법입니다.

---

## 1. Auto-Run 켜기 (권장)

1. **Cursor 설정 열기**  
   - **Mac:** `Cmd + Shift + J`  
   - **Windows / Linux:** `Ctrl + Shift + J`  
   - 또는 메뉴: **Cursor → Settings** (또는 **File → Preferences → Cursor Settings**)

2. **Agent 섹션으로 이동**  
   - 왼쪽에서 **Agent** (또는 **Features → Agent**) 를 선택합니다.

3. **Auto-run 켜기**  
   - **Auto-run** (예전 이름: YOLO mode) 옵션을 **켜기(On)** 로 둡니다.  
   - 이렇게 하면 **허용 목록(Allow list)**에 있는 동작은 사용자가 Accept를 누르지 않아도 자동으로 실행됩니다.

4. **허용 목록 확인**  
   - Auto-run을 켜면 "어떤 종류의 명령/동작을 자동 실행할지" 설정할 수 있습니다.  
   - **파일 수정**, **일부 터미널 명령**(테스트, 빌드, 린트, `npm install` 등)을 허용해 두면, 대부분의 일상적인 요청에서 Accept를 누를 필요가 줄어듭니다.  
   - **위험한 동작**(예: `rm -rf`, `git push`, DB 삭제, 배포 등)은 허용 목록에 넣지 않는 것이 좋습니다.

---

## 2. 설정 위치가 다른 경우

- Cursor 버전에 따라 **Settings → Features → Agent** 또는 **Cursor Settings → Agent** 등으로 들어갈 수 있습니다.  
- **"Auto-run"**, **"Run without approval"**, **"YOLO mode"** 같은 이름의 옵션을 찾아 켜면 됩니다.  
- **Allow list** / **권한 목록**에서 "파일 쓰기", "터미널 실행" 등을 허용해 두면, 해당 동작은 자동으로 실행됩니다.

---

## 3. 주의사항

- **Auto-run을 켜면** 허용된 동작은 **사용자 확인 없이** 실행됩니다.  
- 처음에는 허용 목록을 **보수적으로** 두고, 필요할 때만 단계적으로 넓히는 것을 권장합니다.  
- **프로덕션 DB**, **배포**, **git push**, **rm -rf** 같은 건 자동 허용하지 않는 것이 안전합니다.

이렇게 설정해 두면, 일상적인 코딩 요청에서는 Accept를 누르지 않고 에이전트가 알아서 동작하게 할 수 있습니다.
