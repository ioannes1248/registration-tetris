// =============================================================================
// timetableGenerator.js — 시간표 자동 생성 핵심 알고리즘 모듈
//
// 이 파일은 화면(React)과 완전히 분리된 "순수 로직" 모음입니다.
// Supabase에서 내려받은 개설 과목 배열(dbCourses)을 입력받아, 사용자가 설정한
// 조건(필수/선호 과목, 공강 요일, 제외 교시, 학점 범위 등)에 맞는 시간표 조합
// 후보 여러 개를 계산해 돌려주는 일을 담당합니다. (진입 함수: generateTimetableSchedules)
//
// [도메인 핵심 개념 ① — '수업시간코드']
//   과목의 수업 시간은 3자리 숫자 코드로 표현됩니다.
//     · 백의 자리            = 요일 번호 (월=1, 화=2, 수=3, 목=4, 금=5, 토=6, 일=7)
//     · 십의 자리·일의 자리  = 교시 (01 ~ 13교시)
//   예) 305 → 3(수요일) 5교시 ,  112 → 1(월요일) 12교시
//   한 과목이 여러 시간에 열리면 코드가 여러 개(배열/객체/문자열 안에) 들어있을 수
//   있어, 재귀적으로 훑어 모든 3자리 코드를 뽑아냅니다. (collectScheduleCodeTexts 참고)
//
// [도메인 핵심 개념 ② — '학점 = 칸 수']
//   이 앱은 과목의 명시적 학점 컬럼 대신, 시간표에서 차지하는 (요일,교시) 칸의
//   개수를 학점으로 간주합니다. 즉 주당 수업 시간 수 = 학점으로 계산합니다.
//
// [데이터 키가 두 벌인 이유]
//   DB 행은 한글 컬럼('교과목명' 등)으로 올 수도, 영문 snake_case('course_name')로
//   올 수도 있어 아래 접근자(getCourseXxx)들이 두 키를 모두 시도(||)합니다.
// =============================================================================

/**
 * 문자열 정규화 헬퍼: 좌우 공백을 제거하고, 값이 없으면 빈 문자열을 반환합니다.
 * 학과명·과목명 등 텍스트를 비교하기 전에 항상 거쳐 표기 흔들림(앞뒤 공백 등)을 없앱니다.
 */
export const normalizeDepartmentName = (value) => {
  if (!value) return ''
  return String(value).trim()
}

// --- 과목 객체 필드 접근자 모음 ---
// DB 행 구조가 한글/영문 두 가지로 들어올 수 있으므로, 한글 키를 먼저 시도하고
// 없으면 영문 키로 폴백(||)한 뒤 정규화하여 일관된 문자열로 반환합니다.
export const getCourseDepartment = (course) => normalizeDepartmentName(course?.['부서'] || course?.department)
export const getCourseType = (course) => normalizeDepartmentName(course?.['이수구분'] || course?.course_type)
export const getCourseName = (course) => normalizeDepartmentName(course?.['교과목명'] || course?.course_name)
export const getCourseCode = (course) => normalizeDepartmentName(
  course?.['과목코드'] ||
  course?.['교과목코드'] ||
  course?.['학수번호'] ||
  course?.course_code
)
export const getCourseTime = (course) => normalizeDepartmentName(course?.['수업시간'] || course?.class_time)
export const getCoursePlace = (course) => normalizeDepartmentName(course?.['수업장소'] || course?.class_place)
// "수업시간 / 수업장소"를 한 줄로 합쳐 화면 표시용 문자열을 만듭니다.
// 둘 다 있으면 "시간 / 장소", 하나만 있으면 그 값만, 둘 다 없으면 빈 문자열.
export const getCourseTimeAndPlace = (course) => {
  const time = getCourseTime(course)
  const place = getCoursePlace(course)

  if (time && place) return `${time} / ${place}`
  return time || place || ''
}
// 시간표 계산의 원재료가 되는 '수업시간코드'(3자리 숫자 코드)를 꺼냅니다.
// 0이나 빈 값도 의미가 있을 수 있어 || 대신 ??(nullish 병합)로 폴백합니다.
export const getCourseScheduleCode = (course) => course?.['수업시간코드'] ?? course?.time_code ?? course?.class_time_code
export const getCourseProfessor = (course) => normalizeDepartmentName(course?.['교수명'] || course?.professor)

/**
 * collectScheduleCodeTexts: 어떤 형태로 들어오든 그 안에서 '3자리 숫자' 코드만 모두 수집합니다.
 *
 * 수업시간코드는 단일 문자열일 수도, 배열일 수도, 객체일 수도 있어
 * 재귀적으로 끝까지 파고든 뒤, 말단 값에서 정규식 /\d{3}/g 로 연속된 3자리 숫자를 추출합니다.
 * 예) "305,405" → ['305', '405'] ,  ['101','203'] → ['101','203']
 * @param {*} value - 검사할 값(문자열/숫자/배열/객체)
 * @param {string[]} codeTexts - 누적용 배열(재귀 호출 간 공유)
 * @returns {string[]} 추출된 3자리 코드 문자열 배열
 */
const collectScheduleCodeTexts = (value, codeTexts = []) => {
  if (value === null || value === undefined || value === '') return codeTexts

  if (Array.isArray(value)) {
    value.forEach((item) => collectScheduleCodeTexts(item, codeTexts))
    return codeTexts
  }

  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectScheduleCodeTexts(item, codeTexts))
    return codeTexts
  }

  codeTexts.push(...(String(value).match(/\d{3}/g) || []))
  return codeTexts
}

