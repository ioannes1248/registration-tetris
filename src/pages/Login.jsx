import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import './Login.css'

// ============================================================
// ----- TEMP GUEST LOGIN START: 개발 완료 후 이 임시 코드 삭제 -----
// ============================================================

const GUEST_MODE_KEY = 'registration-tetris:guest-mode'

// ============================================================
// ----- TEMP GUEST LOGIN END ---------------------------------
// ============================================================

/**
 * =========================================================
 * [Login.jsx 컴포넌트 동작 흐름도]
 * 
 * 1. URL 파라미터 파싱 (getSearchParams)
 *    : urlBackup.js에서 정돈해 준 깨끗한 실제 쿼리 스트링(window.location.search) 및 해시를 읽어
 *      이메일 인증용 토큰(token_hash)이나 접근 에러(error)를 안전하게 파악합니다.
 * 
 * 2. 컴포넌트 마운트 및 useEffect 실행 (자동 인증 및 방어 로직)
 *    │
 *    ├──▶ [URL 청소기 구동] 방금 파싱한 URL 찌꺼기를 즉각 브라우저 주소창에서 삭제
 *    │         ➔ (이후 로그아웃 시 옛날 URL의 에러 창이 또 뜨는 무한 잔상 버그를 원천 차단)
 *    │
 *    ├──▶ A. 은닉된 인증 토큰(access_token)이 존재하는가? (Implicit 흐름 예외 처리)
 *    │         ├─ Yes ➔ 강제 세션 설정(setSession) ➔ 성공 시 즉시 /main 이동
 *    │         └─ No  ➔ (다음 단계로 진행)
 *    │
 *    ├──▶ B. 매직 링크 검증용 토큰(token_hash)이 존재하는가?
 *    │         ├─ Yes ➔ 서버에 검증(verifyOtp) 요청 ➔ 성공 시 즉시 /main 이동 (실패 시 에러 화면)
 *    │         └─ No  ➔ (다음 단계로 진행)
 *    │
 *    └──▶ C. 로컬 브라우저에 이미 유효한 로그인 세션 정보가 살아있는가?
 *              ├─ Yes ➔ 즉시 /main 이동 (불필요한 로그인 폼 노출 구간 자동 스킵)
 *              └─ No  ➔ 백그라운드용 인증 상태 감시자 가동 (onAuthStateChange)
 * 
 * 3. 폼 제출 이벤트 처리 (handleLogin)
 *    : 사용자가 이메일을 입력하고 "로그인" 버튼을 눌렀을 때의 동작입니다.
 *    │
 *    ├──▶ 이메일 형태가 지정된 제휴 주소(@cku.ac.kr) 소속인가?
 *    │         ├─ 기각 ➔ 폼 하단에 빨간색 경고 텍스트 에러 조용히 노출 및 중단
 *    │         └─ 통과 ➔ Supabase 서버에 즉각적인 매직 링크 이메일 발송 요청
 *    │
 *    └──▶ 이메일 발송 결과 수신
 *              ├─ 실패 ➔ (예: 60초 대기 제한 등) 폼 하단에 빨간색 텍스트(loginFormError) 부드럽게 노출
 *              └─ 성공 ➔ linkSent 상태값을 true로 변경하여 안내 화면(View 2)으로 전환
 * 
 * 4. 현재 렌더링 상태에 따른 조건부 화면 노출 (View 분기)
 *    │
 *    ├──▶ (오래된 토큰 재사용 등 치명적 인증 에러 시) ➔ View 1: "인증 실패" 에러 전용 창
 *    ├──▶ (매직 링크를 정상적으로 발송했을 때)         ➔ View 2: "메일함 열어보기" 안내 화면
 *    └──▶ (아무일도 없는 가장 평범한 최초 접속 상태)  ➔ View 3: 이메일 폼 로그인 입력 화면
 * =========================================================
 */
