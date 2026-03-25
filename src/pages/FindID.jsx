import React from 'react'
import { useNavigate } from 'react-router-dom'

const FindID = () => {
  const navigate = useNavigate()

  const handleFindID = (e) => {
    e.preventDefault()
    alert('입력하신 이메일로 아이디를 전송했습니다.')
    navigate('/login')
  }

  return (
    <div style={containerStyle}>
      <h2>아이디 찾기</h2>
      <p>가입 시 등록한 이메일을 입력해주세요.</p>
      <form onSubmit={handleFindID} style={formStyle}>
        <input type="email" placeholder="이메일" style={inputStyle} required />
        <button type="submit">아이디 찾기</button>
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

export default FindID