// '사제동행세미나1/2/...' 류 과목인지 판별합니다. (공백 제거 후 정규식 매칭)
// 이 과목들은 시간표 칸은 차지하지만 학점(=칸 수)으로는 세지 않기 위한 예외 처리입니다.
const isAdvisorSeminarCourse = (course) => {
  const courseName = getCourseName(course).replace(/\s/g, '')
  return /사제동행세미나\d+/.test(courseName)
}

/**
 * getCourseCredits: 과목이 차지하는 서로 다른 (요일,교시) 칸의 수를 학점으로 환산합니다.
 *
 * 동작:
 *   1) 사제동행세미나는 0학점으로 예외 처리.
 *   2) 모든 3자리 코드를 요일번호(code/100)와 교시(code%100)로 분해.
 *   3) days/periodCount가 주어지면 유효 범위(존재하는 요일, 1~최대교시) 밖 코드는 무시.
 *   4) Set('요일-교시')으로 중복을 제거한 뒤 그 크기를 반환 → 곧 주당 수업 칸 수 = 학점.
 * @param {object} course - 과목 객체
 * @param {string[]} [days] - 요일 배열(예: ['월','화',...]) — 유효성 검사에 사용
 * @param {number} [periodCount] - 최대 교시 수 — 유효성 검사에 사용
 */
export const getCourseCredits = (course, days, periodCount) => {
  if (isAdvisorSeminarCourse(course)) return 0

  const seen = new Set()

  collectScheduleCodeTexts(getCourseScheduleCode(course)).forEach((codeText) => {
    const code = Number(codeText)
    const dayNumber = Math.floor(code / 100) // 백의 자리 = 요일 번호
    const period = code % 100                // 나머지 두 자리 = 교시

    if (Array.isArray(days) && periodCount) {
      const day = days[dayNumber - 1]
      if (!day || period < 1 || period > periodCount) return // 범위를 벗어난 코드는 제외
    }

    seen.add(`${dayNumber}-${period}`)
  })

  return seen.size
}

// 시간 충돌 비교용 키: '요일명-교시'  (예: '월-3') — 의미 기반 키
export const getScheduleCellKey = ({ day, period }) => `${day}-${period}`

// 화면 그리드 좌표용 키: '행번호-열번호'  (행=교시-1, 열=요일 인덱스)
// Tetris.jsx의 금지 셀(forbiddenCells) 표현과 동일한 좌표 체계를 맞추기 위함입니다.
export const getGridCellKey = ({ day, period }, days) => {
  const colIdx = days.indexOf(day)
  return `${period - 1}-${colIdx}`
}

// 학점이 모자랄 때 빈 자리를 채우는 데 동원할 '보충 과목'의 이수구분 기본 후보.
// (소단위전공·교양필수·교양선택은 비교적 자유롭게 끼워 넣을 수 있는 과목군)
const DEFAULT_SUPPLEMENT_COURSE_TYPES = ['소단위전공', '교양필수', '교양선택']

/**
 * matchesCourseLookupType: 과목의 이수구분이 사용자가 고른 분류와 일치하는지 검사합니다.
 * '교양필수↔교필', '교양선택↔교선'처럼 DB 표기가 약칭일 수 있어 부분 일치까지 허용합니다.
 */
export const matchesCourseLookupType = (course, selectedType) => {
  const courseType = getCourseType(course)
  if (!courseType) return false

  if (selectedType === '교양필수') {
    return courseType.includes('교양필수') || courseType.includes('교필')
  }

  if (selectedType === '교양선택') {
    return courseType.includes('교양선택') || courseType.includes('교선')
  }

  return courseType.includes(selectedType)
}

// 이 과목이 '보충 과목' 후보군에 속하는지(지정된 이수구분 중 하나라도 일치) 여부.
export const isSupplementCourseCandidate = (course, supplementCourseTypes = DEFAULT_SUPPLEMENT_COURSE_TYPES) => (
  supplementCourseTypes.some((type) => matchesCourseLookupType(course, type))
)

/**
 * shuffleArray: 배열을 무작위로 섞은 '새 배열'을 반환합니다. (피셔–예이츠 셔플)
 * 원본을 건드리지 않도록 복사본을 만든 뒤 섞습니다. 시간표를 매번 다양하게 생성하기 위해
 * 후보 과목 풀을 섞는 용도로 쓰입니다.
 */
export const shuffleArray = (items) => {
  const shuffled = [...items]

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = current
  }

  return shuffled
}

/**
 * parseCourseScheduleCodes: 수업시간코드 값을 시간표에서 차지하는 칸 목록으로 변환합니다.
 *
 * 반환 형태: [{ day: '월', period: 3 }, { day: '수', period: 5 }, ...]
 *   - 3자리 코드를 요일/교시로 분해하고, 유효 범위를 벗어나거나 중복된 칸은 버립니다.
 *   - getCourseCredits가 '개수'만 셌다면, 이 함수는 '어느 칸인지' 실제 좌표를 만들어 줍니다.
 * @param {*} codeValue - 수업시간코드(문자열/배열/객체)
 * @param {string[]} days - 요일 배열(예: ['월','화',...]) — 요일번호→요일명 변환에 사용
 * @param {number} periodCount - 최대 교시 수 — 범위 검사에 사용
 */
