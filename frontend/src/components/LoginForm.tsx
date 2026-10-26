import { useState } from 'react'
import { login } from '../api/admin'
import { getErrorMessage } from '../api/client'

interface Props {
  onLogin: (token: string) => void
}

export default function LoginForm({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault() // stop the browser from reloading the page
    setError('')
    setLoading(true)
    try {
      const token = await login(username, password)
      onLogin(token)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="card narrow" onSubmit={handleSubmit}>
      <div className="brand">
        <span className="live-dot" /> Conflict Map
      </div>
      <h2>Admin login</h2>
      <p className="muted">Sign in to add and verify events.</p>

      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button className="btn" type="submit" disabled={loading}>
        {loading ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  )
}