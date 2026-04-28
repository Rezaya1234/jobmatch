import axios from 'axios'

const http = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

export const createUser = (email) => http.post('/users', { email }).then(r => r.data)
export const getUser = (id) => http.get(`/users/${id}`).then(r => r.data)
export const lookupUserByEmail = (email) => http.get('/users/by-email', { params: { email } }).then(r => r.data)
export const upsertProfile = (id, profile) => http.post(`/users/${id}/profile`, profile).then(r => r.data)
export const getProfile = (id) => http.get(`/users/${id}/profile`).then(r => r.data)
export const getMatches = (id, minScore = 0, limit = 50, includeDisliked = false) =>
  http.get(`/users/${id}/matches`, { params: { min_score: minScore, limit, include_disliked: includeDisliked } }).then(r => r.data)
export const submitFeedback = (id, jobId, rating, comment = '', weight = null) =>
  http.post(`/users/${id}/feedback`, { job_id: jobId, rating, comment, weight }).then(r => r.data)
export const getFeedback = (id) => http.get(`/users/${id}/feedback`).then(r => r.data)
export const deleteFeedback = (id, jobId) => http.delete(`/users/${id}/feedback/${jobId}`)
export const listJobs = (params = {}) =>
  http.get('/jobs', { params }).then(r => r.data)
export const getJobCount = (params = {}) =>
  http.get('/jobs/count', { params }).then(r => r.data)
export const getMatchCount = (id) => http.get(`/users/${id}/matches/count`, { params: { min_score: 0.8 } }).then(r => r.data)
export const triggerDailyPipeline = () => http.post('/pipeline/daily').then(r => r.data)
export const triggerCollect = () => http.post('/pipeline/collect').then(r => r.data)
export const triggerMatchAll = () => http.post('/pipeline/match-all').then(r => r.data)
export const triggerFeedbackPipeline = (id) => http.post(`/pipeline/feedback/${id}`).then(r => r.data)
export const triggerOnDemandMatch = (id) => http.post(`/pipeline/match/${id}`).then(r => r.data)
export const triggerRescore = (id) => http.post(`/pipeline/rescore/${id}`).then(r => r.data)
export const triggerResetFilters = (id) => http.post(`/pipeline/reset-filters/${id}`).then(r => r.data)
export const triggerTestEmail = (id) => http.post(`/pipeline/test-email/${id}`).then(r => r.data)
export const recordEngagement = (id) => http.post(`/users/${id}/engage`).catch(() => {})
export const getActivity = (id) => http.get(`/users/${id}/qa/activity`).then(r => r.data)
export const getPipelineStatus = () => http.get('/pipeline/status').then(r => r.data)
export const listCompanies = (params = {}) => http.get('/companies', { params }).then(r => r.data)
export const getCompany = (slug) => http.get(`/companies/${slug}`).then(r => r.data)
export const getCompanyJobs = (slug, params = {}) => http.get(`/companies/${slug}/jobs`, { params }).then(r => r.data)
export const triggerCompanyInsights = () => http.post('/pipeline/company-insights').then(r => r.data)
export const backfillLogos = () => http.post('/pipeline/backfill-logos').then(r => r.data)
export const getFeedbackSummary = (id, days = 30) =>
  http.get(`/users/${id}/feedback/summary`, { params: { days } }).then(r => r.data)
export const parseProfile = (id, text, resumeFile) => {
  const form = new FormData()
  if (text) form.append('text', text)
  if (resumeFile) form.append('resume', resumeFile)
  return http.post(`/users/${id}/profile/parse`, form).then(r => r.data)
}

// Admin
const adm = (path, opts = {}) => {
  const uid = localStorage.getItem('userId')
  return http.get(`/admin/${path}`, { params: { user_id: uid, ...opts.params }, ...opts }).then(r => r.data)
}
export const adminCheck = () => adm('check')
export const adminPipelineStatus = () => adm('pipeline-status')
export const adminRecommendedActions = () => adm('recommended-actions')
export const adminTestAgentMetrics = () => adm('test-agent-metrics')
export const adminRunTestAgent = () => {
  const uid = localStorage.getItem('userId')
  return http.post('/admin/test-agent/run', null, { params: { user_id: uid } }).then(r => r.data)
}
export const adminAgentLogs = (params = {}) => adm('agent-logs', { params })
export const adminPipelineFunnel = () => adm('pipeline-funnel')
export const adminSourceHealth = () => adm('source-health')
export const adminAlerts = (params = {}) => adm('alerts', { params })
export const adminDismissAlert = (alertId) => {
  const uid = localStorage.getItem('userId')
  return http.patch(`/admin/alerts/${alertId}/dismiss`, null, { params: { user_id: uid } }).then(r => r.data)
}
export const adminUserActivity = () => adm('user-activity')
export const adminJobScoring = (params = {}) => adm('job-scoring', { params })
export const adminWeightEvolution = (params = {}) => adm('weight-evolution', { params })
export const adminGetThresholds = () => adm('thresholds')
export const adminUpdateThresholds = (thresholds) => {
  const uid = localStorage.getItem('userId')
  return http.patch('/admin/thresholds', { thresholds }, { params: { user_id: uid } }).then(r => r.data)
}
