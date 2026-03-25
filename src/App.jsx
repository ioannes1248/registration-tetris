import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Intro from './pages/Intro'
import Login from './pages/Login'
import Main from './pages/Main'
import Register from './pages/Register'
import FindID from './pages/FindID'
import FindPassword from './pages/FindPassword'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Intro />} />
        <Route path="/login" element={<Login />} />
        <Route path="/main" element={<Main />} />
        <Route path="/register" element={<Register />} />
        <Route path="/find-id" element={<FindID />} />
        <Route path="/find-password" element={<FindPassword />} />
      </Routes>
    </Router>
  )
}

export default App