export const parseCourseScheduleCodes = (codeValue, days, periodCount) => {
  const seen = new Set()
  const scheduleCells = []

  // 값이 배열/객체로 중첩돼 있어도 끝까지 재귀로 훑어 말단의 코드 문자열을 처리합니다.
  const collectCodes = (value) => {
    if (value === null || value === undefined || value === '') return

    if (Array.isArray(value)) {
      value.forEach(collectCodes)
      return
    }

    if (typeof value === 'object') {
      Object.values(value).forEach(collectCodes)
      return
    }

    collectScheduleCodeTexts(value).forEach((codeText) => {
      const code = Number(codeText)
      const dayNumber = Math.floor(code / 100) // 백의 자리 = 요일 번호
      const period = code % 100                // 나머지 = 교시
      const day = days[dayNumber - 1]          // 요일 번호(1~) → 요일명
      const key = `${day}-${period}`

      // 존재하지 않는 요일/교시이거나 이미 추가된 칸이면 건너뜀
      if (!day || period < 1 || period > periodCount || seen.has(key)) return

      seen.add(key)
      scheduleCells.push({ day, period })
    })
  }

  collectCodes(codeValue)
  return scheduleCells
}

// 과목 객체에서 곧장 칸 목록을 얻는 단축 헬퍼 (수업시간코드 추출 + 파싱을 한 번에).
export const getCourseScheduleCells = (course, days, periodCount) => (
  parseCourseScheduleCodes(getCourseScheduleCode(course), days, periodCount)
)

/**
 * createCourseByNameMap: '교과목명 → 과목 객체' 빠른 조회용 Map을 만듭니다.
 *
 * 화면에서는 과목을 '이름'으로 다루므로, 이름으로 원본 과목 데이터를 즉시 찾을 수 있게 색인합니다.
 * 같은 이름이 여러 행으로 들어오면, 시간 정보(수업시간코드)가 있는 행을 우선 채택합니다.
 */
export const createCourseByNameMap = (courses) => {
  const map = new Map()

  courses.forEach((course) => {
    const courseName = getCourseName(course)
    if (!courseName) return

    const existingCourse = map.get(courseName)
    if (!existingCourse || (!getCourseScheduleCode(existingCourse) && getCourseScheduleCode(course))) {
      map.set(courseName, course)
    }
  })

  return map
}

/**
 * createScheduleEntry: 원본 과목 객체를 '시간표 항목(entry)' 형태로 가공합니다.
 *
 * 알고리즘 내부에서 다루기 쉽도록 자주 쓰는 값(이름·코드·이수구분·학점·교수·시간장소·
 * 차지하는 칸 목록)을 미리 계산해 한 객체로 묶어 둡니다.
 * @param {object} course - 원본 과목
 * @param {string} source - 이 과목이 추가된 출처 라벨('필수'/'선호'/'보충'/'후보' 등)
 */
export const createScheduleEntry = (course, source, days, periodCount) => {
  const courseName = getCourseName(course)
  const scheduleCells = getCourseScheduleCells(course, days, periodCount)

  return {
    course,
    courseName,
    courseCode: getCourseCode(course),
    courseType: getCourseType(course),
    credits: getCourseCredits(course, days, periodCount),
    professor: getCourseProfessor(course),
    timeAndPlace: getCourseTimeAndPlace(course),
    scheduleCells,
    source,
  }
}

/**
 * getRequiredCourseConflict: 새로 추가하려는 과목이 '기존 필수 과목들'과 시간이 겹치는지 검사합니다.
 *
 * 겹치면 어떤 과목의 몇 요일 몇 교시에서 충돌하는지 목록으로 알려 주고(화면 경고용),
 * 겹치지 않으면 null을 반환합니다. (Tetris.jsx에서 필수 과목 추가/이동 시 호출)
 * @returns {{courseName: string, conflicts: {courseName: string, timeLabel: string}[]} | null}
 */
export const getRequiredCourseConflict = ({ courseName, requiredCourses, courseByName, days, periodCount }) => {
  const nextCells = getCourseScheduleCells(courseByName.get(courseName), days, periodCount)
  if (nextCells.length === 0) return null

  // 새 과목이 차지하는 칸들을 빠른 조회용 집합으로 만든 뒤, 기존 필수 과목들의 칸과 대조합니다.

  const nextCellKeys = new Set(nextCells.map(getScheduleCellKey))
  const conflicts = []

  requiredCourses.forEach((existingCourseName) => {
    if (existingCourseName === courseName) return

    getCourseScheduleCells(courseByName.get(existingCourseName), days, periodCount).forEach(({ day, period }) => {
      if (nextCellKeys.has(`${day}-${period}`)) {
        conflicts.push({
          courseName: existingCourseName,
          timeLabel: `${day}요일 ${period}교시`,
        })
      }
    })
  })

  if (conflicts.length === 0) return null

  return {
    courseName,
    conflicts,
  }
}

/**
 * getScheduleGapScore: 시간표에 생기는 '수업 사이 빈 교시(공강 구멍)'의 총 개수를 셉니다.
 *
 * 요일별로 수업이 있는 교시들을 모아 정렬한 뒤, 연속한 두 수업 사이의 간격을 더합니다.
 * 예) 어떤 요일에 2·5교시 수업 → 3,4교시가 빔 → 빈칸 2개.
 * 값이 작을수록 수업이 촘촘히 붙은(공강 구멍이 적은) 좋은 시간표로 평가됩니다.
 */
