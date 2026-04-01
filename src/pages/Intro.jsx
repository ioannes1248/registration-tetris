import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * =========================================================
 * [Intro.jsx 컴포넌트 흐름도]
 * 
 * 1. 기초 화면 (랜딩 페이지)
 *    : 사용자가 웹사이트의 제일 앞문(루트 도메인)에 접속하면 무조건 띄워지는 '대문' 역할입니다.
 *    : Genesis 디자인 시스템 기반의 히어로 섹션 + 시간표 미리보기를 포함합니다.
 * 
 * 2. 내비게이션 기능 (로그인 버튼 클릭)
 *    │
 *    └─▶ [시작하기 버튼 클릭 시]
 *          navigate('/login') 실행 
 *          ➔ 브라우저 주소를 바꾸어 사용자를 Login.jsx 기반의 로그인 씬으로 안내합니다.
 * =========================================================
 */

// 시간표 미리보기에 사용할 샘플 과목 블록 데이터
const SAMPLE_BLOCKS = [
  { day: 0, start: 0, span: 2, color: '#6366F1', name: '데이터구조' },
  { day: 1, start: 1, span: 2, color: '#8B5CF6', name: '알고리즘' },
  { day: 2, start: 0, span: 1, color: '#06B6D4', name: '웹프로그래밍' },
  { day: 2, start: 2, span: 2, color: '#EC4899', name: '캡스톤' },
  { day: 3, start: 0, span: 2, color: '#6366F1', name: '데이터구조' },
  { day: 4, start: 1, span: 1, color: '#14B8A6', name: '영어회화' },
  { day: 0, start: 3, span: 1, color: '#F59E0B', name: '교양세미나' },
  { day: 4, start: 3, span: 1, color: '#06B6D4', name: '웹프로그래밍' },
]

const DAYS = ['월', '화', '수', '목', '금']
const TIMES = ['09:00', '10:00', '11:00', '12:00']

const Intro = () => {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // 렌더링 후 애니메이션 트리거
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section className="hero">
      {/* 타이틀 영역 */}
      <div className={`${mounted ? 'animate-in' : ''}`} style={{ opacity: mounted ? undefined : 0 }}>
        <h1 className="hero-title">
          <span>공강 테트리스</span>
        </h1>
      </div>

      <p className={`hero-subtitle ${mounted ? 'animate-in delay-2' : ''}`}>
        원하는 공강 시간을 지정하면,<br />
        가능한 시간표 조합을 자동으로 찾아드립니다.
      </p>

      {/* 시간표 미리보기 */}
      <div className={`timetable-preview ${mounted ? 'animate-in delay-3' : ''}`}>
        {/* 헤더 행: 빈 칸 + 요일 */}
        <div className="tt-header" style={{ background: 'var(--color-bg)' }}></div>
        {DAYS.map((day) => (
          <div className="tt-header" key={day}>{day}</div>
        ))}

        {/* 데이터 행 */}
        {TIMES.map((time, rowIdx) => (
          <React.Fragment key={time}>
            <div className="tt-time">{time}</div>
            {DAYS.map((_, colIdx) => {
              const block = SAMPLE_BLOCKS.find(
                (b) => b.day === colIdx && b.start === rowIdx
              )
              // 이 셀이 다른 블록의 span에 의해 가려지는지 확인
              const coveredByBlock = SAMPLE_BLOCKS.find(
                (b) => b.day === colIdx && b.start < rowIdx && b.start + b.span > rowIdx
              )

              if (coveredByBlock) return null // span으로 가려짐

              if (block) {
                return (
                  <div
                    key={`${rowIdx}-${colIdx}`}
                    className="tt-block"
                    style={{
                      backgroundColor: block.color,
                      gridRow: `span ${block.span}`,
                    }}
                  >
                    {block.name}
                  </div>
                )
              }
              return <div key={`${rowIdx}-${colIdx}`} className="tt-cell" />
            })}
          </React.Fragment>
        ))}
      </div>

      {/* CTA 버튼 */}
      <div className={`flex gap-4 ${mounted ? 'animate-in delay-4' : ''}`}>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => navigate('/login')}
        >
          시작하기
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: '2px' }}>
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* 하단 힌트 */}
      <p className={`${mounted ? 'animate-in delay-5' : ''}`} style={{
        marginTop: 'var(--space-16)',
        fontSize: '0.8rem',
        color: 'var(--color-neutral)',
        letterSpacing: '0.02em',
      }}>
        가톨릭관동대학교 재학생 전용 서비스
      </p>
    </section>
  )
}

export default Intro
