export function deviceNameFromUserAgent(userAgent: string | null | undefined): string {
  const ua = String(userAgent ?? '')

  let platform = 'Computer'
  if (/iPhone/i.test(ua)) platform = 'iPhone'
  else if (/iPad/i.test(ua)) platform = 'iPad'
  else if (/Android/i.test(ua)) platform = /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet'
  else if (/Windows/i.test(ua)) platform = 'Windows computer'
  else if (/Macintosh|Mac OS X/i.test(ua)) platform = 'Mac'
  else if (/CrOS/i.test(ua)) platform = 'Chromebook'
  else if (/Linux/i.test(ua)) platform = 'Linux computer'

  let browser = 'browser'
  if (/Edg\//i.test(ua)) browser = 'Edge'
  else if (/OPR\//i.test(ua)) browser = 'Opera'
  else if (/CriOS|Chrome\//i.test(ua)) browser = 'Chrome'
  else if (/FxiOS|Firefox\//i.test(ua)) browser = 'Firefox'
  else if (/Safari\//i.test(ua)) browser = 'Safari'

  return `${platform} · ${browser}`
}
