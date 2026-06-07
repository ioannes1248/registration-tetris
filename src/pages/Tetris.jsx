import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { supabase } from '../supabaseClient'
import {
  createCourseByNameMap,
  generateTimetableSchedules,
  getCourseCode,
  getCourseDepartment,
  getCourseName,
  getCourseProfessor,
  getCourseScheduleCells,
  getCourseTimeAndPlace,
  getCourseType,
  getRequiredCourseConflict,
  normalizeDepartmentName,
} from '../timetableGenerator'
import { fetchUserDepartmentProfile } from '../userDepartmentProfile'
import './Tetris.css'

// ============================================================
// ----- TEMP GUEST LOGIN START -----
// ============================================================
const GUEST_MODE_KEY = 'registration-tetris:guest-mode'
const GUEST_EMAIL = 'guest@cku.ac.kr'
const COURSES_TABLE = 'test table'
const COURSES_PAGE_SIZE = 1000
// ============================================================

/**
 * =========================================================
 * [Tetris.jsx — 공강 테트리스 페이지 (화면 ID: tetris)]
 *
 * 화면 목적 : 시간표 조건 설정, 조합 생성, 후보 조회 및 비교
 * 진입 경로 : 메인 페이지 → 공강 테트리스 시작 버튼
 * 화면 구성 : 조건 설정 패널 + 시간표 그리드 + 후보 리스트 + 비교 영역
 *
 * ─────────────────────────────────────────────────────────
 * [컴포넌트 렌더링 흐름도]
 *
 * 1. 컴포넌트 마운트 (loading: true)
 * │
 * ├──▶ 2-A. fetchSession() 실행
 * │         : Supabase에 현재 세션을 확인합니다.
 * │           ├─ 세션 있음(O) ➔ 이메일을 State에 저장 ➔ loading 해제
 * │           └─ 세션 없음(X) ➔ / (인트로) 페이지로 강제 이동 (접근 차단)
 * │
 * └──▶ 2-B. onAuthStateChange() 구독 시작
 * : 실시간으로 인증 상태 변화를 감시합니다.
 * ├─ SIGNED_OUT 감지 ➔ / 페이지로 즉시 이동
 * └─ 세션 갱신 ➔ 이메일 State 업데이트
 *
 * 3. 화면 렌더링 (View) — 3-Column 레이아웃 (좌측 조건, 중앙 그리드, 우측 DB조회)
 * │
 * ├──▶ (로딩 중)  ─▶ 스피너 표시
 * │
 * └──▶ (로딩 완료) ─▶ 대시보드 렌더링
 * │
 * ├─▶ [좌측 패널] 조건 설정
 * │     ├─ [TT-001] 공강 요일 선택   : 월~금 토글 Chip
 * │     ├─ [TT-002] 선호 시간 설정   : 오전/오후/저녁 토글 Chip
 * │     ├─ [TT-003] 학점 범위 설정   : 최소/최대 숫자 입력
 * │     ├─ [TT-004] 필수과목 설정   : 검색 + 태그 추가/삭제
 * │     └─ [TT-006] 시간표 생성 버튼 : 조건 기반 조합 생성 트리거
 * │
 * ├─▶ [중앙 그리드] 시간표
 * │     ├─ [TT-005] 금지 시간 설정   : 셀 클릭으로 토글 (✕ 표시)
 * │     └─ [TT-007] 시간표 시각화   : 요일×시간 그리드 UI
 * │
 * ├─▶ [우측 패널] 개설 과목 조회 (DB 연동)
 * │     ├─ [TT-013] 과목 검색        : DB 데이터 실시간 필터링
 * │     └─ [TT-014] 필수과목 연동    : 카드 클릭 시 좌측 필수과목으로 즉시 추가
 * │
 * └─▶ [하단] 후보 목록
 * ├─ [TT-008] 후보 목록       : 카드 형태로 요약 정보 표시
 * ├─ [TT-009] 상세 보기       : 후보 선택 시 그리드 갱신
 * ├─ [TT-010] 후보 비교       : 2개+ 선택 시 비교 테이블
 * ├─ [TT-011] 시간표 저장     : PDF/TXT 내보내기
 * └─ [TT-012] 결과 재생성     : 조건 변경 후 재생성
 *
 * ─────────────────────────────────────────────────────────
 * [예외 처리]
 *
 * | 구분     | 발생 조건               | 사용자 메시지                             | 처리 방안              |
 * |----------|------------------------|----------------------------------------|------------------------|
 * | 조건입력 | 최소학점 > 최대학점     | "학점 범위를 다시 확인해주세요."         | 입력값 수정 유도        |
 * | 조건입력 | 모든 요일 공강 선택     | "조건이 너무 엄격하여 결과가 없을 수..."  | 경고 표시 후 진행 허용    |
 * | 조합생성 | 필수 과목 간 시간 충돌 | "선택한 필수 과목 간 시간 충돌..."       | 충돌 과목 안내          |
 * | 조합생성 | 조건 충족 결과 없음     | "조건에 맞는 시간표가 없습니다..."       | 조건 완화 가이드        |
 * | 세션     | 세션 만료               | —                                      | / 페이지로 리다이렉트  |
 * | 보안     | URL 찌꺼기 파라미터     | —                                      | replaceState로 삭제     |
 * =========================================================
 */

// 요일 상수 정의 (월요일부터 일요일까지)
const DAYS = ['월', '화', '수', '목', '금', '토', '일']