const getScheduleGapScore = (entries) => {
  const periodsByDay = new Map()

  // 1) 요일별로 수업이 있는 교시 번호들을 수집
  entries.forEach((entry) => {
    entry.scheduleCells.forEach(({ day, period }) => {
      const periods = periodsByDay.get(day) || []
      periods.push(period)
      periodsByDay.set(day, periods)
    })
  })

  // 2) 각 요일에서 인접 교시 사이의 빈칸 수를 합산
  let gapCount = 0
  periodsByDay.forEach((periods) => {
    const uniquePeriods = Array.from(new Set(periods)).sort((a, b) => a - b)
    for (let i = 1; i < uniquePeriods.length; i += 1) {
      gapCount += Math.max(0, uniquePeriods[i] - uniquePeriods[i - 1] - 1)
    }
  })

  return gapCount
}

/**
 * scoreCandidateCourse: 한 후보 과목이 현재까지 짜인 시간표에 '얼마나 잘 어울리는지' 점수를 매깁니다.
 *
 * 이 알고리즘은 완전탐색이 아니라, 점수가 높은 과목을 골라 하나씩 채워 나가는 '탐욕적(greedy)'
 * 방식입니다. 점수가 높을수록 우선 선택됩니다. 가중치(weight)는 호출부에서 조절합니다.
 *
 * 점수 구성:
 *   + preferredWeight : 선호 과목이면 큰 가산점(기본 100)
 *   + 12             : 바로 위/아래 교시에 이미 수업이 있어 '딱 붙는' 경우(공강 구멍 방지)
 *   + (8 - 거리)      : 같은 요일의 기존 수업과 가까울수록 가산점(요일별로 뭉치게)
 *   + targetDayWeight : 특정 요일(targetDays)에 몰아넣고 싶을 때 해당 요일 수업에 가산점
 *   - offTargetPenalty: 반대로 목표 요일이 아닌 곳에 잡히면 감점
 *   + 학점(칸 수)     : 학점이 큰 과목을 약간 선호(빈자리를 빨리 채움)
 *   - 늘어난 빈칸×compactWeight : 이 과목을 넣어 공강 구멍이 늘면 그만큼 감점
 */
const scoreCandidateCourse = ({
  course,
  selectedEntries,
  selectedCellKeys,
  preferredCourses,
  days,
  periodCount,
  targetDays = null,
  preferredWeight = 100,
  compactWeight = 18,
  targetDayWeight = 0,
  offTargetPenalty = 0,
}) => {
  const courseName = getCourseName(course)
  const scheduleCells = getCourseScheduleCells(course, days, periodCount)
  // 선호 과목이면 시작 점수부터 크게 줌
  let score = preferredCourses.includes(courseName) ? preferredWeight : 0
  // 이 과목을 넣기 '전/후'의 빈칸 수를 비교하기 위해 가상으로 추가해 봄
  const nextEntry = createScheduleEntry(course, '후보', days, periodCount)
  const currentGapScore = getScheduleGapScore(selectedEntries)
  const nextGapScore = getScheduleGapScore([...selectedEntries, nextEntry])

  scheduleCells.forEach(({ day, period }) => {
    // 같은 요일 바로 인접 교시에 수업이 있으면 '연강'이 되어 가산점
    if (selectedCellKeys.has(`${day}-${period - 1}`) || selectedCellKeys.has(`${day}-${period + 1}`)) {
      score += 12
    }

    // 같은 요일의 기존 수업들과의 최소 거리를 구해, 가까울수록(뭉칠수록) 가산점
    const sameDayPeriods = selectedEntries.flatMap((entry) => (
      entry.scheduleCells
        .filter((cell) => cell.day === day)
        .map((cell) => cell.period)
    ))

    if (sameDayPeriods.length > 0) {
      const closestDistance = Math.min(...sameDayPeriods.map((selectedPeriod) => Math.abs(selectedPeriod - period)))
      score += Math.max(0, 8 - closestDistance)
    }

    // 특정 요일에 수업을 몰아넣는 전략일 때의 가산/감점
    if (targetDays?.has(day)) {
      score += targetDayWeight
    } else {
      score -= offTargetPenalty
    }
  })

  score += getCourseCredits(course, days, periodCount)               // 학점이 클수록 약간 선호
  score -= Math.max(0, nextGapScore - currentGapScore) * compactWeight // 새로 생기는 빈칸은 감점
  return score
}

/**
 * canPlaceCourse: 후보 과목을 지금 시간표에 '넣을 수 있는지' 여부를 모두 검사하는 관문(gate)입니다.
 *
 * 아래 조건 중 하나라도 걸리면 false:
 *   · 이름/수업시간이 없는 과목
 *   · 이미 선택된 과목(같은 이름 중복)
 *   · 추가 시 최대 학점 초과
 *   · 고정 금지 조건 위반(공강 요일/제외 교시/금지 칸)
 *   · targetDaysOnly 모드인데 목표 요일 밖에 수업이 잡히는 경우
 *   · 기존에 선택된 칸과 시간이 겹치는 경우
 * 모두 통과하면 true.
 */
