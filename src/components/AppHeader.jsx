import React from 'react'
import { useNavigate } from 'react-router-dom'
import './AppHeader.css'

const getInitial = (email) => {
  if (!email) return '?'
  return email.charAt(0).toUpperCase()
}

const AppHeader = ({ active, userEmail, onLogout }) => {
  const navigate = useNavigate()

  return (
    <nav className="nav app-header">
      <div className="nav-brand app-header-brand" onClick={() => navigate('/main')}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="8" height="8" rx="2" fill="var(--color-primary)" opacity="0.9" />
          <rect x="11" y="1" width="8" height="8" rx="2" fill="var(--color-subject-3)" opacity="0.7" />
          <rect x="1" y="11" width="8" height="8" rx="2" fill="var(--color-subject-5)" opacity="0.6" />
          <rect x="11" y="11" width="8" height="8" rx="2" fill="var(--color-subject-2)" opacity="0.8" />
        </svg>
        <span>공강</span>테트리스
      </div>

      <ul className="nav-links app-header-links">
        <li
          className={`nav-link ${active === 'main' ? 'nav-link-active' : ''}`}
          onClick={() => navigate('/main')}
        >
          홈
        </li>
        <li
          className={`nav-link ${active === 'tetris' ? 'nav-link-active' : ''}`}
          onClick={() => navigate('/tetris')}
        >
          시간표 편성
        </li>
      </ul>

      <div className="flex gap-3 app-header-actions">
        <div className="user-badge">
          <div className="user-avatar">{getInitial(userEmail)}</div>
          <span className="app-header-user-email">{userEmail}</span>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </nav>
  )
}

export default AppHeader
