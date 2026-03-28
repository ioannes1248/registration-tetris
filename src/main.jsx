// ES Module의 import 우선순위 문제로 인해 가장 먼저 실행될 수 있도록 별도 파일로 분리하여 최상단에 import 합니다.
import './urlBackup.js'

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
