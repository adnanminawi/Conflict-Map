import { useEffect, useState } from 'react'
import { deleteNews, fetchAdminNews, updateNewsStatus } from '../api/admin'
import { fetchCountries } from '../api/countries'
import { getErrorMessage, isUnauthorized } from '../api/client'
import type { AdminNewsItem, NewsStatus } from '../types'

interface Props {
  onLoggedOut: () => void
}

const PAGE_SIZE = 50 // rows per page
const ADMIN_LIMIT = 1000 // the backend sends at most this many (newest first)
const NO_COUNTRY = '-' // the "No country" choice: items the tagging found no country in

type Show = NewsStatus | 'all'
const SHOW_TABS: { value: Show; label: string }[] = [
  { value: 'published', label: 'On the site' },
  { value: 'draft', label: 'Hidden' },
  { value: 'all', label: 'All' },
]

// The News tab: news from the RSS feeds is published automatically.
// Here the admin hides what shouldn't be on the site: one by one, or tick many and hide them at once.
export default function NewsAdmin({ onLoggedOut }: Props) {
  const [news, setNews] = useState<AdminNewsItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [countryNames, setCountryNames] = useState<Record<string, string>>({}) // 'YE' → 'Yemen'

  // Filters
  const [show, setShow] = useState<Show>('published')
  const [country, setCountry] = useState('') // '' = every country, NO_COUNTRY = items with none
  const [lang, setLang] = useState<'en' | 'ar' | ''>('') // '' = both
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const [selected, setSelected] = useState<Set<number>>(new Set()) // ticked rows
  const [busy, setBusy] = useState(false) // a change is being saved: buttons wait
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  useEffect(() => {
    fetchAdminNews()
      .then((list) => {
        setNews(list)
        setLoaded(true)
      })
      .catch(handleError)
    fetchCountries()
      .then((list) => setCountryNames(Object.fromEntries(list.map((c) => [c.code, c.name_en]))))
      .catch(() => {}) // without names we just show the codes
  }, [])

  // A new filter starts on page 1 with nothing ticked, so you never change rows you can't see
  useEffect(() => {
    setPage(0)
    setSelected(new Set())
    setMessage('')
  }, [show, country, lang, source, search])

  const nameOf = (code: string) => countryNames[code] ?? code

  // ---------- Changing news ----------

  // Hide ('draft') or show ('published'): one request per item. Stops at the first error.
  async function setStatusOf(ids: number[], status: NewsStatus) {
    setError('')
    setMessage('')
    setBusy(true)
    let done = 0
    try {
      for (const id of ids) {
        await updateNewsStatus(id, status)
        done++
      }
    } catch (err) {
      handleError(err)
    } finally {
      const changed = new Set(ids.slice(0, done))
      setNews((list) => list.map((n) => (changed.has(n.id) ? { ...n, status } : n)))
      setSelected(new Set())
      if (ids.length > 1 && done > 0) setMessage(`${done} ${done === 1 ? 'item' : 'items'} ${status === 'draft' ? 'hidden' : 'shown'}.`)
      setBusy(false)
    }
  }

  async function remove(ids: number[]) {
    // Deleted news that is still in the feed is saved again at the next read. Hiding keeps it away.
    const label = ids.length === 1 ? 'this item' : `${ids.length} items`
    if (!window.confirm(`Delete ${label}? If it's still in the feed it comes back within 10 minutes. To keep it off the site, use Hide.`)) return
    setError('')
    setMessage('')
    setBusy(true)
    let done = 0
    try {
      for (const id of ids) {
        await deleteNews(id)
        done++
      }
    } catch (err) {
      handleError(err)
    } finally {
      const gone = new Set(ids.slice(0, done))
      setNews((list) => list.filter((n) => !gone.has(n.id)))
      setSelected(new Set())
      if (ids.length > 1 && done > 0) setMessage(`${done} ${done === 1 ? 'item' : 'items'} deleted.`)
      setBusy(false)
    }
  }

  function toggleRow(id: number) {
    setSelected((old) => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---------- Filtering ----------

  const term = search.trim().toLowerCase()
  const shown = news.filter(
    (n) =>
      (show === 'all' || n.status === show) &&
      (country === '' || (country === NO_COUNTRY ? n.country_codes.length === 0 : n.country_codes.includes(country))) &&
      (lang === '' || n.lang === lang) &&
      (source === '' || n.source_name === source) &&
      (term === '' || n.title.toLowerCase().includes(term)),
  )

  // The choices in the dropdowns come from the news itself
  const countries = [...new Set(news.flatMap((n) => n.country_codes))].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const sources = [...new Set(news.map((n) => n.source_name))].sort()
  const countOf = (s: Show) => (s === 'all' ? news.length : news.filter((n) => n.status === s).length)

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1) // after deleting, the last page may be gone
  const rows = shown.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const allTicked = rows.length > 0 && rows.every((n) => selected.has(n.id))
  const filtered = country !== '' || lang !== '' || source !== '' || term !== ''

  // What the ticked rows are: only show the bulk buttons that change something
  const tickedItems = news.filter((n) => selected.has(n.id))
  const anyPublished = tickedItems.some((n) => n.status === 'published')
  const anyHidden = tickedItems.some((n) => n.status === 'draft')

  return (
    <div className="card wide">
      <div className="list-header">
        <h2>News</h2>
      </div>
      <p className="hint">New items from the feeds go on the site straight away. Hide anything that isn't news about the conflict.</p>

      <div className="status-tabs" role="tablist" aria-label="Status">
        {SHOW_TABS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={show === s.value}
            className={show === s.value ? 'status-tab active' : 'status-tab'}
            onClick={() => setShow(s.value)}
          >
            {s.label} <span className="status-count">{countOf(s.value)}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {nameOf(c)}
            </option>
          ))}
          <option value={NO_COUNTRY}>No country found</option>
        </select>
        <select value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} aria-label="Language">
          <option value="">Both languages</option>
          <option value="en">English</option>
          <option value="ar">Arabic</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles" />
        {filtered && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => {
              setCountry('')
              setLang('')
              setSource('')
              setSearch('')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      {/* Ticked rows: change them all at once */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} selected</span>
          <div className="bulk-actions">
            <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => setSelected(new Set())}>
              Clear
            </button>
            {anyPublished && (
              <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => setStatusOf([...selected], 'draft')}>
                Hide
              </button>
            )}
            {anyHidden && (
              <button className="btn btn-small" disabled={busy} onClick={() => setStatusOf([...selected], 'published')}>
                Show
              </button>
            )}
            <button className="btn btn-small btn-danger" disabled={busy} onClick={() => remove([...selected])}>
              {busy ? 'Saving…' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {!loaded && !error && <p className="muted-line">Loading news…</p>}
      {loaded && shown.length === 0 && <p className="muted-line">No news matches these filters.</p>}

      {rows.length > 0 && (
        <div className="base-table-wrap">
          <table className="base-table news-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={allTicked}
                    aria-label="Select this page"
                    onChange={() =>
                      setSelected((old) => {
                        const next = new Set(old)
                        rows.forEach((n) => (allTicked ? next.delete(n.id) : next.add(n.id)))
                        return next
                      })
                    }
                  />
                </th>
                <th>Title</th>
                <th>Countries</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} className={n.status === 'draft' ? 'row-hidden' : undefined}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleRow(n.id)} aria-label={`Select ${n.title}`} />
                  </td>
                  <td>
                    {/* dir="auto": Arabic titles read right to left */}
                    <div dir="auto">{n.title}</div>
                    <div className="row-sub">
                      {/* Under the title, not in it: inside an Arabic title it would land in the middle */}
                      {n.status === 'draft' && <span className="pill-muted no-gap">Hidden</span>}
                      {/* <bdi>: the Arabic source name must not flip the order of the date next to it */}
                      <bdi>{n.source_name}</bdi> ·{' '}
                      {new Date(n.published_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="muted">{n.country_codes.length === 0 ? '—' : n.country_codes.map(nameOf).join(', ')}</td>
                  <td className="col-actions">
                    {n.url && (
                      <a className="btn btn-small btn-ghost" href={n.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    )}
                    {n.status === 'published' ? (
                      <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => setStatusOf([n.id], 'draft')}>
                        Hide
                      </button>
                    ) : (
                      <button className="btn btn-small" disabled={busy} onClick={() => setStatusOf([n.id], 'published')}>
                        Show
                      </button>
                    )}
                    <button className="btn btn-small btn-danger" disabled={busy} onClick={() => remove([n.id])}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="pager">
              <span>
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, shown.length)} of {shown.length}
              </span>
              <button className="btn btn-small btn-ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Previous
              </button>
              <button className="btn btn-small btn-ghost" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {news.length >= ADMIN_LIMIT && <p className="hint">Only the newest {ADMIN_LIMIT} items are listed.</p>}
    </div>
  )
}