import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Sparkles, Mail, Lock, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { user, isLoading, loginDemo, login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [slow, setSlow]       = useState(false)

  if (!isLoading && user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault()
    setError('')
    setSlow(false)
    setLoading(true)
    const slowTimer = setTimeout(() => setSlow(true), 6000)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login gagal, coba lagi')
    } finally {
      clearTimeout(slowTimer)
      setSlow(false)
      setLoading(false)
    }
  }

  const handleDemo = () => { loginDemo(); navigate('/dashboard') }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Sparkles size={22} color="var(--accent)" />
          </div>
          <div>
            <div className="login-title">AgencyOS</div>
            <div className="login-subtitle">AI-Powered Agency Dashboard</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input type="email" className="input" style={{ paddingLeft: 36 }} placeholder="you@agency.com"
                value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input type="password" className="input" style={{ paddingLeft: 36 }} placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

          <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
            {loading ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <ArrowRight size={16} />}
            {loading ? (slow ? 'Menghubungi server…' : 'Signing in...') : 'Sign In'}
          </button>
        </form>

        <div className="divider-or">atau</div>

        <button className="btn btn-demo btn-full btn-lg" onClick={handleDemo} type="button">
          Magic Demo Login
        </button>

        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: 18 }}>
          Demo mode memberikan akses penuh dengan data sample
        </p>
      </div>
    </div>
  )
}
