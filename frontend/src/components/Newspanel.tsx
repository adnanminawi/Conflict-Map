import { useEffect, useState } from 'react'
import { fetchNews } from '../api/News'
import type { NewsItem } from '../types'

interface Props {
  onOpenChange: (open: boolean) => void // the map leaves room on the right while the box is open
}

const REFRESH_MINUTES = 2 // the backend reads the feeds every 10 min; 2 min here keeps the box close to that

type Lang = 'all' | 'en' | 'ar'

// "5 min ago", "3 h ago"
function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}

// The box on the right of the map: the latest news from the feeds. Clicking one opens the article.
export default function NewsPanel({ onOpenChange }: Props) {
  // Open on computers, closed on phones (like the boxes on the left)
  const [open, setOpen] = useState(() => window.innerWidth > 600)
  const [lang, setLang] = useState<Lang>('all')
  const [news, setNews] = useState<NewsItem[]>([])
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    onOpenChange(open)
  }, [open])

  // Load now, then every few minutes. Changing the language loads again.
  useEffect(() => {
    let stopped = false // a late answer for the old language is ignored
    async function load() {
      try {
        const list = await fetchNews(lang === 'all' ? undefined : lang)
        if (stopped) return
        setNews(list)
        setError(false)
      } catch {
        if (!stopped) setError(true)
      } finally {
        if (!stopped) setLoaded(true)
      }
    }
    load()
    const timer = setInterval(load, REFRESH_MINUTES * 60 * 1000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [lang])

  return (
    <div className={open ? 'map-panel news-panel open' : 'map-panel news-panel'}>
      <button type="button" className="key-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        Latest news
        <span className="key-chevron" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <>
          <div className="news-langs" role="group" aria-label="Language">
            {(['all', 'en', 'ar'] as Lang[]).map((l) => (
              <button key={l} type="button" className={lang === l ? 'news-lang active' : 'news-lang'} aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l === 'all' ? 'All' : l === 'en' ? 'English' : 'عربي'}
              </button>
            ))}
          </div>

          {error && <p className="reach-hint reach-error">Could not load the news. It will try again in a few minutes.</p>}
          {loaded && !error && news.length === 0 && <p className="reach-hint">No news in the last day.</p>}

          <ul className="news-list">
            {news.map((n) => (
              <li key={n.id}>
                <a className="news-item" href={n.url ?? undefined} target="_blank" rel="noopener noreferrer">
                  {/* dir="auto": Arabic titles read right to left */}
                  <span className="news-title" dir="auto">
                    {n.title}
                  </span>
                  <span className="news-meta">
                    {/* <bdi>: the Arabic source name must not flip the order of the time next to it */}
                    <bdi>{n.source_name}</bdi> · {timeAgo(n.published_at)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}