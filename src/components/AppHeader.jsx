import React, { useEffect, useMemo, useReducer, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
// 사용자 부서/전공 프로필과 관련된 API 함수들을 임포트합니다.
import {
  fetchDepartmentOptions,
  fetchUserDepartmentProfile,
  saveUserDepartmentProfile,
} from '../userDepartmentProfile'
import './AppHeader.css'

// 전공/부전공이 선택되지 않았을 때 표시할 기본 라벨 상수
const EMPTY_DEPARTMENT_LABEL = '선택해주세요'

/**
 * 이메일의 첫 글자를 따서 아바타에 표시할 이니셜을 반환하는 헬퍼 함수
 * @param {string} email - 사용자의 이메일 주소
 * @returns {string} 이메일의 첫 글자(대문자) 또는 이메일이 없을 경우 '?'
 */
const getInitial = (email) => {
  if (!email) return '?'
  return email.charAt(0).toUpperCase()
}

// 전공 설정 패널 상태 초기값
const initialDepartmentState = {
  major: '',                 // 저장된 주전공
  minor: '',                 // 저장된 부전공
  draftMajor: '',            // 팝오버에서 편집 중인 주전공
  draftMinor: '',            // 팝오버에서 편집 중인 부전공
  options: [],               // DB에서 가져온 전체 학과 목록
  profileLoading: true,      // 프로필 로딩 여부 (마운트 직후 즉시 로딩하므로 true로 시작)
  departmentsLoading: false, // 학과 목록 로딩 여부
  profileSaving: false,      // 프로필 저장 진행 여부
  panelOpen: false,          // 전공 설정 팝오버 열림 여부
  error: '',                 // 오류 메시지
  message: '',               // 성공 메시지
}

/**
 * 전공 설정 패널 리듀서
 * 서로 밀접하게 연관된 전공 상태(저장값/편집값/목록/로딩/메시지/열림)를 하나로 묶어 일관되게 갱신합니다.
 */
function departmentReducer(state, action) {
  switch (action.type) {
    case 'PROFILE_LOAD_SUCCESS':
      return { ...state, major: action.major, minor: action.minor, profileLoading: false }
    case 'PROFILE_LOAD_ERROR':
      return { ...state, error: action.message, profileLoading: false }
    case 'DEPARTMENTS_LOAD_START':
      return { ...state, departmentsLoading: true, error: '' }
    case 'DEPARTMENTS_LOAD_SUCCESS':
      return { ...state, options: action.options, departmentsLoading: false }
    case 'DEPARTMENTS_LOAD_ERROR':
      return { ...state, error: action.message, departmentsLoading: false }
    case 'OPEN_PANEL':
      // 팝오버를 열면서 현재 저장값을 편집용 draft로 동기화하고 메시지를 비웁니다.
      // (이전에는 별도 useEffect로 처리했으나, 팝오버를 여는 이벤트에서 직접 처리)
      return { ...state, panelOpen: true, draftMajor: state.major, draftMinor: state.minor, message: '' }
    case 'CLOSE_PANEL':
      return { ...state, panelOpen: false }
    case 'SET_DRAFT_MAJOR':
      return { ...state, draftMajor: action.value }
    case 'SET_DRAFT_MINOR':
      return { ...state, draftMinor: action.value }
    case 'SAVE_VALIDATION_ERROR':
      return { ...state, error: action.message }
    case 'SAVE_START':
      return { ...state, profileSaving: true, error: '', message: '' }
    case 'SAVE_ERROR':
      return { ...state, error: action.message, profileSaving: false }
    case 'SAVE_SUCCESS':
      return {
        ...state,
        major: action.major,
        minor: action.minor,
        message: '저장했습니다.',
        profileSaving: false,
        panelOpen: false,
      }
    default:
      return state
  }
}

/**
 * DepartmentSettings 컴포넌트
 * 사용자의 주전공/부전공 조회·수정 팝오버를 담당합니다.
 *
 * 전공 관리 권한이 있을 때(canManageDepartments)에만 마운트되므로, 권한이 사라지면 언마운트되어
 * 관련 상태가 자연히 초기화됩니다 — 별도의 "prop 변경 시 상태 리셋" effect가 필요 없습니다.
 *
 * @param {string} userEmail - 로그인한 사용자의 이메일 주소
 */
const DepartmentSettings = ({ userEmail }) => {
  const panelRef = useRef(null)               // 팝오버 바깥 클릭 감지용 ref
  const departmentsFetchedRef = useRef(false) // 학과 목록을 이미 가져왔는지 (렌더에 쓰이지 않으므로 ref로 관리)

  const [state, dispatch] = useReducer(departmentReducer, initialDepartmentState)
  const {
    major, minor, draftMajor, draftMinor, options,
    profileLoading, departmentsLoading, profileSaving,
    panelOpen, error, message,
  } = state

  /**
   * 드롭다운(select)에 표시할 최종 학과 목록.
   * DB 목록에 더해, 저장/편집 중인 값이 목록에 없을 수 있으므로 합쳐 중복 제거 후 가나다순 정렬합니다.
   */
  const selectDepartmentOptions = useMemo(() => {
    const values = new Set([...options, major, minor, draftMajor, draftMinor].filter(Boolean))
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ko-KR'))
  }, [options, draftMajor, draftMinor, major, minor])

  // 전공 표시 텍스트 (로딩 중이면 '불러오는 중...', 저장값이 없으면 '선택해주세요')
  const majorDisplay = profileLoading ? '불러오는 중...' : major || EMPTY_DEPARTMENT_LABEL

  /**
   * [effect 1] 마운트 시(또는 userEmail 변경 시) 사용자 전공 프로필 로딩.
   * race condition 방지를 위해 ignore 플래그를 사용하며, await 이후의 상태 갱신만 수행합니다.
   */
  useEffect(() => {
    let ignore = false

    const loadProfile = async () => {
      try {
        const profile = await fetchUserDepartmentProfile(userEmail)
        if (!ignore) {
          dispatch({ type: 'PROFILE_LOAD_SUCCESS', major: profile.majorDepartment, minor: profile.minorDepartment })
        }
      } catch (err) {
        if (!ignore) {
          dispatch({ type: 'PROFILE_LOAD_ERROR', message: err?.message || '전공 정보를 불러오지 못했습니다.' })
        }
      }
    }

    loadProfile()

    return () => {
      ignore = true
    }
  }, [userEmail])

  /**
   * [effect 2] 팝오버가 처음 열릴 때 1회 전체 학과 목록 로딩 (departmentsFetchedRef로 재요청 방지).
   */
  useEffect(() => {
    if (!panelOpen || departmentsFetchedRef.current) return

    let ignore = false

    const loadDepartments = async () => {
      dispatch({ type: 'DEPARTMENTS_LOAD_START' })
      try {
        const fetchedOptions = await fetchDepartmentOptions()
        if (!ignore) {
          departmentsFetchedRef.current = true
          dispatch({ type: 'DEPARTMENTS_LOAD_SUCCESS', options: fetchedOptions })
        }
      } catch (err) {
        if (!ignore) {
          dispatch({ type: 'DEPARTMENTS_LOAD_ERROR', message: err?.message || '전공 목록을 불러오지 못했습니다.' })
        }
      }
    }

    loadDepartments()

    return () => {
      ignore = true
    }
  }, [panelOpen])

  /**
   * [effect 3] 팝오버 외부 클릭 / ESC 키로 팝오버 닫기.
   */
  useEffect(() => {
    if (!panelOpen) return

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        dispatch({ type: 'CLOSE_PANEL' })
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') dispatch({ type: 'CLOSE_PANEL' })
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [panelOpen])

  // 전공 버튼 클릭 시 팝오버 토글 (열 때의 draft 동기화는 OPEN_PANEL 액션이 담당)
  const togglePanel = () => dispatch({ type: panelOpen ? 'CLOSE_PANEL' : 'OPEN_PANEL' })

  /**
   * 전공 정보 저장 처리 함수
   * 임시 전공/부전공 값을 검증한 뒤 서버에 저장하고 반영합니다.
   */
  const handleSaveDepartments = async () => {
    const nextMajor = draftMajor.trim()
    const nextMinor = draftMinor.trim()

    // 유효성 검사: 전공과 부전공이 동일하게 선택되었는지 확인
    if (nextMajor && nextMinor && nextMajor === nextMinor) {
      dispatch({ type: 'SAVE_VALIDATION_ERROR', message: '전공과 부전공은 서로 다르게 선택해주세요.' })
      return
    }

    dispatch({ type: 'SAVE_START' })

    const { profile, error: saveError } = await saveUserDepartmentProfile({
      majorDepartment: nextMajor,
      minorDepartment: nextMinor,
    })

    if (saveError) {
      dispatch({ type: 'SAVE_ERROR', message: saveError.message || '전공 정보를 저장하지 못했습니다.' })
      return
    }

    dispatch({ type: 'SAVE_SUCCESS', major: profile.majorDepartment, minor: profile.minorDepartment })
  }

  return (
    <div className="app-header-departments" ref={panelRef}>
      {/* 전공 버튼 */}
      <button
        type="button"
        className="app-header-department-button"
        aria-expanded={panelOpen}
        onClick={togglePanel}
      >
        <span className="app-header-department-label">전공</span>
        <span className="app-header-department-value">{majorDisplay}</span>
      </button>

      {/* 부전공 버튼: 설정된 부전공이 존재하는 경우에만 렌더링 */}
      {minor && (
        <button
          type="button"
          className="app-header-department-button app-header-department-button-minor"
          aria-expanded={panelOpen}
          onClick={togglePanel}
        >
          <span className="app-header-department-label">부전공</span>
          <span className="app-header-department-value">{minor}</span>
        </button>
      )}

      {/* 전공 설정 드롭다운/팝오버 레이어 */}
      {panelOpen && (
        <div className="app-header-department-popover">
          <div className="app-header-department-popover-header">
            <strong>전공 설정</strong>
            {/* 팝오버 닫기 엑스 버튼 */}
            <button
              type="button"
              className="app-header-popover-close"
              aria-label="전공 설정 닫기"
              onClick={() => dispatch({ type: 'CLOSE_PANEL' })}
            >
              ×
            </button>
          </div>

          {/* 주전공 선택 필드 */}
          <label className="app-header-field">
            <span>전공</span>
            <select
              className="input app-header-select"
              value={draftMajor}
              disabled={departmentsLoading || profileSaving}
              onChange={(event) => dispatch({ type: 'SET_DRAFT_MAJOR', value: event.target.value })}
            >
              <option value="">{departmentsLoading ? '목록을 불러오는 중...' : EMPTY_DEPARTMENT_LABEL}</option>
              {selectDepartmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>

          {/* 부전공 선택 필드 (선택한 주전공 학과는 제외) */}
          <label className="app-header-field">
            <span>부전공</span>
            <select
              className="input app-header-select"
              value={draftMinor}
              disabled={departmentsLoading || profileSaving}
              onChange={(event) => dispatch({ type: 'SET_DRAFT_MINOR', value: event.target.value })}
            >
              <option value="">선택하지 않음</option>
              {/* 선택한 주전공은 부전공 목록에서 제외 (flatMap으로 필터+매핑을 단일 순회로 처리) */}
              {selectDepartmentOptions.flatMap((department) =>
                department === draftMajor
                  ? []
                  : [
                      <option key={department} value={department}>
                        {department}
                      </option>,
                    ]
              )}
            </select>
          </label>

          {/* 에러 및 성공 상태 메시지 출력 */}
          {error && (
            <p className="app-header-department-message app-header-department-message-error">
              {error}
            </p>
          )}
          {message && (
            <p className="app-header-department-message app-header-department-message-success">
              {message}
            </p>
          )}

          {/* 하단 취소 및 저장 작업 영역 */}
          <div className="app-header-popover-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => dispatch({ type: 'CLOSE_PANEL' })}
            >
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={profileSaving || departmentsLoading}
              onClick={handleSaveDepartments}
            >
              {profileSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * AppHeader 컴포넌트
 * 애플리케이션의 최상단 내비게이션 바를 담당하며, 페이지 이동(홈, 시간표 설정),
 * 사용자의 주전공/부전공 조회 및 수정 팝오버(DepartmentSettings), 로그아웃 기능을 제공합니다.
 *
 * [Props 설명]
 * @param {string} active - 현재 활성화된 메뉴 ('main' 또는 'tetris')
 * @param {string} userEmail - 로그인한 사용자의 이메일 주소
 * @param {function} onLogout - 로그아웃 버튼 클릭 시 실행할 콜백 함수
 * @param {boolean} isGuest - 현재 게스트 모드 로그인 여부 (기본값: false)
 */
const AppHeader = ({ active, userEmail, onLogout, isGuest = false }) => {
  const navigate = useNavigate() // 페이지 이동을 위한 react-router-dom 훅

  // 전공 정보 관리 권한 여부: 로그인 상태이고 게스트 모드가 아니어야 함
  const canManageDepartments = Boolean(userEmail) && !isGuest

  return (
    <nav className="nav app-header">
      {/* 좌측 브랜드 로고 및 탭 이동 영역 */}
      <div className="app-header-left">
        {/* 서비스 타이틀 클릭 시 메인 대시보드로 이동 */}
        <button type="button" className="nav-brand app-header-brand" onClick={() => navigate('/main')}>
          {/* 블록 형태의 4개 정사각형 아이콘 SVG */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="8" height="8" rx="2" fill="var(--color-primary)" opacity="0.9" />
            <rect x="11" y="1" width="8" height="8" rx="2" fill="var(--color-subject-3)" opacity="0.7" />
            <rect x="1" y="11" width="8" height="8" rx="2" fill="var(--color-subject-5)" opacity="0.6" />
            <rect x="11" y="11" width="8" height="8" rx="2" fill="var(--color-subject-2)" opacity="0.8" />
          </svg>
          <span>공강</span>테트리스
        </button>

        {/* 내비게이션 탭 메뉴 */}
        <div className="nav-links app-header-links">
          <button
            type="button"
            className={`nav-link ${active === 'main' ? 'nav-link-active' : ''}`}
            onClick={() => navigate('/main')}
          >
            홈
          </button>
          <button
            type="button"
            className={`nav-link ${active === 'tetris' ? 'nav-link-active' : ''}`}
            onClick={() => navigate('/tetris')}
          >
            시간표 설정
          </button>
        </div>
      </div>

      {/* 우측 전공 선택 단추 및 로그인 사용자 정보, 로그아웃 영역 */}
      <div className="flex gap-3 app-header-actions">
        {/* 일반 사용자(게스트 아님)의 경우에만 전공 정보 편집 팝오버 노출.
            key={userEmail}로 사용자가 바뀌면 내부 상태가 새로 초기화되도록 합니다. */}
        {canManageDepartments && <DepartmentSettings key={userEmail} userEmail={userEmail} />}

        {/* 로그인 사용자 배지 (이메일 앞자리 아바타 엠블럼 + 전체 이메일 주소) */}
        <div className="user-badge">
          <div className="user-avatar">{getInitial(userEmail)}</div>
          <span className="app-header-user-email">{userEmail}</span>
        </div>

        {/* 로그아웃 액션 버튼 */}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </nav>
  )
}

export default AppHeader
