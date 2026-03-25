import React from 'react'
import { useNavigate } from 'react-router-dom'

const Login = () => {
  const navigate = useNavigate()

  const handleLogin = (e) => {
    e.preventDefault()
    navigate('/main')
  }

  return (
    <div style={containerStyle}>
      <h2>로그인</h2>
      <form onSubmit={handleLogin} style={formStyle}>
        <input type="text" placeholder="사용자 이름" style={inputStyle} />
        <input type="password" placeholder="비밀번호" style={inputStyle} />
        <button type="submit">로그인</button>
      </form>
      <div style={linkContainerStyle}>
        <span onClick={() => navigate('/register')} style={linkStyle}>회원가입</span>
        <span onClick={() => navigate('/find-id')} style={linkStyle}>아이디 찾기</span>
        <span onClick={() => navigate('/find-password')} style={linkStyle}>비밀번호 찾기</span>
      </div>
    </div>
  )
}

const linkContainerStyle = {
  display: 'flex',
  gap: '15px',
  marginTop: '20px',
  fontSize: '14px'
}

const linkStyle = {
  cursor: 'pointer',
  textDecoration: 'underline',
  color: '#007bff'
}

const containerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  backgroundColor: '#ffffff'
}

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '300px'
}

const inputStyle = {
  padding: '10px',
  fontSize: '16px'
}

export default Login
