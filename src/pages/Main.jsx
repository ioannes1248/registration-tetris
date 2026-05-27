import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import './Main.css'

// ============================================================
// ----- TEMP GUEST LOGIN START: 개발 완료 후 이 임시 코드 삭제 -----
// ============================================================
const GUEST_MODE_KEY = 'registration-tetris:guest-mode'
const GUEST_EMAIL = 'guest@cku.ac.kr'
// ============================================================
// ----- TEMP GUEST LOGIN END ---------------------------------
// ============================================================

/**
 * =========================================================
 * [Main.jsx 컴포넌트 흐름도]
 * 
 * 1. 컴포넌트 렌더링 시작 (loading: true 세팅)
 *    │
 *    ├──▶ 2-A. fetchSession() 실행 
 *    │         : Supabase에 현재 접속된 세션을 물어봅니다.
 *    │           ├─ 세션 있음(O) ➔ 이메일 정보를 화면(State)에 저장 ➔ loading 해제
 *    │           └─ 세션 없음(X) ➔ /login 페이지로 즉시 추방 (접근 차단)
 *    │
 *    └──▶ 2-B. onAuthStateChange() 구독 시작
 *              : 백그라운드에서 사용자의 인증 상태(로그아웃 등) 변화를 실시간 감시합니다.
 *                ├─ 본인 혹은 외부에서 로그아웃됨 ➔ /login 페이지로 즉시 추방
 *                └─ 세션 정보 갱신됨 ➔ 화면(State)에 새로운 이메일 정보 업데이트
 * 
 * 3. 화면 렌더링 (View)
 *    │
 *    ├──▶ (로딩 중) ➔ 로딩 스피너 화면 노출
 *    │
 *    └──▶ (로딩 완료) ➔ 대시보드 화면 노출 (이용 가이드 UI + 로그아웃 버튼)
 *              │
 *              └─▶ [로그아웃 버튼 클릭 시]
 *                    handleLogout() 실행 ➔ Supabase에 로그아웃 요청 
 *                    ➔ 2-B 구독 로직이 이 상황을 즉시 감지하여 /login으로 자동 안내함
 * =========================================================
 */
