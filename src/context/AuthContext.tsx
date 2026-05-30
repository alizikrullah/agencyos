import React, { createContext, useContext, useEffect, useState } from 'react'
import { sql } from '../lib/neon'

type AppUser = {
  id: string
  email: string
  role: 'editor' | 'finance'
  agency_id: string
}

interface AuthContextType {
  user: AppUser | null
  isDemo: boolean
  isLoading: boolean
  loginDemo: () => void
  exitDemo: () => void
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const SESSION_KEY = 'agencyos_session'
const DEMO_KEY = 'agencyos_demo'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const isDemo = localStorage.getItem(DEMO_KEY) === 'true'
    if (isDemo) {
      setIsDemo(true)
      setUser({ id: 'demo-123', email: 'demo@agencyos.com', role: 'finance', agency_id: 'demo' })
      setIsLoading(false)
      return
    }
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      try { setUser(JSON.parse(raw) as AppUser) } catch { localStorage.removeItem(SESSION_KEY) }
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const hash = await hashPassword(password)
    const rows = await sql`
      SELECT id, email, role, agency_id::text FROM users
      WHERE email = ${email} AND password_hash = ${hash}
      LIMIT 1`
    if (rows.length === 0) throw new Error('Email atau password salah.')
    const u = rows[0] as AppUser
    setUser(u)
    localStorage.setItem(SESSION_KEY, JSON.stringify(u))
  }

  const loginDemo = () => {
    const demo: AppUser = { id: 'demo-123', email: 'demo@agencyos.com', role: 'finance', agency_id: 'demo' }
    setIsDemo(true)
    setUser(demo)
    localStorage.setItem(DEMO_KEY, 'true')
  }

  const exitDemo = () => {
    setIsDemo(false)
    setUser(null)
    localStorage.removeItem(DEMO_KEY)
  }

  const logout = () => {
    setUser(null)
    setIsDemo(false)
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(DEMO_KEY)
  }

  return (
    <AuthContext.Provider value={{ user, isDemo, isLoading, loginDemo, exitDemo, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider')
  return context
}
