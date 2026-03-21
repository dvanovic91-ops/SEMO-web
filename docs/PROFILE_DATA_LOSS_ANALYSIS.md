# 개인정보 저장 위치 — 참고 (현행 아키텍처)

> 과거 `localStorage`(`profileEdit`) 위주였던 시절의 유실 분석 문서였습니다. **현재는 아래와 같이 DB가 진실의 원천입니다.**

---

## 현재: 데이터가 어디에 저장되는가

| 항목 | 저장 위치 | 비고 |
|------|-----------|------|
| 닉네임(표시 이름), 전화 | `profiles` | 프로필 수정·결제 저장 시 `update` |
| **ФИО, 도시/주소, 우편번호, INN, 여권번호 등** | **`shipping_addresses`** | `user_id` 기준 `upsert` (`ProfileEdit`, `Checkout`) |
| 포인트·등급 문자열 | `profiles` | 이벤트·트리거로 갱신 |

브라우저 **localStorage에는 개인정보를 주 저장소로 두지 않습니다.**  
레거시 키만 `migrateLegacyProfileEditToSupabase`로 1회 이관 후 정리합니다.

---

## (과거) 유실이 발생할 수 있었던 원인 — 참고 보관

이전에는 `profileEdit` 키, effect 타이밍, 저장 버튼 미클릭 등으로 데이터가 로컬에만 있거나 덮어써질 수 있었습니다.  
현재 코드는 **Supabase `profiles` + `shipping_addresses`** 를 기준으로 통일했습니다.

상세 이력이 필요하면 Git 히스토리를 참고하세요.
