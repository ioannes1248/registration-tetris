import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import './Courses.css'

/**
 * =========================================================
 * [Courses.jsx — 과목 테이블 조회 페이지 (개발용 Supabase 연결 점검 화면)]
 *
 * 화면 목적 : Supabase의 과목 테이블이 정상 연결되는지 샘플 데이터를 표로 보여주며 확인.
 *            (서비스용 메인 기능이라기보다 DB 연동 테스트 성격의 페이지)
 * 진입 경로 : /courses (상단 내비게이션의 '과목 조회')
 *
 * [동작 요약]
 *   1) 로그인 세션(또는 게스트 모드) 확인 → 비로그인 시 인트로('/')로 차단.
 *   2) 인증이 끝나면 과목 테이블에서 샘플 행(최대 25개)을 조회.
 *   3) 조회된 행들의 키를 모아 표의 열(헤더)을 동적으로 구성하고 값들을 렌더링.
 * =========================================================
 */

// 게스트 모드 식별용 sessionStorage 키 / 게스트 이메일
const GUEST_MODE_KEY = 'registration-tetris:guest-mode'
const GUEST_EMAIL = 'guest@cku.ac.kr'
const COURSES_TABLE = 'test table' // 조회 대상 테이블명
const SAMPLE_LIMIT = 25            // 한 번에 가져올 샘플 행 수

