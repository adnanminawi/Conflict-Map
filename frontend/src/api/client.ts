import axios from 'axios'

export const TOKEN_KEY = 'admin_token'

// One Axios instance for the whole app. Every call goes to /api/...
// On your computer VITE_API_URL is empty → "/api" (Vite's proxy sends it to localhost:4000).
// Online it's the backend's address, e.g. https://conflict-map-api.onrender.com → https://…onrender.com/api
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ''}/api`,
})

// Before every request: if the admin is logged in, attach the token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Turns any error into a message we can show, e.g. "title is required"
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response?.data?.error ?? err.message
  return 'Something went wrong'
}

// True when the backend answered 401 (not logged in, or the login expired)
export function isUnauthorized(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401
}