const Main = () => {
  const navigate = useNavigate()
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    //  [버그 원천 차단] Main 진입 완료 시, 주소창에 숨어있는 이전 로그인 파라미터(?token=... 등)를 브라우저에서 완전히 삭제합니다.
    if (window.location.search || window.location.hash.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0]
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }

    // 흐름도 2-A: 컴포넌트 마운트 시 최초 1회 세션(로그인 상태) 확인
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const isGuestMode = window.sessionStorage.getItem(GUEST_MODE_KEY) === 'true'

      if (session?.user) {
        setUserEmail(session.user.email) // 세션이 있으면 이메일을 화면 변수에 저장
      } else if (isGuestMode) {
        setUserEmail(GUEST_EMAIL)
      } else {
        navigate('/', { replace: true }) // 비로그인 시 인트로 페이지로 강제 반송
      }
      setLoading(false) // 보안 검사가 끝났으므로 로딩 화면 해제
    }

    fetchSession()

    // 흐름도 2-B: 실시간 로그아웃 감지용 감시자 등록
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // 브라우저 탭에서 로그아웃을 누르거나 세션 만료 시 즉시 작동
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

    // 컴포넌트가 꺼질 때 감시자도 같이 종료 (메모리 누수 방지용)
    return () => subscription.unsubscribe()
  }, [navigate])

  // 로그아웃을 실행하는 함수
  const handleLogout = async () => {
    window.sessionStorage.removeItem(GUEST_MODE_KEY)
    await supabase.auth.signOut() 
    //  여기서 signOut()을 부르면 흐름도 2-B의 감시자가 "로그아웃 감지" 하고 안내 역할을 해줍니다.
  }

  // 이메일에서 아바타용 이니셜 추출 함수
  const getInitial = (email) => {
    if (!email) return '?'
    return email.charAt(0).toUpperCase()
  }

  // 흐름도 3-A: 정보를 검사하는 동안 잠깐 보여줄 로딩 화면
  if (loading) {
    return (
      <div className="page-center">
        <div className="flex flex-col flex-center gap-4">
          <div className="spinner spinner-dark" />
          <p>로딩 중...</p>
        </div>
      </div>
    )
  }

  // 흐름도 3-B: 인증 시스템을 통과한 유저에게만 보여줄 메인 화면 (오버랩 UI)
  return (
    <div className="dashboard">
      {/* 1. 상단 네비게이션 바 */}
      <nav className="nav">
        <div className="nav-brand">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ marginRight: '8px' }}>
            <rect x="1" y="1" width="8" height="8" rx="2" fill="var(--color-primary)" />
            <rect x="11" y="11" width="8" height="8" rx="2" fill="var(--color-subject-3)" />
          </svg>
          <span>공강</span>테트리스
        </div>
        
        <div className="flex gap-4 flex-center">
          <div className="user-badge">
            <div className="user-avatar">{getInitial(userEmail)}</div>
            <span>{userEmail}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/courses')}>
            과목 조회
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </nav>

      {/* 2. 히어로 섹션 (오버랩을 위한 높이 축소) */}
      <header 
        className="hero animate-in" 
        style={{ minHeight: '75vh', paddingBottom: '100px' }}
      >
        <h1 className="hero-title">이용 <span>가이드</span></h1>
        <p className="hero-subtitle">
          공강 테트리스를 효과적으로 사용하는 방법을 안내합니다.<br/>
          아래의 4단계 안내에 따라 최적의 시간표를 완성해보세요.
        </p>

        {/* 스크롤 다운 유도 화살표 */}
        <div style={{ position: 'absolute', bottom: '120px', color: 'var(--color-neutral)', opacity: 0.7 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'fadeInUp 1.5s infinite alternate' }}>
            <path d="M12 5v14M19 12l-7 7-7-7"/>
          </svg>
        </div>
      </header>

      {/* 3. 메인 컨텐츠 영역 (네거티브 마진으로 오버랩 효과 적용) */}
      <main 
        className="container animate-in delay-2" 
        style={{ marginTop: '-80px', position: 'relative', zIndex: 10, paddingBottom: '80px' }}
      >
        
        {/* 가이드 스텝 (4개의 카드) */}
        <div className="guide-steps">
          
          <div className="guide-step-card">
            <div className="guide-step-number" style={{ backgroundColor: 'var(--color-subject-1)' }}>1</div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>조건 설정</h3>
            <p style={{ fontSize: '0.85rem' }}>원하는 공강 요일, 선호하는 시간대, 그리고 수강할 학점 범위를 자유롭게 설정하세요.</p>
          </div>

          <div className="guide-step-card">
            <div className="guide-step-number" style={{ backgroundColor: 'var(--color-subject-2)' }}>2</div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>시간 차단</h3>
            <p style={{ fontSize: '0.85rem' }}>동아리나 알바 시간이 있나요? 시간표에서 해당 셀을 클릭하여 '금지 시간'으로 설정하세요.</p>
          </div>

          <div className="guide-step-card">
            <div className="guide-step-number" style={{ backgroundColor: 'var(--color-subject-3)' }}>3</div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>자동 생성</h3>
            <p style={{ fontSize: '0.85rem' }}>필수 과목을 추가하고 생성 버튼을 누르면 알고리즘이 가능한 모든 조합을 계산합니다.</p>
          </div>

          <div className="guide-step-card">
            <div className="guide-step-number" style={{ backgroundColor: 'var(--color-subject-4)' }}>4</div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>비교 및 선택</h3>
            <p style={{ fontSize: '0.85rem' }}>생성된 여러 후보군의 요약 정보를 한눈에 비교하고, 나에게 가장 완벽한 시간표를 저장하세요.</p>
          </div>

        </div>

        {/* 4. 하단 CTA 섹션 */}
        <section className="main-cta-section animate-in delay-4">
          <div className="main-cta-content flex flex-col flex-center gap-6">
            <h2 style={{ color: '#ffffff', fontSize: '1.8rem' }}>이제 나만의 시간표를 만들어볼까요?</h2>
            <button 
              className="btn btn-lg" 
              style={{ backgroundColor: '#ffffff', color: 'var(--color-primary)' }}
              onClick={() => navigate('/tetris')}
            >
              공강 테트리스 시작하기
            </button>
          </div>
        </section>

      </main>
    </div>
  )
}

export default Main
