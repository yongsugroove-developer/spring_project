# cursor-agent-project-template

Cursor 기반 멀티 에이전트 프로젝트를 빠르게 시작하기 위한 재사용 가능한 GitHub 템플릿 저장소입니다.

## 템플릿이 제공하는 것

- 루트 `AGENTS.md` 자동 생성
- `.cursor/rules/` 프로젝트 규칙
- `.cursor/agents/` 역할별 서브에이전트
- `docs/agent-ops/` 운영 문서 세트
- `node-express`부터 시작하는 스택 프로파일 지원
- placeholder 치환과 프로파일 적용을 위한 PowerShell 부트스트랩 스크립트

## 템플릿 구조

```text
template/
  core/
  profiles/
scripts/
examples/
template-manifest.json
```

## 권장 사용 흐름

1. 이 저장소를 GitHub Template으로 사용해 새 저장소를 생성합니다.
2. 새 저장소를 로컬로 클론합니다.
3. 설정 파일을 새 프로젝트에 맞게 수정합니다.
4. 부트스트랩 스크립트를 실행합니다.
5. 생성된 프로젝트를 Cursor에서 엽니다.
6. 생성된 `AGENTS.md`, `.cursor/rules/`, `.cursor/agents/`, `docs/agent-ops/` 기준으로 작업을 시작합니다.

## 빠른 시작

### 기본 실행 명령

```powershell
.\scripts\init-project.ps1 -ConfigFile .\examples\project-config.node-express.json
```

### Windows PowerShell 실행 정책 오류

다음과 같은 오류가 보이면:

```text
... init-project.ps1 cannot be loaded because running scripts is disabled on this system
```

문제는 스크립트 내용이 아니라 로컬 PowerShell 실행 정책입니다.

가장 권장하는 1회성 안전 우회 방법:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\init-project.ps1 -ConfigFile .\examples\project-config.node-express.json
```

이 방법을 권장하는 이유:
- 시스템 전체 정책을 영구 변경하지 않습니다
- 이번 실행 1회에만 우회 적용됩니다
- 부트스트랩 실행용으로 가장 실용적이고 안전합니다

현재 PowerShell 세션에만 적용하는 대안:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\init-project.ps1 -ConfigFile .\examples\project-config.node-express.json
```

사용자 계정 범위의 장기 설정 대안:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

마지막 방법은 로컬 정책 자체를 바꾸므로, 의미를 이해할 때만 사용하세요.

## 설정 파일 수정

예제 설정 파일 위치:

```text
examples/project-config.node-express.json
```

기본 예제:

```json
{
  "PROJECT_NAME": "sns ai 뉴스 수집기",
  "FOLDER_NAME": "sns-ai-news-collector",
  "OWNER": "yongsugroove",
  "REQUIREMENT_ID": "RQ-001",
  "STACK_PROFILE": "node-express",
  "EMAIL_PROVIDER": "SMTP",
  "BUILD_CMD": "npm run build",
  "UNIT_TEST_CMD": "npm run test:unit",
  "INTEGRATION_TEST_CMD": "npm run test:integration",
  "LINT_CMD": "npm run lint",
  "RUN_CMD": "npm run dev",
  "TARGET_RELEASE_DATE": "2026-02-24",
  "HARD_DEADLINE": "2026-02-24",
  "SOURCE_MODE": "official API",
  "SETTINGS_SCOPE": "per-user"
}
```

## 설정 항목 설명

### 프로젝트 식별 / 책임

- `PROJECT_NAME`
  - 사람이 읽는 프로젝트/서비스 이름
  - 예: `"AI Digest Admin"`

- `FOLDER_NAME`
  - 저장소/폴더용 안전한 이름
  - 소문자와 하이픈 사용 권장
  - 예: `"ai-digest-admin"`

- `OWNER`
  - 문서와 승인 흐름의 1차 책임자
  - 예: `"yongsugroove"` 또는 `"Platform Team"`

- `REQUIREMENT_ID`
  - 첫 번째 추적 작업 ID
  - 예: `"RQ-001"` 또는 `"INIT-001"`