const Courses = () => {
  const navigate = useNavigate()
  // --- 상태(State) 정의 ---
  const [userEmail, setUserEmail] = useState('')           // 로그인한 사용자 이메일
  const [authLoading, setAuthLoading] = useState(true)     // 세션 확인(인증) 진행 중 여부
  const [courses, setCourses] = useState([])               // 조회된 과목 행 배열
  const [courseCount, setCourseCount] = useState(null)     // 테이블 전체 행 수(count)
  const [coursesLoading, setCoursesLoading] = useState(true) // 과목 데이터 로딩 중 여부
  const [hasFetchedCourses, setHasFetchedCourses] = useState(false) // 한 번이라도 조회를 시도했는지
  const [coursesError, setCoursesError] = useState('')     // 조회 오류 메시지
  const [lastFetchedAt, setLastFetchedAt] = useState('')   // 마지막 조회 시각(표시용)
  const [accessRole, setAccessRole] = useState('확인 중')   // 현재 접근 권한 라벨(authenticated/anon 등)

  // 게스트 모드 여부(sessionStorage 플래그 확인)
  const isGuestMode = () => window.sessionStorage.getItem(GUEST_MODE_KEY) === 'true'

  // 이메일 첫 글자(대문자)를 아바타 이니셜로 반환, 없으면 '?'
  const getInitial = (email) => {
    if (!email) return '?'
    return email.charAt(0).toUpperCase()
  }

  /**
   * JWT 토큰에서 권한(role)을 추출합니다.
   * Supabase access_token은 'header.payload.signature' 형태의 JWT이며,
   * 가운데 payload는 Base64로 인코딩된 JSON입니다. atob로 디코딩해 role 값을 읽습니다.
   * 디코딩 실패 시 기본값 'authenticated'를 반환합니다.
   */
  const getSessionRole = (session) => {
    const token = session?.access_token
    if (!token) return 'authenticated'

    try {
      const payload = JSON.parse(atob(token.split('.')[1])) // 두 번째 조각(payload) 디코딩
      return payload.role || 'authenticated'
    } catch {
      return 'authenticated'
    }
  }

  /**
   * fetchCourses: 과목 테이블에서 샘플 데이터를 조회합니다. (useCallback으로 메모이즈)
   * { count: 'exact' } 옵션으로 전체 행 수도 함께 받아오고, .limit으로 표시용 샘플만 가져옵니다.
   */
  const fetchCourses = useCallback(async () => {
    setCoursesLoading(true)
    setCoursesError('')

    const { data, error, count } = await supabase
      .from(COURSES_TABLE)
      .select('*', { count: 'exact' }) // 모든 컬럼 + 전체 행 수
      .limit(SAMPLE_LIMIT)              // 표에는 최대 SAMPLE_LIMIT개만

    if (error) {
      // 실패 시 데이터 비우고 오류 메시지 저장
      setCourses([])
      setCourseCount(null)
      setCoursesError(error.message)
    } else {
      // 성공 시 데이터/전체 개수/조회 시각 갱신
      setCourses(data || [])
      setCourseCount(count)
      setLastFetchedAt(new Date().toLocaleString('ko-KR'))
    }

    setHasFetchedCourses(true)
    setCoursesLoading(false)
  }, [])

  /**
   * [useEffect 1] 인증 세션 확인 + 실시간 인증 상태 감시
   * 마운트 시 URL에 남은 인증 파라미터를 청소하고, 로그인/게스트 여부를 검사합니다.
   * 비로그인 사용자는 인트로('/')로 돌려보내 접근을 차단합니다.
   */
  useEffect(() => {
    // 로그인 리다이렉트로 주소창에 남은 토큰 파라미터 제거
    if (window.location.search || window.location.hash.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0]
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }

    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        // 정식 로그인: 이메일과 토큰 권한 표시
        setUserEmail(session.user.email)
        setAccessRole(getSessionRole(session))
      } else if (isGuestMode()) {
        // 게스트 모드: 세션이 없어 anon 권한으로 조회됨
        setUserEmail(GUEST_EMAIL)
        setAccessRole('anon (게스트)')
      } else {
        // 인증/게스트 모두 아님 → 접근 차단
        navigate('/', { replace: true })
        return
      }

      setAuthLoading(false) // 인증 검사 완료
    }

    fetchSession()

    // 인증 상태 변화(로그아웃/세션 갱신) 실시간 감시
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (isGuestMode()) {
          setUserEmail(GUEST_EMAIL)
          setAccessRole('anon (게스트)')
          return
        }
        navigate('/', { replace: true })
      } else if (session?.user) {
        setUserEmail(session.user.email)
        setAccessRole(getSessionRole(session))
      }
    })

    // 컴포넌트 소멸 시 감시자 해제(메모리 누수 방지)
    return () => subscription.unsubscribe()
  }, [navigate])

  /**
   * [useEffect 2] 인증이 끝나면 과목 데이터 자동 조회
   * authLoading이 false가 되는 순간(=세션 확인 완료) 한 번 fetchCourses를 호출합니다.
   */
  useEffect(() => {
    if (!authLoading) {
      fetchCourses()
    }
  }, [authLoading, fetchCourses])

  /**
   * 표의 열(헤더) 목록을 동적으로 계산합니다.
   * 테이블 스키마를 미리 모르므로, 조회된 모든 행의 키를 Set으로 합쳐 컬럼 집합을 만듭니다.
   * (행마다 키가 다를 수 있어 전부 순회) — courses가 바뀔 때만 재계산(useMemo).
   */
  const columns = useMemo(() => {
    const names = new Set()
    courses.forEach((course) => {
      Object.keys(course || {}).forEach((key) => names.add(key))
    })
    return Array.from(names)
  }, [courses])

  // 셀 값 표시 포맷: 빈 값은 '-', 객체는 JSON 문자열, 그 외는 문자열로 변환
  const formatCellValue = (value) => {
    if (value === null || value === undefined || value === '') return '-'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  // 로그아웃: 게스트 플래그 제거 후 Supabase 로그아웃 → useEffect 1의 감시자가 인트로로 이동시킴
  const handleLogout = async () => {
    window.sessionStorage.removeItem(GUEST_MODE_KEY)
    await supabase.auth.signOut()
  }

  // 인증 검사 중에는 로딩 스피너만 표시
  if (authLoading) {
    return (
      <div className="page-center courses-page">
        <div className="flex flex-col flex-center gap-4">
          <div className="spinner spinner-dark courses-loading-spinner" />
          <p className="courses-loading-text">로딩 중...</p>
        </div>
      </div>
    )
  }

  // --- 메인 화면 렌더링 ---
  return (
    <div className="dashboard courses-page">
      {/* 상단 내비게이션 바 (브랜드 로고 + 메뉴 + 사용자 정보/로그아웃) */}
      <nav className="nav">
        <div className="nav-brand courses-clickable-brand" onClick={() => navigate('/main')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="16" height="3" rx="1.5" fill="var(--color-primary)" opacity="0.9" />
            <rect x="2" y="8.5" width="16" height="3" rx="1.5" fill="var(--color-subject-3)" opacity="0.75" />
            <rect x="2" y="14" width="16" height="3" rx="1.5" fill="var(--color-subject-5)" opacity="0.65" />
          </svg>
          <span>과목</span>조회
        </div>

        <ul className="nav-links courses-nav-links">
          <li className="nav-link" onClick={() => navigate('/main')}>홈</li>
          <li className="nav-link" onClick={() => navigate('/tetris')}>시간표 편성</li>
          <li className="nav-link nav-link-active">과목 조회</li>
        </ul>

        <div className="flex gap-3 courses-nav-actions">
          <div className="user-badge">
            <div className="user-avatar">{getInitial(userEmail)}</div>
            <span className="courses-user-email">{userEmail}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </nav>

      <main className="dashboard-content">
        <div className="container">
          {/* 페이지 제목 영역 + '다시 조회' 버튼 */}
          <div className="courses-page-header animate-in">
            <div>
              <p className="courses-kicker">Supabase 연결 테스트</p>
              <h2 className="courses-heading">과목 테이블 조회</h2>
              <p className="courses-description">
                <code>{COURSES_TABLE}</code> 테이블에서 샘플 데이터를 불러와 연결 상태를 확인합니다.
              </p>
            </div>
            <button className="btn btn-primary btn-md" onClick={fetchCourses} disabled={coursesLoading}>
              {coursesLoading ? '조회 중...' : '다시 조회'}
            </button>
          </div>

          {/* 상태 요약 카드 3개: 조회 결과 / 테이블 정보 / 접근 권한 */}
          <section className="courses-status-grid animate-in delay-1">
            <div className="courses-status-panel">
              <span className={`chip ${coursesError ? 'chip-error' : hasFetchedCourses ? 'chip-success' : ''}`}>
                {coursesError ? '조회 실패' : hasFetchedCourses ? '조회 성공' : '조회 중'}
              </span>
              <strong className="courses-status-value">
                {coursesError
                  ? '테이블을 불러오지 못했습니다'
                  : coursesLoading
                    ? 'Supabase에서 데이터를 확인하고 있습니다'
                    : `${courses.length}개 샘플 표시`}
              </strong>
              <p>
                전체 행 수: {courseCount === null ? '-' : `${courseCount.toLocaleString('ko-KR')}개`}
              </p>
            </div>
            <div className="courses-status-panel">
              <span className="chip">테이블</span>
              <strong className="courses-status-value">{COURSES_TABLE}</strong>
              <p>마지막 조회: {lastFetchedAt || '-'}</p>
            </div>
            <div className="courses-status-panel courses-status-panel-wide">
              <span className="chip">조회 권한</span>
              <strong className="courses-status-value">{accessRole}</strong>
              <p>
                게스트 모드는 Supabase Auth 세션이 없어서 anon 권한으로 조회됩니다.
              </p>
            </div>
          </section>

          {/* 오류가 있으면 오류 박스를, 없으면 샘플 데이터 표를 표시 */}
          {coursesError ? (
            <section className="courses-message courses-message-error animate-in delay-2">
              <strong>Supabase 오류</strong>
              <p>{coursesError}</p>
            </section>
          ) : (
            <section className="courses-table-section animate-in delay-2">
              <div className="courses-table-header">
                <h3>샘플 데이터</h3>
                <span className="chip">최대 {SAMPLE_LIMIT}행</span>
              </div>

              {coursesLoading ? (
                <div className="courses-empty-state">
                  <div className="spinner spinner-dark" />
                  <p>과목 데이터를 불러오는 중입니다.</p>
                </div>
              ) : courses.length === 0 ? (
                <div className="courses-empty-state">
                  <p>테이블은 조회됐지만 표시할 행이 없습니다.</p>
                </div>
              ) : (
                // 동적으로 구한 columns로 표 헤더를 만들고, 각 행을 같은 열 순서로 렌더링
                <div className="courses-table-wrap">
                  <table className="courses-table">
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {courses.map((course, index) => (
                        <tr key={course.id || `${COURSES_TABLE}-${index}`}>
                          {columns.map((column) => (
                            <td key={column}>{formatCellValue(course[column])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

export default Courses