// 시간표의 교시별 시간대 정의 (1교시부터 13교시까지)
const TIMES = [
  { period: '1교시', time: '09:00' },
  { period: '2교시', time: '10:00' },
  { period: '3교시', time: '11:00' },
  { period: '4교시', time: '12:00' },
  { period: '5교시', time: '13:00' },
  { period: '6교시', time: '14:00' },
  { period: '7교시', time: '15:00' },
  { period: '8교시', time: '16:00' },
  { period: '9교시', time: '17:00' },
  { period: '10교시', time: '18:00' },
  { period: '11교시', time: '19:00' },
  { period: '12교시', time: '20:00' },
  { period: '13교시', time: '21:00' }
]

// 제외 설정이 가능한 전체 교시 목록
const EXCLUDED_PERIODS = [
  '1교시',
  '2교시',
  '3교시',
  '4교시',
  '5교시',
  '6교시',
  '7교시',
  '8교시',
  '9교시',
  '10교시',
  '11교시',
  '12교시',
  '13교시'
]

// 이수구분 카테고리 (우측 개설 과목 조회 필터링에 사용)
const SECONDARY_MAJOR_TYPE = '복수/부전공'
const SECONDARY_MAJOR_DB_TYPES = ['복수전공', '부전공']

const COURSE_TYPES = [
  '전체', '전공', '직무전공', '소단위전공', '교양필수', '교양선택', 
  SECONDARY_MAJOR_TYPE, '연계전공', '교직', 'ROTC/현장실습', '일반선택', '사이버'
]

const EMPTY_DEPARTMENT_PROFILE = { majorDepartment: '', minorDepartment: '' }

const COURSE_LIST_TYPES = {
  preferred: 'preferred',
  required: 'required',
}

const REQUIRED_COURSE_COLORS = [
  'var(--color-subject-3)',
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
  '#ef4444',
]

const fetchAllCourses = async () => {
  const courses = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(COURSES_TABLE)
      .select('*')
      .range(from, from + COURSES_PAGE_SIZE - 1)

    if (error) {
      throw error
    }

    courses.push(...(data || []))

    if (!data || data.length < COURSES_PAGE_SIZE) {
      break
    }

    from += COURSES_PAGE_SIZE
  }

  return courses
}

/**
 * Tetris 컴포넌트
 * 사용자가 공강 요일, 제외 시간대, 학점 범위, 필수 과목을 입력하여 
 * 가능한 대학 시간표의 조합을 설계하고, 개설된 교과목 목록을 조회할 수 있는 메인 기능 페이지입니다.
 */
