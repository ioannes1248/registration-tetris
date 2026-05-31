import React from 'react'
import { useNavigate } from 'react-router-dom'
import logoImg from '../images/학교로고.png'
import './Intro.css'

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
    <div className="intro-page">
      {/* 2층: 사진 위에 덮는 어두운 투명 필터 (글씨가 잘 보이게 함) */}
      <div className="intro-overlay" />

      {/* 3층: 실제 내용 (UI 요소들) */}
      <div className="intro-content">
        
        {/* 상단 영역: 로고 및 방문자 수 */}
        <header className="intro-header">
          <div className="intro-logo-block">
            <img 
              src={logoImg} 
              alt="CKU Logo" 
              className="intro-logo-image" 
            />
            <div className="intro-logo-text">CATHOLIC KWANDONG UNIVERSITY</div>
          </div>
        </header>

        {/* 중앙 영역: 메인 타이틀 및 검사하기 버튼 */}
        <main className="intro-main">
          <div className="intro-main-text">
            <p className="intro-subtitle">가톨릭관동대학교 수강 신청 도우미</p>
            <h1 className="intro-title">공강 테트리스</h1>
            <button type="button" onClick={() => navigate('/login')} className="intro-start-button">
              시작하기
            </button>
          </div>
        </main>

        {/* 하단 영역: 피드백, 연락처, 저작권 정보 */}
        <footer className="intro-footer">
          <div className="intro-footer-left">
            <div className="intro-contact-box">
              <span className="intro-contact-badge">CONTACT</span>
            </div>
            <p className="intro-footer-link">cku@gmail.com</p>
          </div>
          
          <div className="intro-footer-right">
            <p className="intro-footer-note">제작: 소프트웨어학과</p>
            <p className="intro-footer-note">© 2026 CKU Software Dev Team All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default Intro
