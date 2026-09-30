import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useTheme } from './hooks/useTheme'
import Navbar from './components/Navbar'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import AuthCallback from './pages/AuthCallback'
import RepositoriesPage from './pages/RepositoriesPage'
import RepoDetailPage from './pages/RepoDetailPage'

function AppContent() {
  // Initialize theme (defaults to light, persists in localStorage)
  useTheme()

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/repositories" element={<RepositoriesPage />} />
        <Route path="/repositories/:owner/:repo" element={<RepoDetailPage />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