### 스택 선택

- `STACK_PROFILE`
  - 적용할 프로파일 자산 이름
  - 현재 지원 값: `"node-express"`

### 런타임 / Provider 선택

- `EMAIL_PROVIDER`
  - 문서와 가이드에 반영될 메일 전송 제공자 이름
  - 예: `"SMTP"`, `"SES"`

- `SOURCE_MODE`
  - 외부 소스 접근 방식
  - 예: `"official API"`

- `SETTINGS_SCOPE`
  - 설정 범위가 사용자별인지, 공용인지
  - 예: `"per-user"` 또는 `"global"`

### 실행 명령

- `BUILD_CMD`
  - 문서와 가이드에 표시될 빌드 명령
  - 예: `"npm run build"`

- `UNIT_TEST_CMD`
  - 단위 테스트 명령
  - 예: `"npm run test:unit"`

- `INTEGRATION_TEST_CMD`
  - 통합 테스트 명령
  - 예: `"npm run test:integration"`

- `LINT_CMD`
  - 린트 명령
  - 예: `"npm run lint"`

- `RUN_CMD`
  - 로컬 실행 명령
  - 예: `"npm run dev"`

### 일정 / 추적

- `TARGET_RELEASE_DATE`
  - 목표 릴리즈 날짜
  - 예: `"2026-04-01"`

- `HARD_DEADLINE`
  - 실제 마감일
  - 예: `"2026-04-10"`

## 설정 예시 변경안

### 예시 1: 내부 운영용 관리자 대시보드

```json
{
  "PROJECT_NAME": "AI Digest Admin",
  "FOLDER_NAME": "ai-digest-admin",
  "OWNER": "Platform Team",
  "REQUIREMENT_ID": "RQ-001",
  "STACK_PROFILE": "node-express",
  "EMAIL_PROVIDER": "SMTP",
  "BUILD_CMD": "npm run build",
  "UNIT_TEST_CMD": "npm run test:unit",
  "INTEGRATION_TEST_CMD": "npm run test:integration",
  "LINT_CMD": "npm run lint",
  "RUN_CMD": "npm run dev",
  "TARGET_RELEASE_DATE": "2026-04-01",
  "HARD_DEADLINE": "2026-04-10",
  "SOURCE_MODE": "official API",
  "SETTINGS_SCOPE": "global"
}
```

적합한 경우:
- 운영팀 한 곳이 설정을 관리하는 경우
- 전체 사용자가 같은 다이제스트 동작을 공유하는 경우

### 예시 2: SaaS형 사용자별 알림 서비스

```json
{
  "PROJECT_NAME": "Personal AI Alert",
  "FOLDER_NAME": "personal-ai-alert",
  "OWNER": "yongsugroove",
  "REQUIREMENT_ID": "RQ-001",
  "STACK_PROFILE": "node-express",
  "EMAIL_PROVIDER": "SES",
  "BUILD_CMD": "npm run build",
  "UNIT_TEST_CMD": "npm run test:unit",
  "INTEGRATION_TEST_CMD": "npm run test:integration",
  "LINT_CMD": "npm run lint",
  "RUN_CMD": "npm run dev",
  "TARGET_RELEASE_DATE": "2026-05-15",
  "HARD_DEADLINE": "2026-05-30",
  "SOURCE_MODE": "official API",
  "SETTINGS_SCOPE": "per-user"
}
```

적합한 경우:
- 각 사용자가 수신자, 모델, 스케줄을 직접 제어하는 경우
- provider 전략이 기본 예제와 다른 경우

## 생성되는 결과물

부트스트랩 스크립트를 실행하면 대상 프로젝트에 다음이 생성됩니다.

- `AGENTS.md`
- `.cursor/rules/`
- `.cursor/agents/`
- `docs/agent-ops/`
- `package.json`, `tsconfig.json`, `starter source/tests` 같은 프로파일별 런타임 파일

## 생성 후 권장 작업 흐름

