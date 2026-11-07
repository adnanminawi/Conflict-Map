import { useEffect, useState } from 'react'
import { deleteNews, fetchAdminNews, updateNewsStatus } from '../api/admin'
import { getErrorMessage, isUnauthorized } from '../api/client'
import type { AdminNewsItem, NewsStatus } from '../types'

interface Props {
  onLoggedOut: () => void
}

// The News tab: news from the RSS feeds is published automatically.
// Here the admin hides what shouldn't be on the site.
export default function NewsAdmin({ onLoggedOut }: Props) {
  const [news, setNews] = useState<AdminNewsItem[]>([])
  const [show, setShow] = useState<'published' | 'draft' | 'all'>('published')
  const [lang, setLang] = useState<'en' | 'ar' | 'all'>('all')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null) // stops a double click

  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  async function load() {
    try {
      setNews(await fetchAdminNews())
    } catch (err) {
      handleError(err)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function changeStatus(item: AdminNewsItem, status: NewsStatus) {
    setError('')
    setBusyId(item.id)
    try {
      await updateNewsStatus(item.id, status)
      // Change just this row, no need to load everything again
      setNews((list) => list.map((n) => (n.id === item.id ? { ...n, status } : n)))
    } catch (err) {
      handleError(err)
    } finally {
      setBusyId(null)
    }
  }

  async function remove(item: AdminNewsItem) {
    // Deleted news that is still in the feed is saved again at the next read. Hiding keeps it away.
    if (!window.confirm('Delete this news? If it is still in the feed it will come back within 10 minutes. To keep it off the site, use Hide.')) return
    setError('')
    setBusyId(item.id)
    try {
      await deleteNews(item.id)
      setNews((list) => list.filter((n) => n.id !== item.id))
    } catch (err) {
      handleError(err)
    } finally {
      setBusyId(null)
    }
  }

  const shown = news.filter((n) => (show === 'all' || n.status === show) && (lang === 'all' || n.lang === lang))
  const hiddenCount = news.filter((n) => n.status === 'draft').length

  return (
    <div className="card wide">
      <div className="list-header">
        <h2>News ({shown.length})</h2>
        <div className="list-controls">
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="published">On the site</option>
            <option value="draft">Hidden ({hiddenCount})</option>
            <option value="all">All</option>
          </select>
          <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
            <option value="all">Both languages</option>
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </div>
      </div>
      <p className="muted">New items from the feeds go on the site straight away. Hide anything that isn't news about the conflict.</p>

      {error && <p className="error">{error}</p>}
      {shown.length === 0 && <p className="muted">No news here.</p>}

      <ul className="event-list">
        {shown.map((n) => (
          <li key={n.id} className={n.status === 'draft' ? 'event-item news-hidden' : 'event-item'}>
            <div className="event-info">
              {/* dir="auto": Arabic titles read right to left */}
              <div className="event-title" dir="auto">
                {n.status === 'draft' && <span className="badge false">hidden</span>}
                {n.title}
              </div>
              <div className="event-meta">
                {/* <bdi>: the Arabic source name must not flip the order of the date next to it */}
                <bdi>{n.source_name}</bdi> · {new Date(n.published_at).toLocaleString()}
                {n.url && (
                  <>
                    {' · '}
                    <a href={n.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  </>
                )}
              </div>
            </div>
            <div className="event-actions">
              {n.status === 'published' ? (
                <button className="btn btn-small btn-ghost" disabled={busyId === n.id} onClick={() => changeStatus(n, 'draft')}>
                  Hide
                </button>
              ) : (
                <button className="btn btn-small" disabled={busyId === n.id} onClick={() => changeStatus(n, 'published')}>
                  Show
                </button>
              )}
              <button className="btn btn-small btn-danger" disabled={busyId === n.id} onClick={() => remove(n)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}