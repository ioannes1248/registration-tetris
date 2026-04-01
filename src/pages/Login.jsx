import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

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
            const cleanHash = window.location.hash.split('?')[0]
            window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
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

      {/* 폼 제출 실패 시 나타나는 인라인 에러 메시지 (60초 대기 등) */}
      {loginFormError && (
        <p style={{ color: '#d9534f', marginTop: '15px', fontSize: '14px', fontWeight: 'bold' }}>
          ⚠️ {loginFormError}
        </p>
      )}

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
