import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/Navbar'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import AuthCallback from './pages/AuthCallback'
import RepositoriesPage from './pages/RepositoriesPage'
import RepoDetailPage from './pages/RepoDetailPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/repositories" element={<RepositoriesPage />} />
          <Route path="/repositories/:owner/:repo" element={<RepoDetailPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
