import { useState } from 'react'
import LoginForm from '../components/LoginForm'
import EventForm from '../components/EventForm'
import { TOKEN_KEY } from '../api/client'

// The admin page: shows the login form, or the event form once logged in.
export default function AdminPage() {
  // Keep the token after a page refresh
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))

  function handleLogin(newToken: string) {
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  return (
    <div className="admin-page">
      {token && (
        <header className="topbar">
          <div className="brand">
            <span className="live-dot" /> Conflict Map
          </div>
          <div className="topbar-links">
            <a href="/">View map</a>
            <button className="btn btn-ghost" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>
      )}

      <main className="admin-content">
        {token ? <EventForm onLoggedOut={handleLogout} /> : <LoginForm onLogin={handleLogin} />}
      </main>
    </div>
  )
}