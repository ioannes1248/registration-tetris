import { supabase } from './supabaseClient.js'

export const COURSE_DEPARTMENTS_TABLE = 'courses_2026_spring'
export const USER_DEPARTMENTS_TABLE = 'user_department_preferences'

const DEPARTMENT_PAGE_SIZE = 1000
const MAJOR_METADATA_KEY = 'major_department'
const MINOR_METADATA_KEY = 'minor_department'

const normalizeDepartment = (value) => {
  if (!value) return ''
  return String(value).trim()
}

const getMetadataProfile = (user) => ({
  majorDepartment: normalizeDepartment(
    user?.user_metadata?.[MAJOR_METADATA_KEY] || user?.user_metadata?.majorDepartment,
  ),
  minorDepartment: normalizeDepartment(
    user?.user_metadata?.[MINOR_METADATA_KEY] || user?.user_metadata?.minorDepartment,
  ),
})

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
  const { data: userData } = await supabase.auth.getUser()
  const metadataProfile = getMetadataProfile(userData?.user)

  if (!email) {
    return metadataProfile
  }

  const { data, error } = await supabase
    .from(USER_DEPARTMENTS_TABLE)
    .select('major_department, minor_department')
    .eq('email', email)
    .maybeSingle()

  if (error || !data) {
    return metadataProfile
  }

  return {
    majorDepartment: normalizeDepartment(data.major_department) || metadataProfile.majorDepartment,
    minorDepartment: normalizeDepartment(data.minor_department) || metadataProfile.minorDepartment,
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

  const metadataPayload = {
    [MAJOR_METADATA_KEY]: profile.majorDepartment || null,
    [MINOR_METADATA_KEY]: profile.minorDepartment || null,
  }

  const { error: tableError } = await supabase
    .from(USER_DEPARTMENTS_TABLE)
    .upsert(dbPayload, { onConflict: 'email' })

  if (tableError) {
    return { error: tableError }
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: metadataPayload,
  })

  return { profile, metadataError }
}
