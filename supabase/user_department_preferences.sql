-- ============================================================
-- [user_department_preferences.sql]
-- 사용자 전공/부전공 설정 및 데이터베이스 보안(RLS), 트리거 설정 스크립트
--
-- 💡 구성 요소 안내:
--   1. [초기 설정]: 테이블 구조 생성, 보안 및 함수 등록 명령어 (최초 1회만 데이터베이스에 실행)
--   supa date base에서 초기 1회 실행. 서비스에서는 실행하지 않음
-- ============================================================

-- ------------------------------------------------------------
-- 1. [초기 설정] 사용자 전공 설정 테이블 생성
-- ------------------------------------------------------------
-- 만약 public 스키마 내에 테이블이 존재하지 않는 경우 신규로 생성합니다.
create table if not exists public.user_department_preferences (
  email text primary key,             -- [실시간 작동] 사용자 이메일 (기본키로 지정하여 계정당 1개 레코드만 유지)
  major_department text,              -- [실시간 작동] 주전공 명칭
  minor_department text,              -- [실시간 작동] 부전공 명칭
  updated_at timestamptz not null default now() -- [실시간 작동] 정보 수정 시간 기록
);

-- ------------------------------------------------------------
-- 2. [초기 설정] 행 레벨 보안(RLS) 설정 및 활성화
-- ------------------------------------------------------------
-- 테이블 보안 통제를 적용하기 위해 RLS 기능을 켭니다.
alter table public.user_department_preferences enable row level security;

-- 기존에 생성된 통합 정책이 이미 존재할 경우의 초기화 구문입니다.
drop policy if exists "사용자 전공 설정 관리" on public.user_department_preferences;

-- 본인의 데이터에 대해 조회, 등록, 수정, 삭제(ALL) 권한을 부여하는 신규 정책을 등록합니다.
create policy "사용자 전공 설정 관리"
on public.user_department_preferences
for all
-- 🔽 [실시간 작동] 사용자가 API를 보낼 때마다 데이터베이스 엔진이 로그인한 이메일과 데이터를 대조합니다.
using (auth.jwt() ->> 'email' = email); 

-- ------------------------------------------------------------
-- 3. [초기 설정] 자동 시간 갱신 기능 (트리거)
-- ------------------------------------------------------------
-- 데이터 변경 시 updated_at 필드를 현재 시각으로 자동 채워주는 PostgreSQL 함수를 등록합니다.
create or replace function public.set_user_department_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- 🔽 [실시간 작동] 데이터가 업데이트(UPDATE)될 때마다 새로운(new) 행의 시간 정보를 현재 시각(now())으로 실시간 자동 치환합니다.
  new.updated_at = now(); 
  return new;
end;
$$;

-- 테이블에 기존 작동하던 동일한 이름의 트리거가 있다면 삭제합니다.
drop trigger if exists set_user_department_preferences_updated_at
on public.user_department_preferences;

-- 테이블의 데이터가 변경(update)되기 직전에 위에서 정의한 갱신 함수가 실시간으로 작동하도록 연결합니다.
create trigger set_user_department_preferences_updated_at
before update on public.user_department_preferences
for each row
-- 🔽 [실시간 작동] 데이터 수정 이벤트 발생 시 함수를 실시간 자동 실행합니다.
execute function public.set_user_department_preferences_updated_at();
