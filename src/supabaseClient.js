// =============================================================================
// supabaseClient.js — Supabase 백엔드 연결 클라이언트(싱글턴)
//
// Supabase는 PostgreSQL 데이터베이스 + 인증(Auth)을 제공하는 BaaS(Backend as a
// Service)입니다. 이 파일에서 클라이언트를 '딱 한 번' 만들어 export 하면, 앱 전체가
// 같은 인스턴스를 import 해서 DB 조회(.from())와 로그인(.auth)을 수행합니다.
//
// 접속 정보(URL/Key)는 코드에 직접 박지 않고 .env 파일의 환경변수에서 읽어옵니다.
// (Vite에서는 'VITE_' 접두사가 붙은 변수만 import.meta.env로 노출됩니다.)
// 여기서 쓰는 Key는 공개되어도 안전한 'anon(공개) 키'이며, 실제 데이터 접근 권한은
// Supabase의 RLS(Row Level Security) 정책으로 통제합니다.
// =============================================================================
import { createClient } from '@supabase/supabase-js'

// 프로젝트 고유 URL (환경변수 없으면 빈 문자열로 폴백)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
// 공개(anon) 키 — 새 명칭(PUBLISHABLE_DEFAULT_KEY)을 우선 시도하고 구 명칭(ANON_KEY)으로 폴백
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// 앱 전역에서 공유할 Supabase 클라이언트 인스턴스
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
