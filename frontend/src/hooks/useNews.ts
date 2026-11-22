import { useEffect, useState } from 'react'
import { fetchNews } from '../api/News'
import type { NewsItem } from '../types'

export type NewsLang = 'all' | 'en' | 'ar'

const REFRESH_MINUTES = 2 // the backend reads the feeds every 10 min; 2 min here keeps the list close to that

// The latest news, loaded now and again every few minutes. Changing the language loads again.
// One place loads it, and the side panel uses it twice: the short list (Map) and the full list (News).
export function useNews(lang: NewsLang) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

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

  return { news, error, loaded }
}