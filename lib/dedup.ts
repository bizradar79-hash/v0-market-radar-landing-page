export function deduplicateByField<T>(arr: T[], field: keyof T): T[] {
  const seen = new Set()
  return arr.filter(item => {
    const val = item[field]
    if (!val || seen.has(val)) return false
    seen.add(val)
    return true
  })
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export function deduplicateByDomain(arr: any[], urlField = 'website'): any[] {
  const seen = new Set<string>()
  return arr.filter(item => {
    const domain = extractDomain(item[urlField] || '')
    if (!domain || seen.has(domain)) return false
    seen.add(domain)
    return true
  })
}