const canPlaceCourse = ({
  course,
  selectedCourseNames,
  selectedCellKeys,
  currentCredits,
  maxCredits,
  days,
  periodCount,
  freeDays,
  excludedPeriods,
  forbiddenCells,
  targetDays = null,
  targetDaysOnly = false,
}) => {
  const courseName = getCourseName(course)
  const scheduleCells = getCourseScheduleCells(course, days, periodCount)
  const credits = getCourseCredits(course, days, periodCount)

  if (!courseName || scheduleCells.length === 0) return false
  if (selectedCourseNames.has(courseName)) return false
  if (currentCredits + credits > maxCredits) return false
  if (targetDaysOnly && targetDays?.size > 0 && scheduleCells.some(({ day }) => !targetDays.has(day))) return false

  // 마지막으로, 차지할 모든 칸이 비어 있어야(시간 충돌이 없어야) 배치 가능
  return scheduleCells.every((cell) => !selectedCellKeys.has(getScheduleCellKey(cell)))
}

/**
 * chooseCourseFromRankedPool: 점수가 높은 상위 몇 개 중에서 '무작위로' 하나를 고릅니다.
 *
 * 항상 1등만 고르면 매번 똑같은 시간표만 나오므로, 점수순 정렬 후 상위 randomTopCount개
 * 안에서 랜덤 선택합니다. → '괜찮은 품질'은 유지하면서 '다양한 후보'를 만들 수 있습니다.
 */
const chooseCourseFromRankedPool = ({
  pool,
  selectedEntries,
  selectedCellKeys,
  preferredCourses,
  days,
  periodCount,
  randomTopCount = 4,
  scoreOptions = {},
}) => {
  // 점수 내림차순 정렬 (b - a)
  const rankedPool = [...pool].sort((a, b) => (
    scoreCandidateCourse({ course: b, selectedEntries, selectedCellKeys, preferredCourses, days, periodCount, ...scoreOptions }) -
    scoreCandidateCourse({ course: a, selectedEntries, selectedCellKeys, preferredCourses, days, periodCount, ...scoreOptions })
  ))
  const topCount = Math.min(randomTopCount, rankedPool.length)

  return rankedPool[Math.floor(Math.random() * topCount)] // 상위 topCount개 중 무작위 1개
}

/**
 * addCourseToSelection: 고른 과목을 현재 선택 상태(3종 자료구조)에 실제로 반영합니다.
 *
 * 세 가지를 동시에 갱신합니다: 항목 목록(selectedEntries), 이름 집합(중복 방지),
 * 차지한 칸 집합(시간 충돌 검사용). 추가된 과목의 학점을 반환해 누적 학점 계산에 씁니다.
 * (주의: 인자로 받은 Set/배열을 직접 변경하는 부수효과 함수입니다.)
 */
const addCourseToSelection = ({ course, source, selectedEntries, selectedCourseNames, selectedCellKeys, days, periodCount }) => {
  const entry = createScheduleEntry(course, source, days, periodCount)

  selectedEntries.push(entry)
  selectedCourseNames.add(entry.courseName)
  entry.scheduleCells.forEach((cell) => selectedCellKeys.add(getScheduleCellKey(cell)))

  return entry.credits
}

// 시간표 항목들의 학점 합계
const getEntriesCreditTotal = (entries) => entries.reduce((sum, entry) => sum + entry.credits, 0)

// 시간표 항목들이 실제로 수업이 있는 '요일 집합'을 구함 (사용 요일 수 평가에 사용)
const getEntriesUsedDays = (entries) => {
  const usedDays = new Set()

  entries.forEach((entry) => {
    entry.scheduleCells.forEach(({ day }) => usedDays.add(day))
  })

  return usedDays
}

/**
 * createScheduleSignature: 시간표의 '지문(서명)' 문자열을 만듭니다.
 *
 * 과목 코드(없으면 이름) + 차지한 칸들을 정렬해 이어 붙여, 과목 순서가 달라도 내용이
 * 같으면 동일한 문자열이 나오게 합니다. → 중복된 시간표 후보를 걸러내는 데 사용합니다.
 */
const createScheduleSignature = (entries) => entries
  .map((entry) => {
    const timeSignature = entry.scheduleCells
      .map(getScheduleCellKey)
      .sort()
      .join(',')
    return `${entry.courseCode || entry.courseName}:${timeSignature}`
  })
  .sort()
  .join('|')

/**
 * createScheduleResult: 화면에 넘겨줄 최종 시간표 결과 객체를 만듭니다.
 * 카드에 표시할 요약 통계(총학점·빈칸 수·선호과목 포함 수·사용 요일 수)를 함께 계산해 둡니다.
 */
const createScheduleResult = ({ id, variant, entries, preferredCourses }) => ({
  id,
  variant,
  entries,
  totalCredits: getEntriesCreditTotal(entries),
  gapCount: getScheduleGapScore(entries),
  preferredCount: entries.filter((entry) => preferredCourses.includes(entry.courseName)).length,
  usedDayCount: getEntriesUsedDays(entries).size,
})

/**
 * getRequiredAnchorDays: 필수 과목이 이미 자리 잡은 '평일 요일'들을 모읍니다.
 *
 * 이 요일들은 어차피 학교에 나와야 하는 날(anchor)이므로, 나머지 수업도 가급적 이 요일들에
 * 몰아넣으면 공강 요일이 늘어납니다. (아래 '요일 몰아넣기' 전략의 목표 요일로 사용)
 * 공강 희망 요일과 주말(토/일)은 제외합니다.
 */
const getRequiredAnchorDays = ({ requiredEntries, freeDays }) => {
  const freeDaySet = new Set(freeDays)
  const excludedDays = new Set(['토', '일'])
  const anchorDays = new Set()

  requiredEntries.forEach((entry) => {
    entry.scheduleCells.forEach(({ day }) => {
      if (freeDaySet.has(day) || excludedDays.has(day)) return
      anchorDays.add(day)
    })
  })

  return anchorDays
}