const Tetris = () => {
  const navigate = useNavigate() // 페이지 강제 이동 및 라우팅을 위한 훅
  
  // --- 사용자 인증 및 로딩 상태 ---
  const [userEmail, setUserEmail] = useState('') // 로그인한 사용자 이메일 (게스트는 guest@cku.ac.kr)
  const [loading, setLoading] = useState(true)     // DB 데이터 및 세션 로딩 상태
  const [mounted, setMounted] = useState(false)    // 애니메이션 효과를 위한 마운트 완료 여부 State

  // --- 시간표 설정 관련 State ---
  const [freeDays, setFreeDays] = useState([])     // 사용자가 선택한 공강 희망 요일 목록 (예: ['금'])
  const [excludedPeriods, setExcludedPeriods] = useState(['10교시', '11교시', '12교시', '13교시']) // 기본 제외할 야간 시간대
  const [minCredits, setMinCredits] = useState(15) // 최소 신청 학점
  const [maxCredits, setMaxCredits] = useState(21) // 최대 신청 학점
  const [preferredCourse, setPreferredCourse] = useState('') // 선호 과목 입력창의 텍스트
  const [preferredCourses, setPreferredCourses] = useState([]) // 등록된 선호 과목명 배열
  const [requiredCourse, setRequiredCourse] = useState('') // 필수 과목 입력창의 텍스트
  const [requiredCourses, setRequiredCourses] = useState([]) // 등록된 필수 과목명 배열
  const [draggedCourseTag, setDraggedCourseTag] = useState(null) // 선호/필수 과목 간 이동 중인 태그 정보
  const [scheduleConflictAlert, setScheduleConflictAlert] = useState(null) // 필수 과목 시간 충돌 알림 정보
  const [generatedSchedules, setGeneratedSchedules] = useState([]) // 자동 생성된 시간표 후보 목록
  const [selectedGeneratedScheduleId, setSelectedGeneratedScheduleId] = useState(null) // 중앙 시간표에 표시 중인 자동 생성 후보 ID
  const [generationMessage, setGenerationMessage] = useState('') // 시간표 자동 생성 결과 안내 메시지
  const [forbiddenCells, setForbiddenCells] = useState(new Set()) // 시간표 그리드 상에서 개별 클릭하여 금지한 셀 세트 ("행번호-열번호" 포맷)

  // --- DB(Supabase) 데이터 및 필터링 관련 State ---
  const [dbCourses, setDbCourses] = useState([])   // Supabase의 'test table'에서 조회한 전체 개설 과목 목록
  const [searchTerm, setSearchTerm] = useState('') // 과목명/교수명 검색어 문자열
  const [selectedType, setSelectedType] = useState('전체') // 현재 선택된 대분류 이수구분
  const [selectedDept, setSelectedDept] = useState('전체') // 현재 선택된 소분류 학과/부서
  const [departmentProfile, setDepartmentProfile] = useState(EMPTY_DEPARTMENT_PROFILE) // 사용자가 선택한 전공/부전공 정보

  const selectedMajorDepartment = normalizeDepartmentName(departmentProfile.majorDepartment)
  const selectedMinorDepartment = normalizeDepartmentName(departmentProfile.minorDepartment)
  const profileDepartments = useMemo(
    () => [selectedMajorDepartment, selectedMinorDepartment].filter(Boolean),
    [selectedMajorDepartment, selectedMinorDepartment]
  )

  const handleDepartmentProfileChange = useCallback((profile = EMPTY_DEPARTMENT_PROFILE) => {
    setDepartmentProfile({
      majorDepartment: normalizeDepartmentName(profile.majorDepartment),
      minorDepartment: normalizeDepartmentName(profile.minorDepartment),
    })
  }, [])

  /**
   * [useEffect 1] 마운트 애니메이션 효과 트리거
   * 컴포넌트 렌더링 직후 `mounted`를 true로 세팅하여 페이드인 효과를 제공합니다.
   */
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  /**
   * [useEffect 2] 인증 세션 확인 및 Supabase 개설 과목 데이터 가져오기
   * 1. URL에 포함된 불필요한 쿼리나 해시 파라미터가 있을 경우 주소창을 정리합니다.
   * 2. Supabase 세션을 확인하거나 브라우저 세션스토리지의 게스트 모드 플래그를 검사하여 로그인 여부를 확인합니다.
   *    - 미인증 시 인트로('/')로 튕겨내 보안을 유지합니다.
   * 3. Supabase의 'test table' 테이블로부터 전체 과목 데이터를 비동기 조회하여 `dbCourses` 상태에 저장합니다.
   * 4. Supabase의 인증 상태 변화(`onAuthStateChange`)를 실시간으로 감시하여 로그아웃 등이 감지되면 인트로로 이동시킵니다.
   */
  useEffect(() => {
    // 1. URL 정리 (OAuth 로그인 시 주소창에 남는 토큰 파라미터 등 제거)
    if (window.location.search || window.location.hash.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0]
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }

    const fetchSessionAndData = async () => {
      // 2. 로그인 정보 및 게스트 모드 확인
      const { data: { session } } = await supabase.auth.getSession()
      const isGuestMode = window.sessionStorage.getItem(GUEST_MODE_KEY) === 'true'

      if (session?.user) {
        setUserEmail(session.user.email)
        const profile = await fetchUserDepartmentProfile(session.user.email)
        handleDepartmentProfileChange(profile)
      } else if (isGuestMode) {
        setUserEmail(GUEST_EMAIL)
        handleDepartmentProfileChange(EMPTY_DEPARTMENT_PROFILE)
      } else {
        // 인증정보가 없고 게스트 모드도 아니면 인트로 페이지로 리다이렉트
        navigate('/', { replace: true })
        return 
      }

      // 3. Supabase에서 전체 개설 과목 정보 조회
      try {
        const coursesData = await fetchAllCourses()
        setDbCourses(coursesData)
      } catch (error) {
        console.error('과목 데이터를 불러오는 중 오류 발생:', error.message)
      }

      setLoading(false) // 로딩 상태 해제
    }

    fetchSessionAndData()

    // 4. Supabase 인증 변경 이벤트 감시 리스너 설정
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        // 로그아웃 되었더라도 게스트 모드 세션이 켜져있다면 유예
        if (window.sessionStorage.getItem(GUEST_MODE_KEY) === 'true') {
          setUserEmail(GUEST_EMAIL)
          handleDepartmentProfileChange(EMPTY_DEPARTMENT_PROFILE)
          return
        }
        handleDepartmentProfileChange(EMPTY_DEPARTMENT_PROFILE)
        navigate('/', { replace: true })
      } else if (session?.user) {
        setUserEmail(session.user.email)
        fetchUserDepartmentProfile(session.user.email)
          .then(handleDepartmentProfileChange)
          .catch(() => handleDepartmentProfileChange(EMPTY_DEPARTMENT_PROFILE))
      }
    })

    // Clean-up: 컴포넌트 소멸 시 이벤트 리스너 해제
    return () => subscription.unsubscribe()
  }, [handleDepartmentProfileChange, navigate])

  /**
   * 로그아웃 처리 함수
   * 세션스토리지 게스트 정보 삭제 후 Supabase 로그아웃을 요청합니다.
   */
  const handleLogout = async () => {
    window.sessionStorage.removeItem(GUEST_MODE_KEY)
    await supabase.auth.signOut()
  }

  const courseByName = useMemo(() => createCourseByNameMap(dbCourses), [dbCourses])

  const getRequiredCourseScheduleCells = useCallback((courseName) => {
    const matchedCourse = courseByName.get(courseName)
    return getCourseScheduleCells(matchedCourse, DAYS, TIMES.length)
  }, [courseByName])

  const findRequiredCourseConflict = useCallback((courseName) => {
    return getRequiredCourseConflict({
      courseName,
      requiredCourses,
      courseByName,
      days: DAYS,
      periodCount: TIMES.length,
    })
  }, [courseByName, requiredCourses])

  const handleGenerateSchedules = () => {
    setGenerationMessage('')
    setGeneratedSchedules([])
    setSelectedGeneratedScheduleId(null)

    const { schedules, message } = generateTimetableSchedules({
      dbCourses,
      courseByName,
      requiredCourses,
      preferredCourses,
      minCredits,
      maxCredits,
      freeDays,
      excludedPeriods,
      forbiddenCells,
      days: DAYS,
      periodCount: TIMES.length,
    })

    setGeneratedSchedules(schedules)
    setGenerationMessage(message)
  }

  // --- 시간표 설정 관련 조작 이벤트 핸들러 ---
  
  // 공강 희망 요일 토글 (목록에 있으면 제거, 없으면 추가)
  const toggleFreeDay = (day) => setFreeDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  
  // 제외할 교시 시간대 토글
  const toggleExcludedPeriod = (period) => setExcludedPeriods(prev => prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period])
  
  // 선호 과목 태그 클릭 시 선호 목록에서 제거
  const removePreferredCourse = (course) => setPreferredCourses(prev => prev.filter(c => c !== course))
  
  // 텍스트 인풋 입력을 통한 선호 과목 수동 추가
  const addPreferredCourse = () => {
    const trimmed = preferredCourse.trim()
    if (trimmed && !preferredCourses.includes(trimmed)) {
      setPreferredCourses(prev => [...prev, trimmed])
      setPreferredCourse('') // 인풋 값 리셋
    }
  }

  // 필수 과목 태그 클릭 시 필수 목록에서 제거
  const removeRequiredCourse = (course) => setRequiredCourses(prev => prev.filter(c => c !== course))
  
  // 텍스트 인풋 입력을 통한 필수 과목 수동 추가
  const addRequiredCourse = () => {
    const trimmed = requiredCourse.trim()
    if (trimmed && !requiredCourses.includes(trimmed)) {
      const conflict = findRequiredCourseConflict(trimmed)
      if (conflict) {
        setScheduleConflictAlert(conflict)
        return
      }

      setRequiredCourses(prev => [...prev, trimmed])
      setRequiredCourse('') // 인풋 값 리셋
      setScheduleConflictAlert(null)
    }
  }

  /**
   * 시간표 개별 셀 클릭 시 금지 셀 지정/해제 핸들러
   * 행 인덱스(rowIdx)와 열 인덱(colIdx)로 고유 키(`rowIdx-colIdx`)를 만든 뒤 Set에 추가/삭제합니다.
   * React의 State 불변성을 유지하기 위해 신규 Set을 복사 생성하여 업데이트합니다.
   */
  const toggleForbiddenCell = (rowIdx, colIdx) => {
    const key = `${rowIdx}-${colIdx}`
    setForbiddenCells(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 우측 개설 과목 리스트에서 과목 카드 클릭 시 선호과목에 자동 추가 기능
  const handleAddCourseFromList = (courseName) => {
    if (!preferredCourses.includes(courseName)) {
      setPreferredCourses(prev => [...prev, courseName])
    }
  }

  const moveCourseTag = (courseName, sourceList, targetList) => {
    if (!courseName || sourceList === targetList) return

    if (targetList === COURSE_LIST_TYPES.preferred) {
      setRequiredCourses(prev => prev.filter(course => course !== courseName))
      setPreferredCourses(prev => prev.includes(courseName) ? prev : [...prev, courseName])
      setScheduleConflictAlert(null)
      return
    }

    const conflict = findRequiredCourseConflict(courseName)
    if (conflict) {
      setScheduleConflictAlert(conflict)
      return
    }

    setPreferredCourses(prev => prev.filter(course => course !== courseName))
    setRequiredCourses(prev => prev.includes(courseName) ? prev : [...prev, courseName])
    setScheduleConflictAlert(null)
  }

  const handleCourseTagDragStart = (event, courseName, sourceList) => {
    const payload = { courseName, sourceList }
    setDraggedCourseTag(payload)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/json', JSON.stringify(payload))
    event.dataTransfer.setData('text/plain', courseName)
  }

  const handleCourseTagDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleCourseTagDrop = (event, targetList) => {
    event.preventDefault()

    let payload = draggedCourseTag
    const rawPayload = event.dataTransfer.getData('application/json')
    if (!payload && rawPayload) {
      try {
        payload = JSON.parse(rawPayload)
      } catch {
        payload = null
      }
    }

    moveCourseTag(payload?.courseName, payload?.sourceList, targetList)
    setDraggedCourseTag(null)
  }

  const handleCourseTagDragEnd = () => {
    setDraggedCourseTag(null)
  }

  // 이수구분 탭(대분류) 클릭 시 상태 변경 및 소분류(학과) 필터 '전체'로 리셋
  const handleTypeChange = (type) => {
    setSelectedType(type)
    setSelectedDept('전체')
  }

  /**
   * [필터링 헬퍼 1] 스마트 과목 분류 매칭 함수
   * 전공/복수·부전공/일반선택은 사용자가 저장한 전공 프로필의 부서명 기준으로 우선 분류합니다.
   * 전공 프로필이 없거나 다른 이수구분 버튼을 누른 경우에는 DB의 실제 이수구분 문자열을 대조합니다.
   * 교양필수/교양선택 등의 약칭(교필, 교선)도 부분 일치하도록 구현하여 필터링의 정확도를 높였습니다.
   */
  const matchCourseType = useCallback((course, selectedBtn) => {
    if (selectedBtn === '전체') return true
    
    const hasProfileFilter = profileDepartments.length > 0
    const department = getCourseDepartment(course)
    const isSecondaryMajorFilter = selectedBtn === SECONDARY_MAJOR_TYPE

    if (hasProfileFilter && selectedBtn === '전공') {
      return Boolean(selectedMajorDepartment) && department === selectedMajorDepartment
    }

    if (hasProfileFilter && isSecondaryMajorFilter && selectedMinorDepartment) {
      return Boolean(selectedMinorDepartment) && department === selectedMinorDepartment
    }

    if (hasProfileFilter && selectedBtn === '일반선택') {
      return !profileDepartments.includes(department)
    }

    const courseType = getCourseType(course)
    if (!courseType) return false
    
    // 예: '전공'을 선택한 경우 DB 값에 '전공'이 들어간 모든 것(전공선택, 전공필수 등)을 통과시킴
    if (selectedBtn === '전공' && courseType.includes('전공')) return true
    if (isSecondaryMajorFilter && SECONDARY_MAJOR_DB_TYPES.some(type => courseType.includes(type))) return true
    if (selectedBtn === '교양필수' && (courseType.includes('교양필수') || courseType.includes('교필'))) return true
    if (selectedBtn === '교양선택' && (courseType.includes('교양선택') || courseType.includes('교선'))) return true
    
    return courseType.includes(selectedBtn)
  }, [profileDepartments, selectedMajorDepartment, selectedMinorDepartment])

  const getCourseTypeButtonLabel = (type) => {
    if (type === '전공' && selectedMajorDepartment) return `전공(${selectedMajorDepartment})`
    if (type === SECONDARY_MAJOR_TYPE && selectedMinorDepartment) return `복수/부전공(${selectedMinorDepartment})`
    return type
  }

  /**
   * [필터링 헬퍼 2] 선택된 대분류에 속하는 학과/부서 목록 동적 추출 및 정렬
   * 사용자가 선택한 개인화 분류 또는 이수구분 필터에 알맞은 교과목들만 대상으로 하여, 
   * 해당 과목들의 '부서' 필드 데이터를 Set으로 중복 제거하고 가나다순으로 정렬하여 드롭다운 리스트를 구성합니다.
   */
  const availableDepts = useMemo(() => ['전체', ...Array.from(new Set(
    dbCourses
      .filter(c => matchCourseType(c, selectedType))
      .map(getCourseDepartment)
      .filter(Boolean) // null 또는 빈 문자열 제외
  ))].sort((a, b) => {
    if (a === '전체') return -1
    if (b === '전체') return 1
    return a.localeCompare(b, 'ko-KR')
  }), [dbCourses, matchCourseType, selectedType])

  useEffect(() => {
    if (!availableDepts.includes(selectedDept)) {
      setSelectedDept('전체')
    }
  }, [availableDepts, selectedDept])

  /**
   * [필터링 헬퍼 3] 최종 과목 목록 필터링
   * 1. 개인화 분류 또는 이수구분 일치 검사 (`matchCourseType`)
   * 2. 학과/부서 일치 검사 (`selectedDept === '전체'`이거나 실제 부서 일치 시)
   * 3. 검색어(교과목명 또는 담당교수명) 부분 일치 검사
   */
  const filteredCourses = useMemo(() => dbCourses.filter(course => {
    const isTypeMatch = matchCourseType(course, selectedType)
    const isDeptMatch = selectedDept === '전체' || getCourseDepartment(course) === selectedDept

    // 검색어가 입력되지 않은 경우 대분류와 학과만 일치하면 통과
    const searchLower = searchTerm.trim().toLowerCase()
    if (!searchLower) return isTypeMatch && isDeptMatch

    const matchName = course['교과목명']?.toLowerCase().includes(searchLower)
    const matchProf = course['교수명']?.toLowerCase().includes(searchLower)
    const matchCode = getCourseCode(course).toLowerCase().includes(searchLower)
    
    return isTypeMatch && isDeptMatch && (matchName || matchProf || matchCode)
  }), [dbCourses, matchCourseType, searchTerm, selectedDept, selectedType])

  const selectedGeneratedSchedule = useMemo(() => (
    generatedSchedules.find((schedule) => schedule.id === selectedGeneratedScheduleId) || null
  ), [generatedSchedules, selectedGeneratedScheduleId])

  const timetableCourseBlocksByCell = useMemo(() => {
    const blocksByCell = new Map()

    const entries = selectedGeneratedSchedule
      ? selectedGeneratedSchedule.entries
      : requiredCourses.map((courseName) => {
        const matchedCourse = courseByName.get(courseName)
        return {
          course: matchedCourse,
          courseName,
          professor: getCourseProfessor(matchedCourse),
          timeAndPlace: getCourseTimeAndPlace(matchedCourse),
          scheduleCells: getRequiredCourseScheduleCells(courseName),
          source: '필수',
        }
      })

    entries.forEach((entry, courseIndex) => {
      entry.scheduleCells.forEach(({ day, period }) => {
        const rowIdx = period - 1
        const colIdx = DAYS.indexOf(day)
        if (rowIdx < 0 || rowIdx >= TIMES.length || colIdx < 0) return

        const cellKey = `${rowIdx}-${colIdx}`
        const cellBlocks = blocksByCell.get(cellKey) || []

        cellBlocks.push({
          courseIndex,
          courseName: entry.courseName,
          professor: entry.professor || getCourseProfessor(entry.course),
          source: entry.source,
          timeAndPlace: entry.timeAndPlace || getCourseTimeAndPlace(entry.course),
        })
        blocksByCell.set(cellKey, cellBlocks)
      })
    })

    return blocksByCell
  }, [courseByName, getRequiredCourseScheduleCells, requiredCourses, selectedGeneratedSchedule])

  // --- 화면 데이터 로딩 중 뷰(View) ---
  if (loading) {
    return (
      <div className="page-center tetris-page">
        <div className="flex flex-col flex-center gap-4">
          <div className="spinner spinner-dark tetris-loading-spinner" />
          <p className="tetris-loading-text">과목 데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  const conflictDetailText = scheduleConflictAlert
    ? scheduleConflictAlert.conflicts
      .map((conflict) => `${conflict.courseName} ${conflict.timeLabel}`)
      .join(', ')
    : ''

  // --- 메인 대시보드 뷰(View) 렌더링 ---
  return (
    <div className="dashboard">
      {/* 최상단 앱 헤더바 컴포넌트 */}
      <AppHeader
        active="tetris"
        userEmail={userEmail}
        isGuest={userEmail === GUEST_EMAIL}
        onDepartmentProfileChange={handleDepartmentProfileChange}
        onLogout={handleLogout}
      />

      {scheduleConflictAlert && (
        <div className="tetris-top-alert" role="alert" aria-live="assertive">
          <div>
            <strong>시간표가 겹칩니다.</strong>
            <span>
              {scheduleConflictAlert.courseName} 과목은 {conflictDetailText}와 시간이 겹쳐 필수 과목에 추가할 수 없습니다.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setScheduleConflictAlert(null)}
          >
            닫기
          </button>
        </div>
      )}

      {scheduleConflictAlert && (
        <div className="tetris-modal-backdrop" role="presentation">
          <div className="tetris-conflict-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-conflict-title">
            <h3 id="schedule-conflict-title">시간표가 겹칩니다</h3>
            <p>
              {scheduleConflictAlert.courseName} 과목을 필수 과목으로 옮길 수 없습니다.
            </p>
            <div className="tetris-conflict-list">
              {scheduleConflictAlert.conflicts.map((conflict) => (
                <span key={`${conflict.courseName}-${conflict.timeLabel}`} className="chip chip-error">
                  {conflict.courseName} · {conflict.timeLabel}
                </span>
              ))}
            </div>
            <div className="tetris-conflict-modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-md"
                onClick={() => setScheduleConflictAlert(null)}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-content">
        <div className="container" style={{ width: '100%', maxWidth: '1800px', padding: '0 40px' }}>
          
          {/* 타이틀 및 헤더 영역 (마운트 후 애니메이션 작동) */}
          <div className={`tetris-page-header ${mounted ? 'animate-in' : 'tetris-hidden'}`}>
            <h2 className="tetris-section-heading">시간표 편성</h2>
            <p className="tetris-page-description">원하는 공강 시간과 과목을 설정하면 가능한 조합을 자동으로 찾아드립니다.</p>
          </div>

          {/* 3단 분할 레이아웃 대시보드 (조건 설정 / 시간표 그리드 / 과목 조회) */}
          <div 
            className={`dashboard-grid ${mounted ? 'animate-in delay-2' : 'tetris-hidden'}`}
            style={{ gridTemplateColumns: '320px 1fr 380px', gap: '30px', alignItems: 'stretch' }} 
          >
            
            {/* ── 1. 좌측: 조건 설정 패널 ── */}
            <div className="panel" style={{ height: '890px', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-title">⚙️ 조건 설정</div>

              <div className="tetris-condition-scroll">
                {/* 공강 희망 요일 선택 칩 버튼들 */}
                <div className="tetris-field-group">
                  <label className="field-label">공강 원하는 요일</label>
                  <div className="flex gap-2 tetris-wrap-row">
                    {DAYS.slice(0, 5).map((day) => (
                      <button
                        key={day}
                        // 해당 요일이 freeDays에 미포함되어 있으면 활성 스타일 적용 (즉, 수업 가능/선택됨 상태)
                        className={`chip tetris-chip-button ${!freeDays.includes(day) ? 'chip-active' : ''}`}
                        onClick={() => toggleFreeDay(day)}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 시간표 자동 생성 시 필터링할 제외 교시 칩 버튼들 */}
                <div className="tetris-field-group">
                  <label className="field-label">제외 시간대</label>
                  <div className="flex gap-2 tetris-wrap-row">
                    {EXCLUDED_PERIODS.map((period) => (
                      <button
                        key={period}
                        // 제외 리스트에 포함되어 있지 않은 교시들을 기본 활성 칩으로 표시
                        className={`chip tetris-chip-button ${!excludedPeriods.includes(period) ? 'chip-active' : ''}`}
                        onClick={() => toggleExcludedPeriod(period)}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 신청 학점 범위 (최소 ~ 최대) 입력 란 */}
                <div className="tetris-field-group">
                  <label className="field-label">학점 범위</label>
                  <div className="flex gap-2 tetris-credit-row">
                    <input type="number" className="input tetris-credit-input" value={minCredits} min={1} max={maxCredits} onChange={(e) => setMinCredits(Number(e.target.value))} />
                    <span className="tetris-credit-text">~</span>
                    <input type="number" className="input tetris-credit-input" value={maxCredits} min={minCredits} max={24} onChange={(e) => setMaxCredits(Number(e.target.value))} />
                    <span className="tetris-credit-text">학점</span>
                  </div>
                </div>

                {/* 선호과목 수동 입력 및 기등록 태그 표시 영역 */}
                <div
                  className={`tetris-field-group tetris-course-dropzone ${draggedCourseTag?.sourceList === COURSE_LIST_TYPES.required ? 'tetris-course-dropzone-active' : ''}`}
                  onDragOver={handleCourseTagDragOver}
                  onDrop={(event) => handleCourseTagDrop(event, COURSE_LIST_TYPES.preferred)}
                >
                  <label className="field-label">선호 과목</label>
                  <div className="flex gap-2">
                    <input
                      className="input"
                      placeholder="우측 리스트 클릭 또는 직접 입력"
                      value={preferredCourse}
                      onChange={(e) => setPreferredCourse(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addPreferredCourse()}
                    />
                    <button className="btn btn-secondary btn-md" onClick={addPreferredCourse}>추가</button>
                  </div>
                  {/* 선호과목 태그 칩 리스트 */}
                  {preferredCourses.length > 0 && (
                    <div className="flex gap-2 tetris-required-tags" style={{ marginTop: '8px', flexWrap: 'wrap' }}>
                      {preferredCourses.map((c) => (
                        <span
                          key={c}
                          className="chip chip-active tetris-required-tag"
                          draggable
                          onClick={() => removePreferredCourse(c)}
                          onDragStart={(event) => handleCourseTagDragStart(event, c, COURSE_LIST_TYPES.preferred)}
                          onDragEnd={handleCourseTagDragEnd}
                          style={{ cursor: 'grab' }}
                        >
                          {c} ✕
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 반드시 들어가야 할 필수과목 수동 입력 및 기등록 태그 표시 영역 */}
                <div
                  className={`tetris-last-field-group tetris-course-dropzone ${draggedCourseTag?.sourceList === COURSE_LIST_TYPES.preferred ? 'tetris-course-dropzone-active' : ''}`}
                  onDragOver={handleCourseTagDragOver}
                  onDrop={(event) => handleCourseTagDrop(event, COURSE_LIST_TYPES.required)}
                >
                  <label className="field-label">필수 과목</label>
                  <div className="flex gap-2">
                    <input
                      className="input"
                      placeholder="반드시 포함할 과목 입력"
                      value={requiredCourse}
                      onChange={(e) => setRequiredCourse(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addRequiredCourse()}
                    />
                    <button className="btn btn-secondary btn-md" onClick={addRequiredCourse}>추가</button>
                  </div>
                  {/* 필수과목 태그 칩 리스트 */}
                  {requiredCourses.length > 0 && (
                    <div className="flex gap-2 tetris-required-tags" style={{ marginTop: '8px', flexWrap: 'wrap' }}>
                      {requiredCourses.map((c) => (
                        <span
                          key={c}
                          className="chip chip-active tetris-required-tag"
                          draggable
                          onClick={() => removeRequiredCourse(c)}
                          onDragStart={(event) => handleCourseTagDragStart(event, c, COURSE_LIST_TYPES.required)}
                          onDragEnd={handleCourseTagDragEnd}
                          style={{ cursor: 'grab' }}
                        >
                          {c} ✕
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 조합 생성 알고리즘 실행 버튼 */}
              <button className="btn btn-primary btn-md tetris-full-button tetris-generate-button" onClick={handleGenerateSchedules}>
                시간표 자동 생성
              </button>
            </div>

            {/* ── 2. 중앙: 시간표 그리드 ── */}
            <div className="timetable" style={{ height: '890px', display: 'flex', flexDirection: 'column' }}>
              <div className="tetris-timetable-header">
                <div className="panel-title tetris-panel-title-inline">📊 시간표</div>
                <div className="flex gap-2">
                  {/* 금지 상태로 지정된 칸 갯수 알림 */}
                  {forbiddenCells.size > 0 && (
                    <span className="chip chip-error">금지 {forbiddenCells.size}칸</span>
                  )}
                  {requiredCourses.length > 0 && (
                    <span className="chip chip-active">필수 {requiredCourses.length}과목</span>
                  )}
                  {selectedGeneratedSchedule && (
                    <span className="chip chip-success">
                      후보 {generatedSchedules.findIndex((schedule) => schedule.id === selectedGeneratedSchedule.id) + 1}
                    </span>
                  )}
                  <span className="chip tetris-hint-chip">클릭하여 금지 시간 설정</span>
                </div>
              </div>

              {/* 시간표 메인 그리드 테이블 */}
              <div className="timetable-grid" style={{ flex: 1 }}>
                {/* 첫 번째 칸 (빈 모퉁이 셀) */}
                <div className="header-cell"></div>
                {/* 요일 헤더 행 출력 */}
                {DAYS.map((day) => (
                  <div className={`header-cell ${freeDays.includes(day) ? 'header-cell-free' : ''}`} key={day}>
                    <div>{day}</div>
                    {/* 해당 요일이 공강 희망 상태일 경우 배지 노출 */}
                    <span className="tetris-free-day-label" style={{ visibility: freeDays.includes(day) ? 'visible' : 'hidden' }}>
                      공강
                    </span>
                  </div>
                ))}

                {/* 각 교시(행)별로 데이터 셀을 순회하며 렌더링 */}
                {TIMES.map((time, rowIdx) => (
                  <React.Fragment key={time.period}>
                    {/* 좌측 교시 라벨 셀 */}
                    <div className="time-cell">
                      <div style={{ fontWeight: 'bold', fontSize: '0.73rem', color: 'var(--color-text-primary)' }}>{time.period}</div>
                      <div style={{ fontSize: '0.63rem', color: 'var(--color-neutral)', marginTop: '2px' }}>{time.time}</div>
                    </div>
                    {/* 해당 교시의 월~일 데이터 셀들 */}
                    {DAYS.map((_, colIdx) => {
                      const key = `${rowIdx}-${colIdx}`
                      const isForbidden = forbiddenCells.has(key)       // 개별 금지 지정 여부
                      const isFreeDay = freeDays.includes(DAYS[colIdx]) // 해당 요일 공강 지정 여부
                      const timetableCellCourses = timetableCourseBlocksByCell.get(key) || []
                      return (
                        <div
                          // 금지되었거나 공강인 경우 특수 클래스를 주어 배경색을 칠함
                          className={`data-cell tetris-clickable-cell ${isForbidden ? 'data-cell-forbidden' : ''} ${isFreeDay ? 'data-cell-freeday' : ''}`}
                          key={key}
                          onClick={() => toggleForbiddenCell(rowIdx, colIdx)} // 클릭하면 금지 설정 토글
                        >
                          {/* 개별 금지된 칸일 경우 ✕ 블록 마크 추가 */}
                          {timetableCellCourses.length > 0 && (
                            <div className="tetris-required-course-list">
                              {timetableCellCourses.map((courseBlock) => (
                                <div
                                  key={`${key}-${courseBlock.courseName}-${courseBlock.courseIndex}`}
                                  className="subject-block tetris-required-course-block"
                                  title={`${courseBlock.courseName}${courseBlock.source ? `\n${courseBlock.source}` : ''}${courseBlock.professor ? `\n${courseBlock.professor}` : ''}${courseBlock.timeAndPlace ? `\n${courseBlock.timeAndPlace}` : ''}`}
                                  style={{
                                    backgroundColor: REQUIRED_COURSE_COLORS[courseBlock.courseIndex % REQUIRED_COURSE_COLORS.length],
                                  }}
                                >
                                  <span className="subject-name">{courseBlock.courseName}</span>
                                  <span className="subject-room">{courseBlock.source || courseBlock.professor || '과목'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {isForbidden && timetableCellCourses.length === 0 && <div className="forbidden-block">✕</div>}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── 3. 우측: 개설 과목 버튼 리스트 ── */}
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '890px', paddingRight: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div className="panel-title" style={{ margin: 0 }}>📚 개설 과목 조회</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                  검색 결과: {filteredCourses.length} / 전체 {dbCourses.length}건
                </div>
              </div>
              
              {/* 대분류 필터 (가로 스크롤 가능한 이수구분 카테고리 칩 버튼군) */}
              <div style={{ 
                display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', 
                marginBottom: '12px', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' 
              }}>
                {COURSE_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => handleTypeChange(type)}
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.85rem',
                      fontWeight: selectedType === type ? 'bold' : '500',
                      borderRadius: '20px',
                      border: `1px solid ${selectedType === type ? 'var(--color-primary)' : '#cbd5e1'}`,
                      backgroundColor: selectedType === type ? 'var(--color-primary)' : '#f8fafc',
                      color: selectedType === type ? 'white' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      flexShrink: 0
                    }}
                  >
                    {getCourseTypeButtonLabel(type)}
                  </button>
                ))}
              </div>

              {/* 소분류 필터(선택한 이수구분에 매칭된 부서/학과 목록) & 검색 인풋 창 */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <select 
                  className="input" 
                  style={{ width: '40%', padding: '10px', fontSize: '0.85rem' }}
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                >
                  {availableDepts.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                
                <input 
                  type="text" 
                  className="input" 
                  placeholder="과목명/교수명 검색..." 
                  style={{ width: '60%', fontSize: '0.85rem' }}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* 필터링 결과 매칭 과목 리스트 렌더링 영역 */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '8px' }}>
                {filteredCourses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: '0.9rem' }}>
                    조건에 맞는 과목이 없습니다.
                  </div>
                ) : (
                  filteredCourses.map((course, idx) => (
                    <div 
                      key={course.id || idx} 
                      onClick={() => handleAddCourseFromList(course['교과목명'])} // 과목 클릭 시 자동 필수과목 등록
                      style={{
                        padding: '14px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        backgroundColor: '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-primary)'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(48, 155, 159, 0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#e2e8f0'
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      {/* 과목 이름 및 이수구분 배지 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#1e293b', lineHeight: '1.3' }}>
                          {course['교과목명']}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ fontSize: '0.7rem', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', color: '#475569', whiteSpace: 'nowrap', fontWeight: '500' }}>
                            {course['이수구분'] || '구분없음'}
                          </span>
                        </div>
                      </div>
                      {/* 과목 추가 상세 정보 (개설 학과/부서, 분반, 담당교수명, 수업 시간 및 장소) */}
                      <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>🔢 {getCourseCode(course) || '과목코드 없음'}</span>
                        <span>🏢 {course['부서'] || course['단과대학'] || '소속 미정'} 
                              {course['분반코드'] ? ` [${course['분반코드']}분반]` : ''}
                        </span>
                        <span>👤 {course['교수명'] || '미정'}</span>
                        <span>🕒 {getCourseTimeAndPlace(course) || '시간/장소 미정'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* ── 하단: 생성된 시간표 후보 목록 (자동 생성 버튼 클릭 시 결과 카드들이 표시될 자리) ── */}
          <div className={`tetris-result-section ${mounted ? 'animate-in delay-3' : 'tetris-hidden'}`} style={{ marginTop: '24px' }}>
            <div className="flex flex-between tetris-result-header">
              <h3>생성된 시간표 조합</h3>
              {generationMessage && (
                <span className={`chip ${generatedSchedules.length > 0 ? 'chip-success' : 'chip-error'}`}>
                  {generationMessage}
                </span>
              )}
            </div>
            {generatedSchedules.length > 0 ? (
              <div className="tetris-generated-grid">
                {generatedSchedules.map((schedule, scheduleIndex) => {
                  const busyDays = new Set()
                  schedule.entries.forEach((entry) => {
                    entry.scheduleCells.forEach(({ day }) => {
                      busyDays.add(day)
                    })
                  })
                  const openDays = DAYS.slice(0, 5).filter((day) => !busyDays.has(day))
                  const isSelectedSchedule = selectedGeneratedScheduleId === schedule.id

                  return (
                    <div
                      className={`tetris-generated-card ${isSelectedSchedule ? 'tetris-generated-card-selected' : ''}`}
                      key={schedule.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelectedSchedule}
                      onClick={() => setSelectedGeneratedScheduleId(schedule.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedGeneratedScheduleId(schedule.id)
                        }
                      }}
                    >
                      <div className="tetris-generated-card-header">
                        <strong>후보 {scheduleIndex + 1}</strong>
                        <span>{schedule.totalCredits}학점</span>
                      </div>
                      <div className="tetris-generated-summary">
                        <span>공강 {openDays.length > 0 ? openDays.join(', ') : '없음'}</span>
                        <span>공강 사이 빈칸 {schedule.gapCount}</span>
                      </div>
                      <div className="tetris-generated-chip-list">
                        {schedule.entries.map((entry) => {
                          const sectionCode = entry.course?.['분반코드'] || entry.course?.section_code || ''
                          const sectionLabel = sectionCode ? ` ${sectionCode}` : ''

                          return (
                            <span
                              className="tetris-generated-course-chip"
                              key={`${schedule.id}-${entry.courseCode || entry.courseName}-${sectionCode}`}
                            >
                              {entry.courseName}{sectionLabel}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="tetris-empty-state">
                <div className="text-center">
                  <p className="tetris-empty-icon">🧩</p>
                  <p className="tetris-empty-title">위의 조건을 설정한 뒤 "시간표 자동 생성" 버튼을 눌러주세요.</p>
                  <p className="tetris-empty-desc">가능한 시간표 조합이 여기에 카드 형태로 표시됩니다.</p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

export default Tetris
