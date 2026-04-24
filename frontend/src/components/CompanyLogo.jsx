import { useState } from 'react'

function getDomainFromUrl(url) {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname.replace(/^(jobs|careers|apply|work|talent|recruiting|hire|www)\./i, '')
  } catch {
    return null
  }
}

function guessDomainFromName(company) {
  if (!company) return null
  const cleaned = company
    .toLowerCase()
    .replace(/\s+(inc|corp|ltd|llc|group|technologies|technology|solutions|services|company|co)\.?\s*$/i, '')
    .trim()
    .replace(/[^a-z0-9]/g, '')
  return cleaned ? `${cleaned}.com` : null
}

const LOGO_SOURCES = (domain) => [
  `https://logo.clearbit.com/${domain}`,
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
]

export default function CompanyLogo({ company, url, size = 'md' }) {
  const [srcIndex, setSrcIndex] = useState(0)

  const domain = getDomainFromUrl(url) || guessDomainFromName(company)
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
  const sources = domain ? LOGO_SOURCES(domain) : []

  if (!domain || srcIndex >= sources.length) {
    return (
      <div className={`${containerClass} bg-violet-100 text-violet-700 font-bold`}>
        {initials}
      </div>
    )
  }

  return (
    <div className={`${containerClass} bg-white border border-slate-100`}>
      <img
        src={sources[srcIndex]}
        alt={company}
        className={`${imgSizeClasses[size]} object-contain`}
        onError={() => setSrcIndex(i => i + 1)}
      />
    </div>
  )
}
