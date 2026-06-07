export const normalizeDepartmentName = (value) => {
  if (!value) return ''
  return String(value).trim()
}

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
export const getCourseTimeAndPlace = (course) => {
  const time = getCourseTime(course)
  const place = getCoursePlace(course)

  if (time && place) return `${time} / ${place}`
  return time || place || ''
}
export const getCourseScheduleCode = (course) => course?.['수업시간코드'] ?? course?.time_code ?? course?.class_time_code
export const getCourseProfessor = (course) => normalizeDepartmentName(course?.['교수명'] || course?.professor)

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

const isAdvisorSeminarCourse = (course) => {
  const courseName = getCourseName(course).replace(/\s/g, '')
  return /사제동행세미나\d+/.test(courseName)
}

export const getCourseCredits = (course, days, periodCount) => {
  if (isAdvisorSeminarCourse(course)) return 0

  const seen = new Set()

  collectScheduleCodeTexts(getCourseScheduleCode(course)).forEach((codeText) => {
    const code = Number(codeText)
    const dayNumber = Math.floor(code / 100)
    const period = code % 100

    if (Array.isArray(days) && periodCount) {
      const day = days[dayNumber - 1]
      if (!day || period < 1 || period > periodCount) return
    }

    seen.add(`${dayNumber}-${period}`)
  })

  return seen.size
}

export const getScheduleCellKey = ({ day, period }) => `${day}-${period}`

export const getGridCellKey = ({ day, period }, days) => {
  const colIdx = days.indexOf(day)
  return `${period - 1}-${colIdx}`
}

const DEFAULT_SUPPLEMENT_COURSE_TYPES = ['소단위전공', '교양필수', '교양선택']

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

export const isSupplementCourseCandidate = (course, supplementCourseTypes = DEFAULT_SUPPLEMENT_COURSE_TYPES) => (
  supplementCourseTypes.some((type) => matchesCourseLookupType(course, type))
)

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

export const parseCourseScheduleCodes = (codeValue, days, periodCount) => {
  const seen = new Set()
  const scheduleCells = []

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
      const dayNumber = Math.floor(code / 100)
      const period = code % 100
      const day = days[dayNumber - 1]
      const key = `${day}-${period}`

      if (!day || period < 1 || period > periodCount || seen.has(key)) return

      seen.add(key)
      scheduleCells.push({ day, period })
    })
  }

  collectCodes(codeValue)
  return scheduleCells
}

export const getCourseScheduleCells = (course, days, periodCount) => (
  parseCourseScheduleCodes(getCourseScheduleCode(course), days, periodCount)
)

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

export const getRequiredCourseConflict = ({ courseName, requiredCourses, courseByName, days, periodCount }) => {
  const nextCells = getCourseScheduleCells(courseByName.get(courseName), days, periodCount)
  if (nextCells.length === 0) return null

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

const violatesFixedTimeFilters = ({ course, days, periodCount, freeDays, excludedPeriods, forbiddenCells }) => {
  const scheduleCells = getCourseScheduleCells(course, days, periodCount)
  if (scheduleCells.length === 0) return true

  return scheduleCells.some(({ day, period }) => (
    freeDays.includes(day) ||
    excludedPeriods.includes(`${period}교시`) ||
    forbiddenCells.has(getGridCellKey({ day, period }, days))
  ))
}

const getScheduleGapScore = (entries) => {
  const periodsByDay = new Map()

  entries.forEach((entry) => {
    entry.scheduleCells.forEach(({ day, period }) => {
      const periods = periodsByDay.get(day) || []
      periods.push(period)
      periodsByDay.set(day, periods)
    })
  })

  let gapCount = 0
  periodsByDay.forEach((periods) => {
    const uniquePeriods = Array.from(new Set(periods)).sort((a, b) => a - b)
    for (let i = 1; i < uniquePeriods.length; i += 1) {
      gapCount += Math.max(0, uniquePeriods[i] - uniquePeriods[i - 1] - 1)
    }
  })

  return gapCount
}

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
  let score = preferredCourses.includes(courseName) ? preferredWeight : 0
  const nextEntry = createScheduleEntry(course, '후보', days, periodCount)
  const currentGapScore = getScheduleGapScore(selectedEntries)
  const nextGapScore = getScheduleGapScore([...selectedEntries, nextEntry])

  scheduleCells.forEach(({ day, period }) => {
    if (selectedCellKeys.has(`${day}-${period - 1}`) || selectedCellKeys.has(`${day}-${period + 1}`)) {
      score += 12
    }

    const sameDayPeriods = selectedEntries.flatMap((entry) => (
      entry.scheduleCells
        .filter((cell) => cell.day === day)
        .map((cell) => cell.period)
    ))

    if (sameDayPeriods.length > 0) {
      const closestDistance = Math.min(...sameDayPeriods.map((selectedPeriod) => Math.abs(selectedPeriod - period)))
      score += Math.max(0, 8 - closestDistance)
    }

    if (targetDays?.has(day)) {
      score += targetDayWeight
    } else {
      score -= offTargetPenalty
    }
  })

  score += getCourseCredits(course, days, periodCount)
  score -= Math.max(0, nextGapScore - currentGapScore) * compactWeight
  return score
}

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
  if (violatesFixedTimeFilters({ course, days, periodCount, freeDays, excludedPeriods, forbiddenCells })) return false
  if (targetDaysOnly && targetDays?.size > 0 && scheduleCells.some(({ day }) => !targetDays.has(day))) return false

  return scheduleCells.every((cell) => !selectedCellKeys.has(getScheduleCellKey(cell)))
}

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
  const rankedPool = [...pool].sort((a, b) => (
    scoreCandidateCourse({ course: b, selectedEntries, selectedCellKeys, preferredCourses, days, periodCount, ...scoreOptions }) -
    scoreCandidateCourse({ course: a, selectedEntries, selectedCellKeys, preferredCourses, days, periodCount, ...scoreOptions })
  ))
  const topCount = Math.min(randomTopCount, rankedPool.length)

  return rankedPool[Math.floor(Math.random() * topCount)]
}

