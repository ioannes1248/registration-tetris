import React from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * =========================================================
 * [Intro.jsx 컴포넌트 흐름도]
 * 
 * 1. 기초 화면 (랜딩 페이지)
 *    : 사용자가 웹사이트의 제일 앞문(루트 도메인)에 접속하면 무조건 띄워지는 '대문' 역할입니다.
 * 
 * 2. 내비게이션 기능 (로그인 버튼 클릭)
 *    │
 *    └─▶ [로그인 하러 가기 버튼 클릭 시]
 *          navigate('/login') 실행 
 *          ➔ 브라우저 주소를 바꾸어 사용자를 Login.jsx 기반의 로그인 씬으로 안내합니다.
 * 
 * 3. 추가 안내
 *    : 메인 게임이나 서비스를 홍보할 수 있는 설명 구조가 들어갈 수 있는 공간입니다.
 * =========================================================
 */
const Intro = () => {
  const navigate = useNavigate()

  return (
    <div style={containerStyle}>
      {/* 화면 제목 텍스트 */}
      <h1 style={titleStyle}>수강신청 테트리스</h1>
      
      {/* 부가적인 안내 메시지 */}
      <p style={subtitleStyle}>원하는 과목을 빈틈없이 맞춰보세요!</p>

      {/* 이벤트 처리: 버튼 클릭 시 navigate 훅이 URL을 /login 으로 변경 */}
      <div style={buttonContainerStyle}>
        <button onClick={() => navigate('/login')} style={loginButtonStyle}>
          로그인 하러 가기
        </button>
      </div>
    </div>
  )
}

// ==========================================
// CSS-in-JS 스타일 정의
// ==========================================
const containerStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', 
  justifyContent: 'center', height: '100vh', backgroundColor: '#f0f4f8'
}

const titleStyle = {
  fontSize: '3rem', color: '#333', marginBottom: '10px'
}

const subtitleStyle = {
  fontSize: '1.2rem', color: '#666', marginBottom: '40px'
}

const buttonContainerStyle = {
  display: 'flex', gap: '20px'
}

const loginButtonStyle = {
  padding: '12px 24px', fontSize: '1rem', color: 'white', 
  backgroundColor: '#0056b3', border: 'none', borderRadius: '5px', 
  cursor: 'pointer', transition: 'background-color 0.3s'
}

export default Intro
