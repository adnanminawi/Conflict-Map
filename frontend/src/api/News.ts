import { api } from './client'
import type { NewsItem } from '../types'

// The latest published news. lang = 'en' or 'ar' for one language, nothing for both.
// country = 'YE' for news about Yemen only, nothing for every country.
export async function fetchNews(lang?: 'en' | 'ar', country?: string): Promise<NewsItem[]> {
  const { data } = await api.get<NewsItem[]>('/news', { params: { lang, country } })
  return data
}