export interface AppearanceOptions {
    glassEffect: boolean
    backgroundColor: string
    accentColor: string
    barOpacity: number
    panelOpacity: number
    blur: number
}

export const DEFAULT_APPEARANCE: AppearanceOptions = {
    glassEffect: true,
    backgroundColor: '#151b26',
    accentColor: '#86b6ff',
    barOpacity: 80,
    panelOpacity: 88,
    blur: 16,
}

export const APPEARANCE_PRESETS = [
    { name: 'appearance.midnight', backgroundColor: '#151b26', accentColor: '#86b6ff' },
    { name: 'appearance.ocean', backgroundColor: '#102a32', accentColor: '#55d6c2' },
    { name: 'appearance.amethyst', backgroundColor: '#241a34', accentColor: '#c4a0ff' },
    { name: 'appearance.graphite', backgroundColor: '#202226', accentColor: '#d4b585' },
    { name: 'appearance.frost', backgroundColor: '#eef3fa', accentColor: '#356ab8' },
] as const

function color (value: unknown, fallback: string): string {
    if (typeof value !== 'string') return fallback
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
    if (/^#[0-9a-f]{3}$/i.test(value)) return '#' + [...value.slice(1)].map(digit => digit + digit).join('').toLowerCase()
    return fallback
}

export function normalizeAppearance (input: Partial<AppearanceOptions>): AppearanceOptions {
    const number = (value: unknown, fallback: number, min: number, max: number): number =>
        typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(min, Math.min(max, value))) : fallback
    return {
        glassEffect: typeof input.glassEffect === 'boolean' ? input.glassEffect : DEFAULT_APPEARANCE.glassEffect,
        backgroundColor: color(input.backgroundColor, DEFAULT_APPEARANCE.backgroundColor),
        accentColor: color(input.accentColor, DEFAULT_APPEARANCE.accentColor),
        barOpacity: number(input.barOpacity, DEFAULT_APPEARANCE.barOpacity, 50, 100),
        panelOpacity: number(input.panelOpacity, DEFAULT_APPEARANCE.panelOpacity, 50, 100),
        blur: number(input.blur, DEFAULT_APPEARANCE.blur, 0, 32),
    }
}

const rgb = (hex: string): number[] => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
const rgba = (hex: string, alpha: number): string => `rgba(${rgb(hex).join(', ')}, ${alpha})`
const mix = (from: string, to: string, weight: number): string => {
    const target = rgb(to)
    return '#' + rgb(from).map((value, index) => Math.round(value + (target[index] - value) * weight).toString(16).padStart(2, '0')).join('')
}
function luminance (hex: string): number {
    const channels = rgb(hex).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}
export function contrastRatio (a: string, b: string): number {
    const first = luminance(a)
    const second = luminance(b)
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05)
}
function legible (foreground: string, background: string): string {
    if (contrastRatio(foreground, background) >= 4.5) return foreground
    const target = contrastRatio('#ffffff', background) >= contrastRatio('#000000', background) ? '#ffffff' : '#000000'
    for (let step = 1; step <= 20; step++) {
        const candidate = mix(foreground, target, step / 20)
        if (contrastRatio(candidate, background) >= 4.5) return candidate
    }
    return target
}

/** Only validated colors and bounded numbers reach CSS; no remote or arbitrary CSS input. */
export function appearanceVariables (input: Partial<AppearanceOptions>): Record<string, string> {
    const options = normalizeAppearance(input)
    const background = options.backgroundColor
    const light = contrastRatio('#182335', background) >= contrastRatio('#eef4ff', background)
    const foreground = light ? '#182335' : '#eef4ff'
    const accent = legible(options.accentColor, background)
    const chartBackground = '#0b111b'
    const chartAccent = legible(options.accentColor, chartBackground)
    return {
        '--trm-surface': background,
        '--trm-bar-background': rgba(background, options.glassEffect ? options.barOpacity / 100 : 1),
        '--trm-panel-background': rgba(background, options.glassEffect ? options.panelOpacity / 100 : 1),
        '--trm-header-background': mix(background, foreground, .035),
        '--trm-backdrop': options.glassEffect ? `blur(${options.blur}px) saturate(125%)` : 'none',
        '--trm-text': legible(mix(foreground, background, .12), background),
        '--trm-strong': legible(foreground, background),
        '--trm-muted': legible(mix(foreground, background, .32), background),
        '--trm-accent': accent,
        '--trm-accent-soft': rgba(accent, .12),
        '--trm-memory': legible(mix(options.accentColor, '#b1a0fa', .4), background),
        '--trm-download': legible(light ? '#147657' : '#63d8b1', background),
        '--trm-upload': legible(light ? '#2868b0' : '#81b3ff', background),
        '--trm-warning': legible(light ? '#855400' : '#f6c37b', background),
        '--trm-critical': legible(light ? '#b1263b' : '#ff858d', background),
        '--trm-border': rgba(foreground, .2),
        '--trm-divider': rgba(foreground, .1),
        '--trm-hover': rgba(foreground, .07),
        '--trm-meter': rgba(foreground, .15),
        '--trm-scrollbar': rgba(foreground, .3),
        '--trm-highlight': rgba(foreground, .08),
        '--trm-shadow': light ? '0 12px 32px #0003, inset 0 1px 0 #ffffff70' : '0 12px 32px #0005, inset 0 1px 0 #ffffff0d',
        '--trm-chart-background': chartBackground,
        '--trm-chart-accent': chartAccent,
        '--trm-chart-grid': rgba(chartAccent, .24),
        '--trm-chart-border': rgba(chartAccent, .42),
        '--trm-chart-area': rgba(chartAccent, .15),
    }
}
