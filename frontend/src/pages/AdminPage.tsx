import { useState } from 'react'
import LoginForm from '../components/LoginForm'
import EventList from '../components/EventList'
import { TOKEN_KEY } from '../api/client'
import LocationsAdmin from '../components/Locationsadmin'
import LayerImport from '../components/LayerImport'
import WeaponsAdmin from '../components/WeaponsAdmin'
import NewsAdmin from '../components/Newsadmin'
import MapImport from '../components/MapImport'

type Tab = 'list' | 'bases' | 'frontlines' | 'import' | 'weapons' | 'news'

// The admin page: shows the login form, or the admin tools once logged in.
export default function AdminPage() {
  // Keep the token after a page refresh
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [tab, setTab] = useState<Tab>('list')
  const [unverified, setUnverified] = useState(0) // events waiting for review: shown on the Events tab

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
          Conflict Map
        </div>

        <nav className="tabs">
          <button className={tab === 'list' ? 'tab active' : 'tab'} onClick={() => setTab('list')}>
            Events
            {unverified > 0 && <span className="tab-count">{unverified}</span>}
          </button>
          <button className={tab === 'bases' ? 'tab active' : 'tab'} onClick={() => setTab('bases')}>
            Bases
          </button>
          <button className={tab === 'frontlines' ? 'tab active' : 'tab'} onClick={() => setTab('frontlines')}>
            Frontlines
          </button>
          <button className={tab === 'import' ? 'tab active' : 'tab'} onClick={() => setTab('import')}>
            Import map
          </button>
          <button className={tab === 'weapons' ? 'tab active' : 'tab'} onClick={() => setTab('weapons')}>
            Weapons
          </button>
          <button className={tab === 'news' ? 'tab active' : 'tab'} onClick={() => setTab('news')}>
            News
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
        {tab === 'list' && <EventList onLoggedOut={handleLogout} onUnverifiedCount={setUnverified} />}
        {tab === 'bases' && <LocationsAdmin onLoggedOut={handleLogout} />}
        {tab === 'frontlines' && <LayerImport onLoggedOut={handleLogout} />}
        {tab === 'import' && <MapImport onLoggedOut={handleLogout} />}
        {tab === 'weapons' && <WeaponsAdmin onLoggedOut={handleLogout} />}
        {tab === 'news' && <NewsAdmin onLoggedOut={handleLogout} />}
      </main>
    </div>
  )
}