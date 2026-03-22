# Cursor 라이브 연동 가이드 (운영·타 프로젝트·IDE 에이전트용)

이 문서는 **Dungeon Agent Board** 웹 UI를 Cursor(또는 유사하게 터미널 메타를 로컬에 남기는 IDE)와 연결할 때 필요한 정보를 한곳에 정리한 것입니다.  
다른 사용자·팀원에게 서비스하거나, Cursor 등 IDE의 에이전트에게 **그대로 붙여 넣어 지시**할 수 있도록 작성했습니다.

관련 보안 경계는 저장소 루트의 `AGENTS.md`를 따릅니다. 로컬 IDE 텔레메트리는 민감하므로 **옵트인·로컬 처리** 전제입니다.

---

## 1. 아키텍처 한 줄 요약

```
Cursor가 로컬에 기록하는 terminals(및 선택 시 agent-transcripts)
        → apps/bridge (CursorAdapter, 로컬만 읽음)
        → HTTP /api/snapshot, SSE /api/stream
        → apps/web (Vite가 /api 를 브리지로 프록시)
```

- 원격 Cursor API 호출 없음.
- 다른 프로젝트를 보려면 브리지가 읽는 **폴더 경로**를 그 프로젝트의 Cursor 산출물로 바꾸면 됨.

---

## 2. 역할 구분

| 역할 | 할 일 |
|------|--------|
| **보드 운영자** | 이 저장소 클론, `npm run dev`, `.env` 설정, 웹에서 `Cursor 라이브` 선택 |
| **다른 프로젝트 담당자** | Cursor로 그 프로젝트 작업 시 `terminals` 경로를 운영자에게 전달, (선택) 명령/cwd 관례·규칙 JSON 제공 |
| **IDE 에이전트** | 이 문서의 「에이전트용 지시문」절을 수행, 경로·규칙 초안 작성 |

---

## 3. 이 저장소(dungeon-agent-board)에서 하는 설정

### 3.1 실행

```bash
npm install
npm run dev
```

- 웹: 터미널에 표시된 **Local** 주소 사용 (기본 `5173`, 점유 시 `5174` 등).
- 브리지: `http://127.0.0.1:4318` (기본).

### 3.2 환경 변수 (프로젝트 루트 `.env`)

`.env.example`을 참고한다.

| 변수 | 필수 | 설명 |
|------|------|------|
| `CURSOR_TERMINALS_DIR` | 조건부 | 읽을 `terminals` 폴더 **절대 경로**. **다른 Cursor 프로젝트**를 볼 때 여기를 그 프로젝트 쪽으로 둔다. |
| `CURSOR_PROJECTS_DIR` | 선택 | 지정 시 `projects` 루트만 알려주고, 브리지가 **이 보드 저장소와 이름이 맞는** 프로젝트 폴더를 자동 선택 (기본은 보드 레포 기준). |
| `CURSOR_AGENT_TRANSCRIPTS_DIR` | 선택 | 퀘스트·문맥용 `agent-transcripts` 폴더 절대 경로. |
| `CURSOR_AGENT_CONFIG` | 선택 | 역할 매핑 JSON 파일 **절대 경로** (`rules` 배열). 샘플: `apps/bridge/config/cursor-agent-config.sample.json` |
| `ALLOWED_ORIGINS` | 권장 | 브라우저 Origin CORS. **실제 접속 URL** 전부 포함 (예: `5173`과 `5174` 둘 다). |
| `PORT` | 선택 | 브리지 포트 (기본 `4318`). |
| `BIND_HOST` | 선택 | 기본 `127.0.0.1`. |

`.env` 변경 후에는 **브리지를 재시작**한다.

### 3.3 웹 UI

1. 상단 **데이터 모드** → `Cursor 라이브`
2. **실행 모드**·**연결 상태** 배지 확인
3. 개발자 도구에서 `/api/snapshot` 이 200인지 확인

---

## 4. 기본 동작 vs 다른 Cursor 프로젝트

