import { memo, useState, useCallback } from 'react'
import { Lock, User, LogIn, LogOut, Shield, Eye, EyeOff, KeyRound } from 'lucide-react'
import { useLocalStorage } from '../hooks/useLocalStorage'

const Auth = memo(function Auth({ addToast }) {
  const [user, setUser] = useLocalStorage('trading-auth-user', null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState('login')

  const handleLogin = useCallback(() => {
    if (!username || !password) {
      addToast?.('warning', 'Username and password required')
      return
    }
    setUser({ username, role: 'trader', loginAt: Date.now() / 1000 })
    addToast?.('success', `Logged in as ${username}`)
    setUsername('')
    setPassword('')
  }, [username, password, setUser, addToast])

  const handleLogout = useCallback(() => {
    setUser(null)
    addToast?.('info', 'Logged out')
  }, [setUser, addToast])

  if (user) {
    const sessionAge = Math.floor((Date.now() / 1000 - user.loginAt) / 60)
    return (
      <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Shield size={14} className="text-accent-green" />
            <span className="text-sm font-medium">Authentication</span>
          </div>
          <span className="text-[10px] text-accent-green">Authenticated</span>
        </div>

        <div className="p-2 bg-bg-700 border border-bg-600">
          <div className="flex items-center gap-1.5 mb-1">
            <User size={12} className="text-gray-400" />
            <span className="text-[11px] text-gray-300">{user.username}</span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <div className="flex flex-col">
              <span className="text-gray-600">Role</span>
              <span className="text-gray-400 capitalize">{user.role}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-600">Session</span>
              <span className="text-gray-400">{sessionAge}m</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-accent-red/20 text-accent-red hover:bg-accent-red/30 transition-colors"
        >
          <LogOut size={12} />
          Logout
        </button>
      </div>
    )
  }

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Lock size={14} className="text-accent-yellow" />
          <span className="text-sm font-medium">Authentication</span>
        </div>
        <span className="text-[10px] text-gray-600">Not logged in</span>
      </div>

      <div className="flex gap-0.5">
        <button
          onClick={() => setMode('login')}
          className={`flex-1 px-2 py-1 text-[10px] transition-colors ${mode === 'login' ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-700 text-gray-500'}`}
        >
          Login
        </button>
        <button
          onClick={() => setMode('register')}
          className={`flex-1 px-2 py-1 text-[10px] transition-colors ${mode === 'register' ? 'bg-accent-blue/20 text-accent-blue' : 'bg-bg-700 text-gray-500'}`}
        >
          Register
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="relative">
          <User size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-bg-700 border border-bg-600 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue"
          />
        </div>
        <div className="relative">
          <KeyRound size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full pl-7 pr-8 py-1.5 text-[11px] bg-bg-700 border border-bg-600 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-blue"
          />
          <button
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
          >
            {showPassword ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
        </div>
      </div>

      <button
        onClick={handleLogin}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors"
      >
        <LogIn size={12} />
        {mode === 'login' ? 'Login' : 'Register'}
      </button>
    </div>
  )
})

export default Auth
