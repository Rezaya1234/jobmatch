import { useState } from 'react'

const ATS_DOMAINS = new Set([
  'greenhouse.io', 'lever.co', 'workday.com', 'myworkdayjobs.com',
  'icims.com', 'taleo.net', 'bamboohr.com', 'smartrecruiters.com',
  'jobvite.com', 'ashbyhq.com', 'jobs.ashbyhq.com', 'linkedin.com',
  'indeed.com', 'glassdoor.com', 'ziprecruiter.com', 'wellfound.com',
  'angel.co', 'rippling.com', 'workable.com', 'recruitee.com',
])

// Known domains keyed by normalised company name (lowercase, no punctuation/spaces)
const KNOWN_DOMAINS = {
  'anthropic':          'anthropic.com',
  'openai':             'openai.com',
  'google':             'google.com',
  'googledeepmind':     'deepmind.google',
  'deepmind':           'deepmind.google',
  'meta':               'meta.com',
  'microsoft':          'microsoft.com',
  'amazon':             'amazon.com',
  'apple':              'apple.com',
  'nvidia':             'nvidia.com',
  'databricks':         'databricks.com',
  'snowflake':          'snowflake.com',
  'scaleai':            'scale.ai',
  'togetherai':         'together.ai',
  'mistralai':          'mistral.ai',
  'cohere':             'cohere.com',
  'perplexityai':       'perplexity.ai',
  'perplexity':         'perplexity.ai',
  'elevenabs':          'elevenlabs.io',
  'elevenlabs':         'elevenlabs.io',
  'pinecone':           'pinecone.io',
  'cursor':             'cursor.sh',
  'harveyai':           'harvey.ai',
  'harvey':             'harvey.ai',
  'sierraai':           'sierra.ai',
  'sierra':             'sierra.ai',
  'runwayml':           'runwayml.com',
  'runway':             'runwayml.com',
  'writer':             'writer.com',
  'glean':              'glean.com',
  'gong':               'gong.com',
  'intercom':           'intercom.com',
  'palantir':           'palantir.com',
  'stripe':             'stripe.com',
  'shopify':            'shopify.com',
  'hubspot':            'hubspot.com',
  'salesforce':         'salesforce.com',
  'oracle':             'oracle.com',
  'sap':                'sap.com',
  'ibm':                'ibm.com',
  'intel':              'intel.com',
  'amd':                'amd.com',
  'qualcomm':           'qualcomm.com',
  'netflix':            'netflix.com',
  'spotify':            'spotify.com',
  'airbnb':             'airbnb.com',
  'uber':               'uber.com',
  'lyft':               'lyft.com',
  'doordash':           'doordash.com',
  'instacart':          'instacart.com',
  'twilio':             'twilio.com',
  'datadog':            'datadoghq.com',
  'hashicorp':          'hashicorp.com',
  'confluent':          'confluent.io',
  'mongodb':            'mongodb.com',
  'elastic':            'elastic.co',
  'cloudflare':         'cloudflare.com',
  'vercel':             'vercel.com',
  'figma':              'figma.com',
  'notion':             'notion.so',
  'slack':              'slack.com',
  'zendesk':            'zendesk.com',
  'atlassian':          'atlassian.com',
  'asana':              'asana.com',
  'linear':             'linear.app',
  'rippling':           'rippling.com',
  'gusto':              'gusto.com',
  'brex':               'brex.com',
  'robinhood':          'robinhood.com',
  'coinbase':           'coinbase.com',
  'plaid':              'plaid.com',
  'chainalysis':        'chainalysis.com',
  'benchling':          'benchling.com',
  'tempus':             'tempus.com',
  'recursion':          'recursionpharma.com',
  'nvidiaresearch':     'nvidia.com',
  'xai':                'x.ai',
  'inflectionai':       'inflection.ai',
  'inflection':         'inflection.ai',
  'adept':              'adept.ai',
  'characterai':        'character.ai',
  'character':          'character.ai',
  'twitterx':           'x.com',
  'twitter':            'twitter.com',
  'linkedin':           'linkedin.com',
}

function normaliseName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/\s+(inc|corp|ltd|llc|group|technologies|technology|solutions|services|company|co|ai|labs?|research)\.?\s*$/i, '')
    .trim()
    .replace(/[^a-z0-9]/g, '')
}

function getDomainFromUrl(url) {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    const domain = hostname.replace(/^(jobs|careers|apply|work|talent|recruiting|hire|boards|www)\./i, '')
    return ATS_DOMAINS.has(domain) ? null : domain
  } catch {
    return null
  }
}

function getDomainFromName(company) {
  if (!company) return null
  const key = normaliseName(company)
  if (KNOWN_DOMAINS[key]) return KNOWN_DOMAINS[key]
  // Try with "ai" suffix stripped (catches "Acme AI" → "acme")
  const keyNoAi = company.toLowerCase().replace(/\s+ai\s*$/i, '').replace(/[^a-z0-9]/g, '')
  if (KNOWN_DOMAINS[keyNoAi]) return KNOWN_DOMAINS[keyNoAi]
  // Fall back to guessing .com
  return key ? `${key}.com` : null
}

const COLORS = [
  'bg-violet-100 text-violet-700', 'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700',
]

export default function CompanyLogo({ company, url, size = 'md' }) {
  const [srcIndex, setSrcIndex] = useState(0)

  const domain = getDomainFromUrl(url) || getDomainFromName(company)
  const initials = (company || '?').slice(0, 2).toUpperCase()
  const colorClass = COLORS[(company || '').charCodeAt(0) % COLORS.length]

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

  const sources = domain ? [
    `https://logo.clearbit.com/${domain}`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ] : []

  const containerClass = `${sizeClasses[size]} flex items-center justify-center shrink-0 overflow-hidden`

  if (!domain || srcIndex >= sources.length) {
    return (
      <div className={`${containerClass} font-bold ${colorClass}`}>
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
