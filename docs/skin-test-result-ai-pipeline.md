# 피부 테스트 결과 텍스트(AI) — 프롬프트와 입력 데이터

웹 결과 화면의 **섹션형 분석 문단**(ko / ru / en)은 피부 API(`무제 폴더/main.py`)의 Gemini 호출로 생성된다. 아래는 **어떤 JSON 필드가 프롬프트에 들어가고**, 그 덕분에 모델이 **어떤 근거로** 문장을 쓰게 되는지 정리한 것이다.

---

## 1. 엔드포인트 개요

| 엔드포인트 | 호출 시점 | 사진·수치 |
|------------|-----------|-----------|
| `POST /analyze-text` | 설문 결과 직후(셀카 없음) | 없음 |
| `POST /analyze-text-with-selfie` | 셀카 분석 완료 후 | `skin_metrics` + (선택) 셀피 Gemini 코멘트 |

웹 호출: `웹사이트/src/pages/SkinTest.tsx` — `fetch(.../analyze-text)` 및 `fetch(.../analyze-text-with-selfie)`.

---

## 2. 공통 요청 필드 → 프롬프트 반영

| 필드 | 출처(웹) | 프롬프트에서의 역할 |
|------|----------|---------------------|
| `skin_type` | 바우만 4글자 코드(예: DSNW) | 4축 영어 라벨(Dry/Oily, …)로 풀어서 삽입 |
| `baumann_scores` | 축별 합산 점수 `"1"…"4"` | Dry+/Oily−, Sensitive+/Resistant− 등 **원시 점수 한 줄** + 타입과 함께 해석 유도 |
| `concern_text` | 사용자 자유 고민 텍스트 | `Patient concern` / `Concern` 인용 |
| `country` | 프로필 국가(RU/KZ/UZ/AE) | `COUNTRY_REGION`으로 지역 매핑 후 **`_build_climate_context`**(월·온도·UV·습도·계절 스트레스 문장) 삽입 |
| `age_code` | 프로필 나이대(`age_1`…`age_7`) | 영어 나이대 라벨 + **SECTION FLAGS**의 주름/안티에이징 블록 조건에 사용 |
| `recommended_product_name` | 추천 박스 미리보기 로드 후 | 카탈로그 블록: SEMO 박스/라인 이름 언급 유도 |
| `composition_product_types` | 같은 미리보기의 구성 타입 나열 | 클렌저·에센스·세럼 등 **단계 앵커**로 성분 이야기 연결 |
| `concern_metric_focus` | `buildConcernMetricFocusForApi(profileData.concern, concernText)` | 고민과 **어느 바우만 행·어느 셀피 지표**를 엮어야 하는지 영어 지시 블록(FOCUS METRICS) |

`concern_metric_focus` 생성 로직: `웹사이트/src/lib/concernMetricHighlight.ts` — 프로필 `con_1…5`와 자유 텍스트 키워드로 바우만 행 인덱스·셀피 키를 고른 뒤, Gemini에게 “이 축/지표를 최소 한 섹션에서 명시적으로 연결하라”고 전달한다.

---

## 3. `POST /analyze-text` 전용

### 3.1 시스템 역할·톤(프롬프트 상단)

- 피부과 지향 스킨케어 조언 역할, **소비자 교육·루틴 가이드**(의학적 진단 아님).
- 두려움·수치심 금지, 점수를 시험 등급처럼 취급하지 말 것, **실천 가능한 다음 단계** 우선.

### 3.2 컨텍스트 블록

- **기후**: `_build_climate_context(region, month, year)` — 월별 기후 DB + 지역 프로필.
- **문진만**: 바우만 코드·4축 라벨·`score_legend`(각 축 대략 −10…+10, 부호 규칙 설명).
- **SECTION FLAGS**(서버에서 계산한 불리언을 문자열로 삽입):
  - `wrinkle_antiaging_section`: 나이 26+ 이고 (코드 W 또는 주름 축 점수 ≥ 1).
  - `tzone_sensitive_section`: 지성 경향(O 타입 또는 s1&lt;0) + 민감 경향(S 타입 또는 s2≥0).

### 3.3 출력 형식

- JSON만: `ko`, `ru`, `en` 각각 **5–7개** `{ title, body }` 배열.
- 섹션 순서는 프롬프트에 명시(프로필·계절·고민·조건부 주름/T존·SEMO·팁 등).

---

## 4. `POST /analyze-text-with-selfie` 추가 입력

### 4.1 `skin_metrics`

`skin_analyzer.analyze_selfie` 등에서 나온 0–100 스케일:

- `redness_index`
- `pigment_unevenness`
- `texture_roughness`
- `oiliness_index`

프롬프트에 **한 번씩 수치로 인용**하고, “알고리즘 시각 신호, 조명·각도 영향, 100 근처 = 모델 포화 가능” 등으로 해석하도록 지시한다.

### 4.2 `gemini_selfie_ko` / `gemini_selfie_ru` / `gemini_selfie_en`

셀피 파이프라인에서 별도로 생성된 **비전/Gemini 셀피 코멘트**(언어별). 프롬프트에는 각각 최대 약 1200자까지 잘라 `Optional notes from the same selfie`로 넣고, **사실 재사용·모순 금지**를 요구한다.

### 4.3 SECTION FLAGS(셀피 경로)

- `wrinkle_antiaging_section`: 26+ 이고 (W 타입 또는 s4≥1 또는 texture≥52 또는 셀피 텍스트에 주름 키워드).
- `tzone_sensitive_section`: 지성 경향 + 민감 경향 + (redness≥38 또는 oil≥48).

### 4.4 출력 형식

- `ko` / `ru` / `en` 각 **6–8개** 섹션. 마지막에 **4주 후 동일 조건 재촬영** 등 행동 제안 포함.

---

## 5. 웹에서 보이는 다른 텍스트(비 Gemini)

| 요소 | 데이터 근거 |
|------|-------------|
| 막대 차트 `SkinResultMetricsCharts` | `baumann_scores` + `skin_metrics`(있을 때); 고민 하이라이트는 `resolveConcernMetricFocus` |
| 차트 아래 서술 요약 `buildSkinStateSummaryParagraph` | 동일 점수·셀피 4지표 구간 문구 + 규칙 기반 **Suggested focus / На что опереться** 한두 문장 |

이 요약은 **프론트에서 규칙으로 생성**하며, Gemini 본문과 별도다.

---

## 6. 모델·설정

- 모델: `gemini-2.5-pro` (`generateContent`).
- `temperature` ≈ 0.65, `maxOutputTokens` 설문만 3072 / 셀피 포함 3200.
- 응답은 JSON 파싱 후 `_normalize_analysis_sections_payload`로 정규화.

---

## 7. 파일 참조

- API·프롬프트 전문: `무제 폴더/main.py` — `analyze_text_endpoint`, `analyze_text_with_selfie_endpoint`
- 기후 블록: `무제 폴더/main.py` — `_build_climate_context`, `get_monthly_climate` 등
- 셀피 수치 산출: `무제 폴더/skin_analyzer.py` — `analyze_selfie`, KPI 필드
- 웹 페이로드: `웹사이트/src/pages/SkinTest.tsx`
- 고민→지표 API 문자열: `웹사이트/src/lib/concernMetricHighlight.ts`
