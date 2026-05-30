import { supabase } from './supabaseClient.js'

export const COURSE_DEPARTMENTS_TABLE = 'courses_2026_spring'
export const USER_DEPARTMENTS_TABLE = 'user_department_preferences'

const DEPARTMENT_PAGE_SIZE = 1000

const EMPTY_PROFILE = { majorDepartment: '', minorDepartment: '' }

const normalizeDepartment = (value) => {
  if (!value) return ''
  return String(value).trim()
}

export const fetchDepartmentOptions = async () => {
  const departments = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(COURSE_DEPARTMENTS_TABLE)
      .select('department')
      .not('department', 'is', null)
      .order('department', { ascending: true })
      .range(from, from + DEPARTMENT_PAGE_SIZE - 1)

    if (error) {
      throw error
    }

    departments.push(...(data || []).map((row) => normalizeDepartment(row.department)).filter(Boolean))

    if (!data || data.length < DEPARTMENT_PAGE_SIZE) {
      break
    }

    from += DEPARTMENT_PAGE_SIZE
  }

  return Array.from(new Set(departments)).sort((a, b) => a.localeCompare(b, 'ko-KR'))
}

export const fetchUserDepartmentProfile = async (email) => {
  if (!email) {
    return { ...EMPTY_PROFILE }
  }

  const { data, error } = await supabase
    .from(USER_DEPARTMENTS_TABLE)
    .select('major_department, minor_department')
    .eq('email', email)
    .maybeSingle()

  if (error || !data) {
    return { ...EMPTY_PROFILE }
  }

  return {
    majorDepartment: normalizeDepartment(data.major_department),
    minorDepartment: normalizeDepartment(data.minor_department),
  }
}

export const saveUserDepartmentProfile = async ({ majorDepartment, minorDepartment }) => {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const user = userData?.user

  if (userError || !user?.email) {
    return {
      error: userError || new Error('로그인된 사용자 정보를 확인할 수 없습니다.'),
    }
  }

  const profile = {
    majorDepartment: normalizeDepartment(majorDepartment),
    minorDepartment: normalizeDepartment(minorDepartment),
  }

  const dbPayload = {
    email: user.email,
    major_department: profile.majorDepartment || null,
    minor_department: profile.minorDepartment || null,
  }

  const { error: tableError } = await supabase
    .from(USER_DEPARTMENTS_TABLE)
    .upsert(dbPayload, { onConflict: 'email' })

  if (tableError) {
    return { error: tableError }
  }

  return { profile }
}
