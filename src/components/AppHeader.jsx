import React, { useEffect, useMemo, useRef, useState } from 'react'
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

/**
 * AppHeader 컴포넌트
 * 애플리케이션의 최상단 내비게이션 바를 담당하며, 페이지 이동(홈, 시간표 설정), 
 * 사용자의 주전공/부전공 조회 및 수정 팝오버, 로그아웃 기능을 제공합니다.
 * 
 * [Props 설명]
 * @param {string} active - 현재 활성화된 메뉴 ('main' 또는 'tetris')
 * @param {string} userEmail - 로그인한 사용자의 이메일 주소
 * @param {function} onLogout - 로그아웃 버튼 클릭 시 실행할 콜백 함수
 * @param {boolean} isGuest - 현재 게스트 모드 로그인 여부 (기본값: false)
 */
const AppHeader = ({ active, userEmail, onLogout, isGuest = false }) => {
  const navigate = useNavigate() // 페이지 이동을 위한 react-router-dom 훅
  const departmentPanelRef = useRef(null) // 전공 설정 팝오버 영역 바깥 클릭을 감지하기 위한 ref
  
  // 전공 정보 관리 권한 여부: 로그인 상태이고 게스트 모드가 아니어야 함
  const canManageDepartments = Boolean(userEmail) && !isGuest

  // --- State(상태) 정의 ---
  // 저장된 전공 및 부전공 상태
  const [majorDepartment, setMajorDepartment] = useState('')
  const [minorDepartment, setMinorDepartment] = useState('')
  
  // 팝오버(설정 창) 내에서 임시로 선택 중인 전공 및 부전공 상태 (저장 전 임시 상태)
  const [draftMajorDepartment, setDraftMajorDepartment] = useState('')
  const [draftMinorDepartment, setDraftMinorDepartment] = useState('')
  
  // DB에서 가져온 전체 학과/전공 목록 옵션
  const [departmentOptions, setDepartmentOptions] = useState([])
  
  // 로딩 및 API 요청 상태 관리
  const [departmentsLoading, setDepartmentsLoading] = useState(false) // 학과 목록 로딩 여부
  const [departmentsFetched, setDepartmentsFetched] = useState(false) // 학과 목록을 이미 가져왔는지 여부
  const [profileLoading, setProfileLoading] = useState(false)         // 사용자 프로필 로딩 여부
  const [profileSaving, setProfileSaving] = useState(false)           // 프로필 저장 중 여부
  
  // UI 상태 관리
  const [departmentPanelOpen, setDepartmentPanelOpen] = useState(false) // 전공 설정 팝오버 열림 여부
  const [departmentError, setDepartmentError] = useState('')             // 오류 메시지 상태
  const [profileMessage, setProfileMessage] = useState('')             // 성공 메시지 상태

  /**
   * [useMemo] selectDepartmentOptions
   * 드롭다운(select) 메뉴에 표시할 최종 학과 목록을 계산합니다.
   * DB에서 로딩된 학과 목록(`departmentOptions`)에 더해, 혹시라도 현재 사용자가 설정 중이거나 
   * 설정해 둔 전공(`majorDepartment` 등)이 목록에 없다면 이를 포함(Set을 사용해 중복 제거)시킨 뒤 
   * 가나다순('ko-KR')으로 정렬하여 반환합니다.
   * 의존성 배열에 지정된 값들이 변경될 때만 재계산되어 렌더링 성능을 최적화합니다.
   */
  const selectDepartmentOptions = useMemo(() => {
    const values = new Set([
      ...departmentOptions,
      majorDepartment,
      minorDepartment,
      draftMajorDepartment,
      draftMinorDepartment,
    ].filter(Boolean)) // null, undefined, 빈 문자열 제거

    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ko-KR'))
  }, [departmentOptions, draftMajorDepartment, draftMinorDepartment, majorDepartment, minorDepartment])

  // 전공 표시 영역 텍스트 정의 (프로필 로딩 중이면 '불러오는 중...', 저장된 값이 없으면 '선택해주세요')
  const majorDisplay = profileLoading ? '불러오는 중...' : majorDepartment || EMPTY_DEPARTMENT_LABEL

  /**
   * [useEffect 1] 사용자 전공/부전공 정보 로딩
   * 컴포넌트가 렌더링되거나 `userEmail`, `canManageDepartments` 권한 정보가 바뀔 때 실행됩니다.
   * 비동기 작업 도중 컴포넌트가 언마운트되거나 이메일이 바뀌는 경우의 경쟁 상태(Race Condition)를 방지하기 위해 
   * `ignore` 플래그(Clean-up 함수로 관리)를 활용합니다.
   */
  useEffect(() => {
    // 권한이 없으면 전공 정보 초기화 및 팝오버를 닫습니다.
    if (!canManageDepartments) {
      setMajorDepartment('')
      setMinorDepartment('')
      setDepartmentPanelOpen(false)
      return
    }

    let ignore = false // 비동기 응답 처리 무시 여부 플래그

    const loadProfile = async () => {
      setProfileLoading(true)
      setDepartmentError('')

      try {
        // Supabase/서버에서 해당 이메일을 사용하는 유저의 전공 프로필을 가져옴
        const profile = await fetchUserDepartmentProfile(userEmail)
        if (ignore) return // 컴포넌트가 언마운트된 경우 상태 업데이트 생략

        setMajorDepartment(profile.majorDepartment)
        setMinorDepartment(profile.minorDepartment)
      } catch (error) {
        if (!ignore) {
          setDepartmentError(error?.message || '전공 정보를 불러오지 못했습니다.')
        }
      } finally {
        if (!ignore) {
          setProfileLoading(false)
        }
      }
    }

    loadProfile()

    // Clean-up 함수: 다음 useEffect 실행 전 또는 컴포넌트 파괴 시 실행되어 이전 비동기 처리를 무시
    return () => {
      ignore = true
    }
  }, [canManageDepartments, userEmail])

  /**
   * [useEffect 2] 학과 목록(Options) 로딩
   * 전공 설정 팝오버가 열리고(`departmentPanelOpen === true`), 아직 목록을 가져오지 않은 경우에만 
   * API를 호출하여 전체 학과 목록 데이터를 로딩합니다.
   */
  useEffect(() => {
    if (!canManageDepartments || !departmentPanelOpen || departmentsFetched) return

    let ignore = false

    const loadDepartments = async () => {
      setDepartmentsLoading(true)
      setDepartmentError('')

      try {
        // 서버/DB에서 전체 학과 목록 조회
        const options = await fetchDepartmentOptions()
        if (ignore) return

        setDepartmentOptions(options)
        setDepartmentsFetched(true) // 데이터 로딩 완료 상태로 기록 (재요청 방지)
      } catch (error) {
        if (!ignore) {
          setDepartmentError(error?.message || '전공 목록을 불러오지 못했습니다.')
        }
      } finally {
        if (!ignore) {
          setDepartmentsLoading(false)
        }
      }
    }

    loadDepartments()

    return () => {
      ignore = true
    }
  }, [canManageDepartments, departmentPanelOpen, departmentsFetched])

  /**
   * [useEffect 3] 팝오버 바깥 영역 클릭 및 ESC 키 이벤트 리스너 등록
   * 팝오버가 열렸을 때 사용자가 바깥 영역을 클릭하거나 키보드 ESC 키를 누르면 팝오버를 자동으로 닫습니다.
   */
  useEffect(() => {
    if (!departmentPanelOpen) return

    // 팝오버 박스 외부 클릭 감지 함수
    const handleClickOutside = (event) => {
      // ref가 설정되어 있고, 클릭한 대상(event.target)이 팝오버 영역 내부에 포함되어 있지 않다면 팝오버를 닫음
      if (departmentPanelRef.current && !departmentPanelRef.current.contains(event.target)) {
        setDepartmentPanelOpen(false)
      }
    }

    // ESC 키 입력 감지 함수
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDepartmentPanelOpen(false)
      }
    }

    // 문서 전역에 마우스 및 키보드 이벤트 리스너 추가
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    // Clean-up 함수: 팝오버가 닫히면 메모리 누수 방지를 위해 이벤트 리스너를 제거
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [departmentPanelOpen])

  /**
   * [useEffect 4] 팝오버 오픈 시 임시 선택값 동기화
   * 팝오버가 열릴 때 현재 실제 저장되어 있는 전공/부전공 상태(`majorDepartment`, `minorDepartment`)를 
   * 임시 상태(`draftMajorDepartment`, `draftMinorDepartment`)에 대입하여 최신화합니다.
   * 또한 이전의 메시지들도 비워줍니다.
   */
  useEffect(() => {
    if (!departmentPanelOpen) return

    setDraftMajorDepartment(majorDepartment)
    setDraftMinorDepartment(minorDepartment)
    setProfileMessage('')
  }, [departmentPanelOpen, majorDepartment, minorDepartment])

  // 전공 설정 버튼 클릭 시 팝오버 창 토글
  const toggleDepartmentPanel = () => {
    if (!canManageDepartments) return
    setDepartmentPanelOpen((open) => !open)
  }

  /**
   * 전공 정보 저장 처리 함수
   * 사용자가 선택한 임시 전공/부전공 값을 검증한 뒤 서버에 저장하고 반영합니다.
   */
  const handleSaveDepartments = async () => {
    const nextMajor = draftMajorDepartment.trim()
    const nextMinor = draftMinorDepartment.trim()

    // 1. 유효성 검사: 전공과 부전공이 같은 값으로 선택되었는지 확인
    if (nextMajor && nextMinor && nextMajor === nextMinor) {
      setDepartmentError('전공과 부전공은 서로 다르게 선택해주세요.')
      return
    }

    setProfileSaving(true)
    setDepartmentError('')
    setProfileMessage('')

    // 2. 서버/Supabase에 프로필 데이터 저장 요청
    const { profile, error } = await saveUserDepartmentProfile({
      majorDepartment: nextMajor,
      minorDepartment: nextMinor,
    })

    if (error) {
      setDepartmentError(error.message || '전공 정보를 저장하지 못했습니다.')
      setProfileSaving(false)
      return
    }

    // 3. 저장 성공 시 상위 상태들을 최신화하고 메시지 노출 후 팝오버 닫음
    setMajorDepartment(profile.majorDepartment)
    setMinorDepartment(profile.minorDepartment)
    setProfileMessage('저장했습니다.')
    setProfileSaving(false)
    setDepartmentPanelOpen(false)
  }

  return (
    <nav className="nav app-header">
      {/* 좌측 브랜드 로고 및 탭 이동 영역 */}
      <div className="app-header-left">
        {/* 서비스 타이틀 클릭 시 메인 대시보드로 이동 */}
        <div className="nav-brand app-header-brand" onClick={() => navigate('/main')}>
          {/* 블록 형태의 4개 정사각형 아이콘 SVG */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="8" height="8" rx="2" fill="var(--color-primary)" opacity="0.9" />
            <rect x="11" y="1" width="8" height="8" rx="2" fill="var(--color-subject-3)" opacity="0.7" />
            <rect x="1" y="11" width="8" height="8" rx="2" fill="var(--color-subject-5)" opacity="0.6" />
            <rect x="11" y="11" width="8" height="8" rx="2" fill="var(--color-subject-2)" opacity="0.8" />
          </svg>
          <span>공강</span>테트리스
        </div>

        {/* 내비게이션 탭 메뉴 */}
        <ul className="nav-links app-header-links">
          <li
            className={`nav-link ${active === 'main' ? 'nav-link-active' : ''}`}
            onClick={() => navigate('/main')}
          >
            홈
          </li>
          <li
            className={`nav-link ${active === 'tetris' ? 'nav-link-active' : ''}`}
            onClick={() => navigate('/tetris')}
          >
            시간표 설정
          </li>
        </ul>
      </div>

      {/* 우측 전공 선택 단추 및 로그인 사용자 정보, 로그아웃 영역 */}
      <div className="flex gap-3 app-header-actions">
        {/* 일반 사용자(게스트 아님)의 경우 전공 정보 편집 팝오버 노출 */}
        {canManageDepartments && (
          <div className="app-header-departments" ref={departmentPanelRef}>
            {/* 전공 버튼 */}
            <button
              type="button"
              className="app-header-department-button"
              aria-expanded={departmentPanelOpen}
              onClick={toggleDepartmentPanel}
            >
              <span className="app-header-department-label">전공</span>
              <span className="app-header-department-value">{majorDisplay}</span>
            </button>

            {/* 부전공 버튼: 설정된 부전공이 존재하는 경우에만 활성화 및 텍스트 렌더링 */}
            {minorDepartment && (
              <button
                type="button"
                className="app-header-department-button app-header-department-button-minor"
                aria-expanded={departmentPanelOpen}
                onClick={toggleDepartmentPanel}
              >
                <span className="app-header-department-label">부전공</span>
                <span className="app-header-department-value">{minorDepartment}</span>
              </button>
            )}

            {/* 전공 설정 드롭다운/팝오버 레이어 */}
            {departmentPanelOpen && (
              <div className="app-header-department-popover">
                <div className="app-header-department-popover-header">
                  <strong>전공 설정</strong>
                  {/* 팝오버 닫기 엑스 버튼 */}
                  <button
                    type="button"
                    className="app-header-popover-close"
                    aria-label="전공 설정 닫기"
                    onClick={() => setDepartmentPanelOpen(false)}
                  >
                    ×
                  </button>
                </div>

                {/* 주전공 선택 필드 */}
                <label className="app-header-field">
                  <span>전공</span>
                  <select
                    className="input app-header-select"
                    value={draftMajorDepartment}
                    disabled={departmentsLoading || profileSaving}
                    onChange={(event) => setDraftMajorDepartment(event.target.value)}
                  >
                    <option value="">{departmentsLoading ? '목록을 불러오는 중...' : EMPTY_DEPARTMENT_LABEL}</option>
                    {selectDepartmentOptions.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </label>

                {/* 부전공 선택 필드 (선택한 주전공 학과는 필터링하여 선택할 수 없도록 방지) */}
                <label className="app-header-field">
                  <span>부전공</span>
                  <select
                    className="input app-header-select"
                    value={draftMinorDepartment}
                    disabled={departmentsLoading || profileSaving}
                    onChange={(event) => setDraftMinorDepartment(event.target.value)}
                  >
                    <option value="">선택하지 않음</option>
                    {selectDepartmentOptions
                      .filter((department) => department !== draftMajorDepartment)
                      .map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                  </select>
                </label>

                {/* 에러 및 성공 상태 메시지 출력 */}
                {departmentError && (
                  <p className="app-header-department-message app-header-department-message-error">
                    {departmentError}
                  </p>
                )}
                {profileMessage && (
                  <p className="app-header-department-message app-header-department-message-success">
                    {profileMessage}
                  </p>
                )}

                {/* 하단 취소 및 저장 작업 영역 */}
                <div className="app-header-popover-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDepartmentPanelOpen(false)}
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
        )}

        {/* 로그인 사용자 배지 (이메일 앞자리 아바타 엠블럼 + 전체 이메일 주소) */}
        <div className="user-badge">
          <div className="user-avatar">{getInitial(userEmail)}</div>
          <span className="app-header-user-email">{userEmail}</span>
        </div>

        {/* 로그아웃 액션 버튼 */}
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </nav>
  )
}

export default AppHeader

