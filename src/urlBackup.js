// Supabase 모듈이 로드되면서 URL을 지워버리기 전에
// 애플리케이션의 극초기 진입점과 해시 변경 시점마다 순수한 URL을 지속 백업해둡니다.
window.__RAW_URL__ = window.location.href

window.addEventListener('hashchange', (event) => {
  window.__RAW_URL__ = event.newURL
})

// ==============================================================
// 🚑 [신규 버그 픽스] 매직 링크 클릭 시 하얀 화면 & 엉뚱한 페이지 이동 방지
// 1. Supabase가 에러나 토큰을 해시(#)로 보내어 HashRouter를 고장내는 것을 방어합니다.
// 2. 파라미터만 있고 경로가 없을 때 억지로 /login 씬으로 멱살잡고 끌고 옵니다.
// ==============================================================
{
  const currUrl = new URL(window.location.href)

  // A. 해시 속 치명적인 데이터(error, access_token)를 안전한 쿼리 스트링(?)으로 도피시킴
  if (currUrl.hash.includes('error=') || currUrl.hash.includes('access_token=')) {
    const hashParams = currUrl.hash.substring(1) // '#' 기호 탈락
    currUrl.search = currUrl.search ? currUrl.search + '&' + hashParams : '?' + hashParams
  }

  // B. 만약 URL 어딘가에 인증 관련 파라미터가 있다면, 라우터를 반드시 Login 뷰로 틀어버림
  if (
    currUrl.search.includes('token_hash=') || 
    currUrl.search.includes('error=') || 
    currUrl.search.includes('access_token=')
  ) {
    if (!currUrl.hash.startsWith('#/login') && !currUrl.hash.startsWith('#/main')) {
      currUrl.hash = '#/login'
    }
  }

  // 안전하게 조립된 주소로 브라우저 기록을 슬쩍 바꿔치기 (에러가 파싱될 수 있도록 RAW_URL도 갱신)
  const safeStr = currUrl.toString()
  window.history.replaceState(null, '', safeStr)
  window.__RAW_URL__ = safeStr
}