export default function Login() {
  const navigate = useNavigate()

  // 로그인 버튼 로딩 상태 및 입력된 이메일 문자열 저장
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')

  // 흐름도 1: URL 파라미터 파싱
  const getSearchParams = () => {
    // 💡 urlBackup.js를 통해 찌꺼기 URL이 모두 올바른 규격으로 정돈되었으므로,
    // 잔상 버그가 생기기 쉬운 과거 __RAW_URL__ 대신 현재 브라우저의 실제 주소에서만 파싱합니다.
    let search = window.location.search
    if (!search && window.location.hash.includes('?')) {
      search = '?' + window.location.hash.split('?')[1]
    }
    return new URLSearchParams(search)
  }

  const params = getSearchParams()
  const initialError = params.get('error_description')

  // 흐름도 4번을 제어하기 위한 렌더링 상태값
  const [authError, setAuthError] = useState(initialError) 
  const [linkSent, setLinkSent] = useState(false)
  const [loginFormError, setLoginFormError] = useState('') // [신규] 폼 제출 시 발생하는 인라인 에러 (60초 제한 등)

  // 애니메이션
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(t)
  }, [])

  // 흐름도 2: 각종 인증 과정 (토큰, 세션 감지) 및 로그인 뷰 자동 스킵 훅
  useEffect(() => {
    const params = getSearchParams()
    const token_hash = params.get('token_hash')
    const type = params.get('type')
    
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    
    // [신규 추가] 추출이 끝났으면 브라우저 주소창에 지저분하게 남아있는 토큰 및 에러 찌꺼기 문자열 완전히 삭제
    // 이 처리를 안 해주면 뒤로가기나 로그아웃 시 옛날 URL의 파라미터가 재실행되어 Auth session missing 에러를 냅니다.
    if (window.location.search || window.location.href.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0] // 해시 뒤에 붙은 것도 제거
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }
    
    // 흐름도 2-A: 토큰 직접 파싱 및 하이재킹 (HashRouter 에러 방지용 패치)
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error }) => {
        if (!error && data?.session) {
          const cleanHash = window.location.hash.split('?')[0]
          window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
          navigate('/main', { replace: true })
        } else {
          setAuthError(error ? error.message : '세션 설정 실패')
        }
      })
    }

    // 흐름도 2-B: 정상 매직 링크 버튼 유입 시 토큰 검증 로직
    if (token_hash) {
      supabase.auth
        .verifyOtp({
          token_hash,
          type: type || 'email',
        })
        .then(({ error }) => {
          if (error) {
            setAuthError(error.message)
          } else {
            const cleanHash = window.location.hash.split('?')[0]
            window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
            
            navigate('/main', { replace: true })
          }
        })
    }

    // 흐름도 2-C: 기존 세션 검사 (이미 로그인 된 유저는 메인으로 프리패스)
    supabase.auth.getSession().then(({ data }) => {
      if (data && data.session && data.session.user) {
        navigate('/main', { replace: true }) 
      }
    })

    // 로그인, 로그아웃 등의 이벤트 발생 시 즉시 이동 감지기 가동
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          navigate('/main', { replace: true })
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  // 흐름도 3: 로그인 폼 제출 시 매직 링크 발송 처리 이벤트
  const handleLogin = async (event) => {
    event.preventDefault()
    setLoginFormError('') // 기존 에러 초기화
    
    // 도메인 제한: @cku.ac.kr로 입력했는지 확인
    if (!email.endsWith('@cku.ac.kr')) {
      setLoginFormError('가톨릭관동대학교 이메일(@cku.ac.kr)만 사용할 수 있습니다.')
      return
    }

    setLoading(true) 
    
    // 이메일에 링크 전송
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname + '#/login',
      },
    })
    
    if (error) {
      // alert() 팝업 증발 버그를 해결하기 위해 화면에 명확한 에러 텍스트로 부드럽게 표시합니다.
      setLoginFormError(error.error_description || error.message) 
    } else {
      setLinkSent(true) // 메일 전송 성공 시 => 화면 전환 (View 2)
    }
    setLoading(false)
  }

  // ============================================================
  // ----- TEMP GUEST LOGIN START: 개발 완료 후 이 함수 삭제 -----
  // ============================================================

  const handleGuestLogin = () => {
    window.sessionStorage.setItem(GUEST_MODE_KEY, 'true')
    navigate('/main', { replace: true })
  }

  // ============================================================
  // ----- TEMP GUEST LOGIN END ---------------------------------
  // ============================================================

  // ==========================================
  // 흐름도 4: 조건부 화면 렌더링 로직 (View 결정)
  // ==========================================

  // View 1: 에러 발생 시
  if (authError) {
    return (
      <div className="page-center login-page">
        <div className={`login-card text-center ${mounted ? 'animate-scale' : 'login-hidden'}`}>
          {/* Error Icon */}
          <div className="login-status-icon login-error-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="login-heading">인증 실패</h2>
          <p className="login-error-text">{authError}</p>
          <button
            className="btn btn-primary btn-md login-full-button"
            onClick={() => {
              setAuthError(null)
              const cleanHash = window.location.hash.split('?')[0]
              window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
            }}
          >
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // View 2: 매직 링크가 사용자 메일로 무사히 발송되었을 시
  if (linkSent) {
    return (
      <div className="page-center login-page">
        <div className={`login-card text-center ${mounted ? 'animate-scale' : 'login-hidden'}`}>
          {/* Mail Icon */}
          <div className="login-status-icon login-mail-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="3" stroke="var(--color-primary)" strokeWidth="2"/>
              <path d="M2 7l10 6 10-6" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="login-heading">메일을 확인해주세요</h2>
          <p className="login-mail-text">
            <code className="login-strong-code">{email}</code> 주소로<br />
            로그인 링크가 포함된 메일을 보냈습니다.
          </p>
          <div className="flex flex-col gap-3">
            <button
              className="btn btn-success btn-md login-full-button"
              onClick={() => window.open('https://mail.google.com/a/cku.ac.kr', '_blank')}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              내 메일함 열기
            </button>
            <button
              className="btn btn-secondary btn-md login-full-button"
              onClick={() => {
                setLinkSent(false)
                setEmail('')
              }}
            >
              처음으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  // View 3: 이메일 전송조차 하지 않은 가장 최초의 폼 입력 상태
  return (
    <div className="page-center login-page">
      <div className={`login-card ${mounted ? 'animate-scale' : 'login-hidden'}`}>
        {/* 브랜드 로고 */}
        <div className="login-brand-block">
          <div className="login-brand-title">
            공강 테트리스
          </div>
          <h2 className="login-heading">로그인</h2>
          <p className="login-no-margin">가톨릭관동대학교 이메일로 로그인하세요.</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          {/* Label */}
          <div>
            <label className="login-email-label">
              이메일
            </label>
            <input
              type="email"
              className={`input ${loginFormError ? 'input-error' : ''}`}
              placeholder="학번@cku.ac.kr"
              value={email}
              required
              onChange={(e) => {
                setEmail(e.target.value)
                if (loginFormError) setLoginFormError('')
              }}
            />
          </div>

          {/* 에러 메시지 */}
          {loginFormError && (
            <div className="message-error animate-fade">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M7 4v3M7 9v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {loginFormError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-md login-submit-button"
          >
            {loading ? (
              <>
                <div className="spinner" />
                로그인 중...
              </>
            ) : (
              '로그인 링크 받기'
            )}
          </button>
        </form>

        {/* 구분선 */}
        <div className="login-divider">
          <div className="login-divider-line" />
          <span className="login-divider-text">또는</span>
          <div className="login-divider-line" />
        </div>

        {/* ============================================================ */}
        {/* ----- TEMP GUEST LOGIN START: 개발 완료 후 이 버튼 삭제 ----- */}
        {/* ============================================================ */}

        <button
          className="btn btn-secondary btn-md login-guest-button"
          onClick={handleGuestLogin}
        >
          게스트로 메인 이동
        </button>

        {/* ============================================================ */}
        {/* ----- TEMP GUEST LOGIN END --------------------------------- */}
        {/* ============================================================ */}

        <button
          className="btn btn-ghost btn-md login-full-button"
          onClick={() => navigate('/')}
        >
          ← 메인으로 돌아가기
        </button>
      </div>

      {/* 하단 안내 */}
      <p className="login-footer-text">
        로그인 시 이메일로 일회성 인증 링크가 발송됩니다.<br />
        별도의 비밀번호가 필요하지 않습니다.
      </p>
    </div>
  )
}
