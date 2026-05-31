import React, { useEffect, useReducer, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { supabase } from '../supabaseClient'
import './Tetris.css'

// ============================================================
// ----- TEMP GUEST LOGIN START -----
// ============================================================
const GUEST_MODE_KEY = 'registration-tetris:guest-mode'
const GUEST_EMAIL = 'guest@cku.ac.kr'
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
 * [컴포넌트 구조]
 * - Tetris            : 인증/데이터 로딩 및 레이아웃 조립 (컨테이너)
 * - ConditionPanel    : 좌측 조건 설정 패널 (공강 요일/제외 교시/학점/필수과목)
 * - TimetableGrid     : 중앙 시간표 그리드 (금지 셀 토글)
 * - CourseSearchPanel : 우측 개설 과목 조회 패널 (필터/검색)
 *
 * 시간표 설정(조건) 상태는 서로 밀접하게 연관되므로 useReducer(conditionsReducer)로 통합 관리하며,
 * 과목 검색 필터 상태(searchTerm/selectedType/selectedDept)는 CourseSearchPanel 내부에서 자체 관리합니다.
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
const COURSE_TYPES = [
  '전체', '전공', '직무전공', '소단위전공', '교양필수', '교양선택',
  '복수전공', '연계전공', '부전공', '교직', 'ROTC/현장실습', '일반선택', '사이버'
]

/**
 * 로그아웃 처리 함수 (지역 상태에 의존하지 않으므로 모듈 스코프에 배치)
 * 세션스토리지 게스트 정보 삭제 후 Supabase 로그아웃을 요청합니다.
 */
const handleLogout = async () => {
  window.sessionStorage.removeItem(GUEST_MODE_KEY)
  await supabase.auth.signOut()
}

/**
 * [필터링 헬퍼] 스마트 이수구분 매칭 함수 (순수 함수 → 모듈 스코프)
 * 사용자가 클릭한 대분류 이수구분 필터 버튼값(selectedBtn)과 DB의 실제 이수구분 문자열(courseType)을 대조합니다.
 * '전공' 버튼 클릭 시 '전공필수', '전공선택' 등을 모두 포함하도록 보완하고,
 * 교양필수/교양선택 등의 약칭(교필, 교선)도 부분 일치하도록 구현합니다.
 */
const matchCourseType = (courseType, selectedBtn) => {
  if (selectedBtn === '전체') return true
  if (!courseType) return false

  if (selectedBtn === '전공' && courseType.includes('전공')) return true
  if (selectedBtn === '교양필수' && (courseType.includes('교양필수') || courseType.includes('교필'))) return true
  if (selectedBtn === '교양선택' && (courseType.includes('교양선택') || courseType.includes('교선'))) return true

  return courseType.includes(selectedBtn)
}

// 시간표 설정(조건) 상태 초기값
const initialConditions = {
  freeDays: [],                                                 // 공강 희망 요일 목록
  excludedPeriods: ['10교시', '11교시', '12교시', '13교시'],     // 기본 제외할 야간 시간대
  minCredits: 15,                                               // 최소 신청 학점
  maxCredits: 21,                                               // 최대 신청 학점
  requiredCourse: '',                                           // 필수 과목 입력창 텍스트
  requiredCourses: [],                                          // 등록된 필수 과목명 배열
  forbiddenCells: new Set(),                                    // 금지 셀 세트 ("행번호-열번호")
}

/**
 * 시간표 설정(조건) 리듀서
 * 서로 연관된 조건 상태들을 하나의 리듀서로 묶어 일관되게 갱신합니다.
 */
function conditionsReducer(state, action) {
  switch (action.type) {
    case 'TOGGLE_FREE_DAY': {
      const has = state.freeDays.includes(action.day)
      return {
        ...state,
        freeDays: has ? state.freeDays.filter((d) => d !== action.day) : [...state.freeDays, action.day],
      }
    }
    case 'TOGGLE_EXCLUDED_PERIOD': {
      const has = state.excludedPeriods.includes(action.period)
      return {
        ...state,
        excludedPeriods: has
          ? state.excludedPeriods.filter((p) => p !== action.period)
          : [...state.excludedPeriods, action.period],
      }
    }
    case 'SET_MIN_CREDITS':
      return { ...state, minCredits: action.value }
    case 'SET_MAX_CREDITS':
      return { ...state, maxCredits: action.value }
    case 'SET_REQUIRED_INPUT':
      return { ...state, requiredCourse: action.value }
    case 'ADD_REQUIRED_FROM_INPUT': {
      // 입력창 텍스트로 필수 과목 추가 (공백/중복은 무시하며, 이 경우 입력값도 그대로 둠)
      const trimmed = state.requiredCourse.trim()
      if (!trimmed || state.requiredCourses.includes(trimmed)) return state
      return { ...state, requiredCourses: [...state.requiredCourses, trimmed], requiredCourse: '' }
    }
    case 'ADD_REQUIRED_COURSE': {
      // 우측 과목 카드 클릭으로 필수 과목 추가 (중복은 무시)
      if (state.requiredCourses.includes(action.courseName)) return state
      return { ...state, requiredCourses: [...state.requiredCourses, action.courseName] }
    }
    case 'REMOVE_REQUIRED_COURSE':
      return { ...state, requiredCourses: state.requiredCourses.filter((c) => c !== action.course) }
    case 'TOGGLE_FORBIDDEN_CELL': {
      // 불변성 유지를 위해 새 Set을 복사 생성하여 토글
      const next = new Set(state.forbiddenCells)
      if (next.has(action.key)) next.delete(action.key)
      else next.add(action.key)
      return { ...state, forbiddenCells: next }
    }
    default:
      return state
  }
}

/**
 * [좌측 패널] 조건 설정
 * 공강 요일, 제외 교시, 학점 범위, 필수 과목을 설정합니다.
 */
const ConditionPanel = ({ conditions, dispatch }) => {
  const { freeDays, excludedPeriods, minCredits, maxCredits, requiredCourse, requiredCourses } = conditions

  return (
    <div className="panel" style={{ height: '890px', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-title">⚙️ 조건 설정</div>

      {/* 공강 희망 요일 선택 칩 버튼들 */}
      <div className="tetris-field-group">
        <div className="field-label">공강 원하는 요일</div>
        <div className="flex gap-2 tetris-wrap-row">
          {DAYS.slice(0, 5).map((day) => (
            <button
              key={day}
              type="button"
              // 해당 요일이 freeDays에 미포함되어 있으면 활성 스타일 적용 (즉, 수업 가능/선택됨 상태)
              className={`chip tetris-chip-button ${!freeDays.includes(day) ? 'chip-active' : ''}`}
              onClick={() => dispatch({ type: 'TOGGLE_FREE_DAY', day })}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {/* 시간표 자동 생성 시 필터링할 제외 교시 칩 버튼들 */}
      <div className="tetris-field-group">
        <div className="field-label">제외 시간대</div>
        <div className="flex gap-2 tetris-wrap-row">
          {EXCLUDED_PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              // 제외 리스트에 포함되어 있지 않은 교시들을 기본 활성 칩으로 표시
              className={`chip tetris-chip-button ${!excludedPeriods.includes(period) ? 'chip-active' : ''}`}
              onClick={() => dispatch({ type: 'TOGGLE_EXCLUDED_PERIOD', period })}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* 신청 학점 범위 (최소 ~ 최대) 입력 란 */}
      <div className="tetris-field-group">
        <div className="field-label">학점 범위</div>
        <div className="flex gap-2 tetris-credit-row">
          <input
            type="number"
            className="input tetris-credit-input"
            aria-label="최소 학점"
            value={minCredits}
            min={1}
            max={maxCredits}
            onChange={(e) => dispatch({ type: 'SET_MIN_CREDITS', value: Number(e.target.value) })}
          />
          <span className="tetris-credit-text">~</span>
          <input
            type="number"
            className="input tetris-credit-input"
            aria-label="최대 학점"
            value={maxCredits}
            min={minCredits}
            max={24}
            onChange={(e) => dispatch({ type: 'SET_MAX_CREDITS', value: Number(e.target.value) })}
          />
          <span className="tetris-credit-text">학점</span>
        </div>
      </div>

      {/* 반드시 들어가야 할 필수과목 수동 입력 및 기등록 태그 표시 영역 */}
      <div className="tetris-last-field-group">
        <div className="field-label">필수 과목</div>
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="우측 리스트 클릭 또는 직접 입력"
            aria-label="필수 과목 입력"
            value={requiredCourse}
            onChange={(e) => dispatch({ type: 'SET_REQUIRED_INPUT', value: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && dispatch({ type: 'ADD_REQUIRED_FROM_INPUT' })}
          />
          <button type="button" className="btn btn-secondary btn-md" onClick={() => dispatch({ type: 'ADD_REQUIRED_FROM_INPUT' })}>추가</button>
        </div>
        {/* 필수과목 태그 칩 리스트 */}
        {requiredCourses.length > 0 && (
          <div className="flex gap-2 tetris-required-tags" style={{ marginTop: '8px', flexWrap: 'wrap' }}>
            {requiredCourses.map((c) => (
              <button
                key={c}
                type="button"
                className="chip chip-active tetris-required-tag"
                onClick={() => dispatch({ type: 'REMOVE_REQUIRED_COURSE', course: c })}
              >
                {c} ✕
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 조합 생성 알고리즘 실행 버튼 */}
      <button type="button" className="btn btn-primary btn-md tetris-full-button" style={{ width: '100%', marginTop: '20px' }}>
        시간표 자동 생성
      </button>
    </div>
  )
}

/**
 * [중앙 그리드] 시간표
 * 요일×교시 그리드를 그리고, 셀을 클릭하면 금지 시간으로 토글합니다.
 */
const TimetableGrid = ({ freeDays, forbiddenCells, dispatch }) => {
  return (
    <div className="timetable" style={{ height: '890px', display: 'flex', flexDirection: 'column' }}>
      <div className="tetris-timetable-header">
        <div className="panel-title tetris-panel-title-inline">📊 시간표</div>
        <div className="flex gap-2">
          {/* 금지 상태로 지정된 칸 갯수 알림 */}
          {forbiddenCells.size > 0 && (
            <span className="chip chip-error">금지 {forbiddenCells.size}칸</span>
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
              <div style={{ fontWeight: 'bold', fontSize: '0.75rem', color: 'var(--color-text-primary)' }}>{time.period}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-neutral)', marginTop: '2px' }}>{time.time}</div>
            </div>
            {/* 해당 교시의 월~일 데이터 셀들 */}
            {DAYS.map((_, colIdx) => {
              const key = `${rowIdx}-${colIdx}`
              const isForbidden = forbiddenCells.has(key)       // 개별 금지 지정 여부
              const isFreeDay = freeDays.includes(DAYS[colIdx]) // 해당 요일 공강 지정 여부
              return (
                <button
                  type="button"
                  // 금지되었거나 공강인 경우 특수 클래스를 주어 배경색을 칠함
                  className={`data-cell tetris-clickable-cell ${isForbidden ? 'data-cell-forbidden' : ''} ${isFreeDay ? 'data-cell-freeday' : ''}`}
                  key={key}
                  aria-label={`${DAYS[colIdx]} ${time.period} ${isForbidden ? '금지 해제' : '금지 설정'}`}
                  aria-pressed={isForbidden}
                  onClick={() => dispatch({ type: 'TOGGLE_FORBIDDEN_CELL', key })} // 클릭하면 금지 설정 토글
                >
                  {/* 개별 금지된 칸일 경우 ✕ 블록 마크 추가 */}
                  {isForbidden && <div className="forbidden-block">✕</div>}
                </button>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

/**
 * [우측 패널] 개설 과목 조회
 * 이수구분/학과/검색어로 과목을 필터링하며, 필터 상태는 이 컴포넌트가 자체적으로 보유합니다.
 * 카드 클릭 시 onAddCourse 콜백을 통해 상위의 필수과목 목록에 추가합니다.
 */
const CourseSearchPanel = ({ dbCourses, onAddCourse }) => {
  const [searchTerm, setSearchTerm] = useState('')       // 과목명/교수명 검색어
  const [selectedType, setSelectedType] = useState('전체') // 선택된 대분류 이수구분
  const [selectedDept, setSelectedDept] = useState('전체') // 선택된 소분류 학과/부서

  // 이수구분 탭(대분류) 변경 시 소분류(학과) 필터를 '전체'로 리셋
  const handleTypeChange = (type) => {
    setSelectedType(type)
    setSelectedDept('전체')
  }

  // 선택된 대분류에 속하는 학과/부서 목록을 단일 순회로 추출한 뒤 가나다순 정렬
  const deptSet = new Set()
  for (const course of dbCourses) {
    if (matchCourseType(course['이수구분'], selectedType)) {
      const dept = course['부서']
      if (dept) deptSet.add(dept)
    }
  }
  const availableDepts = ['전체', ...Array.from(deptSet).sort((a, b) => a.localeCompare(b, 'ko-KR'))]

  // 최종 과목 목록 필터링 (이수구분 → 학과 → 검색어 순)
  const filteredCourses = dbCourses.filter((course) => {
    const isTypeMatch = matchCourseType(course['이수구분'], selectedType)
    const isDeptMatch = selectedDept === '전체' || course['부서'] === selectedDept

    if (!searchTerm) return isTypeMatch && isDeptMatch

    const searchLower = searchTerm.toLowerCase()
    const matchName = course['교과목명']?.toLowerCase().includes(searchLower)
    const matchProf = course['교수명']?.toLowerCase().includes(searchLower)

    return isTypeMatch && isDeptMatch && (matchName || matchProf)
  })

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '890px', paddingRight: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div className="panel-title" style={{ margin: 0 }}>📚 개설 과목 조회</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 'bold' }}>
          검색 결과: {filteredCourses.length}건
        </div>
      </div>

      {/* 대분류 필터 (가로 스크롤 가능한 이수구분 카테고리 칩 버튼군) */}
      <div className="tetris-type-row">
        {COURSE_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`tetris-type-chip ${selectedType === type ? 'tetris-type-chip-active' : ''}`}
            onClick={() => handleTypeChange(type)}
          >
            {type}
          </button>
        ))}
      </div>

      {/* 소분류 필터(선택한 이수구분에 매칭된 부서/학과 목록) & 검색 인풋 창 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <select
          className="input"
          style={{ width: '40%', padding: '10px', fontSize: '0.85rem' }}
          aria-label="학과 필터"
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
        >
          {availableDepts.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>

        <input
          type="text"
          className="input"
          placeholder="과목명/교수명 검색..."
          style={{ width: '60%', fontSize: '0.85rem' }}
          aria-label="과목명 또는 교수명 검색"
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
            <button
              key={course.id || idx}
              type="button"
              className="tetris-course-card"
              onClick={() => onAddCourse(course['교과목명'])} // 과목 클릭 시 자동 필수과목 등록
            >
              {/* 과목 이름 및 이수구분 배지 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#1e293b', lineHeight: '1.3' }}>
                  {course['교과목명']}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span style={{ fontSize: '0.75rem', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', color: '#475569', whiteSpace: 'nowrap', fontWeight: '500' }}>
                    {course['이수구분'] || '구분없음'}
                  </span>
                </div>
              </div>
              {/* 과목 추가 상세 정보 (개설 학과/부서, 분반, 담당교수명, 수업 시간 및 장소) */}
              <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span>🏢 {course['부서'] || course['단과대학'] || '소속 미정'}
                      {course['분반코드'] ? ` [${course['분반코드']}분반]` : ''}
                </span>
                <span>👤 {course['교수명'] || '미정'}</span>
                <span>🕒 {course['수업시간및장소'] || '시간/장소 미정'}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Tetris 컴포넌트 (컨테이너)
 * 인증/과목 데이터 로딩을 담당하고, 조건 설정·시간표·과목 조회 패널을 조립하여 렌더링합니다.
 */
const Tetris = () => {
  const navigate = useNavigate() // 페이지 강제 이동 및 라우팅을 위한 훅

  // --- 사용자 인증 및 로딩/애니메이션 상태 ---
  const [userEmail, setUserEmail] = useState('') // 로그인한 사용자 이메일 (게스트는 guest@cku.ac.kr)
  const [loading, setLoading] = useState(true)     // DB 데이터 및 세션 로딩 상태
  const [mounted, setMounted] = useState(false)    // 애니메이션 효과를 위한 마운트 완료 여부
  const [dbCourses, setDbCourses] = useState([])   // Supabase에서 조회한 전체 개설 과목 목록

  // --- 시간표 설정(조건) 상태는 useReducer로 통합 관리 ---
  const [conditions, dispatchConditions] = useReducer(conditionsReducer, initialConditions)

  /**
   * [useEffect 1] 마운트 애니메이션 효과 트리거
   */
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  /**
   * [useEffect 2] 인증 세션 확인 및 Supabase 개설 과목 데이터 가져오기
   * 1. URL의 불필요한 쿼리/해시 파라미터 정리
   * 2. 세션/게스트 모드 확인 (미인증 시 인트로로 리다이렉트)
   * 3. 'test table'에서 전체 과목 데이터를 비동기 조회하여 dbCourses에 저장
   * 4. onAuthStateChange로 인증 변화를 감시하여 로그아웃 시 인트로로 이동
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
      } else if (isGuestMode) {
        setUserEmail(GUEST_EMAIL)
      } else {
        // 인증정보가 없고 게스트 모드도 아니면 인트로 페이지로 리다이렉트
        navigate('/', { replace: true })
        return
      }

      // 3. Supabase에서 전체 개설 과목 정보 조회
      const { data: coursesData, error } = await supabase
        .from('test table')
        .select('*')

      if (error) {
        console.error('과목 데이터를 불러오는 중 오류 발생:', error.message)
      } else if (coursesData) {
        setDbCourses(coursesData)
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
          return
        }
        navigate('/', { replace: true })
      } else if (session?.user) {
        setUserEmail(session.user.email)
      }
    })

    // Clean-up: 컴포넌트 소멸 시 이벤트 리스너 해제
    return () => subscription.unsubscribe()
  }, [navigate])

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

  // --- 메인 대시보드 뷰(View) 렌더링 ---
  return (
    <div className="dashboard">
      {/* 최상단 앱 헤더바 컴포넌트 */}
      <AppHeader
        active="tetris"
        userEmail={userEmail}
        isGuest={userEmail === GUEST_EMAIL}
        onLogout={handleLogout}
      />

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
            <ConditionPanel conditions={conditions} dispatch={dispatchConditions} />

            <TimetableGrid
              freeDays={conditions.freeDays}
              forbiddenCells={conditions.forbiddenCells}
              dispatch={dispatchConditions}
            />

            <CourseSearchPanel
              dbCourses={dbCourses}
              onAddCourse={(courseName) => dispatchConditions({ type: 'ADD_REQUIRED_COURSE', courseName })}
            />
          </div>

          {/* ── 하단: 생성된 시간표 후보 목록 (자동 생성 버튼 클릭 시 결과 카드들이 표시될 자리) ── */}
          <div className={`tetris-result-section ${mounted ? 'animate-in delay-3' : 'tetris-hidden'}`} style={{ marginTop: '24px' }}>
            <div className="flex flex-between tetris-result-header">
              <h3>생성된 시간표 조합</h3>
            </div>
            <div className="tetris-empty-state">
              <div className="text-center">
                <p className="tetris-empty-icon">🧩</p>
                <p className="tetris-empty-title">위의 조건을 설정한 뒤 "시간표 자동 생성" 버튼을 눌러주세요.</p>
                <p className="tetris-empty-desc">가능한 시간표 조합이 여기에 카드 형태로 표시됩니다.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Tetris