1. 생성된 프로젝트를 Cursor에서 엽니다
2. `AGENTS.md`를 확인합니다
3. `docs/agent-ops/requirements.md`를 확인합니다
4. 생성된 subagent와 rules 기반으로 작업을 시작합니다
5. 진행 중 `status-board.md`, `decision-log.md`를 갱신합니다

## 보안 주의사항

- `examples/*.json`에는 비밀값을 넣지 마세요
- 생성된 문서에도 비밀값을 넣지 마세요
- 실제 자격증명은 secret manager, 환경변수, 또는 git 밖의 안전한 로컬 설정에 두세요

## 현재 지원 프로파일

- `node-express`

## 참고

- 이 저장소는 템플릿 자산을 `template/` 아래에 보관합니다
- `init-project.ps1`가 이 자산을 실제 프로젝트 레이아웃으로 전개합니다
- 생성된 프로젝트는 부트스트랩 이후 독립적으로 수정/커밋/운영하는 것을 전제로 합니다

---

# cursor-agent-project-template

Reusable GitHub template repository for starting new Cursor-based multi-agent projects.

## What this template provides

- Root-level `AGENTS.md` generation
- Cursor project rules in `.cursor/rules/`
- Focused project subagents in `.cursor/agents/`
- `docs/agent-ops/` operational documents
- Stack profile support, starting with `node-express`
- PowerShell bootstrap for placeholder replacement and profile application

## Template structure

```text
template/
  core/
  profiles/
scripts/
examples/
template-manifest.json
```

## Recommended workflow

1. Create a new repository from this GitHub template.
2. Clone the new repository locally.
3. Edit the config file to match your new project.
4. Run the bootstrap script.
5. Open the generated project in Cursor.
6. Start work with the generated `AGENTS.md`, `.cursor/rules/`, `.cursor/agents/`, and `docs/agent-ops/`.

## Quick Start

### Standard command

```powershell
.\scripts\init-project.ps1 -ConfigFile .\examples\project-config.node-express.json
```

### Windows PowerShell execution policy issue

If you see an error like:

```text
... init-project.ps1 cannot be loaded because running scripts is disabled on this system
```

the problem is not the script itself. The problem is the local PowerShell execution policy.

Recommended one-time safe workaround:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\init-project.ps1 -ConfigFile .\examples\project-config.node-express.json
```

This is recommended because:
- it does not permanently change system-wide policy
- it only bypasses policy for this single command
- it is the safest practical option for bootstrap execution

Alternative for the current shell session only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\init-project.ps1 -ConfigFile .\examples\project-config.node-express.json
```

Longer-term user-level option:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Use the last option only if you understand and accept the local policy change.

## Config file editing

The example config lives at:

```text
examples/project-config.node-express.json
```

Default example:

```json
{
  "PROJECT_NAME": "sns ai 뉴스 수집기",
  "FOLDER_NAME": "sns-ai-news-collector",
  "OWNER": "yongsugroove",
  "REQUIREMENT_ID": "RQ-001",
  "STACK_PROFILE": "node-express",
  "EMAIL_PROVIDER": "SMTP",
  "BUILD_CMD": "npm run build",
  "UNIT_TEST_CMD": "npm run test:unit",
  "INTEGRATION_TEST_CMD": "npm run test:integration",
  "LINT_CMD": "npm run lint",
  "RUN_CMD": "npm run dev",
  "TARGET_RELEASE_DATE": "2026-02-24",
  "HARD_DEADLINE": "2026-02-24",
  "SOURCE_MODE": "official API",
  "SETTINGS_SCOPE": "per-user"
}
```

## Config field reference

### Identity and ownership

- `PROJECT_NAME`
  - Human-readable product or service name
  - Example: `"AI Digest Admin"`

- `FOLDER_NAME`
  - Repository-safe project folder name
  - Use lowercase and hyphens
  - Example: `"ai-digest-admin"`

- `OWNER`
  - Primary owner for documents and approvals
  - Example: `"yongsugroove"` or `"Platform Team"`

- `REQUIREMENT_ID`
  - First tracked work item
  - Example: `"RQ-001"` or `"INIT-001"`

### Stack selection

