import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import Intro from './pages/Intro'
import Login from './pages/Login'
import Main from './pages/Main'

/**
 * =========================================================
 * [App.jsx 라우팅 구조 흐름도]
 * 
 * 브라우저 주소창의 변경을 실시간 감지하여 알맞은 페이지(컴포넌트)를 꺼내 그려주는 '신호등(라우터)'입니다.
 * 추후 GitHub Pages 같은 정적 서버 무료 배포 시 404 에러를 쉽게 회피하기 위해 HashRouter(#)를 사용합니다.
 * 
 * [접속 URL 체계와 페이지 연결망]
 *    ├─ https://도메인/#/        ➔ {<Intro />} 대문 랜딩 페이지
 *    ├─ https://도메인/#/login   ➔ {<Login />} 로그인 처리 페이지
 *    └─ https://도메인/#/main    ➔ {<Main />}  인증 회원 전용 페이지
 * =========================================================
 */
function App() {
  return (
    // URL에 # 기호를 사용하여 클라이언트 내부에서만 안전하게 페이지를 전환하도록 해주는 Router
    <Router>
      <Routes>
        {/* 주소 규칙(path)에 따라 각각 알맞은 페이지 컴포넌트(element)를 연결해 줍니다. */}
        <Route path="/" element={<Intro />} />
        <Route path="/login" element={<Login />} />
        <Route path="/main" element={<Main />} />
      </Routes>
    </Router>
  )
}

export default App
