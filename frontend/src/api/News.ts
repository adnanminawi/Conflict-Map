import { api } from './client'
import type { NewsItem } from '../types'

// The latest published news. lang = 'en' or 'ar' for one language, nothing for both.
export async function fetchNews(lang?: 'en' | 'ar'): Promise<NewsItem[]> {
  const { data } = await api.get<NewsItem[]>('/news', { params: { lang } })
  return data
}