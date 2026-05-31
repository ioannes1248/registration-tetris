import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import './Courses.css'

const GUEST_MODE_KEY = 'registration-tetris:guest-mode'
const GUEST_EMAIL = 'guest@cku.ac.kr'
const COURSES_TABLE = 'test table'
const SAMPLE_LIMIT = 25

// 아래 헬퍼들은 컴포넌트 지역 상태에 의존하지 않는 순수/유틸 함수이므로 모듈 스코프에 두어
// 렌더링마다 재생성되지 않도록 합니다.

// 게스트 모드 여부 확인
const isGuestMode = () => window.sessionStorage.getItem(GUEST_MODE_KEY) === 'true'

// 이메일 첫 글자 이니셜
const getInitial = (email) => {
  if (!email) return '?'
  return email.charAt(0).toUpperCase()
}

// JWT access_token에서 role 클레임을 파싱
const getSessionRole = (session) => {
  const token = session?.access_token
  if (!token) return 'authenticated'

  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.role || 'authenticated'
  } catch {
    return 'authenticated'
  }
}

// 테이블 셀 값 표시용 포맷터
const formatCellValue = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// 로그아웃 실행 함수
const handleLogout = async () => {
  window.sessionStorage.removeItem(GUEST_MODE_KEY)
  await supabase.auth.signOut()
}

// 서로 연관된 과목 조회 상태(데이터/카운트/로딩/조회완료/에러/마지막조회시각)를 하나의 리듀서로 통합 관리합니다.
const initialCoursesState = {
  courses: [],
  courseCount: null,
  coursesLoading: true,
  hasFetchedCourses: false,
  coursesError: '',
  lastFetchedAt: '',
}

function coursesReducer(state, action) {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, coursesLoading: true, coursesError: '' }
    case 'FETCH_SUCCESS':
      return {
        ...state,
        courses: action.courses,
        courseCount: action.count,
        lastFetchedAt: action.lastFetchedAt,
        coursesError: '',
        hasFetchedCourses: true,
        coursesLoading: false,
      }
    case 'FETCH_ERROR':
      return {
        ...state,
        courses: [],
        courseCount: null,
        coursesError: action.message,
        hasFetchedCourses: true,
        coursesLoading: false,
      }
    default:
      return state
  }
}

const Courses = () => {
  const navigate = useNavigate()
  const [userEmail, setUserEmail] = useState('')
  const [authLoading, setAuthLoading] = useState(true)
  const [accessRole, setAccessRole] = useState('확인 중')

  // 과목 조회 관련 상태를 useReducer로 묶고, 기존 읽기 코드 호환을 위해 동일한 이름으로 구조 분해합니다.
  const [coursesState, dispatchCourses] = useReducer(coursesReducer, initialCoursesState)
  const { courses, courseCount, coursesLoading, hasFetchedCourses, coursesError, lastFetchedAt } = coursesState

  const fetchCourses = useCallback(async () => {
    dispatchCourses({ type: 'FETCH_START' })

    const { data, error, count } = await supabase
      .from(COURSES_TABLE)
      .select('*', { count: 'exact' })
      .limit(SAMPLE_LIMIT)

    if (error) {
      dispatchCourses({ type: 'FETCH_ERROR', message: error.message })
    } else {
      dispatchCourses({
        type: 'FETCH_SUCCESS',
        courses: data || [],
        count,
        lastFetchedAt: new Date().toLocaleString('ko-KR'),
      })
    }
  }, [])

  useEffect(() => {
    if (window.location.search || window.location.hash.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0]
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }

    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        setUserEmail(session.user.email)
        setAccessRole(getSessionRole(session))
      } else if (isGuestMode()) {
        setUserEmail(GUEST_EMAIL)
        setAccessRole('anon (게스트)')
      } else {
        navigate('/', { replace: true })
        return
      }

      setAuthLoading(false)
      // 인증 확인 직후 과목 데이터를 직접 호출합니다.
      // (이전에는 authLoading 상태를 감시하는 useEffect로 우회 호출했으나, 인증 핸들러에서 직접 호출하도록 변경)
      fetchCourses()
    }

    fetchSession()

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

    return () => subscription.unsubscribe()
  }, [navigate, fetchCourses])

  const columns = useMemo(() => {
    const names = new Set()
    courses.forEach((course) => {
      Object.keys(course || {}).forEach((key) => names.add(key))
    })
    return Array.from(names)
  }, [courses])

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

  return (
    <div className="dashboard courses-page">
      <nav className="nav">
        <button
          type="button"
          className="nav-brand courses-clickable-brand"
          onClick={() => navigate('/main')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="16" height="3" rx="1.5" fill="var(--color-primary)" opacity="0.9" />
            <rect x="2" y="8.5" width="16" height="3" rx="1.5" fill="var(--color-subject-3)" opacity="0.75" />
            <rect x="2" y="14" width="16" height="3" rx="1.5" fill="var(--color-subject-5)" opacity="0.65" />
          </svg>
          <span>과목</span>조회
        </button>

        <div className="nav-links courses-nav-links">
          <button type="button" className="nav-link" onClick={() => navigate('/main')}>
            홈
          </button>
          <button type="button" className="nav-link" onClick={() => navigate('/tetris')}>
            시간표 편성
          </button>
          <span className="nav-link nav-link-active">과목 조회</span>
        </div>

        <div className="flex gap-3 courses-nav-actions">
          <div className="user-badge">
            <div className="user-avatar">{getInitial(userEmail)}</div>
            <span className="courses-user-email">{userEmail}</span>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </nav>

      <main className="dashboard-content">
        <div className="container">
          <div className="courses-page-header animate-in">
            <div>
              <p className="courses-kicker">Supabase 연결 테스트</p>
              <h2 className="courses-heading">과목 테이블 조회</h2>
              <p className="courses-description">
                <code>{COURSES_TABLE}</code> 테이블에서 샘플 데이터를 불러와 연결 상태를 확인합니다.
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-md" onClick={fetchCourses} disabled={coursesLoading}>
              {coursesLoading ? '조회 중...' : '다시 조회'}
            </button>
          </div>

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
