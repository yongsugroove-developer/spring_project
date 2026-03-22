# my-planner

마이 플래너 1차 웹 MVP입니다. 루틴, 투두, 캘린더, 통계를 탭 기반으로 나눠 관리하는 Node + Express 서비스입니다.

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

- `오늘`: 오늘 루틴 체크와 오늘/미배정 투두 확인
- `루틴`: 반복 루틴과 세부 항목 편집
- `투두`: 단건 할일 생성, 일정 배정, 완료 처리
- `캘린더`: 월간 루틴 달성률 시각화
- `통계`: 일/주/월 달성률, 스트릭, 상위 루틴 집계

## Notes

- 런타임 저장소는 `data/planner-data.json`을 자동 생성해 사용합니다.
- 현재 범위는 단일 사용자, 무인증 웹 MVP입니다.
