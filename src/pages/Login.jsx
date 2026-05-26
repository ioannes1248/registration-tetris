import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import './Login.css'

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
 * [Login.jsx 컴포넌트 동작 흐름도]
 * * 1. URL 파라미터 파싱 (getSearchParams)
 * 2. 컴포넌트 마운트 및 useEffect 실행 (자동 인증 및 방어 로직)
 * 3. 폼 제출 이벤트 처리 (handleLogin)
 * 4. 현재 렌더링 상태에 따른 조건부 화면 노출 (View 분기)
 * =========================================================
 */
export default function Login() {
  const navigate = useNavigate()

  // 로그인 버튼 로딩 상태 및 입력된 이메일 문자열 저장
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')

  // 흐름도 1: URL 파라미터 파싱
  const getSearchParams = () => {
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
  const [loginFormError, setLoginFormError] = useState('') 

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
    
    if (window.location.search || window.location.href.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0] 
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }
    
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

    supabase.auth.getSession().then(({ data }) => {
      if (data && data.session && data.session.user) {
        navigate('/main', { replace: true }) 
      }
    })

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
    setLoginFormError('') 
    
    if (!email.endsWith('@cku.ac.kr')) {
      setLoginFormError('가톨릭관동대학교 이메일(@cku.ac.kr)만 사용할 수 있습니다.')
      return
    }

    setLoading(true) 
    
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + window.location.pathname + '#/login',
      },
    })
    
    if (error) {
      setLoginFormError(error.error_description || error.message) 
    } else {
      setLinkSent(true) 
    }
    setLoading(false)
  }

  const handleGuestLogin = () => {
    window.sessionStorage.setItem(GUEST_MODE_KEY, 'true')
    navigate('/main', { replace: true })
  }

  // ==========================================
  // 흐름도 4: 조건부 화면 렌더링 로직 (View 결정)
  // ==========================================

  // View 1: 에러 발생 시
  if (authError) {
    return (
      <div className="login-page">
        <div className={`login-card ${mounted ? 'animate-scale' : 'login-hidden'}`}>
          <div className="login-header">
            <h2 className="login-title" style={{ color: '#ef4444' }}>인증 실패</h2>
          </div>
          <div className="login-message error">{authError}</div>
          <button
            className="login-button"
            style={{ marginTop: '20px' }}
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
      <div className="login-page">
        <div className={`login-card ${mounted ? 'animate-scale' : 'login-hidden'}`}>
          <div className="login-header">
            <h2 className="login-title">메일을 확인해주세요</h2>
            <p className="login-subtitle">
              <strong>{email}</strong> 주소로<br />
              로그인 링크가 포함된 메일을 보냈습니다.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              className="login-button"
              onClick={() => window.open('https://mail.google.com/a/cku.ac.kr', '_blank')}
            >
              내 메일함 열기
            </button>
            <button
              className="login-guest-button"
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
    <div className="login-page">
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div className={`login-card ${mounted ? 'animate-scale' : 'login-hidden'}`}>
          
          <div className="login-header">
            <h2 className="login-title">공강 테트리스 로그인</h2>
            <p className="login-subtitle">가톨릭관동대학교 이메일로 로그인하세요.</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <input
              type="email"
              className={`login-input ${loginFormError ? 'input-error' : ''}`}
              placeholder="학번@cku.ac.kr"
              value={email}
              required
              onChange={(e) => {
                setEmail(e.target.value)
                if (loginFormError) setLoginFormError('')
              }}
            />

            {loginFormError && (
              <div className="login-message error">
                {loginFormError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-button"
            >
              {loading ? '로그인 중...' : '로그인 링크 받기'}
            </button>
          </form>

          <div style={{ margin: '20px 0', borderBottom: '1px solid #e2e8f0' }}></div>

          {/* ============================================================ */}
          {/* ----- TEMP GUEST LOGIN START ----- */}
          {/* ============================================================ */}
          <button
            className="login-guest-button"
            onClick={handleGuestLogin}
          >
            게스트로 메인 이동
          </button>
          {/* ============================================================ */}
          {/* ----- TEMP GUEST LOGIN END ----- */}
          {/* ============================================================ */}

          <button
            className="login-guest-button"
            style={{ border: 'none', backgroundColor: 'transparent', marginTop: '5px' }}
            onClick={() => navigate('/')}
          >
            ← 메인으로 돌아가기
          </button>
        </div>

        {/* 하단 안내 */}
        <p className="login-subtitle" style={{ textAlign: 'center', marginTop: '20px' }}>
          로그인 시 이메일로 일회성 인증 링크가 발송됩니다.<br />
          별도의 비밀번호가 필요하지 않습니다.
        </p>
      </div>
    </div>
  )
}