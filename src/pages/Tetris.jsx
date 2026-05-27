import React, { useEffect, useState } from 'react'
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

const DAYS = ['월', '화', '수', '목', '금']
const TIMES = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
const TIME_PREFS = [
  { id: 'morning', label: '오전 (09~12)', desc: '9:00 ~ 12:00' },
  { id: 'afternoon', label: '오후 (13~16)', desc: '13:00 ~ 16:00' },
  { id: 'evening', label: '저녁 (17~)', desc: '17:00 이후' },
]

// 이수구분 카테고리
const COURSE_TYPES = [
  '전체', '전공', '직무전공', '소단위전공', '교양필수', '교양선택', 
  '복수전공', '연계전공', '부전공', '교직', 'ROTC/현장실습', '일반선택', '사이버'
]

const Tetris = () => {
  const navigate = useNavigate()
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  const [freeDays, setFreeDays] = useState([])
  const [timePref, setTimePref] = useState([])
  const [minCredits, setMinCredits] = useState(15)
  const [maxCredits, setMaxCredits] = useState(21)
  const [requiredCourse, setRequiredCourse] = useState('')
  const [requiredCourses, setRequiredCourses] = useState([])
  const [forbiddenCells, setForbiddenCells] = useState(new Set())

  // DB 연동 및 필터링 State
  const [dbCourses, setDbCourses] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState('전체') 
  const [selectedDept, setSelectedDept] = useState('전체') 

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (window.location.search || window.location.hash.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0]
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }

    const fetchSessionAndData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const isGuestMode = window.sessionStorage.getItem(GUEST_MODE_KEY) === 'true'

      if (session?.user) {
        setUserEmail(session.user.email)
      } else if (isGuestMode) {
        setUserEmail(GUEST_EMAIL)
      } else {
        navigate('/', { replace: true })
        return 
      }

      // 테이블명 'test'에서 데이터 가져오기
      const { data: coursesData, error } = await supabase
        .from('test table') 
        .select('*')
      
      if (error) {
        console.error('과목 데이터를 불러오는 중 오류 발생:', error.message)
      } else if (coursesData) {
        setDbCourses(coursesData)
      }

      setLoading(false)
    }

    fetchSessionAndData()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (window.sessionStorage.getItem(GUEST_MODE_KEY) === 'true') {
          setUserEmail(GUEST_EMAIL)
          return
        }
        navigate('/', { replace: true })
      } else if (session?.user) {
        setUserEmail(session.user.email)
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  const handleLogout = async () => {
    window.sessionStorage.removeItem(GUEST_MODE_KEY)
    await supabase.auth.signOut()
  }

  const toggleFreeDay = (day) => setFreeDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  const toggleTimePref = (id) => setTimePref(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  const removeRequiredCourse = (course) => setRequiredCourses(prev => prev.filter(c => c !== course))
  
  const addRequiredCourse = () => {
    const trimmed = requiredCourse.trim()
    if (trimmed && !requiredCourses.includes(trimmed)) {
      setRequiredCourses(prev => [...prev, trimmed])
      setRequiredCourse('')
    }
  }

  const toggleForbiddenCell = (rowIdx, colIdx) => {
    const key = `${rowIdx}-${colIdx}`
    setForbiddenCells(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleAddCourseFromList = (courseName) => {
    if (!requiredCourses.includes(courseName)) {
      setRequiredCourses(prev => [...prev, courseName])
    }
  }

  const handleTypeChange = (type) => {
    setSelectedType(type)
    setSelectedDept('전체')
  }

  // [업그레이드 1] 스마트 이수구분 매칭 함수
  const matchCourseType = (courseType, selectedBtn) => {
    if (selectedBtn === '전체') return true
    if (!courseType) return false
    
    // DB의 값이 '전공필수', '전공선택'일 때 '전공' 버튼을 누르면 통과
    if (selectedBtn === '전공' && courseType.includes('전공')) return true
    if (selectedBtn === '교양필수' && (courseType.includes('교양필수') || courseType.includes('교필'))) return true
    if (selectedBtn === '교양선택' && (courseType.includes('교양선택') || courseType.includes('교선'))) return true
    
    return courseType.includes(selectedBtn)
  }

  // [업그레이드 2] 선택된 대분류에 속하는 부서 목록 동적 추출 후 가나다순 정렬
  const availableDepts = ['전체', ...Array.from(new Set(
    dbCourses
      .filter(c => matchCourseType(c['이수구분'], selectedType))
      .map(c => c['부서'])
      .filter(Boolean)
  ))].sort((a, b) => {
    if (a === '전체') return -1
    if (b === '전체') return 1
    return a.localeCompare(b)
  })

  // [업그레이드 3] 3단 필터 (대분류 -> 소분류 -> 검색어) 최종 적용
  const filteredCourses = dbCourses.filter(course => {
    const isTypeMatch = matchCourseType(course['이수구분'], selectedType)
    const isDeptMatch = selectedDept === '전체' || course['부서'] === selectedDept

    if (!searchTerm) return isTypeMatch && isDeptMatch

    const searchLower = searchTerm.toLowerCase()
    const matchName = course['교과목명']?.toLowerCase().includes(searchLower)
    const matchProf = course['교수명']?.toLowerCase().includes(searchLower)
    
    return isTypeMatch && isDeptMatch && (matchName || matchProf)
  })

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

  return (
    <div className="dashboard">
      <AppHeader active="tetris" userEmail={userEmail} onLogout={handleLogout} />

      <div className="dashboard-content">
        <div className="container" style={{ width: '100%', maxWidth: '1800px', padding: '0 40px' }}>
          
          <div className={`tetris-page-header ${mounted ? 'animate-in' : 'tetris-hidden'}`}>
            <h2 className="tetris-section-heading">시간표 편성</h2>
            <p className="tetris-page-description">원하는 공강 시간과 과목을 설정하면 가능한 조합을 자동으로 찾아드립니다.</p>
          </div>

          <div 
            className={`dashboard-grid ${mounted ? 'animate-in delay-2' : 'tetris-hidden'}`}
            style={{ gridTemplateColumns: '320px 1fr 380px', gap: '30px' }} 
          >
            
            {/* ── 1. 좌측: 조건 설정 패널 ── */}
            <div className="panel">
              <div className="panel-title">⚙️ 조건 설정</div>

              <div className="tetris-field-group">
                <label className="field-label">공강 원하는 요일</label>
                <div className="flex gap-2 tetris-wrap-row">
                  {DAYS.map((day) => (
                    <button
                      key={day}
                      className={`chip tetris-chip-button ${freeDays.includes(day) ? 'chip-active' : ''}`}
                      onClick={() => toggleFreeDay(day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tetris-field-group">
                <label className="field-label">선호 시간대</label>
                <div className="flex flex-col gap-2">
                  {TIME_PREFS.map((pref) => (
                    <button
                      key={pref.id}
                      className={`chip tetris-chip-button tetris-time-pref-button ${timePref.includes(pref.id) ? 'chip-active' : ''}`}
                      onClick={() => toggleTimePref(pref.id)}
                    >
                      {pref.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tetris-field-group">
                <label className="field-label">학점 범위</label>
                <div className="flex gap-2 tetris-credit-row">
                  <input type="number" className="input tetris-credit-input" value={minCredits} min={1} max={maxCredits} onChange={(e) => setMinCredits(Number(e.target.value))} />
                  <span className="tetris-credit-text">~</span>
                  <input type="number" className="input tetris-credit-input" value={maxCredits} min={minCredits} max={24} onChange={(e) => setMaxCredits(Number(e.target.value))} />
                  <span className="tetris-credit-text">학점</span>
                </div>
              </div>

              <div className="tetris-last-field-group">
                <label className="field-label">필수 과목</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="우측 리스트 클릭 또는 직접 입력"
                    value={requiredCourse}
                    onChange={(e) => setRequiredCourse(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addRequiredCourse()}
                  />
                  <button className="btn btn-secondary btn-md" onClick={addRequiredCourse}>추가</button>
                </div>
                {requiredCourses.length > 0 && (
                  <div className="flex gap-2 tetris-required-tags" style={{ marginTop: '8px', flexWrap: 'wrap' }}>
                    {requiredCourses.map((c) => (
                      <span key={c} className="chip chip-active tetris-required-tag" onClick={() => removeRequiredCourse(c)} style={{ cursor: 'pointer' }}>
                        {c} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <button className="btn btn-primary btn-md tetris-full-button" style={{ width: '100%', marginTop: '20px' }}>
                시간표 자동 생성
              </button>
            </div>

            {/* ── 2. 중앙: 시간표 그리드 ── */}
            <div className="timetable" style={{ height: 'fit-content' }}>
              <div className="tetris-timetable-header">
                <div className="panel-title tetris-panel-title-inline">📊 시간표</div>
                <div className="flex gap-2">
                  {forbiddenCells.size > 0 && (
                    <span className="chip chip-error">금지 {forbiddenCells.size}칸</span>
                  )}
                  <span className="chip tetris-hint-chip">클릭하여 금지 시간 설정</span>
                </div>
              </div>

              <div className="timetable-grid">
                <div className="header-cell"></div>
                {DAYS.map((day) => (
                  <div className={`header-cell ${freeDays.includes(day) ? 'header-cell-free' : ''}`} key={day}>
                    {day}
                    {freeDays.includes(day) && <span className="tetris-free-day-label">공강</span>}
                  </div>
                ))}

                {TIMES.map((time, rowIdx) => (
                  <React.Fragment key={time}>
                    <div className="time-cell">{time}</div>
                    {DAYS.map((_, colIdx) => {
                      const key = `${rowIdx}-${colIdx}`
                      const isForbidden = forbiddenCells.has(key)
                      const isFreeDay = freeDays.includes(DAYS[colIdx])
                      return (
                        <div
                          className={`data-cell tetris-clickable-cell ${isForbidden ? 'data-cell-forbidden' : ''} ${isFreeDay ? 'data-cell-freeday' : ''}`}
                          key={key}
                          onClick={() => toggleForbiddenCell(rowIdx, colIdx)}
                        >
                          {isForbidden && <div className="forbidden-block">✕</div>}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── 3. 우측: 개설 과목 버튼 리스트 ── */}
            <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', minHeight: '600px', paddingRight: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div className="panel-title" style={{ margin: 0 }}>📚 개설 과목 조회</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                  검색 결과: {filteredCourses.length}건
                </div>
              </div>
              
              {/* 대분류 필터 (가로 스크롤) */}
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
                    {type}
                  </button>
                ))}
              </div>

              {/* 소분류 필터(부서) & 검색창 */}
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

              {/* 과목 리스트 렌더링 */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '8px' }}>
                {filteredCourses.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: '0.9rem' }}>
                    조건에 맞는 과목이 없습니다.
                  </div>
                ) : (
                  filteredCourses.map((course, idx) => (
                    <div 
                      key={course.id || idx} 
                      onClick={() => handleAddCourseFromList(course['교과목명'])}
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
                      <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>🏢 {course['부서'] || course['단과대학'] || '소속 미정'} 
                              {course['분반코드'] ? ` [${course['분반코드']}분반]` : ''}
                        </span>
                        <span>👤 {course['교수명'] || '미정'}</span>
                        <span>🕒 {course['수업시간및장소'] || '시간/장소 미정'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* ── 하단: 생성된 시간표 후보 목록 ── */}
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
