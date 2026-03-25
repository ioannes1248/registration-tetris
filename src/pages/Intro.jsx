import React from 'react'
import { useNavigate } from 'react-router-dom'

const Intro = () => {
  const navigate = useNavigate()

  return (
    <div>
      <h1>수강신청 테트리스 (Registration Tetris)</h1>
      <p>수강신청 테트리스 인트로 페이지에 오신 것을 환영합니다.</p>
      <button onClick={() => navigate('/signup')}>시작하기</button>
      <button onClick={() => navigate('/login')}>로그인</button>
    </div>
  )
}

export default Intro