- `STACK_PROFILE`
  - Which profile assets to apply
  - Current supported value: `"node-express"`

### Runtime and provider choices

- `EMAIL_PROVIDER`
  - Delivery provider label used in docs and generated guidance
  - Example: `"SMTP"`, `"SES"`

- `SOURCE_MODE`
  - External source access strategy
  - Example: `"official API"`

- `SETTINGS_SCOPE`
  - Whether settings are per-user or shared
  - Example: `"per-user"` or `"global"`

### Commands

- `BUILD_CMD`
  - Build command shown in docs and guidance
  - Example: `"npm run build"`

- `UNIT_TEST_CMD`
  - Unit test command
  - Example: `"npm run test:unit"`

- `INTEGRATION_TEST_CMD`
  - Integration test command
  - Example: `"npm run test:integration"`

- `LINT_CMD`
  - Lint command
  - Example: `"npm run lint"`

- `RUN_CMD`
  - Local run command
  - Example: `"npm run dev"`

### Schedule and tracking

- `TARGET_RELEASE_DATE`
  - Planned target date for initial release
  - Example: `"2026-04-01"`

- `HARD_DEADLINE`
  - Non-negotiable deadline if one exists
  - Example: `"2026-04-10"`

## Example configuration changes

### Example 1: internal admin dashboard

```json
{
  "PROJECT_NAME": "AI Digest Admin",
  "FOLDER_NAME": "ai-digest-admin",
  "OWNER": "Platform Team",
  "REQUIREMENT_ID": "RQ-001",
  "STACK_PROFILE": "node-express",
  "EMAIL_PROVIDER": "SMTP",
  "BUILD_CMD": "npm run build",
  "UNIT_TEST_CMD": "npm run test:unit",
  "INTEGRATION_TEST_CMD": "npm run test:integration",
  "LINT_CMD": "npm run lint",
  "RUN_CMD": "npm run dev",
  "TARGET_RELEASE_DATE": "2026-04-01",
  "HARD_DEADLINE": "2026-04-10",
  "SOURCE_MODE": "official API",
  "SETTINGS_SCOPE": "global"
}
```

Use this when:
- one operations team manages settings
- all users share the same digest behavior

### Example 2: SaaS-style per-user notifier

```json
{
  "PROJECT_NAME": "Personal AI Alert",
  "FOLDER_NAME": "personal-ai-alert",
  "OWNER": "yongsugroove",
  "REQUIREMENT_ID": "RQ-001",
  "STACK_PROFILE": "node-express",
  "EMAIL_PROVIDER": "SES",
  "BUILD_CMD": "npm run build",
  "UNIT_TEST_CMD": "npm run test:unit",
  "INTEGRATION_TEST_CMD": "npm run test:integration",
  "LINT_CMD": "npm run lint",
  "RUN_CMD": "npm run dev",
  "TARGET_RELEASE_DATE": "2026-05-15",
  "HARD_DEADLINE": "2026-05-30",
  "SOURCE_MODE": "official API",
  "SETTINGS_SCOPE": "per-user"
}
```

Use this when:
- each user controls their own recipients, model, and schedule
- provider strategy differs from the default example

## What gets generated

After running the bootstrap script, the target project receives:

- `AGENTS.md`
- `.cursor/rules/`
- `.cursor/agents/`
- `docs/agent-ops/`
- profile-specific runtime files such as `package.json`, `tsconfig.json`, and starter source/tests

## Expected generated workflow

1. Open the generated project in Cursor
2. Review `AGENTS.md`
3. Review `docs/agent-ops/requirements.md`
4. Start work with the generated subagents and rules
5. Update `status-board.md` and `decision-log.md` as work progresses

## Safety notes

- Do not put secrets in `examples/*.json`
- Do not put secrets in generated docs
- Keep actual credentials in secret managers, environment variables, or secure local configuration outside git

## Current profile

- `node-express`

## Notes

- This repository stores template assets under `template/`
- `init-project.ps1` expands those assets into a real project layout
- The generated project is meant to be edited, committed, and evolved independently after bootstrap
