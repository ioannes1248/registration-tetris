import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

/**
 * =========================================================
 * [Login.jsx 컴포넌트 흐름도]
 * 
 * 1. URL 파라미터 파싱 (getSearchParams)
 *    : 기존 탭 통째 복사, 새 탭 오픈 등 다양한 환경에서 에러나 인증 토큰을 
 *      놓치지 않기 위해 window.__RAW_URL__ 또는 현재 URL을 분석합니다.
 * 
 * 2. 컴포넌트 마운트 및 useEffect 실행 (자동 인증 및 리다이렉트 처리)
 *    │
 *    ├──▶ A. 토큰(access_token)이 URL에 존재하는가? (HashRouter 더블 해시 환경)
 *    │         ├─ Yes ➔ 수동으로 강제 세션 설정(setSession) ➔ 성공 시 즉시 /main 이동
 *    │         └─ No  ➔ (다음 단계로 진행)
 *    │
 *    ├──▶ B. 매직 링크 이메일 검증(token_hash)으로 유입되었는가?
 *    │         ├─ Yes ➔ 서버에 OTP 토큰 검증(verifyOtp) 요청 ➔ 성공 시 즉시 /main 이동
 *    │         └─ No  ➔ (다음 단계로 진행)
 *    │
 *    └──▶ C. 기존에 과거 로그인해 둔 흔적(세션)이 브라우저에 남아있는가?
 *              ├─ Yes ➔ 즉시 /main 이동 (불필요한 로그인 폼 노출 방지)
 *              └─ No  ➔ 백그라운드에서 인증 상태 감시자 가동 (onAuthStateChange)
 * 
 * 3. 폼 제출 이벤트 처리 (handleLogin)
 *    : 유저가 자신이 사용할 이메일을 치고 "로그인" 버튼을 클릭했을 때 실행됩니다.
 *    │
 *    ├──▶ 이메일 형태가 @cku.ac.kr로 끝나는가?
 *    │         ├─ 기각 ➔ 경고창(alert) 띄우고 종료
 *    │         └─ 통과 ➔ Supabase에 이메일 매직 링크 발송 요청 (signInWithOtp)
 *    │
 *    └──▶ 이메일 발송 결과 
 *              ├─ 실패 ➔ 실패 사유 에러 팝업
 *              └─ 성공 ➔ linkSent 상태를 true로 변경하여 화면 전환 (View 2)
 * 
 * 4. 현재 상태에 따른 조건부 화면 렌더링 (View 분기)
 *    │
 *    ├──▶ (에러 상태인가?) ➔ View 1: "인증 실패" 에러 창과 뒤로가기 버튼
 *    ├──▶ (링크 발송인가?) ➔ View 2: "메일을 확인해주세요!" 안내창 및 구글 메일 숏컷 버튼
 *    └──▶ (아무일도 없음)  ➔ View 3: [기본 상태] 이메일 입력 폼 노출
 * =========================================================
 */
