import { useState } from 'react'
import LoginForm from '../components/LoginForm'
import EventForm from '../components/EventForm'
import EventList from '../components/EventList'
import { TOKEN_KEY } from '../api/client'
import KmlImport from '../components/KmlImport'
import LayerImport from '../components/LayerImport'

type Tab = 'list' | 'add' | 'bases' | 'frontlines'


// The admin page: shows the login form, or the admin tools once logged in.
export default function AdminPage() {
  // Keep the token after a page refresh
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [tab, setTab] = useState<Tab>('list')

  function handleLogin(newToken: string) {
    localStorage.setItem(TOKEN_KEY, newToken)
    setToken(newToken)
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  if (!token) {
    return (
      <div className="admin-page">
        <main className="admin-content">
          <LoginForm onLogin={handleLogin} />
        </main>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <header className="topbar">
        <div className="brand">
          <span className="live-dot" /> Conflict Map
        </div>

        <nav className="tabs">
          <button className={tab === 'list' ? 'tab active' : 'tab'} onClick={() => setTab('list')}>
            Events
          </button>
          <button className={tab === 'add' ? 'tab active' : 'tab'} onClick={() => setTab('add')}>
            Add event
          </button>
          <button className={tab === 'bases' ? 'tab active' : 'tab'} onClick={() => setTab('bases')}>
            Bases
          </button>
          <button className={tab === 'frontlines' ? 'tab active' : 'tab'} onClick={() => setTab('frontlines')}>
            Frontlines
          </button>
        </nav>

        <div className="topbar-links">
          <a href="/">View map</a>
          <button className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="admin-content">
        {tab === 'list' && <EventList onLoggedOut={handleLogout} />}
        {tab === 'add' && <EventForm onLoggedOut={handleLogout} />}
        {tab === 'bases' && <KmlImport onLoggedOut={handleLogout} />}
        {tab === 'frontlines' && <LayerImport onLoggedOut={handleLogout} />}
      </main>
    </div>
  )
}