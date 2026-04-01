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

  const fullHash = currUrl.hash;
  
  if (fullHash.includes('error=') || fullHash.includes('access_token=')) {
    // 1. 모든 URL에서 구분자(?, #, &)를 기준으로 쪼개서 key=value 형태를 찾습니다.
    const parts = fullHash.split(/[?#&]/);
    const searchParams = new URLSearchParams(currUrl.search);
    
    let isModified = false;
    for (const part of parts) {
      if (part.includes('=')) {
        const [key, ...values] = part.split('=');
        const value = values.join('=');
        const targetKeys = [
          'access_token', 'refresh_token', 'expires_in', 
          'token_type', 'type', 'error', 'error_description', 'error_code'
        ];
        if (targetKeys.includes(key)) {
          searchParams.set(key, value);
          isModified = true;
        }
      }
    }

    if (isModified) {
      // 2. 파싱한 토큰들을 안전한 쿼리 스트링(?)으로 이동시킵니다.
      currUrl.search = searchParams.toString();
      
      // 3. HashRouter가 인식할 수 있도록 해시 부분에서 토큰 찌꺼기들을 분리하여 깨끗한 경로만 남깁니다.
      let cleanRoute = '';
      const routeMatch = fullHash.match(/^#(\/[^?#&]*)/);
      if (routeMatch) {
        cleanRoute = routeMatch[0]; // "#/login" 등
      }
      
      if (!cleanRoute || (!cleanRoute.startsWith('#/login') && !cleanRoute.startsWith('#/main'))) {
        cleanRoute = '#/login';
      }
      
      currUrl.hash = cleanRoute;
      
      // 안전하게 조립된 주소로 브라우저 기록을 슬쩍 바꿔치기
      const safeStr = currUrl.toString()
      window.history.replaceState(null, '', safeStr)
      window.__RAW_URL__ = safeStr
    }
  } else {
    // 만약 URL 어딘가에 인증 관련 파라미터가 있다면, 라우터를 반드시 Login 뷰로 틀어버림
    if (
      currUrl.search.includes('token_hash=') || 
      currUrl.search.includes('error=') || 
      currUrl.search.includes('access_token=')
    ) {
      if (!currUrl.hash.startsWith('#/login') && !currUrl.hash.startsWith('#/main')) {
        currUrl.hash = '#/login'
      }
    }
  }
}
