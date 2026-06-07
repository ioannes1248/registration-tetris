import { supabase } from './supabaseClient.js'

// --- 데이터베이스 테이블 상수 정의 ---
// 전체 개설 과목 정보가 보관되어 있는 테이블명
export const COURSE_DEPARTMENTS_TABLE = 'courses_2026_spring'
// 사용자가 설정한 주전공/부전공 정보가 저장되어 있는 테이블명
export const USER_DEPARTMENTS_TABLE = 'user_department_preferences'

// 한 번에 가져올 학과 데이터 페이징 크기 (Supabase 단일 요청 최대 반환 행 제한 고려)
const DEPARTMENT_PAGE_SIZE = 1000

// 빈 프로필 기본 양식 객체
const EMPTY_PROFILE = { majorDepartment: '', minorDepartment: '' }

/**
 * 학과명 텍스트 정규화(공백 제거 등) 헬퍼 함수
 * @param {any} value - 원본 학과명 데이터
 * @returns {string} 좌우 공백이 제거된 문자열 또는 빈 문자열
 */
const normalizeDepartment = (value) => {
  if (!value) return ''
  return String(value).trim()
}

/**
 * fetchDepartmentOptions (전체 학과 목록 조회 함수)
 * 
 * [동작 설명]
 * 전체 개설 교과목 테이블(`courses_2026_spring`)로부터 모든 학과명('department') 필드를 조회합니다.
 * 중복되거나 누락된 값을 정제하여 드롭다운 리스트의 옵션용 배열을 반환합니다.
 * 
 * [페이징(Pagination)이 쓰인 이유]
 * 데이터가 매우 많을 경우(예: 수천 개 이상의 행), Supabase는 단일 요청에서 반환하는 결과 갯수를 제한할 수 있습니다.
 * 따라서 `range(from, from + DEPARTMENT_PAGE_SIZE - 1)`를 이용해 1000개 단위로 루프를 돌며 끝까지 페이징 스크롤 조회합니다.
 */
export const fetchDepartmentOptions = async () => {
  const departments = []
  let from = 0 // 페이징 범위 시작 인덱스

  while (true) {
    // Supabase 쿼리 빌더 실행
    const { data, error } = await supabase
      .from(COURSE_DEPARTMENTS_TABLE)
      .select('department')            // department 컬럼만 선택 조회
      .not('department', 'is', null)    // null인 행은 필터링하여 제외
      .order('department', { ascending: true }) // 기본 알파벳/가나다순 오름차순 정렬
      .range(from, from + DEPARTMENT_PAGE_SIZE - 1) // 특정 구간 데이터만 조회 (예: 0~999, 1000~1999)

    if (error) {
      throw error // 에러 발생 시 호출부에 에러를 전파
    }

    // 가져온 데이터를 텍스트 정규화한 뒤 departments 임시 배열에 합침 (filter(Boolean)로 null/빈 문자열 제거)
    departments.push(...(data || []).map((row) => normalizeDepartment(row.department)).filter(Boolean))

    // 수신된 데이터 개수가 한 페이지 설정 사이즈보다 작다면 더 이상 데이터가 없는 것이므로 루프 중단
    if (!data || data.length < DEPARTMENT_PAGE_SIZE) {
      break
    }

    // 다음 페이지 오프셋 갱신
    from += DEPARTMENT_PAGE_SIZE
  }

  // Set 객체를 이용하여 학과 이름의 중복을 제거한 뒤, 최종 한글(ko-KR) 가나다 오름차순 정렬하여 반환
  return Array.from(new Set(departments)).sort((a, b) => a.localeCompare(b, 'ko-KR'))
}

