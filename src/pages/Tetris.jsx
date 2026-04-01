import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

/**
 * =========================================================
 * [Tetris.jsx — 공강 테트리스 페이지 (화면 ID: tetris)]
 *
 * 화면 목적 : 시간표 조건 설정, 조합 생성, 후보 조회 및 비교
 * 진입 경로 : 메인 페이지 → 공강 테트리스 시작 버튼
 * 화면 구성 : 조건 설정 패널 + 시간표 그리드 + 후보 리스트 + 비교 영역
 *
 * ─────────────────────────────────────────────────────────
 *  [컴포넌트 렌더링 흐름도]
 *
 *  1. 컴포넌트 마운트 (loading: true)
 *     │
 *     ├──▶ 2-A. fetchSession() 실행
 *     │         : Supabase에 현재 세션을 확인합니다.
 *     │           ├─ 세션 있음(O) ➔ 이메일을 State에 저장 ➔ loading 해제
 *     │           └─ 세션 없음(X) ➔ / (인트로) 페이지로 강제 이동 (접근 차단)
 *     │
 *     └──▶ 2-B. onAuthStateChange() 구독 시작
 *              : 실시간으로 인증 상태 변화를 감시합니다.
 *                ├─ SIGNED_OUT 감지 ➔ / 페이지로 즉시 이동
 *                └─ 세션 갱신 ➔ 이메일 State 업데이트
 *
 *  3. 화면 렌더링 (View) — 2-Column 레이아웃
 *     │
 *     ├──▶ (로딩 중)  ─▶ 스피너 표시
 *     │
 *     └──▶ (로딩 완료) ─▶ 대시보드 렌더링
 *              │
 *              ├─▶ [좌측 패널] 조건 설정
 *              │     ├─ [TT-001] 공강 요일 선택   : 월~금 토글 Chip
 *              │     ├─ [TT-002] 선호 시간 설정   : 오전/오후/저녁 토글 Chip
 *              │     ├─ [TT-003] 학점 범위 설정   : 최소/최대 숫자 입력
 *              │     ├─ [TT-004] 필수과목 설정   : 검색 + 태그 추가/삭제
 *              │     └─ [TT-006] 시간표 생성 버튼 : 조건 기반 조합 생성 트리거
 *              │
 *              ├─▶ [우측 그리드] 시간표
 *              │     ├─ [TT-005] 금지 시간 설정   : 셀 클릭으로 토글 (✕ 표시)
 *              │     └─ [TT-007] 시간표 시각화   : 요일×시간 그리드 UI
 *              │
 *              └─▶ [하단] 후보 목록
 *                    ├─ [TT-008] 후보 목록       : 카드 형태로 요약 정보 표시
 *                    ├─ [TT-009] 상세 보기       : 후보 선택 시 그리드 갱신
 *                    ├─ [TT-010] 후보 비교       : 2개+ 선택 시 비교 테이블
 *                    ├─ [TT-011] 시간표 저장     : PDF/TXT 내보내기
 *                    └─ [TT-012] 결과 재생성     : 조건 변경 후 재생성
 *
 * ─────────────────────────────────────────────────────────
 *  [예외 처리]
 *
 *  | 구분     | 발생 조건               | 사용자 메시지                             | 처리 방안              |
 *  |----------|------------------------|----------------------------------------|------------------------|
 *  | 조건입력 | 최소학점 > 최대학점     | "학점 범위를 다시 확인해주세요."         | 입력값 수정 유도        |
 *  | 조건입력 | 모든 요일 공강 선택     | "조건이 너무 엄격하여 결과가 없을 수..."  | 경고 표시 후 진행 허용    |
 *  | 조합생성 | 필수 과목 간 시간 충돌 | "선택한 필수 과목 간 시간 충돌..."       | 충돌 과목 안내          |
 *  | 조합생성 | 조건 충족 결과 없음     | "조건에 맞는 시간표가 없습니다..."       | 조건 완화 가이드        |
 *  | 세션   | 세션 만료               | —                                      | / 페이지로 리다이렉트  |
 *  | 보안   | URL 찌꺼기 파라미터     | —                                      | replaceState로 삭제     |
 * =========================================================
 */

// 시간표 그리드 기본 상수 — 요일(월~금)과 시간(09:00~17:00)
const DAYS = ['월', '화', '수', '목', '금']
const TIMES = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']

// [TT-002] 선호 시간대 선택지 — 오전/오후/저녁
// 선호 시간대 수업 집중 조합에 높은 점수를 부여할 때 사용됩니다.
const TIME_PREFS = [
  { id: 'morning', label: '오전 (09~12)', desc: '9:00 ~ 12:00' },
  { id: 'afternoon', label: '오후 (13~16)', desc: '13:00 ~ 16:00' },
  { id: 'evening', label: '저녁 (17~)', desc: '17:00 이후' },
]

