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


  // View 1: 인증 실패 (에러 발생) 화면 (디자인 적용)
  // ==========================================
  if (authError) {
    return (
      <div style={containerStyle}>
        {/* 학교 포털 스타일의 점선 박스 */}
        <div style={formStyle}>
          {/* 상단 타이틀 영역 */}
          <div style={{ 
            width: '100%',
            borderBottom: '1px solid #e5e5e5',
            paddingBottom: '10px',
            marginBottom: '10px',
            color: '#d9534f', // 에러를 직관적으로 나타내는 붉은색
            fontSize: '22px',
            fontWeight: 'bold',
            textAlign: 'center' 
          }}>
            인증 오류 안내
          </div>

          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '50px', marginBottom: '20px' }}>⚠️</div>
            
            <h2 style={{ 
              color: '#d9534f', 
              fontSize: '18px', 
              marginBottom: '15px',
              fontWeight: 'bold' 
            }}>
              로그인 링크가 만료되었거나 유효하지 않습니다.
            </h2>

            {/* 에러 메시지 상세 박스 */}
            <div style={{ 
              backgroundColor: '#fef2f2', 
              border: '1px solid #fecaca',
              color: '#ef4444', 
              padding: '15px', 
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '30px',
              wordBreak: 'break-all',
              lineHeight: '1.5'
            }}>
              {/* URL에 섞여 들어온 '+' 기호를 깔끔한 공백으로 변환해 보여줍니다 */}
              상세 사유: {authError.replace(/\+/g, ' ')}
            </div>

            <button
              onClick={() => {
                setAuthError(null)
                // URL 찌꺼기 청소 로직 유지
                const cleanHash = window.location.hash.split('?')[0]
                window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
              }}
              style={{ 
                ...buttonStyle, 
                backgroundColor: '#64748b', // 다시 시도하도록 유도하는 차분한 회색 버튼
                width: '100%'
              }}
            >
              로그인 화면으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

// View 2: 매직 링크 발송 완료 화면 (디자인 적용 버전)
// ==========================================
if (linkSent) {
  return (
    <div style={containerStyle}>
      {/* 학교 포털 스타일의 점선 박스 */}
      <div style={formStyle}>
        {/* 상단 타이틀 영역 */}
        <div style={{ ...headerTitleStyle, textAlign: 'center' }}>
          메일 발송 완료
        </div>

        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '50px', marginBottom: '20px' }}>📧</div>
          
          <h2 style={{ 
            color: '#309b9f', 
            fontSize: '20px', 
            marginBottom: '15px',
            fontWeight: 'bold' 
          }}>
            메일을 확인해주세요!
          </h2>

          <p style={{ 
            fontSize: '14px', 
            lineHeight: '1.8', 
            color: '#555',
            marginBottom: '30px'
          }}>
            <strong style={{ color: '#333', borderBottom: '1px solid #309b9f' }}>
              {email}
            </strong> 주소로<br />
            로그인 링크가 포함된 메일을 보냈습니다.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
              onClick={() => window.open('https://mail.google.com/a/cku.ac.kr', '_blank')} 
              style={buttonStyle} // 우리가 만든 청록색 버튼 스타일 사용
            >
              내 메일함(@cku.ac.kr) 열어보기
            </button>
            
            <button 
              onClick={() => {
                setLinkSent(false)
                setEmail('')
              }} 
              style={{ 
                ...buttonStyle, 
                backgroundColor: '#666666', // '처음으로'는 차분한 회색으로
                fontSize: '13px'
              }}
            >
              처음으로 돌아가기
            </button>
          </div>
        </div>
      </div>

      {/* 하단 안내 문구 (포털 느낌 추가) */}
      <p style={{ marginTop: '20px', fontSize: '12px', color: '#999' }}>
        ※ 메일이 오지 않았다면 스팸 메일함을 확인해 주세요.
      </p>
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

// ==========================================
// 스타일 모음 (가톨릭관동대 공식 포털 스타일)
// ==========================================

const containerStyle = {
  display: 'flex', 
  flexDirection: 'column', 
  alignItems: 'center',      // 가로(좌우) 중앙 정렬
  justifyContent: 'center',  // ★ 추가됨: 세로(위아래) 중앙 정렬!
  minHeight: '100vh',        // 화면 전체 높이 사용
  width: '100%',
  backgroundColor: '#ffffff', 
  color: '#333333',
  fontFamily: '"맑은 고딕", "Malgun Gothic", "Noto Sans KR", sans-serif', 
  padding: '20px',
  boxSizing: 'border-box'
}

const formStyle = {
  display: 'flex', 
  flexDirection: 'column', 
  gap: '15px',
  width: '100%',
  maxWidth: '450px', // 사진처럼 가로로 살짝 넓은 박스
  marginTop: '20px',
  backgroundColor: '#ffffff', 
  padding: '40px',
  // 캡처 화면의 핵심인 '회색 빗금/점선 테두리' 느낌을 살립니다.
  border: '2px dotted #cccccc', 
}

const inputStyle = {
  padding: '10px 15px', 
  fontSize: '14px', 
  border: '1px solid #bfcedb', // 캡처본의 옅은 파란빛 도는 회색 테두리
  backgroundColor: '#eef3f8', // 캡처본의 입력칸 배경색 (연한 하늘색 느낌)
  color: '#333',
  outline: 'none',
  height: '40px',
  boxSizing: 'border-box'
}

const buttonStyle = {
  padding: '12px', 
  fontSize: '15px', 
  fontWeight: 'bold',
  cursor: 'pointer',
  backgroundColor: '#309b9f', // 캡처본의 메인 청록색 버튼 컬러!
  color: '#ffffff', 
  border: 'none',
  marginTop: '10px',
  transition: 'background-color 0.2s',
}

// (선택 사항) 로그인 박스 위에 캡처본처럼 '로그인' 이라는 타이틀을 달아주기 위한 추가 스타일
// 만약 적용하고 싶다면 JSX의 <form> 태그 바로 위에 <div style={headerTitleStyle}>로그인</div> 을 추가하시면 됩니다.
const headerTitleStyle = {
  width: '100%',
  maxWidth: '450px',
  borderBottom: '1px solid #e5e5e5',
  paddingBottom: '10px',
  marginBottom: '10px',
  color: '#309b9f',
  fontSize: '22px',
  fontWeight: 'bold'
}