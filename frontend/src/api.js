import axios from 'axios'

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

export const createUser = (email) => http.post('/users', { email }).then(r => r.data)
export const getUser = (id) => http.get(`/users/${id}`).then(r => r.data)
export const upsertProfile = (id, profile) => http.post(`/users/${id}/profile`, profile).then(r => r.data)
export const getProfile = (id) => http.get(`/users/${id}/profile`).then(r => r.data)
export const getMatches = (id, minScore = 0, limit = 50) =>
  http.get(`/users/${id}/matches`, { params: { min_score: minScore, limit } }).then(r => r.data)
export const submitFeedback = (id, jobId, rating, comment = '') =>
  http.post(`/users/${id}/feedback`, { job_id: jobId, rating, comment }).then(r => r.data)
export const getFeedback = (id) => http.get(`/users/${id}/feedback`).then(r => r.data)
export const listJobs = (search = '', limit = 100) =>
  http.get('/jobs', { params: { search, limit } }).then(r => r.data)
export const getJobCount = () => http.get('/jobs/count').then(r => r.data)
export const getMatchCount = (id) => http.get(`/users/${id}/matches/count`, { params: { min_score: 0.8 } }).then(r => r.data)
export const triggerDailyPipeline = () => http.post('/pipeline/daily').then(r => r.data)
export const triggerCollect = () => http.post('/pipeline/collect').then(r => r.data)
export const triggerMatchAll = () => http.post('/pipeline/match-all').then(r => r.data)
export const triggerFeedbackPipeline = (id) => http.post(`/pipeline/feedback/${id}`).then(r => r.data)
export const triggerRescore = (id) => http.post(`/pipeline/rescore/${id}`).then(r => r.data)
export const triggerResetFilters = (id) => http.post(`/pipeline/reset-filters/${id}`).then(r => r.data)
export const parseProfile = (id, text, resumeFile) => {
  const form = new FormData()
  if (text) form.append('text', text)
  if (resumeFile) form.append('resume', resumeFile)
  return http.post(`/users/${id}/profile/parse`, form).then(r => r.data)
}
