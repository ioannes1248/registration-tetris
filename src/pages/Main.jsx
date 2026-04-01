import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

/**
 * =========================================================
 * [Main.jsx — 메인 페이지 (화면 ID: main)]
 *
 * 화면 목적 : 사용자 정보 표시 및 서비스 사용 안내
 * 진입 경로 : 로그인 성공 후 자동 이동
 * 이동 경로 : 공강 테트리스 시작 버튼 → 공강 테트리스 페이지 (/tetris)
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
 *  3. 화면 렌더링 (View)
 *     │
 *     ├──▶ (로딩 중)  ─▶ 스피너 + "로딩 중..." 표시
 *     │
 *     └──▶ (로딩 완료) ─▶ 메인 페이지 렌더링
 *              │
 *              ├─▶ [MN-001] 사용자 정보 카드
 *              │     : 이메일 기반으로 이름, 마스킹된 학번, 모드를 표시합니다.
 *              │     : 게스트 모드 시 '게스트'로 표시됩니다.
 *              │
 *              ├─▶ [MN-002] 사용 방법 안내
 *              │     : 서비스 이용 절차를 4단계 카드로 안내합니다.
 *              │     : 조건 설정 → 시간표 생성 → 결과 비교 → 최종 선택
 *              │
 *              ├─▶ [MN-003] 공강 테트리스 시작 CTA
 *              │     : 클릭 시 /tetris 페이지로 라우팅합니다.
 *              │
 *              └─▶ [로그아웃 버튼 클릭 시]
 *                    handleLogout() ➔ Supabase signOut()
 *                    ➔ 2-B 구독이 SIGNED_OUT 감지 ➔ / 페이지로 자동 이동
 *
 * ─────────────────────────────────────────────────────────
 *  [예외 처리]
 *
 *  | 구분   | 발생 조건           | 처리 방안                        |
 *  |--------|---------------------|----------------------------------|
 *  | 세션   | 세션 만료           | / (인트로) 페이지로 리다이렉트    |
 *  | 데이터 | 사용자 정보 없음    | 최소 정보 또는 게스트 모드 표시   |
 *  | 보안   | URL 찌꺼기 파라미터 | replaceState로 즉시 삭제         |
 * =========================================================
 */

// [MN-002] 서비스 이용 절차 안내 — 4단계 스텝 데이터
// 조건 설정 → 시간표 생성 → 결과 비교 → 최종 선택
const GUIDE_STEPS = [
  {
    step: 1,
    icon: '⚙️',
    title: '조건 설정',
    description: '공강 요일, 선호 시간, 학점 범위, 필수과목 등 원하는 조건을 설정하세요.',
    color: 'var(--color-primary)',
  },
  {
    step: 2,
    icon: '🧩',
    title: '시간표 생성',
    description: '설정한 조건에 맞는 최적의 시간표 조합을 자동으로 생성합니다.',
    color: 'var(--color-subject-3)',
  },
  {
    step: 3,
    icon: '📊',
    title: '결과 비교',
    description: '생성된 시간표 후보를 공강, 연강, 점심시간 등 지표로 비교하세요.',
    color: 'var(--color-subject-2)',
  },
  {
    step: 4,
    icon: '✅',
    title: '최종 선택',
    description: '마음에 드는 시간표를 선택하고 저장하세요.',
    color: 'var(--color-success)',
  },
]

