import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/hooks/useTheme'
import { Logo } from '@/components/ui/logo'
import {
  Moon,
  Sun,
  LogOut,
  Layers,
  ChevronRight,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const isActive = (path: string) => location.pathname === path

  return (
    <header className="fixed top-0 inset-x-0 z-50 h-14 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-full flex items-center justify-between gap-4">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group shrink-0">
          <Logo className="w-7 h-7 text-primary transition-transform duration-300 group-hover:scale-110" />
          <span className="font-bold text-sm text-foreground tracking-tight">
            RepoChat
          </span>
        </Link>

        {/* Nav links (when logged in) */}
        {user && (
          <nav className="hidden sm:flex items-center gap-1">
            <Link
              to="/repositories"
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive('/repositories')
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Repositories
            </Link>
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            className="w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>

          {/* Auth section */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-muted transition-colors cursor-pointer group outline-none">
                <Avatar className="w-7 h-7 border border-border">
                  <AvatarImage src={user.avatar_url ?? ''} alt={user.username} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                    {(user.name || user.username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">
                  {user.name || user.username}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground rotate-90 group-hover:text-foreground transition-colors" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 mt-1">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-xs font-medium text-foreground truncate">{user.name || user.username}</p>
                  {user.email && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                  )}
                </div>
                <DropdownMenuItem
                  onClick={() => navigate('/repositories')}
                  className="gap-2 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Repositories
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-1.5 rounded-lg transition-all shadow-sm hover:shadow-md"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