/**
 * createInitialSelection: 시간표의 '시작 상태'를 만듭니다.
 *
 * 필수 과목들은 무조건 들어가야 하므로 이들로 선택 상태를 미리 채워 두고, 여기에 선호/보충
 * 과목을 점점 얹어 나갑니다. 알고리즘 내부에서 빠르게 다루기 위한 3종 자료구조를 함께 만듭니다.
 *   · selectedEntries    : 선택된 항목 배열
 *   · selectedCourseNames: 선택된 이름 집합(중복 방지)
 *   · selectedCellKeys   : 차지한 칸 집합(시간 충돌 검사)
 */
const createInitialSelection = (requiredEntries) => {
  const selectedEntries = [...requiredEntries]
  const selectedCourseNames = new Set(requiredEntries.map((entry) => entry.courseName))
  const selectedCellKeys = new Set()

  requiredEntries.forEach((entry) => {
    entry.scheduleCells.forEach((cell) => selectedCellKeys.add(getScheduleCellKey(cell)))
  })

  return {
    selectedEntries,
    selectedCourseNames,
    selectedCellKeys,
    totalCredits: getEntriesCreditTotal(requiredEntries),
  }
}

/**
 * buildScheduleCandidate: 시간표 후보 '한 개'를 만들어 냅니다. (탐욕+무작위 채우기 1회 실행)
 *
 * 채우는 순서:
 *   1) 선호 과목 풀에서 점수 높은 것을 골라 최대 학점까지 추가
 *   2) 보충 과목(소단위전공/교양 등) 풀에서 '최소 학점'을 채울 때까지 추가
 *   3) 그래도 최소 학점이 모자라고 fallbackToAnyDay가 켜져 있으면, 목표 요일 제약을 풀고 한 번 더 채움
 * 마지막에 총학점이 [minCredits, maxCredits] 범위를 벗어나면 실패로 보고 null을 반환합니다.
 *
 * 매번 풀을 무작위로 섞고(shuffleArray) 상위권에서 랜덤 선택하므로, 같은 입력이라도 호출할
 * 때마다 다른 시간표가 나옵니다. → 호출부에서 여러 번 돌려 다양한 후보를 모읍니다.
 */
const buildScheduleCandidate = ({
  id,
  variant,
  requiredEntries,
  preferredCandidateCourses,
  supplementCandidateCourses,
  preferredCourses,
  minCredits,
  maxCredits,
  freeDays,
  excludedPeriods,
  forbiddenCells,
  days,
  periodCount,
  targetDays = null,
  targetDaysOnly = false,
  fallbackToAnyDay = false,
  randomTopCount = 4,
  scoreOptions = {},
}) => {
  const selection = createInitialSelection(requiredEntries)

  // 주어진 후보 풀에서, 더 넣을 수 없을 때까지(또는 최소 학점을 채울 때까지) 과목을 한 개씩 추가하는 내부 루프.
  // 반환값: 추가에 쓰고 남은 풀(다음 단계에서 이어서 사용 가능)
  const addFromPool = ({ pool, source, fillUntilMinCredits = false, placeOptions = {} }) => {
    let nextPool = pool

    while (!fillUntilMinCredits || selection.totalCredits < minCredits) {
      // 1) 현재 상태에서 '배치 가능한' 과목만 추림
      const placeableCourses = nextPool.filter((course) => canPlaceCourse({
        course,
        selectedCourseNames: selection.selectedCourseNames,
        selectedCellKeys: selection.selectedCellKeys,
        currentCredits: selection.totalCredits,
        maxCredits,
        days,
        periodCount,
        freeDays,
        excludedPeriods,
        forbiddenCells,
        ...placeOptions,
      }))

      if (placeableCourses.length === 0) break // 더 넣을 게 없으면 종료

      // 2) 점수 상위권 중 무작위로 한 과목 선택
      const nextCourse = chooseCourseFromRankedPool({
        pool: placeableCourses,
        selectedEntries: selection.selectedEntries,
        selectedCellKeys: selection.selectedCellKeys,
        preferredCourses,
        days,
        periodCount,
        randomTopCount,
        scoreOptions,
      })

      // 3) 선택한 과목을 반영하고 학점 누적
      selection.totalCredits += addCourseToSelection({
        course: nextCourse,
        source,
        selectedEntries: selection.selectedEntries,
        selectedCourseNames: selection.selectedCourseNames,
        selectedCellKeys: selection.selectedCellKeys,
        days,
        periodCount,
      })
      // 4) 방금 넣은 과목을 풀에서 제거하고 반복
      nextPool = nextPool.filter((course) => getCourseName(course) !== getCourseName(nextCourse))
    }

    return nextPool
  }

  // 단계 1: 선호 과목을 (가능한 만큼) 채움
  addFromPool({
    pool: shuffleArray(preferredCandidateCourses),
    source: '선호',
    placeOptions: { targetDays, targetDaysOnly },
  })

  // 단계 2: 보충 과목으로 '최소 학점'을 채울 때까지 추가
  const remainingSupplementPool = addFromPool({
    pool: shuffleArray(supplementCandidateCourses),
    source: '보충',
    fillUntilMinCredits: true,
    placeOptions: { targetDays, targetDaysOnly },
  })

  // 단계 3: 여전히 부족하고 '요일 몰아넣기'가 막아 채우지 못했다면, 요일 제약을 풀고 한 번 더 시도
  if (selection.totalCredits < minCredits && fallbackToAnyDay) {
    addFromPool({
      pool: remainingSupplementPool,
      source: '보충',
      fillUntilMinCredits: true,
      placeOptions: { targetDays, targetDaysOnly: false },
    })
  }

  // 학점 범위를 만족하지 못하면 이 후보는 폐기
  if (selection.totalCredits < minCredits || selection.totalCredits > maxCredits) return null

  return createScheduleResult({
    id,
    variant,
    entries: selection.selectedEntries,
    preferredCourses,
  })
}