const Tetris = () => {
  const navigate = useNavigate()
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  // ─── 조건 설정 State ───
  const [freeDays, setFreeDays] = useState([])          // [TT-001] 공강 요일 배열
  const [timePref, setTimePref] = useState([])           // [TT-002] 선호 시간대 배열
  const [minCredits, setMinCredits] = useState(15)       // [TT-003] 최소 수강 학점
  const [maxCredits, setMaxCredits] = useState(21)       // [TT-003] 최대 수강 학점
  const [requiredCourse, setRequiredCourse] = useState('') // [TT-004] 필수과목 검색 입력값
  const [requiredCourses, setRequiredCourses] = useState([]) // [TT-004] 선택된 필수과목 배열
  const [forbiddenCells, setForbiddenCells] = useState(new Set()) // [TT-005] 금지 시간 셀 집합

  // 흐름도 1: 마운트 직후 CSS 애니메이션 작동을 위한 지연 트리거
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  // 흐름도 2-A, 2-B: 세션 확인 + 실시간 인증 감시 + URL 찌꺼기 제거
  useEffect(() => {
    // 🔥 [보안] 주소창에 남아있는 이전 로그인 파라미터(?token=... 등)를 완전히 제거합니다.
    //    로그아웃 후 찌꺼기 파라미터가 Login 페이지로 딸려가는 것을 방지합니다.
    if (window.location.search || window.location.hash.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0]
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }

    // 흐름도 2-A: 최초 1회 세션(로그인 상태) 확인
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUserEmail(session.user.email) // 세션이 있으면 이메일을 화면 변수에 저장
      } else {
        navigate('/', { replace: true }) // 비로그인 시 인트로 페이지로 강제 반송
      }
      setLoading(false) // 보안 검사가 끝났으므로 로딩 화면 해제
    }

    fetchSession()

    // 흐름도 2-B: 실시간 인증 상태 변화 감시 (로그아웃 / 세션 만료 즉시 감지)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // 다른 브라우저 탭에서 로그아웃을 누르거나 세션 만료 시 즉시 작동
      if (event === 'SIGNED_OUT' || !session) {
        navigate('/', { replace: true })
      } else if (session?.user) {
        setUserEmail(session.user.email)
      }
    })

    // 컴포넌트 언마운트 시 감시자 해제 (메모리 누수 방지)
    return () => subscription.unsubscribe()
  }, [navigate])

  // 흐름도 3: 로그아웃 → signOut() 호출 → 2-B 감시자가 SIGNED_OUT 감지 → 자동 리다이렉트
  const handleLogout = async () => {
    await supabase.auth.signOut()
    // 👉 여기서 signOut()을 부르면 흐름도 2-B의 감시자가 "로그아웃 감지!" 하고 알아서 / 페이지로 안내합니다.
  }

  // 이메일에서 아바타 이니셜 추출
  const getInitial = (email) => {
    if (!email) return '?'
    return email.charAt(0).toUpperCase()
  }

  // ─── [TT-001] 공강 요일 선택 핸들러 ───
  // 원하는 공강 요일 복수 선택 (월~금 토글). 선택한 요일에는 수업 미배치
  const toggleFreeDay = (day) => {
    setFreeDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])
  }

  // ─── [TT-002] 선호 시간대 토글 핸들러 ───
  // 오전/오후/저녁 중 복수 선택 가능. 선호 시간대 수업 집중 조합에 높은 점수 부여
  const toggleTimePref = (id) => {
    setTimePref(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  // ─── [TT-004] 필수과목 추가/삭제 핸들러 ───
  // 반드시 포함할 과목 검색 및 선택. 해당 과목 포함 시간표만 결과 표시
  const addRequiredCourse = () => {
    const trimmed = requiredCourse.trim()
    if (trimmed && !requiredCourses.includes(trimmed)) {
      setRequiredCourses(prev => [...prev, trimmed])
      setRequiredCourse('')
    }
  }

  const removeRequiredCourse = (course) => {
    setRequiredCourses(prev => prev.filter(c => c !== course))
  }

  // ─── [TT-005] 금지 시간 설정 핸들러 ───
  // 수업 피하고 싶은 요일-시간 블록을 그리드에서 직접 클릭하여 지정.
  // 해당 시간 수업 포함 조합은 결과에서 제외됩니다.
  const toggleForbiddenCell = (rowIdx, colIdx) => {
    const key = `${rowIdx}-${colIdx}`
    setForbiddenCells(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 흐름도 3-A: 세션 검증 중 잠깐 보여줄 로딩 화면
  if (loading) {
    return (
      <div className="page-center" style={{ background: 'var(--color-bg)' }}>
        <div className="flex flex-col flex-center gap-4">
          <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--color-neutral)', fontSize: '0.93rem' }}>로딩 중...</p>
        </div>
      </div>
    )
  }

  // 흐름도 3-B: 인증 완료 후 보여줄 공강 테트리스 화면
  return (
    <div className="dashboard">
      {/* ── 상단 네비게이션 ── */}
      <nav className="nav">
        <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/main')}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="8" height="8" rx="2" fill="var(--color-primary)" opacity="0.9"/>
            <rect x="11" y="1" width="8" height="8" rx="2" fill="var(--color-subject-3)" opacity="0.7"/>
            <rect x="1" y="11" width="8" height="8" rx="2" fill="var(--color-subject-5)" opacity="0.6"/>
            <rect x="11" y="11" width="8" height="8" rx="2" fill="var(--color-subject-2)" opacity="0.8"/>
          </svg>
          <span>공강</span>테트리스
        </div>

        <ul className="nav-links" style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0 }}>
          <li className="nav-link" onClick={() => navigate('/main')}>홈</li>
          <li className="nav-link nav-link-active">시간표 편성</li>
        </ul>

        <div className="flex gap-3" style={{ alignItems: 'center' }}>
          <div className="user-badge">
            <div className="user-avatar">{getInitial(userEmail)}</div>
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userEmail}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </nav>

      {/* ── 메인 콘텐츠 ── */}
      <div className="dashboard-content">
        <div className="container">
          {/* 페이지 헤더 */}
          <div className={`${mounted ? 'animate-in' : ''}`} style={{
            marginBottom: 'var(--space-8)', opacity: mounted ? undefined : 0,
          }}>
            <h2 style={{ marginBottom: 'var(--space-2)' }}>시간표 편성</h2>
            <p style={{ fontSize: '0.93rem' }}>
              원하는 공강 시간과 과목을 설정하면 가능한 조합을 자동으로 찾아드립니다.
            </p>
          </div>

          {/* 2-Column 대시보드 레이아웃 */}
          <div className={`dashboard-grid ${mounted ? 'animate-in delay-2' : ''}`} style={{ opacity: mounted ? undefined : 0 }}>
            
            {/* ── 좌측: 조건 설정 패널 ── */}
            <div className="panel">
              <div className="panel-title">⚙️ 조건 설정</div>

              {/* [TT-001] 공강 요일 선택 — 원하는 공강 요일 복수 선택 (월~금 토글) */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label className="field-label">공강 원하는 요일</label>
                <p className="field-desc">선택한 요일에는 수업이 배치되지 않습니다.</p>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {DAYS.map((day) => (
                    <button
                      key={day}
                      className={`chip ${freeDays.includes(day) ? 'chip-active' : ''}`}
                      style={{ cursor: 'pointer', border: 'none' }}
                      onClick={() => toggleFreeDay(day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* [TT-002] 선호 시간 설정 — 선호 수업 시간대 (오전/오후/저녁) */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label className="field-label">선호 시간대</label>
                <p className="field-desc">선호 시간대에 수업이 집중 배치됩니다.</p>
                <div className="flex flex-col gap-2">
                  {TIME_PREFS.map((pref) => (
                    <button
                      key={pref.id}
                      className={`chip ${timePref.includes(pref.id) ? 'chip-active' : ''}`}
                      style={{ cursor: 'pointer', border: 'none', justifyContent: 'flex-start', padding: 'var(--space-2) var(--space-3)' }}
                      onClick={() => toggleTimePref(pref.id)}
                    >
                      {pref.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* [TT-003] 학점 범위 설정 — 최소/최대 수강 학점 (범위 내 학점 충족 시간표만 결과에 포함) */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label className="field-label">학점 범위</label>
                <div className="flex gap-2" style={{ alignItems: 'center' }}>
                  <input
                    type="number"
                    className="input"
                    style={{ width: 80, textAlign: 'center' }}
                    value={minCredits}
                    min={1}
                    max={maxCredits}
                    onChange={(e) => setMinCredits(Number(e.target.value))}
                  />
                  <span style={{ color: 'var(--color-neutral)', fontSize: '0.87rem' }}>~</span>
                  <input
                    type="number"
                    className="input"
                    style={{ width: 80, textAlign: 'center' }}
                    value={maxCredits}
                    min={minCredits}
                    max={24}
                    onChange={(e) => setMaxCredits(Number(e.target.value))}
                  />
                  <span style={{ color: 'var(--color-neutral)', fontSize: '0.87rem' }}>학점</span>
                </div>
                {/* [예외처리] 최소 학점 > 최대 학점 시 에러 메시지 표시 */}
                {minCredits > maxCredits && (
                  <div className="message-error animate-fade" style={{ marginTop: 'var(--space-2)' }}>
                    학점 범위를 다시 확인해주세요.
                  </div>
                )}
              </div>

              {/* [TT-004] 필수과목 설정 — 반드시 포함할 과목 검색 및 선택 */}
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <label className="field-label">필수 과목</label>
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="과목명 또는 학수번호 입력..."
                    value={requiredCourse}
                    onChange={(e) => setRequiredCourse(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addRequiredCourse()}
                  />
                  <button className="btn btn-secondary btn-md" onClick={addRequiredCourse}>
                    추가
                  </button>
                </div>
                {/* 선택된 필수과목 태그 목록 (클릭 시 삭제) */}
                {requiredCourses.length > 0 && (
                  <div className="flex gap-2" style={{ flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                    {requiredCourses.map((c) => (
                      <span key={c} className="chip chip-active" style={{ cursor: 'pointer', gap: 'var(--space-1)' }} onClick={() => removeRequiredCourse(c)}>
                        {c} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* [TT-006] 시간표 생성 버튼 — 설정한 조건으로 시간표 조합 생성 트리거 */}
              <button className="btn btn-primary btn-md" style={{ width: '100%' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13 3L6 14L3 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                시간표 자동 생성
              </button>
            </div>

            {/* ── 우측: 시간표 그리드 ([TT-005] 금지 시간 설정 + [TT-007] 시간표 시각화) ── */}
            <div className="timetable">
              <div style={{
                padding: 'var(--space-4) var(--space-5)',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div className="panel-title" style={{ margin: 0 }}>📊 시간표</div>
                <div className="flex gap-2">
                  {/* [TT-005] 금지 시간 현황 표시 */}
                  {forbiddenCells.size > 0 && (
                    <span className="chip chip-error">
                      금지 {forbiddenCells.size}칸
                    </span>
                  )}
                  <span className="chip" style={{ fontSize: '0.73rem', color: 'var(--color-neutral)' }}>
                    클릭하여 금지 시간 설정
                  </span>
                </div>
              </div>

              <div className="timetable-grid">
                {/* 헤더 행 — [TT-001] 공강 선택 요일은 초록 배경 + "공강" 라벨 */}
                <div className="header-cell"></div>
                {DAYS.map((day) => (
                  <div className={`header-cell ${freeDays.includes(day) ? 'header-cell-free' : ''}`} key={day}>
                    {day}
                    {freeDays.includes(day) && <span style={{ display: 'block', fontSize: '0.6rem', color: 'var(--color-success)' }}>공강</span>}
                  </div>
                ))}

                {/* 시간 슬롯 — [TT-005] 셀 클릭으로 금지 시간 설정/해제 */}
                {TIMES.map((time, rowIdx) => (
                  <React.Fragment key={time}>
                    <div className="time-cell">{time}</div>
                    {DAYS.map((_, colIdx) => {
                      const key = `${rowIdx}-${colIdx}`
                      const isForbidden = forbiddenCells.has(key)
                      const isFreeDay = freeDays.includes(DAYS[colIdx])
                      return (
                        <div
                          className={`data-cell ${isForbidden ? 'data-cell-forbidden' : ''} ${isFreeDay ? 'data-cell-freeday' : ''}`}
                          key={key}
                          onClick={() => toggleForbiddenCell(rowIdx, colIdx)}
                          style={{ cursor: 'pointer' }}
                          title={isForbidden ? '금지 시간 해제' : '금지 시간으로 설정'}
                        >
                          {isForbidden && (
                            <div className="forbidden-block">✕</div>
                          )}
                        </div>
                      )
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* ── 하단: 생성된 시간표 후보 목록 ([TT-008] 후보 목록) ── */}
          {/* 시간표 생성 후 조건 충족 시간표를 카드/리스트로 제공합니다. */}
          {/* 요약 정보(학점, 공강, 연강 수 등)가 표시됩니다. */}
          <div className={`${mounted ? 'animate-in delay-3' : ''}`} style={{
            marginTop: 'var(--space-10)', opacity: mounted ? undefined : 0,
          }}>
            <div className="flex flex-between" style={{ marginBottom: 'var(--space-5)' }}>
              <h3>생성된 시간표 조합</h3>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--space-16) var(--space-6)',
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface)',
            }}>
              <div className="text-center">
                <p style={{ fontSize: '2rem', marginBottom: 'var(--space-3)' }}>🧩</p>
                <p style={{ color: 'var(--color-neutral)', fontSize: '0.93rem' }}>
                  위의 조건을 설정한 뒤 "시간표 자동 생성" 버튼을 눌러주세요.
                </p>
                <p style={{ color: 'var(--color-neutral)', fontSize: '0.8rem', marginTop: 'var(--space-2)' }}>
                  가능한 시간표 조합이 여기에 카드 형태로 표시됩니다.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Tetris
