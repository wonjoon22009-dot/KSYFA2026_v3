# KSYFA Match Center v12.1 — GitHub → Vercel 배포형

이 폴더를 그대로 GitHub 저장소에 올리고 Vercel에서 Import 하면 됩니다.

## v12.1 추가 사항

- 승점이 정확히 2팀 동률이면 **승자승을 가장 먼저 적용**
- 2팀의 맞대결도 무승부이면 **골득실 → 다득점**
- 3팀 이상 승점 동률이면 **골득실 → 다득점**
- ADMIN에서 득점 / 옐로카드 / 레드카드 / 교체 이벤트 삭제 가능
- 득점 이벤트를 삭제하면 해당 팀 스코어도 자동으로 1 감소
- 삭제 결과도 Supabase에 저장되어 모든 관중 화면에 반영

---

## 1. Supabase 설정

1. Supabase에서 새 프로젝트 생성
2. SQL Editor에서 `supabase.sql` 전체 실행
3. Project Settings → API에서 아래 두 값 확인
   - Project URL
   - Publishable key 또는 anon public key
4. `config.js` 수정

```js
window.KSYFA_CONFIG = {
  supabaseUrl: "여기에 Project URL",
  supabaseAnonKey: "여기에 Publishable key"
};
```

주의: `service_role` 키는 config.js에 넣으면 안 됩니다.

---

## 2. GitHub에 올리기

GitHub에서 새 Repository를 하나 만든 뒤 이 폴더의 **내용 전체**를 업로드합니다.

저장소 최상단에 다음이 보여야 합니다.

```text
index.html
config.js
supabase.sql
vercel.json
api/
  admin.js
README.md
```

ZIP 파일 자체를 업로드하는 것이 아니라 **압축을 푼 파일들**을 올리세요.

---

## 3. Vercel과 GitHub 연결

1. Vercel 로그인
2. Add New → Project
3. GitHub 계정 연결
4. 방금 만든 KSYFA Repository 선택
5. Import
6. Framework Preset은 `Other`
7. Root Directory는 기본값 그대로
8. Build Command는 비워 두기
9. Output Directory도 비워 두기

---

## 4. Vercel Environment Variables

Vercel 프로젝트의 Settings → Environment Variables에서 다음 3개를 추가합니다.

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PIN
```

값:

- `SUPABASE_URL` = Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase service_role key
- `ADMIN_PIN` = `0618`

Production / Preview / Development 중 최소 Production에는 반드시 넣으세요.

환경변수를 추가한 뒤 한 번 Redeploy 해야 반영됩니다.

---

## 5. 최초 데이터 저장

Supabase SQL 실행 직후 DB state는 빈 객체입니다.

1. 배포된 사이트 접속
2. ADMIN LOGIN
3. PIN `0618`
4. 아무 경기나 선택
5. `경기 현황 저장` 한 번 누르기

그러면 사이트의 전체 기본 대회 데이터가 Supabase에 저장됩니다.

---

## 6. 실시간 동작

관리자:
- 경기 상태
- 스코어
- 라인업
- 득점
- PK / 자책골
- 카드
- 교체
- 승부차기
- 이벤트 삭제

를 수정하면 Supabase에 저장됩니다.

관중 화면은 Supabase Realtime을 구독하므로 자동 갱신됩니다.

응원 버튼은 `increment_cheer` PostgreSQL 함수를 사용하여 동시에 여러 명이 눌러도 서버에서 +1 처리합니다.

---

## 7. 도메인 연결

Vercel 프로젝트:

Settings → Domains → Add Domain

예:

```text
ksyfa.kr
match.ksyfa.kr
```

도메인을 입력하면 Vercel이 DNS에 추가해야 할 레코드를 알려줍니다.
도메인을 구입한 업체의 DNS 설정에서 그 값을 그대로 등록하면 됩니다.

---

## 보안

관리자 PIN `0618`은 `index.html`에 들어 있지 않습니다.

Vercel의 `/api/admin` 서버리스 함수가 `ADMIN_PIN` 환경변수와 비교합니다.

`SUPABASE_SERVICE_ROLE_KEY`도 브라우저에 노출되지 않고 Vercel 서버에서만 사용됩니다.

단, `0618` 자체는 짧은 PIN이므로 필요하면 Vercel 환경변수의 `ADMIN_PIN` 값만 더 긴 비밀번호로 변경할 수 있습니다.


## v12.1 Vercel 빌드 수정
기존 `vercel.json`의 `functions` 항목 때문에
`api/admin.js`를 찾지 못하는 빌드 오류가 발생할 수 있어 해당 설정을 제거했습니다.

Vercel은 루트의 `api/admin.js`를 자동으로 Serverless Function으로 감지합니다.
별도의 functions 설정은 필요하지 않습니다.