const addCourseToSelection = ({ course, source, selectedEntries, selectedCourseNames, selectedCellKeys, days, periodCount }) => {
  const entry = createScheduleEntry(course, source, days, periodCount)

  selectedEntries.push(entry)
  selectedCourseNames.add(entry.courseName)
  entry.scheduleCells.forEach((cell) => selectedCellKeys.add(getScheduleCellKey(cell)))

  return entry.credits
}

const getEntriesCreditTotal = (entries) => entries.reduce((sum, entry) => sum + entry.credits, 0)

const getEntriesUsedDays = (entries) => {
  const usedDays = new Set()

  entries.forEach((entry) => {
    entry.scheduleCells.forEach(({ day }) => usedDays.add(day))
  })

  return usedDays
}

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

const createScheduleResult = ({ id, variant, entries, preferredCourses }) => ({
  id,
  variant,
  entries,
  totalCredits: getEntriesCreditTotal(entries),
  gapCount: getScheduleGapScore(entries),
  preferredCount: entries.filter((entry) => preferredCourses.includes(entry.courseName)).length,
  usedDayCount: getEntriesUsedDays(entries).size,
})

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

  const addFromPool = ({ pool, source, fillUntilMinCredits = false, placeOptions = {} }) => {
    let nextPool = pool

    while (!fillUntilMinCredits || selection.totalCredits < minCredits) {
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

      if (placeableCourses.length === 0) break

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

      selection.totalCredits += addCourseToSelection({
        course: nextCourse,
        source,
        selectedEntries: selection.selectedEntries,
        selectedCourseNames: selection.selectedCourseNames,
        selectedCellKeys: selection.selectedCellKeys,
        days,
        periodCount,
      })
      nextPool = nextPool.filter((course) => getCourseName(course) !== getCourseName(nextCourse))
    }

    return nextPool
  }

  addFromPool({
    pool: shuffleArray(preferredCandidateCourses),
    source: '선호',
    placeOptions: { targetDays, targetDaysOnly },
  })

  const remainingSupplementPool = addFromPool({
    pool: shuffleArray(supplementCandidateCourses),
    source: '보충',
    fillUntilMinCredits: true,
    placeOptions: { targetDays, targetDaysOnly },
  })

  if (selection.totalCredits < minCredits && fallbackToAnyDay) {
    addFromPool({
      pool: remainingSupplementPool,
      source: '보충',
      fillUntilMinCredits: true,
      placeOptions: { targetDays, targetDaysOnly: false },
    })
  }

  if (selection.totalCredits < minCredits || selection.totalCredits > maxCredits) return null

  return createScheduleResult({
    id,
    variant,
    entries: selection.selectedEntries,
    preferredCourses,
  })
}

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
  maxSchedules = 10,
  attempts = 120,
  supplementCourseTypes = DEFAULT_SUPPLEMENT_COURSE_TYPES,
}) => {
  if (minCredits > maxCredits) {
    return { schedules: [], message: '학점 범위를 다시 확인해주세요.' }
  }

  const requiredEntries = []
  const baseCellKeys = new Set()
  const baseCourseNames = new Set()
  let baseCredits = 0

  for (const courseName of requiredCourses) {
    const course = courseByName.get(courseName)
    if (!course) {
      return { schedules: [], message: `${courseName} 과목 정보를 찾지 못했습니다.` }
    }

    if (violatesFixedTimeFilters({ course, days, periodCount, freeDays, excludedPeriods, forbiddenCells })) {
      return { schedules: [], message: `${courseName} 과목이 선택한 공강/제외 시간 조건과 겹칩니다.` }
    }

    const entry = createScheduleEntry(course, '필수', days, periodCount)
    const hasConflict = entry.scheduleCells.some((cell) => baseCellKeys.has(getScheduleCellKey(cell)))
    if (hasConflict) {
      return { schedules: [], message: '필수 과목끼리 시간이 겹쳐 시간표를 생성할 수 없습니다.' }
    }

    entry.scheduleCells.forEach((cell) => baseCellKeys.add(getScheduleCellKey(cell)))
    baseCourseNames.add(entry.courseName)
    baseCredits += entry.credits
    requiredEntries.push(entry)
  }

  const requiredOnlySchedule = createScheduleResult({
    id: 'schedule-required-only',
    variant: 'required-only',
    entries: requiredEntries,
    preferredCourses,
  })

  if (baseCredits > maxCredits) {
    return { schedules: [requiredOnlySchedule], message: '필수 과목만으로 최대 학점을 초과합니다.' }
  }

  const preferredCourseNames = new Set(preferredCourses)
  const createCandidatePool = (predicate) => dbCourses.filter((course) => {
    const scheduleCells = getCourseScheduleCells(course, days, periodCount)

    return (
      predicate(course) &&
      scheduleCells.length > 0 &&
      !baseCourseNames.has(getCourseName(course)) &&
      !violatesFixedTimeFilters({ course, days, periodCount, freeDays, excludedPeriods, forbiddenCells })
    )
  })

  const preferredCandidateCourses = createCandidatePool((course) => preferredCourseNames.has(getCourseName(course)))
  const supplementCandidateCourses = createCandidatePool((course) => (
    isSupplementCourseCandidate(course, supplementCourseTypes) &&
    getCourseCredits(course, days, periodCount) > 0 &&
    !preferredCourseNames.has(getCourseName(course))
  ))

  const scheduleSignatures = new Set()
  const schedules = []

  const addSchedule = (schedule) => {
    if (!schedule || schedules.length >= maxSchedules) return false
    const signature = createScheduleSignature(schedule.entries)
    if (scheduleSignatures.has(signature)) return false

    scheduleSignatures.add(signature)
    schedules.push(schedule)
    return true
  }

  const collectCandidates = ({ count, variant, targetDays = null, targetDaysOnly = false, fallbackToAnyDay = false, sortCandidates }) => {
    const candidates = []
    const candidateSignatures = new Set()

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
        randomTopCount: 4 + (attempt % 6),
        scoreOptions: targetDays
          ? { targetDays, compactWeight: 22, targetDayWeight: 18, offTargetPenalty: 14 }
          : { compactWeight: 20 },
      })

      if (!candidate) continue

      const signature = createScheduleSignature(candidate.entries)
      if (candidateSignatures.has(signature)) continue

      candidateSignatures.add(signature)
      candidates.push(candidate)
    }

    return candidates
      .sort(sortCandidates)
      .slice(0, count * 3)
  }

  addSchedule(requiredOnlySchedule)

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

  preferredCompactCandidates.forEach((candidate) => {
    if (schedules.length < 7) addSchedule(candidate)
  })

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

  if (schedules.length < maxSchedules) {
    preferredCompactCandidates.forEach((candidate) => {
      if (schedules.length < maxSchedules) addSchedule(candidate)
    })
  }

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

  return {
    schedules,
    message: schedules.length > 0
      ? `${schedules.length}개의 시간표 조합을 생성했습니다.`
      : supplementCandidateCourses.length === 0
        ? '선호 과목까지 조합했지만 부족 학점을 채울 소단위전공/교양필수/교양선택 후보를 찾지 못했습니다.'
        : '학점 범위와 시간 조건을 모두 만족하는 조합을 찾지 못했습니다.',
  }
}
