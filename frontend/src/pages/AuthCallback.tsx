import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * This page handles the OAuth callback.
 *
 * The backend already set the HttpOnly cookies and redirected here.
 * We just need to re-fetch the current user so the AuthContext updates,
 * then redirect to /repositories.
 */
export default function AuthCallback() {
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    refreshUser().then(() => {
      navigate('/repositories', { replace: true })
    })
  }, [refreshUser, navigate])

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4">
      <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      <p className="text-sm text-slate-400 animate-pulse">Signing you in…</p>
    </div>
  )
}