/**
 * =============================================================================
 * generateTimetableSchedules: 이 모듈의 '진입 함수'. 조건에 맞는 시간표 후보 목록을 만듭니다.
 *
 * 전체 흐름:
 *   1) 입력 검증 — 학점 범위가 뒤집혔는지 확인.
 *   2) 필수 과목을 토대(base)로 고정 — 시간 조건 위반/필수끼리 충돌이면 즉시 실패 메시지 반환.
 *   3) 후보 풀 구성 — 자동 배치에 쓸 '선호 과목 풀'과 '보충 과목 풀'을 미리 거른다.
 *   4) 여러 전략으로 후보를 모은다(중복은 서명으로 제거):
 *        a. 필수 과목만 짠 기본안
 *        b. 선호 과목 위주 + 공강 구멍 최소화(preferred-compact)
 *        c. 필수 요일이 3일 이상이면, 그 요일들에 몰아넣어 공강 요일을 늘리는 안(required-day-packed)
 *        d. 그래도 부족하면 다양성 위주 보충(fallback-diverse)
 *   5) 최대 maxSchedules개까지 모아 결과/안내 메시지와 함께 반환.
 *
 * @returns {{schedules: object[], message: string}}
 * =============================================================================
 */
export const generateTimetableSchedules = ({
  dbCourses,
  courseByName,
  requiredCourses,
  preferredCourses,
  minCredits,
  maxCredits,
  freeDays,
  excludedPeriods,
  forbiddenCells,
  days,
  periodCount,
  maxSchedules = 10, // 만들 후보 시간표 최대 개수
  attempts = 120,    // 한 전략당 무작위 생성 시도 횟수(많을수록 다양/느림)
  supplementCourseTypes = DEFAULT_SUPPLEMENT_COURSE_TYPES,
}) => {
  // 1) 학점 범위 검증
  if (minCredits > maxCredits) {
    return { schedules: [], message: '학점 범위를 다시 확인해주세요.' }
  }

  // 2) 필수 과목으로 '토대(base)' 구성 — 모든 후보가 공통으로 깔고 시작하는 부분
  const requiredEntries = []
  const baseCellKeys = new Set()    // 필수 과목들이 차지한 칸(충돌 검사용)
  const baseCourseNames = new Set() // 필수 과목 이름(후보 풀에서 제외용)
  let baseCredits = 0

  for (const courseName of requiredCourses) {
    const course = courseByName.get(courseName)



    entry.scheduleCells.forEach((cell) => baseCellKeys.add(getScheduleCellKey(cell)))
    baseCourseNames.add(entry.courseName)
    baseCredits += entry.credits
    requiredEntries.push(entry)
  }

  // 필수 과목만으로 짠 기본 시간표(가장 단순한 후보)
  const requiredOnlySchedule = createScheduleResult({
    id: 'schedule-required-only',
    variant: 'required-only',
    entries: requiredEntries,
    preferredCourses,
  })

  if (baseCredits > maxCredits) {
    return { schedules: [requiredOnlySchedule], message: '필수 과목만으로 최대 학점을 초과합니다.' }
  }

  // 3) 자동 배치 후보 풀 구성
  //    - 시간 정보가 있고, 필수 과목과 겹치지 않으며, 고정 금지 조건을 위반하지 않는 과목만 남깁니다.
  const preferredCourseNames = new Set(preferredCourses)
  const createCandidatePool = (predicate) => dbCourses.filter((course) => {
    const scheduleCells = getCourseScheduleCells(course, days, periodCount)

    return (
      predicate(course) &&
      scheduleCells.length > 0
    )
  })

  // 선호 과목 풀: 사용자가 콕 집은 선호 과목들
  const preferredCandidateCourses = createCandidatePool((course) => preferredCourseNames.has(getCourseName(course)))
  // 보충 과목 풀: 학점 채우기용 후보(소단위전공/교양 등, 0학점·선호 과목은 제외)
  const supplementCandidateCourses = createCandidatePool((course) => (
    isSupplementCourseCandidate(course, supplementCourseTypes) &&
    getCourseCredits(course, days, periodCount) > 0 &&
    !preferredCourseNames.has(getCourseName(course))
  ))

  // 4) 결과 누적. 서명(signature)으로 중복 시간표를 거르고 최대 maxSchedules개까지만 담습니다.
  const scheduleSignatures = new Set()
  const schedules = []

  // 후보 하나를 결과 목록에 추가(중복/정원 초과면 무시). 추가 성공 시 true.
  const addSchedule = (schedule) => {
    if (!schedule || schedules.length >= maxSchedules) return false
    const signature = createScheduleSignature(schedule.entries)
    if (scheduleSignatures.has(signature)) return false

    scheduleSignatures.add(signature)
    schedules.push(schedule)
    return true
  }

  /**
   * collectCandidates: 한 가지 '전략'으로 무작위 후보를 여러 번 만든 뒤, 좋은 순으로 정렬해 일부를 추립니다.
   * @param count - 목표 개수(넉넉히 만든 뒤 상위 count*3개만 남김)
   * @param variant - 전략 식별 라벨
   * @param targetDays/targetDaysOnly/fallbackToAnyDay - '요일 몰아넣기' 전략 옵션
   * @param sortCandidates - 후보 정렬 기준(전략마다 우선순위가 다름)
   */
  const collectCandidates = ({ count, variant, targetDays = null, targetDaysOnly = false, fallbackToAnyDay = false, sortCandidates }) => {
    const candidates = []
    const candidateSignatures = new Set()

    // 충분한 후보가 모이거나 시도 횟수를 소진할 때까지 반복 생성
    for (let attempt = 0; attempt < attempts && candidates.length < count * 6; attempt += 1) {
      const candidate = buildScheduleCandidate({
        id: `schedule-${variant}-${attempt}`,
        variant,
        requiredEntries,
        preferredCandidateCourses,
        supplementCandidateCourses,
        preferredCourses,
        minCredits,
        maxCredits,
        freeDays,
        excludedPeriods,
        forbiddenCells,
        days,
        periodCount,
        targetDays,
        targetDaysOnly,
        fallbackToAnyDay,
        // 시도마다 무작위 폭(4~9)을 바꿔 더 다양한 결과를 유도
        randomTopCount: 4 + (attempt % 6),
        // 요일 몰아넣기 전략이면 해당 요일 가산점/벗어남 감점을 강하게, 아니면 빈칸 최소화만
        scoreOptions: targetDays
          ? { targetDays, compactWeight: 22, targetDayWeight: 18, offTargetPenalty: 14 }
          : { compactWeight: 20 },
      })

      if (!candidate) continue // 학점 조건 미달 등으로 실패한 시도는 건너뜀

      const signature = createScheduleSignature(candidate.entries)
      if (candidateSignatures.has(signature)) continue // 이 전략 안에서의 중복 제거

      candidateSignatures.add(signature)
      candidates.push(candidate)
    }

    return candidates
      .sort(sortCandidates)  // 전략별 우선순위로 정렬
      .slice(0, count * 3)   // 상위 일부만 추려 반환
  }

  // 전략 a: 필수 과목만 짠 기본안을 먼저 담기
  addSchedule(requiredOnlySchedule)

  // 전략 b: 선호 과목을 많이 담고 공강 구멍이 적은 안 우선
  const preferredCompactCandidates = collectCandidates({
    count: 6,
    variant: 'preferred-compact',
    sortCandidates: (a, b) => (
      b.preferredCount - a.preferredCount ||
      a.gapCount - b.gapCount ||
      a.usedDayCount - b.usedDayCount ||
      b.totalCredits - a.totalCredits
    ),
  })

  // 선호-촘촘 후보를 우선 7개까지 채움
  preferredCompactCandidates.forEach((candidate) => {
    if (schedules.length < 7) addSchedule(candidate)
  })

  // 전략 c: 필수 과목이 평일 3일 이상에 걸쳐 있으면, 그 요일들에 수업을 몰아넣어 공강 요일을 늘리는 안
  const anchorDays = getRequiredAnchorDays({ requiredEntries, freeDays })
  if (anchorDays.size >= 3) {
    const anchorPackedCandidates = collectCandidates({
      count: 3,
      variant: 'required-day-packed',
      targetDays: anchorDays,
      targetDaysOnly: true,
      fallbackToAnyDay: true,
      sortCandidates: (a, b) => (
        a.usedDayCount - b.usedDayCount ||
        a.gapCount - b.gapCount ||
        b.preferredCount - a.preferredCount ||
        b.totalCredits - a.totalCredits
      ),
    })

    anchorPackedCandidates.forEach((candidate) => {
      if (schedules.length < maxSchedules) addSchedule(candidate)
    })
  }

  // 아직 정원이 안 찼으면, 남은 선호-촘촘 후보로 더 채움
  if (schedules.length < maxSchedules) {
    preferredCompactCandidates.forEach((candidate) => {
      if (schedules.length < maxSchedules) addSchedule(candidate)
    })
  }

  // 전략 d: 그래도 부족하면, 선호/학점/빈칸을 두루 고려한 '다양성 위주' 보충 후보로 마저 채움
  if (schedules.length < maxSchedules) {
    const fallbackCandidates = collectCandidates({
      count: maxSchedules,
      variant: 'fallback-diverse',
      sortCandidates: (a, b) => (
        b.preferredCount - a.preferredCount ||
        b.totalCredits - a.totalCredits ||
        a.gapCount - b.gapCount ||
        a.usedDayCount - b.usedDayCount
      ),
    })

    fallbackCandidates.forEach((candidate) => {
      if (schedules.length < maxSchedules) addSchedule(candidate)
    })
  }

  // 5) 결과와 함께 상황에 맞는 안내 메시지 반환
  //    - 성공: 개수 안내 / 실패: 원인을 구분해 안내(보충 후보 자체가 없었는지 vs 조건이 빡빡했는지)
  return {
    schedules,
    message: schedules.length > 0
      ? `${schedules.length}개의 시간표 조합을 생성했습니다.`
      : supplementCandidateCourses.length === 0
        ? '선호 과목까지 조합했지만 부족 학점을 채울 소단위전공/교양필수/교양선택 후보를 찾지 못했습니다.'
        : '학점 범위와 시간 조건을 모두 만족하는 조합을 찾지 못했습니다.',
  }
}
