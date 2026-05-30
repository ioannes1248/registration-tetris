-- ============================================================
-- [user_department_preferences.sql]
-- 사용자 전공/부전공 설정 및 데이터베이스 보안(RLS), 트리거 설정 스크립트
-- ============================================================

-- 1. 사용자 전공 설정 테이블 생성
-- 만약 public 스키마 내에 user_department_preferences 테이블이 존재하지 않는 경우 신규로 생성합니다.
create table if not exists public.user_department_preferences (
  email text primary key,             -- 사용자 이메일 (기본키로 지정하여 한 계정당 하나의 레코드만 존재)
  major_department text,              -- 주전공 명칭
  minor_department text,              -- 부전공 명칭
  updated_at timestamptz not null default now() -- 정보 수정 시간 기록 (시간대 포함 타임스탬프, 기본값은 현재 시각)
);

-- 2. 행 레벨 보안 (Row Level Security, RLS) 활성화
-- 기본적으로 모든 외부 사용자의 직접적인 조회를 차단하고, 
-- 아래에서 생성되는 특정 보안 정책(Policy)을 통과하는 행(Row)만 조회/수정할 수 있도록 제한합니다.
alter table public.user_department_preferences enable row level security;

-- ── SELECT(조회) 보안 정책 설정 ──
-- 기존에 동일한 이름의 정책이 있다면 충돌을 방지하기 위해 먼저 삭제(drop)합니다.
drop policy if exists "Users can read own department preferences"
on public.user_department_preferences;

-- 사용자가 자기 자신의 전공/부전공 설정을 조회할 수 있도록 허용하는 정책입니다.
-- JWT(JSON Web Token)에 담긴 사용자 이메일('email')정보가 테이블의 'email' 컬럼과 일치하는 행만 SELECT 하도록 제어합니다.
create policy "Users can read own department preferences"
on public.user_department_preferences
for select
using (auth.jwt() ->> 'email' = email);

-- ── INSERT(등록) 보안 정책 설정 ──
drop policy if exists "Users can insert own department preferences"
on public.user_department_preferences;

-- 사용자가 전공/부전공 정보를 최초 등록할 때 작동하는 보안 정책입니다.
-- JWT의 이메일과 입력(insert)하고자 하는 데이터의 'email'이 같을 때만 허용합니다. (타인 정보 등록 대행 방지)
create policy "Users can insert own department preferences"
on public.user_department_preferences
for insert
with check (auth.jwt() ->> 'email' = email);

-- ── UPDATE(수정) 보안 정책 설정 ──
drop policy if exists "Users can update own department preferences"
on public.user_department_preferences;

-- 기존 설정을 수정(update)할 때 적용되는 보안 정책입니다.
-- 기존 행의 이메일(`using` 절)과 새로 수정 입력하는 행의 이메일(`with check` 절)이 모두 
-- 현재 인증된 로그인 유저의 JWT 이메일 정보와 일치해야 정상 작동합니다.
create policy "Users can update own department preferences"
on public.user_department_preferences
for update
using (auth.jwt() ->> 'email' = email)
with check (auth.jwt() ->> 'email' = email);

-- 3. 자동 시간(updated_at) 갱신 함수 및 트리거 설정
-- 레코드가 업데이트(UPDATE)될 때마다 자동으로 updated_at 컬럼을 현재 시각으로 갱신하는 절차적 언어(PL/pgSQL) 함수입니다.
create or replace function public.set_user_department_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now(); -- 변경된 신규 행(new)의 updated_at 필드에 현재 시각(now())을 대입합니다.
  return new;             -- 갱신된 레코드를 반환하여 수정 연산을 완료합니다.
end;
$$;

-- 테이블에 기존 트리거가 남아 있다면 삭제 처리합니다.
drop trigger if exists set_user_department_preferences_updated_at
on public.user_department_preferences;

-- user_department_preferences 테이블에서 레코드의 UPDATE가 일어나기 직전(before update)에,
-- 각 행마다(for each row) 위에서 만든 set_user_department_preferences_updated_at 함수를 실행시킵니다.
create trigger set_user_department_preferences_updated_at
before update on public.user_department_preferences
for each row
execute function public.set_user_department_preferences_updated_at();

