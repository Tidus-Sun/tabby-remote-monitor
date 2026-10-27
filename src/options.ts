import type { LanguagePreference } from './i18n'
import { DEFAULT_APPEARANCE, normalizeAppearance } from './appearance'
import type { AppearanceOptions } from './appearance'

export interface MonitorOptions extends AppearanceOptions {
    language: LanguagePreference
    enabled: boolean
    interval: number
    diskInterval: number
    timeout: number
    pauseWhenHidden: boolean
    interfaces: string
    showHostname: boolean
    showCPU: boolean
    showMemory: boolean
    showNetwork: boolean
    showDisks: boolean
    showVirtualFilesystems: boolean
}

export const DEFAULT_OPTIONS: MonitorOptions = {
    ...DEFAULT_APPEARANCE,
    language: 'auto',
    enabled: true,
    interval: 2,
    diskInterval: 15,
    timeout: 8,
    pauseWhenHidden: false,
    interfaces: '',
    showHostname: true,
    showCPU: true,
    showMemory: true,
    showNetwork: true,
    showDisks: true,
    showVirtualFilesystems: false,
}

export function normalizeOptions (input: Partial<MonitorOptions> = {}): MonitorOptions {
    const result = { ...DEFAULT_OPTIONS }
    for (const key of Object.keys(DEFAULT_OPTIONS) as (keyof MonitorOptions)[]) {
        if (typeof DEFAULT_OPTIONS[key] === 'boolean' && typeof input[key] === 'boolean') {
            Object.assign(result, { [key]: input[key] })
        }
    }
    const number = (value: unknown, fallback: number, min: number, max: number): number =>
        typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
    result.interval = number(input.interval, 2, 1, 60)
    result.diskInterval = number(input.diskInterval, 15, 5, 300)
    result.timeout = number(input.timeout, 8, 3, 30)
    result.interfaces = typeof input.interfaces === 'string' ? input.interfaces.trim() : ''
    result.language = input.language === 'zh-CN' || input.language === 'en' ? input.language : 'auto'
    Object.assign(result, normalizeAppearance(input))
    return result
}