/**
 * fetchUserDepartmentProfile (특정 사용자의 전공/부전공 조회 함수)
 * 
 * [동작 설명]
 * `user_department_preferences` 테이블에서 로그인한 사용자 이메일에 매칭되는 행을 조회합니다.
 * 
 * [maybeSingle() 사용 의도]
 * `.single()`은 결과가 반드시 1개여야 하며 0개(최초 로그인 유저 등)일 때 예외 에러를 발생시킵니다.
 * 반면 `.maybeSingle()`은 레코드가 존재하면 1개를 가져오고, 존재하지 않으면 에러 대신 `null`을 반환하므로 
 * 가입 후 최초로 전공을 설정하는 유저의 예외 처리에 적합합니다.
 * 
 * @param {string} email - 사용자의 이메일 주소
 * @returns {object} { majorDepartment, minorDepartment } 형태의 객체
 */
export const fetchUserDepartmentProfile = async (email) => {
  if (!email) {
    return { ...EMPTY_PROFILE }
  }

  const { data, error } = await supabase
    .from(USER_DEPARTMENTS_TABLE)
    .select('major_department, minor_department')
    .eq('email', email)          // email 필드가 일치하는 조건 검색
    .maybeSingle()               // 레코드가 없어도 에러 대신 null 반환

  // 에러가 났거나 데이터 결과가 존재하지 않으면 빈 프로필 포맷 반환
  if (error || !data) {
    return { ...EMPTY_PROFILE }
  }

  // 성공적으로 조회된 경우 DB 컬럼명(snake_case)을 JS 카멜케이스 변수명으로 매핑하여 반환
  return {
    majorDepartment: normalizeDepartment(data.major_department),
    minorDepartment: normalizeDepartment(data.minor_department),
  }
}

/**
 * saveUserDepartmentProfile (사용자의 전공/부전공 정보 저장 및 업데이트 함수)
 * 
 * [동작 설명]
 * 현재 세션의 로그인 유저 정보를 Supabase Auth 모듈에서 조회한 뒤, 
 * `user_department_preferences` 테이블에 전공 정보를 upsert(등록 혹은 업데이트)합니다.
 * 
 * [upsert & onConflict 사용 설명]
 * `upsert` 메서드는 "Insert or Update" 연산을 나타냅니다.
 * `{ onConflict: 'email' }` 옵션은 'email' 컬럼의 고유 키 충돌이 일어났을 때(이미 해당 유저의 설정 행이 데이터베이스에 존재할 때),
 * 에러를 내는 대신 해당 이메일 행의 컬럼값들을 새 데이터로 교체(UPDATE)하라는 지시어입니다.
 * 
 * @param {object} params - { majorDepartment, minorDepartment } 주전공/부전공 값 객체
 * @returns {object} { profile, error } 결과를 담은 객체
 */
export const saveUserDepartmentProfile = async ({ majorDepartment, minorDepartment }) => {
  // Supabase Auth 세션에서 안전하게 현재 로그인 정보 획득
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const user = userData?.user

  // 사용자 계정 조회가 실패했거나 이메일이 식별되지 않는 경우 에러 반환
  if (userError || !user?.email) {
    return {
      error: userError || new Error('로그인된 사용자 정보를 확인할 수 없습니다.'),
    }
  }

  // 입력된 값 정규화
  const profile = {
    majorDepartment: normalizeDepartment(majorDepartment),
    minorDepartment: normalizeDepartment(minorDepartment),
  }

  // DB에 전달할 Payload 생성 (JS 객체 key를 PostgreSQL 테이블 컬럼명에 맞춰 매핑)
  const dbPayload = {
    email: user.email,
    major_department: profile.majorDepartment || null, // 빈 문자열 대신 DB에는 null 값으로 투입
    minor_department: profile.minorDepartment || null,
  }

  // DB에 데이터 삽입 혹은 갱신 요청
  const { error: tableError } = await supabase
    .from(USER_DEPARTMENTS_TABLE)
    .upsert(dbPayload, { onConflict: 'email' }) // 중복 이메일 충돌 시 덮어쓰기(UPDATE) 수행

  if (tableError) {
    return { error: tableError }
  }

  return { profile } // 저장에 사용된 최종 전공 정보 반환
}

