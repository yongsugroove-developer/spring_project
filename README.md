# my-planner

루틴 로그 1차 웹 MVP입니다. 루틴, 투두, 캘린더, 통계를 탭 기반으로 나눠 관리하고, 대표 이모지와 개인화 옵션으로 꾸밀 수 있는 Node + Express 서비스입니다.

## Owner

- yongsugroove

## Requirement

- RQ-001

## Stack Profile

- node-express

## Commands

- Build: `npm run build`
- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- Lint: `npm run lint`
- Run: `npm run dev`

## Product Scope

- `오늘`: 오늘 루틴 체크, 빠른 투두 추가, 오늘/미배정 투두 확인
- `루틴`: 반복 루틴과 세부 항목 편집, 대표 이모지와 색상 미리보기 설정
- `투두`: 단건 할일 생성, 일정 배정, 완료 처리, 대표 이모지 꾸미기
- `캘린더`: 월간 루틴 달성률 시각화, 선택 날짜 요약과 예외 상태 확인
- `통계`: 일/주/월 달성률, 스트릭, 상위 루틴 집계와 대표 이모지 노출
- `개인화`: 테마 프리셋과 `compact/comfy` 밀도 설정을 브라우저에 저장

## Notes

- 런타임 저장소는 `data/planner-data.json`을 자동 생성해 사용합니다.
- 루틴과 투두의 대표 이모지는 JSON 데이터에 저장됩니다.
- 최근 이모지, 테마, 밀도 설정은 브라우저 `localStorage`에 저장됩니다.
- 현재 범위는 단일 사용자, 무인증 웹 MVP입니다.
