import React from 'react'
import { useNavigate } from 'react-router-dom'
import backgroundImg from '../images/backGround.png' 
import logoImg from '../images/학교로고.png'

/**
 * =========================================================
 * [Intro.jsx 컴포넌트 흐름도]
 * * 1. 기초 화면 (랜딩 페이지)
 * : 가톨릭관동대학교 졸업 요건 검사 사이트 'FINISH LINE'의 인트로입니다.
 * * 2. 내비게이션 기능 (검사하기 버튼 클릭)
 * └─▶ [검사하기 버튼 클릭 시]
 * navigate('/login') 실행 
 * ➔ 사용자를 로그인 또는 다음 페이지로 안내합니다.
 * =========================================================
 */
const Intro = () => {
  const navigate = useNavigate()

  return (
    <div style={containerStyle}>
      {/* 2층: 사진 위에 덮는 어두운 투명 필터 (글씨가 잘 보이게 함) */}
      <div style={overlayStyle} />

      {/* 3층: 실제 내용 (UI 요소들) */}
      <div style={contentWrapperStyle}>
        
        {/* 상단 영역: 로고 및 방문자 수 */}
        <header style={headerStyle}>
          <div style={logoContainerStyle}>
            {/* ★ 변경된 부분: 불러온 logoImg 변수를 사용합니다. */}
            <img 
              src={logoImg} 
              alt="CKU Logo" 
              style={logoStyle} 
            />
            <div style={logoTextStyle}>CATHOLIC KWANDONG UNIVERSITY</div>
          </div>
        </header>

        {/* 중앙 영역: 메인 타이틀 및 검사하기 버튼 */}
        <main style={mainStyle}>
          <div style={mainTextContainerStyle}>
            <p style={subtitleStyle}>가톨릭관동대학교 수강 신청 도우미</p>
            <h1 style={titleStyle}>공강 테트리스</h1>
            <button onClick={() => navigate('/login')} style={startButtonStyle}>
              시작하기
            </button>
          </div>
        </main>

        {/* 하단 영역: 피드백, 연락처, 저작권 정보 */}
        <footer style={footerStyle}>
          <div style={footerLeftStyle}>
            <div style={contactBoxStyle}>
              <span style={contactBadgeStyle}>CONTACT</span>
            </div>
            <p style={footerLinkStyle}>cku@gmail.com</p>
          </div>
          
          <div style={footerRightStyle}>
            <p>제작: 소프트웨어학과</p>
            <p>© 2026 CKU Software Dev Team All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ==========================================
// CSS-in-JS 스타일 정의 
// ==========================================

// 1층: 전체 화면 및 배경 사진 설정
const containerStyle = {
  position: 'relative',
  width: '100%',
  height: '100vh',

  backgroundImage: `url(${backgroundImg})`, 
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  overflow: 'hidden',
  margin: 0,
  padding: 0,
}

// 2층: 어두운 투명 필터
const overlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  backgroundColor: 'rgba(0, 0, 0, 0.3)', // 30% 투명도의 검은색 필터
  zIndex: 1,
}

// 3층: 내용물들을 담는 전체 박스
const contentWrapperStyle = {
  position: 'relative',
  zIndex: 2, // 필터보다 위에 보이도록 설정
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '40px',
  boxSizing: 'border-box',
  color: 'white',
  fontFamily: '"Noto Sans KR", sans-serif', // 깔끔한 폰트 적용
}

/* 상단 스타일 */
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
}

const logoContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const logoStyle = {
  width: '60px',
  height: '60px',
  borderRadius: '50%', // 로고를 동그랗게
  marginBottom: '8px',
  border: '2px solid white',
  objectFit: 'cover', //
}

const logoTextStyle = {
  fontSize: '0.75rem',
  fontWeight: '500',
  letterSpacing: '1px',
}

/* 중앙 스타일 */
const mainStyle = {
  display: 'flex',
  justifyContent: 'flex-end', // 오른쪽 정렬
  alignItems: 'center',
  flex: 1,
  paddingRight: '5%',
}

const mainTextContainerStyle = {
  textAlign: 'right', // 텍스트 우측 정렬
}

const subtitleStyle = {
  fontSize: '1.2rem',
  fontWeight: '500',
  margin: '0 0 10px 0',
  textShadow: '1px 1px 3px rgba(0,0,0,0.5)', // 글씨가 더 잘 보이게 그림자 추가
}

const titleStyle = {
  fontSize: '5rem',
  fontWeight: '900',
  fontStyle: 'italic',
  margin: '0 0 30px 0',
  letterSpacing: '2px',
  textShadow: '2px 2px 4px rgba(0,0,0,0.6)',
}

const startButtonStyle = {
  padding: '15px 40px',
  fontSize: '1.2rem',
  fontWeight: 'bold',
  color: 'white',
  backgroundColor: 'rgba(255, 255, 255, 0.2)', // 반투명 흰색 배경
  border: '2px solid white',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  backdropFilter: 'blur(5px)', // 배경 블러 효과
}

/* 하단 스타일 */
const footerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  fontSize: '0.85rem',
  lineHeight: '1.6',
}

const footerLeftStyle = {
  textAlign: 'left',
}

const contactBoxStyle = {
  marginBottom: '8px',
}

const contactBadgeStyle = {
  backgroundColor: 'white',
  color: 'black',
  padding: '2px 8px',
  borderRadius: '12px',
  fontSize: '0.7rem',
  fontWeight: 'bold',
}

const footerLinkStyle = {
  margin: '2px 0',
  color: '#cbd5e1',
}

const footerRightStyle = {
  textAlign: 'right',
  color: '#cbd5e1',
  fontSize: '0.75rem',
}

export default Intro