- **자동 탐색(변수 미지정 시)**  
  브리지는 패키지 기준 **이 저장소(dungeon-agent-board) 루트**와 짝이 맞는 Cursor 프로젝트 디렉터리를 `CURSOR_PROJECTS_DIR` 아래에서 고른다.  
  즉 **별도 설정 없으면** “이 보드를 연 Cursor 창” 쪽 터미널을 읽으려는 동작에 가깝다.

- **다른 프로젝트만 보고 싶을 때**  
  `CURSOR_TERMINALS_DIR`을 **그 프로젝트의** `…\projects\<id>\terminals` 로 명시한다.  
  (선택) `CURSOR_AGENT_TRANSCRIPTS_DIR` 도 같은 프로젝트의 `agent-transcripts` 로 맞춘다.

- **한 브리지로 두 워크스페이스를 동시에 합치기**  
  현재 구조는 **터미널 디렉터리 하나** 전제. 동시 합산은 기본 미지원이다.

---

## 5. 다른 Cursor 프로젝트 측에서 할 일 (npm 설치 불필요)

### 5.1 그 프로젝트 레포에 “설치”하는 것

- **없음.** Dungeon Agent Board 패키지를 다른 레포에 넣을 필요 없음.
- Cursor가 해당 워크스페이스에 대해 기록하는 경로만 존재하면 됨.

### 5.2 운영자에게 넘길 정보

- **필수**: `terminals` 폴더의 **전체 절대 경로**  
  Windows 예: `C:\Users\<사용자>\.cursor\projects\<cursor-project-id>\terminals`
- **선택**: `agent-transcripts` 폴더 절대 경로

`<cursor-project-id>`는 Cursor가 만든 폴더 이름이므로, 탐색기에서 `projects` 아래를 확인한다.

### 5.3 역할 매칭을 쉽게 하려면 (권장 관례)

브리지는 터미널 파일의 **cwd**, **command**, **last_command** (및 규칙에 따라 **output**) 문자열로 규칙을 맞춘다.

권장:

1. **cwd**에 레포 고유 경로 조각이 들어가게 한다 → 규칙 `cwdIncludes`.
2. 에이전트/터미널 실행 명령에 **고정 태그**를 넣는다 → 규칙 `commandIncludes`.  
   예: `npm run dab:frontend`, 명령 인자에 `--dab-role=backend` 등.
3. 출력으로만 구분해야 하면 `outputIncludes` (덜 권장).

역할 값 (`role` 필드): `leader` | `frontend` | `backend` | `qa` | `security` | `general`  
`avatarKey`는 소문자 권장: `leader`, `frontend`, …

규칙 스키마는 `apps/bridge/src/adapters/cursor/cursor-adapter.ts`의 매칭 로직과 샘플 JSON을 따른다.

### 5.4 타 프로젝트 전용 규칙 JSON 예시

파일은 **그 프로젝트 루트** 등 아무 곳에 두고, 보드 쪽 `.env`의 `CURSOR_AGENT_CONFIG`에 **절대 경로**로 지정한다.

파일명 예: `dab-cursor-bridge.rules.json`

```json
{
  "rules": [
    {
      "cwdIncludes": ["my-other-app"],
      "commandIncludes": ["dab-leader"],
      "role": "leader",
      "name": "오케스트레이터",
      "roleLabel": "팀 리더",
      "avatarKey": "leader"
    },
    {
      "cwdIncludes": ["my-other-app"],
      "commandIncludes": ["dab-frontend"],
      "role": "frontend",
      "name": "프런트 작업",
      "roleLabel": "프런트엔드",
      "avatarKey": "frontend"
    }
  ]
}
```

- 규칙은 배열 **앞에서부터** 매칭된다. 구체적인 규칙을 위에 둔다.
- `terminalId` 로 특정 터미널만 지정할 수 있다.

### 5.5 보드 `.env` 예시 (다른 프로젝트 소스)

