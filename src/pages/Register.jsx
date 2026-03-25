import React from 'react'
import { useNavigate } from 'react-router-dom'

const Register = () => {
  const navigate = useNavigate()

  const handleRegister = (e) => {
    e.preventDefault()
    alert('회원가입이 완료되었습니다.')
    navigate('/login')
  }

  return (
    <div style={containerStyle}>
      <h2>회원가입</h2>
      <form onSubmit={handleRegister} style={formStyle}>
        <input type="text" placeholder="사용자 이름" style={inputStyle} required />
        <input type="email" placeholder="이메일" style={inputStyle} required />
        <input type="password" placeholder="비밀번호" style={inputStyle} required />
        <input type="password" placeholder="비밀번호 확인" style={inputStyle} required />
        <button type="submit">가입하기</button>
      </form>
      <button onClick={() => navigate('/login')} style={backButtonStyle}>뒤로가기</button>
    </div>
  )
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

const backButtonStyle = {
  marginTop: '10px',
  backgroundColor: 'transparent',
  border: 'none',
  textDecoration: 'underline',
  cursor: 'pointer',
  color: '#666'
}

export default Register