export default function Login() {
  const navigate = useNavigate()

  // 로그인 버튼 로딩 상태 및 입력된 이메일 문자열 저장
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')

  // 흐름도 1: URL 파라미터 파싱
  const getSearchParams = () => {
    const href = window.__RAW_URL__ || window.location.href
    let search = ''
    
    if (href.includes('?')) {
      search = href.substring(href.indexOf('?'))
    } else if (href.includes('error=')) {
      search = '?' + href.substring(href.indexOf('error='))
    } else if (href.includes('access_token=')) {
      search = '?' + href.substring(href.indexOf('access_token='))
    }
    return new URLSearchParams(search)
  }

  const params = getSearchParams()
  const initialError = params.get('error_description')

  // 흐름도 4번을 제어하기 위한 렌더링 상태값
  const [authError, setAuthError] = useState(initialError) 
  const [linkSent, setLinkSent] = useState(false)

  // 흐름도 2: 각종 인증 과정 (토큰, 세션 감지) 및 로그인 뷰 자동 스킵 훅
  useEffect(() => {
    const params = getSearchParams()
    const token_hash = params.get('token_hash')
    const type = params.get('type')
    
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    
    // 흐름도 2-A: 토큰 직접 파싱 및 하이재킹 (HashRouter 에러 방지용 패치)
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ data, error }) => {
        if (!error && data?.session) {
          const unhashedPath = window.location.hash.split('#')[0]
          window.history.replaceState({}, document.title, window.location.pathname + unhashedPath)
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
            const unhashedPath = window.location.hash.includes('?') 
              ? window.location.hash.split('?')[0] 
              : window.location.hash.split('#')[0]
            window.history.replaceState({}, document.title, window.location.pathname + unhashedPath)
            
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
    
    // 도메인 제한: @cku.ac.kr로 입력했는지 확인
    if (!email.endsWith('@cku.ac.kr')) {
      alert('가톨릭관동대학교 이메일(@cku.ac.kr)만 사용할 수 있습니다.')
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
      alert(error.error_description || error.message) 
    } else {
      setLinkSent(true) // 메일 전송 성공 시 => 화면 전환 (View 2)
    }
    setLoading(false)
  }

  // ==========================================
  // 흐름도 4: 조건부 화면 렌더링 로직 (View 결정)
  // ==========================================

  // View 1: 에러 발생 시
  if (authError) {
    return (
      <div style={containerStyle}>
        <h2>인증 실패</h2>
        <p>✗ 인증에 실패했습니다.</p>
        <p>{authError}</p>
        <button
          onClick={() => {
            setAuthError(null)
            const unhashedPath = window.location.hash.includes('?') 
              ? window.location.hash.split('?')[0] 
              : window.location.hash.split('#')[0]
            window.history.replaceState({}, document.title, window.location.pathname + unhashedPath)
          }}
          style={buttonStyle}
        >
          로그인으로 돌아가기
        </button>
      </div>
    )
  }

  // View 2: 매직 링크가 사용자 메일로 무사히 발송되었을 시
  if (linkSent) {
    return (
      <div style={containerStyle}>
        <h2 style={{ fontSize: '48px', margin: '0 0 10px 0' }}>📧</h2>
        <h2 style={{ marginBottom: '15px' }}>메일을 확인해주세요!</h2>
        <p style={{ lineHeight: '1.6', marginBottom: '30px' }}>
          <strong>{email}</strong> 주소로<br />
          로그인 링크가 포함된 메일을 보냈습니다.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '300px' }}>
          <button 
            onClick={() => window.open('https://mail.google.com/a/cku.ac.kr', '_blank')} 
            style={{ ...buttonStyle, backgroundColor: '#28a745' }}
          >
            내 메일함({email}) 열어보기
          </button>
          <button 
            onClick={() => {
              setLinkSent(false)
              setEmail('')
            }} 
            style={{ ...buttonStyle, backgroundColor: '#6c757d' }}
          >
            처음으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // View 3: 이메일 전송조차 하지 않은 가장 최초의 폼 입력 상태
  return (
    <div style={containerStyle}>
      <h2>공강 테트리스 로그인</h2>
      <p>아래에 가톨릭관동대학교 이메일을 입력하여 로그인하세요.</p>
      <form onSubmit={handleLogin} style={formStyle}>
        <input
          type="email"
          placeholder="@cku.ac.kr"
          value={email}
          required={true}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? <span>로그인 중...</span> : <span>로그인</span>}
        </button>
      </form>
      <div style={{ marginTop: '20px' }}>
        <button onClick={() => navigate('/')} style={{ ...buttonStyle, backgroundColor: '#6c757d' }}>
          처음으로
        </button>
      </div>
    </div>
  )
}

// 스타일 모음 (간략화)
const containerStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', height: '100vh', backgroundColor: '#ffffff',
  textAlign: 'center'
}

const formStyle = {
  display: 'flex', flexDirection: 'column', gap: '10px',
  width: '300px', marginTop: '20px'
}

const inputStyle = {
  padding: '10px', fontSize: '16px', borderRadius: '4px',
  border: '1px solid #ccc'
}

const buttonStyle = {
  padding: '10px', fontSize: '16px', cursor: 'pointer',
  backgroundColor: '#007bff', color: 'white', border: 'none',
  borderRadius: '4px'
}
