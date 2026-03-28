// Supabase 모듈이 로드되면서 URL을 지워버리기 전에
// 애플리케이션의 극초기 진입점과 해시 변경 시점마다 순수한 URL을 지속 백업해둡니다.
window.__RAW_URL__ = window.location.href

window.addEventListener('hashchange', (event) => {
  window.__RAW_URL__ = event.newURL
})
