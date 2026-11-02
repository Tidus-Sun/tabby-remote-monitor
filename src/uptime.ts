import { translate } from './i18n'
import type { Language } from './i18n'

export function formatUptime (seconds: number | undefined, language: Language, detailed = false): string {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—'
    const total = Math.floor(seconds)
    const days = Math.floor(total / 86400)
    const hours = Math.floor(total % 86400 / 3600)
    const minutes = Math.floor(total % 3600 / 60)
    if (detailed) return translate(language, 'uptime.duration', { days, hours, minutes, seconds: total % 60 })
    if (days) return translate(language, 'uptime.days', { days, hours, minutes })
    if (hours) return translate(language, 'uptime.hours', { hours, minutes })
    return translate(language, 'uptime.minutes', { minutes })
}
