import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

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
 *    ├──▶ (로딩 중) ➔ "로딩 중..." 텍스트 노출
 *    │
 *    └──▶ (로딩 완료) ➔ 대시보드 화면 노출 (내 계정 정보 + 로그아웃 버튼)
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
    // 🔥 [버그 원천 차단] Main 진입 완료 시, 주소창에 숨어있는 이전 로그인 파라미터(?token=... 등)를 브라우저에서 완전히 삭제합니다.
    // 이 처리를 통해 메인에서 놀다가 '로그아웃' 버튼을 눌렀을 때 찌꺼기 파라미터가 Login 페이지로 딸려가는 불상사를 막습니다.
    if (window.location.search || window.location.hash.includes('?')) {
      const cleanHash = window.location.hash.split('?')[0]
      window.history.replaceState({}, document.title, window.location.pathname + cleanHash)
    }

    // 흐름도 2-A: 컴포넌트 마운트 시 최초 1회 세션(로그인 상태) 확인
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        setUserEmail(session.user.email) // 세션이 있으면 이메일을 화면 변수에 저장 (렌더링 준비)
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
        navigate('/', { replace: true })
      } else if (session?.user) {
        setUserEmail(session.user.email)
      }
    })

    // 컴포넌트가 꺼질 때(페이지 이동 시) 감시자도 같이 종료 (메모리 누수 방지용)
    return () => {
      subscription.unsubscribe()
    }
  }, [navigate])

  // 로그아웃을 실행하는 함수
  const handleLogout = async () => {
    await supabase.auth.signOut() 
    // 👉 여기서 signOut()을 부르면 흐름도 2-B의 감시자가 "로그아웃 감지!" 하고 알아서 안내인 역할을 해줍니다.
  }

  // 흐름도 3-A: 정보를 검사하는 동안 잠깐 (보통 0.1초 내외) 보여줄 화면
  if (loading) {
    return (
      <div>
        <h2>로딩 중...</h2>
      </div>
    )
  }

  // 흐름도 3-B: 인증 시스템을 통과한 유저에게만 보여줄 '진짜' 메인 화면
  return (
    <div>
      <h2>메인 대시보드</h2>
      <p>수강신청 테트리스 메인 로비입니다.</p>
      
      <div>
        {/* State에 담아뒀던 계정 정보(이메일)를 꺼내서 화면에 보여줍니다 */}
        <p>현재 접속 계정: {userEmail}</p>
        <button onClick={handleLogout}>로그아웃</button>
      </div>
    </div>
  )
}

export default Main
