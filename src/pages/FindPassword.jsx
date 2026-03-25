import React from 'react'
import { useNavigate } from 'react-router-dom'

const FindPassword = () => {
  const navigate = useNavigate()

  const handleFindPassword = (e) => {
    e.preventDefault()
    alert('입력하신 이메일로 비밀번호 재설정 링크를 전송했습니다.')
    navigate('/login')
  }

  return (
    <div style={containerStyle}>
      <h2>비밀번호 찾기</h2>
      <p>가입 시 등록한 아이디와 이메일을 입력해주세요.</p>
      <form onSubmit={handleFindPassword} style={formStyle}>
        <input type="text" placeholder="사용자 이름(아이디)" style={inputStyle} required />
        <input type="email" placeholder="이메일" style={inputStyle} required />
        <button type="submit">비밀번호 찾기</button>
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

export default FindPassword
