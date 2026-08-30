import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 transition-shadow">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <span className="font-semibold text-sm text-white tracking-tight">RepoChat</span>
        </Link>

        {/* Auth section */}
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400 hidden sm:block">
              {user.name || user.username}
            </span>
            <img
              src={user.avatar_url || ''}
              alt={user.username}
              className="w-7 h-7 rounded-full ring-2 ring-white/10"
            />
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="text-sm font-medium text-white bg-white/10 hover:bg-white/15 px-4 py-1.5 rounded-full border border-white/10 transition-all hover:border-white/20"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}
