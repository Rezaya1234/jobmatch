import { useState } from 'react'

function getDomain(url) {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    // Strip common job-portal subdomains to get the root company domain
    return hostname.replace(/^(jobs|careers|apply|work|talent|recruiting|hire|www)\./i, '')
  } catch {
    return null
  }
}

export default function CompanyLogo({ company, url, size = 'md' }) {
  const [error, setError] = useState(false)
  const domain = getDomain(url)
  const initials = (company || '?').slice(0, 2).toUpperCase()

  const sizeClasses = {
    sm: 'w-9 h-9 rounded-lg text-xs',
    md: 'w-10 h-10 rounded-xl text-xs',
    lg: 'w-12 h-12 rounded-xl text-sm',
  }
  const imgSizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-7 h-7',
    lg: 'w-9 h-9',
  }

  const containerClass = `${sizeClasses[size]} flex items-center justify-center shrink-0 overflow-hidden`

  if (!domain || error) {
    return (
      <div className={`${containerClass} bg-violet-100 text-violet-700 font-bold`}>
        {initials}
      </div>
    )
  }

  return (
    <div className={`${containerClass} bg-white border border-slate-100`}>
      <img
        src={`https://logo.clearbit.com/${domain}`}
        alt={company}
        className={`${imgSizeClasses[size]} object-contain`}
        onError={() => setError(true)}
      />
    </div>
  )
}