const Main = () => {
  const navigate = useNavigate()
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

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
        setUserEmail(session.user.email)
      } else {
        navigate('/', { replace: true })
      }
      setLoading(false)
    }

    fetchSession()

    // 흐름도 2-B: 실시간 인증 상태 변화 감시 (로그아웃 / 세션 만료 즉시 감지)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        navigate('/', { replace: true })
      } else if (session?.user) {
        setUserEmail(session.user.email)
      }
    })

    // 컴포넌트 언마운트 시 감시자 해제 (메모리 누수 방지)
    return () => {
      subscription.unsubscribe()
    }
  }, [navigate])

  // 흐름도 3: 로그아웃 → signOut() 호출 → 2-B 감시자가 SIGNED_OUT 감지 → 자동 리다이렉트
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  // [MN-001 헬퍼] 이메일에서 사용자 정보 추출 유틸리티
  const getInitial = (email) => {
    if (!email) return '?'
    return email.charAt(0).toUpperCase()
  }

  const getUserName = (email) => {
    if (!email) return '게스트'
    return email.split('@')[0]
  }

  const getUserDomain = (email) => {
    if (!email) return ''
    return '@' + email.split('@')[1]
  }

  // [MN-001 헬퍼] 학번 마스킹 — 앞 4자리만 표시하고 나머지 ****
  // 게스트 모드 시 전체 마스킹 처리
  const getMaskedId = (email) => {
    if (!email) return '****'
    const id = email.split('@')[0]
    if (id.length <= 4) return id
    return id.substring(0, 4) + '****'
  }

  // 흐름도 3-A: 세션 검증 중 잠깐 보여줄 로딩 화면 (보통 0.1초 이내)
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

  // 흐름도 3-B: 인증 완료 후 보여줄 메인 화면
  return (
    <div className="dashboard">
      {/* ── 상단 네비게이션 ── */}
      <nav className="nav">
        <div className="nav-brand">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="1" y="1" width="8" height="8" rx="2" fill="var(--color-primary)" opacity="0.9"/>
            <rect x="11" y="1" width="8" height="8" rx="2" fill="var(--color-subject-3)" opacity="0.7"/>
            <rect x="1" y="11" width="8" height="8" rx="2" fill="var(--color-subject-5)" opacity="0.6"/>
            <rect x="11" y="11" width="8" height="8" rx="2" fill="var(--color-subject-2)" opacity="0.8"/>
          </svg>
          <span>공강</span>테트리스
        </div>

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

          {/* MN-001: 사용자 정보 카드 */}
          <div className={`main-user-card ${mounted ? 'animate-in' : ''}`} style={{ opacity: mounted ? undefined : 0 }}>
            <div className="main-user-card-avatar">
              <div className="user-avatar" style={{ width: 56, height: 56, fontSize: '1.4rem' }}>
                {getInitial(userEmail)}
              </div>
            </div>
            <div className="main-user-card-info">
              <h2 style={{ marginBottom: 'var(--space-1)', fontSize: '1.4rem' }}>
                안녕하세요, <span style={{ color: 'var(--color-primary)' }}>{getUserName(userEmail)}</span>님!
              </h2>
              <div className="flex gap-4" style={{ flexWrap: 'wrap' }}>
                <div className="main-info-item">
                  <span className="main-info-label">학번</span>
                  <span className="main-info-value"><code>{getMaskedId(userEmail)}</code></span>
                </div>
                <div className="main-info-item">
                  <span className="main-info-label">이메일</span>
                  <span className="main-info-value">{getUserName(userEmail)}{getUserDomain(userEmail)}</span>
                </div>
                <div className="main-info-item">
                  <span className="main-info-label">모드</span>
                  <span className="chip chip-success" style={{ fontSize: '0.73rem' }}>정회원</span>
                </div>
              </div>
            </div>
          </div>

          {/* MN-002: 사용 방법 안내 — 스텝 가이드 */}
          <div className={`${mounted ? 'animate-in delay-2' : ''}`} style={{ 
            marginTop: 'var(--space-10)', opacity: mounted ? undefined : 0,
          }}>
            <h3 style={{ marginBottom: 'var(--space-2)' }}>서비스 이용 방법</h3>
            <p style={{ fontSize: '0.93rem', marginBottom: 'var(--space-6)' }}>
              아래 4단계를 따라 나만의 최적 시간표를 만들어 보세요.
            </p>

            <div className="guide-steps">
              {GUIDE_STEPS.map((item, idx) => (
                <div className="guide-step-card" key={item.step}>
                  {/* 스텝 번호 뱃지 */}
                  <div className="guide-step-number" style={{ background: item.color }}>
                    {item.step}
                  </div>
                  {/* 아이콘 */}
                  <div style={{ fontSize: '1.6rem', marginBottom: 'var(--space-3)' }}>
                    {item.icon}
                  </div>
                  {/* 제목 */}
                  <div style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: '1rem',
                    marginBottom: 'var(--space-2)',
                    color: 'var(--color-text-primary)',
                  }}>
                    {item.title}
                  </div>
                  {/* 설명 */}
                  <p style={{ fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                    {item.description}
                  </p>
                  {/* 연결 화살표 (마지막 제외) */}
                  {idx < GUIDE_STEPS.length - 1 && (
                    <div className="guide-step-arrow">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M7 4L13 10L7 16" stroke="var(--color-border)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* MN-003: 공강 테트리스 시작 CTA */}
          <div className={`main-cta-section ${mounted ? 'animate-in delay-4' : ''}`} style={{ opacity: mounted ? undefined : 0 }}>
            <div className="main-cta-content">
              <h3 style={{ marginBottom: 'var(--space-2)', color: '#FFFFFF' }}>
                준비되셨나요?
              </h3>
              <p style={{ fontSize: '0.93rem', color: 'rgba(255,255,255,0.8)', margin: 0, marginBottom: 'var(--space-6)' }}>
                원하는 조건을 설정하고 최적의 시간표를 자동으로 생성해 보세요.
              </p>
              <button
                className="btn btn-lg"
                style={{
                  background: '#FFFFFF',
                  color: 'var(--color-primary)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  padding: '0 var(--space-8)',
                  height: 48,
                }}
                onClick={() => navigate('/tetris')}
              >
                🧩 공강 테트리스 시작하기
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 'var(--space-1)' }}>
                  <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default Main
