import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchDepartmentOptions,
  fetchUserDepartmentProfile,
  saveUserDepartmentProfile,
} from '../userDepartmentProfile'
import './AppHeader.css'

const EMPTY_DEPARTMENT_LABEL = '선택해주세요'

const getInitial = (email) => {
  if (!email) return '?'
  return email.charAt(0).toUpperCase()
}

const AppHeader = ({ active, userEmail, onLogout, isGuest = false }) => {
  const navigate = useNavigate()
  const departmentPanelRef = useRef(null)
  const canManageDepartments = Boolean(userEmail) && !isGuest

  const [majorDepartment, setMajorDepartment] = useState('')
  const [minorDepartment, setMinorDepartment] = useState('')
  const [draftMajorDepartment, setDraftMajorDepartment] = useState('')
  const [draftMinorDepartment, setDraftMinorDepartment] = useState('')
  const [departmentOptions, setDepartmentOptions] = useState([])
  const [departmentsLoading, setDepartmentsLoading] = useState(false)
  const [departmentsFetched, setDepartmentsFetched] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [departmentPanelOpen, setDepartmentPanelOpen] = useState(false)
  const [departmentError, setDepartmentError] = useState('')
  const [profileMessage, setProfileMessage] = useState('')

  const selectDepartmentOptions = useMemo(() => {
    const values = new Set([
      ...departmentOptions,
      majorDepartment,
      minorDepartment,
      draftMajorDepartment,
      draftMinorDepartment,
    ].filter(Boolean))

    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ko-KR'))
  }, [departmentOptions, draftMajorDepartment, draftMinorDepartment, majorDepartment, minorDepartment])

  const majorDisplay = profileLoading ? '불러오는 중...' : majorDepartment || EMPTY_DEPARTMENT_LABEL

  useEffect(() => {
    if (!canManageDepartments) {
      setMajorDepartment('')
      setMinorDepartment('')
      setDepartmentPanelOpen(false)
      return
    }

    let ignore = false

    const loadProfile = async () => {
      setProfileLoading(true)
      setDepartmentError('')

      try {
        const profile = await fetchUserDepartmentProfile(userEmail)
        if (ignore) return

        setMajorDepartment(profile.majorDepartment)
        setMinorDepartment(profile.minorDepartment)
      } catch (error) {
        if (!ignore) {
          setDepartmentError(error?.message || '전공 정보를 불러오지 못했습니다.')
        }
      } finally {
        if (!ignore) {
          setProfileLoading(false)
        }
      }
    }

    loadProfile()

    return () => {
      ignore = true
    }
  }, [canManageDepartments, userEmail])

  useEffect(() => {
    if (!canManageDepartments || !departmentPanelOpen || departmentsFetched) return

    let ignore = false

    const loadDepartments = async () => {
      setDepartmentsLoading(true)
      setDepartmentError('')

      try {
        const options = await fetchDepartmentOptions()
        if (ignore) return

        setDepartmentOptions(options)
        setDepartmentsFetched(true)
      } catch (error) {
        if (!ignore) {
          setDepartmentError(error?.message || '전공 목록을 불러오지 못했습니다.')
        }
      } finally {
        if (!ignore) {
          setDepartmentsLoading(false)
        }
      }
    }

    loadDepartments()

    return () => {
      ignore = true
    }
  }, [canManageDepartments, departmentPanelOpen, departmentsFetched])

  useEffect(() => {
    if (!departmentPanelOpen) return

    const handleClickOutside = (event) => {
      if (departmentPanelRef.current && !departmentPanelRef.current.contains(event.target)) {
        setDepartmentPanelOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setDepartmentPanelOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [departmentPanelOpen])

  useEffect(() => {
    if (!departmentPanelOpen) return

    setDraftMajorDepartment(majorDepartment)
    setDraftMinorDepartment(minorDepartment)
    setProfileMessage('')
  }, [departmentPanelOpen, majorDepartment, minorDepartment])

  const toggleDepartmentPanel = () => {
    if (!canManageDepartments) return
    setDepartmentPanelOpen((open) => !open)
  }

  const handleSaveDepartments = async () => {
    const nextMajor = draftMajorDepartment.trim()
    const nextMinor = draftMinorDepartment.trim()

    if (nextMajor && nextMinor && nextMajor === nextMinor) {
      setDepartmentError('전공과 부전공은 서로 다르게 선택해주세요.')
      return
    }

    setProfileSaving(true)
    setDepartmentError('')
    setProfileMessage('')

    const { profile, error } = await saveUserDepartmentProfile({
      majorDepartment: nextMajor,
      minorDepartment: nextMinor,
    })

    if (error) {
      setDepartmentError(error.message || '전공 정보를 저장하지 못했습니다.')
      setProfileSaving(false)
      return
    }

    setMajorDepartment(profile.majorDepartment)
    setMinorDepartment(profile.minorDepartment)
    setProfileMessage('저장했습니다.')
    setProfileSaving(false)
    setDepartmentPanelOpen(false)
  }

  return (
    <nav className="nav app-header">
      <div className="app-header-left">
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
            시간표 설정
          </li>
        </ul>
      </div>

      <div className="flex gap-3 app-header-actions">
        {canManageDepartments && (
          <div className="app-header-departments" ref={departmentPanelRef}>
            <button
              type="button"
              className="app-header-department-button"
              aria-expanded={departmentPanelOpen}
              onClick={toggleDepartmentPanel}
            >
              <span className="app-header-department-label">전공</span>
              <span className="app-header-department-value">{majorDisplay}</span>
            </button>

            {minorDepartment && (
              <button
                type="button"
                className="app-header-department-button app-header-department-button-minor"
                aria-expanded={departmentPanelOpen}
                onClick={toggleDepartmentPanel}
              >
                <span className="app-header-department-label">부전공</span>
                <span className="app-header-department-value">{minorDepartment}</span>
              </button>
            )}

            {departmentPanelOpen && (
              <div className="app-header-department-popover">
                <div className="app-header-department-popover-header">
                  <strong>전공 설정</strong>
                  <button
                    type="button"
                    className="app-header-popover-close"
                    aria-label="전공 설정 닫기"
                    onClick={() => setDepartmentPanelOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <label className="app-header-field">
                  <span>전공</span>
                  <select
                    className="input app-header-select"
                    value={draftMajorDepartment}
                    disabled={departmentsLoading || profileSaving}
                    onChange={(event) => setDraftMajorDepartment(event.target.value)}
                  >
                    <option value="">{departmentsLoading ? '목록을 불러오는 중...' : EMPTY_DEPARTMENT_LABEL}</option>
                    {selectDepartmentOptions.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="app-header-field">
                  <span>부전공</span>
                  <select
                    className="input app-header-select"
                    value={draftMinorDepartment}
                    disabled={departmentsLoading || profileSaving}
                    onChange={(event) => setDraftMinorDepartment(event.target.value)}
                  >
                    <option value="">선택하지 않음</option>
                    {selectDepartmentOptions
                      .filter((department) => department !== draftMajorDepartment)
                      .map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                  </select>
                </label>

                {departmentError && (
                  <p className="app-header-department-message app-header-department-message-error">
                    {departmentError}
                  </p>
                )}
                {profileMessage && (
                  <p className="app-header-department-message app-header-department-message-success">
                    {profileMessage}
                  </p>
                )}

                <div className="app-header-popover-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDepartmentPanelOpen(false)}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={profileSaving || departmentsLoading}
                    onClick={handleSaveDepartments}
                  >
                    {profileSaving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
