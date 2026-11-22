import type { NewsLang } from '../hooks/useNews'
import type { NewsItem } from '../types'

interface Props {
  news: NewsItem[]
  error: boolean
  loaded: boolean
  lang: NewsLang
  onLang: (lang: NewsLang) => void
  limit?: number // the Map page shows only the newest few
  onShowAll?: () => void // "All news": opens the News page of the side panel
  title: string // "Latest news" or "Latest from Yemen"
  emptyText: string // when there's nothing: "No news about Yemen in the last day."
}

// "6 Nov, 17:59" for older news, "5 min ago" / "3 h ago" for today's
function when(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// The news list in the side panel. Clicking one opens the article.
export default function NewsPanel({ news, error, loaded, lang, onLang, limit, onShowAll, title, emptyText }: Props) {
  const shown = limit ? news.slice(0, limit) : news

  return (
    <section className="side-section" aria-labelledby="news-title">
      <div className="side-section-head">
        <h2 id="news-title" className="side-title">
          {title}
        </h2>
        {onShowAll && news.length > 0 && (
          <button type="button" className="side-link" onClick={onShowAll}>
            All news
          </button>
        )}
      </div>

      {/* English / عربي: click one to see only that language, click it again to see both.
          The choice is shared by the Map and News pages, and stays when the country changes. */}
      <div className="news-langs" role="group" aria-label="News language">
        {(['en', 'ar'] as NewsLang[]).map((l) => (
          <button
            key={l}
            type="button"
            className={lang === l ? 'news-lang active' : 'news-lang'}
            aria-pressed={lang === l}
            onClick={() => onLang(lang === l ? 'all' : l)}
          >
            {l === 'en' ? 'English' : 'عربي'}
          </button>
        ))}
      </div>

      {error && <p className="side-note side-error">Could not load the news. It will try again in a few minutes.</p>}
      {loaded && !error && news.length === 0 && <p className="side-note">{emptyText}</p>}

      <ul className="news-list">
        {shown.map((n) => (
          <li key={n.id} dir="auto">
            <a className="news-item" href={n.url ?? undefined} target="_blank" rel="noopener noreferrer">
              <span className="news-meta">
                {/* <bdi>: an Arabic source name must not flip the order of the time next to it */}
                {when(n.published_at)}, <bdi>{n.source_name}</bdi>
              </span>
              {/* dir="auto": Arabic titles read right to left */}
              <span className="news-title" dir="auto">
                {n.title}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}