```env
CURSOR_TERMINALS_DIR=C:\Users\<user>\.cursor\projects\<other-project-id>\terminals
CURSOR_AGENT_TRANSCRIPTS_DIR=C:\Users\<user>\.cursor\projects\<other-project-id>\agent-transcripts
CURSOR_AGENT_CONFIG=C:\path\to\other-repo\dab-cursor-bridge.rules.json
ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174
```

---

## 6. IDE(Cursor) 에이전트에게 그대로 줄 지시문 (복사용)

아래 블록을 규칙·프롬프트·작업 설명에 붙여 넣는다.

```
[목표]
Dungeon Agent Board 웹 UI(라이브 모드)가 우리 프로젝트의 Cursor 터미널을 소스로 쓰도록, 연동에 필요한 정보와 관례를 맞춘다.

[우리 프로젝트에서 할 일]
1. 이 레포에 dungeon-agent-board npm 패키지를 설치할 필요는 없다.
2. Cursor로 이 워크스페이스를 연 상태에서, 다음 폴더의 절대 경로를 정리해 운영자에게 전달한다.
   - 필수: …\.cursor\projects\<이-워크스페이스-id>\terminals
   - 선택: …\agent-transcripts
3. 브리지 규칙(commandIncludes/cwdIncludes)에 걸리도록, 에이전트/터미널이 실행하는 명령 또는 cwd에 팀이 합의한 고유 문자열을 넣는다. (예: dab-frontend, dab-leader)
4. 선택: 프로젝트 루트에 dab-cursor-bridge.rules.json 초안을 작성하고, role/avatarKey/name/roleLabel을 계약에 맞게 채운다.

[역할·avatarKey]
role은 leader, frontend, backend, qa, security, general 중 하나.
avatarKey는 leader, frontend, backend, qa, security, general 소문자 권장.

[검증]
- terminals 폴더에 .txt 파일이 작업 중 갱신되는지 확인한다.
- 운영자가 보드 저장소 .env에 CURSOR_TERMINALS_DIR 등을 넣고 브리지 재시작 후, 웹에서 Cursor 라이브로 연결되는지 확인한다.
```

---

## 7. 트러블슈팅

| 증상 | 확인 |
|------|------|
| 라이브가 곧바로 모의 시나리오로 돌아감 | 브리지 실행 여부, `/api/snapshot` 200 여부, CORS `ALLOWED_ORIGINS`에 브라우저 Origin 포함 여부 |
| 에이전트가 안 보이거나 역할이 전부 general | `CURSOR_AGENT_CONFIG` 경로·JSON 문법, command/cwd에 규칙 문자열 포함 여부 |
| 포트 충돌 | Vite가 5174로 뜨면 `ALLOWED_ORIGINS`에 5174 추가 |
| 경로를 바꿨는데 반영 안 됨 | 브리지 재시작 |

---

## 8. 보안·서비스 범위 메모

- 브리지는 설계상 **로컬 루프백** 사용을 전제로 한다. 외부에 브리지를 노출하지 않는 것을 권장한다.
- 터미널 내용·경로는 민감할 수 있다. 타인에게 경로를 넘길 때는 **필요 최소 정보**만 공유한다.
- “다른 사용자에게 서비스”를 **인터넷 상의 멀티테넌트 SaaS**로 제공하는 것은 현재 코드 범위가 아니다. 각 사용자 PC에서 브리지+웹을 돌리거나, 추후 별도 배포·인증 설계가 필요하다.

---

## 9. 참고 파일

| 경로 | 내용 |
|------|------|
| `.env.example` | 환경 변수 템플릿 |
| `apps/bridge/config/cursor-agent-config.sample.json` | 이 보드 레포용 규칙 샘플 |
| `apps/bridge/src/config/runtime-env.ts` | terminals/transcripts 경로 해석 |
| `apps/bridge/src/server.ts` | `/api/snapshot`, `/api/stream` |
| `apps/web/vite.config.ts` | `/api` → 브리지 프록시 |
| `AGENTS.md` | 보안·작업 약속 |

---

문서 버전: 저장소와 함께 유지보수한다. 연동 절차가 바뀌면 이 파일과 루트 `README.md`의 링크 설명을 함께 갱신한다.
