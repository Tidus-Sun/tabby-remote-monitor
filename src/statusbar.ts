import { clampPercent, formatBytes, visibleDisks } from './metrics'
import type { DiskUsage } from './metrics'
import type { MonitorOptions } from './options'
import type { MonitorState } from './monitor'
import { icon } from './icons'
import { CPU_HISTORY_WINDOW, cpuHistorySegments } from './history'
import { resolveLanguage, translate } from './i18n'
import type { Language, MessageKey, TranslationParams } from './i18n'
import { appearanceVariables } from './appearance'

const stylesheet: string = require('./statusbar.css')
const template = `
<div class="shell">
  <div class="bar" role="group" data-i18n-aria="app.label">
    <div class="metric host"><span class="dot"></span>${icon('host')}<span class="host-text">Remote monitor</span></div>
    <button class="metric cpu reading details-trigger" type="button" aria-expanded="false" aria-controls="monitor-details" data-i18n-aria="cpu.trigger">${icon('cpu')}<span class="value">—</span><span class="cpu-sparkline" aria-hidden="true"></span></button>
    <button class="metric memory reading details-trigger" type="button" aria-expanded="false" aria-controls="monitor-details" data-i18n-aria="memory.trigger">${icon('memory')}<span class="value">—</span><span class="meter" aria-hidden="true"><span class="fill"></span></span></button>
    <button class="metric network reading details-trigger" type="button" aria-expanded="false" aria-controls="monitor-details" data-i18n-aria="network.trigger">${icon('download', 'download')}<span class="rx">—</span>${icon('upload', 'upload')}<span class="tx">—</span></button>
    <div class="disks" role="group" data-i18n-aria="disk.group"></div>
    <span class="message" role="status"></span>
  </div>
  <div class="actions"><span class="status"></span><button class="action refresh" type="button" data-i18n-aria="action.refresh" data-i18n-title="action.refresh">${icon('refresh')}</button><button class="action pause" type="button"><span class="pause-icon">${icon('pause')}</span><span class="play-icon" hidden>${icon('play')}</span></button></div>
</div>
<section class="panel" id="monitor-details" hidden>
  <div class="panel-header"><div><div class="panel-title"></div><div class="panel-subtitle"></div></div><button class="action close" type="button" data-i18n-aria="action.close">${icon('close')}</button></div>
  <div class="panel-body"></div>
</section>`

const panelKinds = ['disk', 'network', 'cpu', 'memory'] as const
type PanelKind = typeof panelKinds[number]

export class StatusBar {
    readonly element: HTMLElement
    private root: ShadowRoot
    private state?: MonitorState
    private options: MonitorOptions
    private language: Language = 'en'
    private activePanel?: PanelKind
    private activeTrigger?: HTMLElement
    private diskTriggers = new Map<string | undefined, HTMLButtonElement>()
    private closeTimer?: ReturnType<typeof setTimeout>
    private resizeObserver: ResizeObserver
    private suppressFocusOpen = false
    private dismissedHoverTrigger?: HTMLElement
    private outsideClick = (event: Event): void => {
        if (!event.composedPath().includes(this.element)) this.closePanel()
    }
    private escape = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && this.activePanel) {
            this.closePanel(true)
            event.stopPropagation()
        }
    }
    private positionPanel = (): void => {
        if (!this.activeTrigger) return
        if (!this.activeTrigger.isConnected) { this.closePanel(); return }
        const panel = this.query('.panel')
        const anchor = this.activeTrigger.getBoundingClientRect()
        const host = this.element.getBoundingClientRect()
        const bar = this.query('.bar').getBoundingClientRect()
        // A horizontally scrolled-out trigger must not leave an orphaned popup.
        if (anchor.right <= bar.left || anchor.left >= bar.right || !host.width) {
            this.closePanel()
            return
        }
        const width = panel.getBoundingClientRect().width
        const center = (Math.max(anchor.left, bar.left) + Math.min(anchor.right, bar.right)) / 2
        const left = Math.max(0, Math.min(host.width - width, center - host.left - width / 2))
        panel.style.left = `${left}px`
        panel.style.bottom = `${host.bottom - anchor.top + 6}px`
        const paneTop = this.element.parentElement?.getBoundingClientRect().top ?? 0
        panel.style.maxHeight = `${Math.max(0, anchor.top - Math.max(0, paneTop) - 6)}px`
    }

    constructor (host: HTMLElement, options: MonitorOptions, pause: () => void, refresh: () => void, private hostLocale?: string) {
        this.options = options
        this.element = host.ownerDocument.createElement('div')
        this.element.className = 'tabby-remote-monitor'
        this.root = this.element.attachShadow({ mode: 'open' })
        const style = host.ownerDocument.createElement('style')
        style.textContent = stylesheet
        this.root.append(style)
        const content = host.ownerDocument.createElement('template')
        content.innerHTML = template // Static markup only; all remote values use textContent below.
        this.root.append(content.content.cloneNode(true))
        this.query('.pause').addEventListener('click', pause)
        this.query('.refresh').addEventListener('click', refresh)
        for (const kind of panelKinds) {
            if (kind !== 'disk') this.bindTrigger(kind, this.query(`.${kind}`))
        }
        this.updateDisks([], false)
        this.query('.panel').addEventListener('mouseenter', () => clearTimeout(this.closeTimer))
        this.query('.panel').addEventListener('mouseleave', () => this.scheduleClose())
        this.query('.panel').addEventListener('focusin', () => clearTimeout(this.closeTimer))
        this.query('.panel').addEventListener('focusout', () => this.scheduleClose())
        this.query('.close').addEventListener('click', () => this.closePanel(true))
        this.query('.bar').addEventListener('scroll', this.positionPanel)
        host.ownerDocument.addEventListener('pointerdown', this.outsideClick)
        host.ownerDocument.defaultView?.addEventListener('resize', this.positionPanel)
        this.element.addEventListener('keydown', this.escape)
        host.append(this.element)
        this.resizeObserver = new ResizeObserver(this.positionPanel)
        this.resizeObserver.observe(host)
        this.resizeObserver.observe(this.element)
        this.configure(options)
    }

    private query<T extends HTMLElement = HTMLElement> (selector: string): T { return this.root.querySelector<T>(selector)! }
    private text (selector: string, value: string): void { this.query(selector).textContent = value }
    private t (key: MessageKey, params?: TranslationParams): string { return translate(this.language, key, params) }
    private timestamp (time?: number): string { return time ? new Date(time).toLocaleTimeString(this.language) : this.t('status.noSample') }
    private message (state: MonitorState): string { return state.messageKey ? this.t(state.messageKey, state.messageParams) : state.message }
    private bindTrigger (kind: PanelKind, trigger: HTMLElement): void {
        trigger.addEventListener('mouseenter', () => { if (this.dismissedHoverTrigger !== trigger) this.openPanel(kind, trigger) })
        trigger.addEventListener('mouseleave', () => {
            if (this.dismissedHoverTrigger === trigger) this.dismissedHoverTrigger = undefined
            this.scheduleClose()
        })
        trigger.addEventListener('focus', () => { if (!this.suppressFocusOpen) this.openPanel(kind, trigger) })
        trigger.addEventListener('blur', () => this.scheduleClose())
        // Keyboard activation and touch still work, while mouse users need no click.
        trigger.addEventListener('click', () => this.openPanel(kind, trigger))
    }

    private updateDisks (disks: DiskUsage[], failed: boolean): void {
        const container = this.query('.disks')
        // Reuse each mount's button so periodic samples retain hover and focus.
        const entries = disks.length ? [...new Map(disks.map(disk => [disk.mount, disk])).values()] : [undefined]
        const mounts = new Set(entries.map(disk => disk?.mount))
        for (const [mount, trigger] of this.diskTriggers) {
            if (mounts.has(mount)) continue
            if (this.activeTrigger === trigger) this.closePanel()
            if (this.dismissedHoverTrigger === trigger) this.dismissedHoverTrigger = undefined
            trigger.remove()
            this.diskTriggers.delete(mount)
        }
        entries.forEach((disk, index) => {
            let trigger = this.diskTriggers.get(disk?.mount)
            if (!trigger) {
                trigger = this.element.ownerDocument.createElement('button')
                trigger.className = 'metric disk reading details-trigger'
                trigger.type = 'button'
                trigger.setAttribute('aria-expanded', 'false')
                trigger.setAttribute('aria-controls', 'monitor-details')
                trigger.innerHTML = `${icon('disk')}<span class="value"><span class="disk-mount"></span><span class="disk-value"></span></span>${icon('chevron', 'chevron')}` // Static markup only.
                const mount = trigger.querySelector<HTMLElement>('.disk-mount')!
                mount.textContent = disk?.mount ?? ''
                mount.title = disk?.mount ?? ''
                mount.hidden = !disk
                this.bindTrigger('disk', trigger)
                this.diskTriggers.set(disk?.mount, trigger)
            }
            trigger.setAttribute('aria-label', disk ? this.t('disk.mountTrigger', { mount: disk.mount }) : this.t('disk.trigger'))
            const value = trigger.querySelector('.disk-value')!
            const text = disk ? `${disk.percent}%${failed ? ' !' : ''}` : failed ? this.t('disk.failed') : '—'
            if (value.textContent !== text) value.textContent = text
            if (container.children[index] !== trigger) container.insertBefore(trigger, container.children[index] ?? null)
        })
    }

    private percentage (selector: string, value: number | null): void {
        const node = this.query(`${selector} .value`)
        node.textContent = value === null ? '—' : `${value.toFixed(1)}%`
        node.classList.toggle('warning', value !== null && value >= 75 && value < 90)
        node.classList.toggle('critical', value !== null && value >= 90)
        const fill = this.root.querySelector<HTMLElement>(`${selector} .fill`)
        if (fill) fill.style.width = `${clampPercent(value ?? 0)}%`
    }

    configure (options: MonitorOptions, hostLocale = this.hostLocale): void {
        this.options = options
        for (const [name, value] of Object.entries(appearanceVariables(options))) this.element.style.setProperty(name, value)
        this.hostLocale = hostLocale
        this.language = resolveLanguage(options.language, hostLocale)
        this.element.lang = this.language
        for (const [attribute, target] of [['data-i18n-aria', 'aria-label'], ['data-i18n-title', 'title']]) {
            this.root.querySelectorAll(`[${attribute}]`).forEach(node => node.setAttribute(target, this.t(node.getAttribute(attribute) as MessageKey)))
        }
        this.element.style.display = options.enabled ? '' : 'none'
        for (const [selector, enabled] of [['.host', options.showHostname], ['.cpu', options.showCPU], ['.memory', options.showMemory], ['.network', options.showNetwork], ['.disks', options.showDisks]] as const) {
            this.query(selector).hidden = !enabled
        }
        if (!options.enabled || this.activeTrigger?.closest('[hidden]')) this.closePanel()
        if (this.state) this.update(this.state)
        else {
            this.updateDisks([], false)
            this.query('.pause').setAttribute('aria-label', this.t('action.pause'))
            this.query('.pause').title = this.t('action.pause')
            if (this.activePanel) { this.renderPanel(); this.positionPanel() }
        }
    }

    update (state: MonitorState): void {
        this.state = state
        this.element.dataset.status = state.status
        const live = state.status === 'live'
        this.text('.status', live ? `${this.options.interval}s` : state.status === 'error' ? this.t('status.retrying') : '')
        this.text('.message', live ? '' : `${this.message(state)}${state.metrics ? this.t('status.previous') : ''}`)
        this.query('.message').title = this.message(state)
        this.query('.status').title = this.t('status.latest', { time: this.timestamp(state.updatedAt) })
        this.query<HTMLButtonElement>('.refresh').disabled = state.paused || state.status === 'hidden'
        const pauseText = this.t(state.paused ? 'action.resume' : 'action.pause')
        this.query('.pause-icon').hidden = state.paused
        this.query('.play-icon').hidden = !state.paused
        this.query('.pause').setAttribute('aria-label', pauseText)
        this.query('.pause').title = pauseText
        const metrics = state.metrics
        this.text('.host-text', metrics?.hostname ?? 'Remote monitor')
        this.query('.host').title = metrics ? this.t('host.uptime', { host: metrics.hostname, days: Math.floor(metrics.uptime / 86400), hours: Math.floor(metrics.uptime % 86400 / 3600) }) : this.message(state)
        this.percentage('.cpu', metrics?.cpuPercent ?? null)
        this.percentage('.memory', metrics?.memory.percent ?? null)
        this.text('.memory .value', metrics ? `${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}` : '—')
        this.query('.cpu-sparkline').replaceChildren(this.cpuChart(true))
        const rate = (value: number | null | undefined): string => value == null ? '—' : `${formatBytes(value)}/s`
        this.text('.rx', rate(metrics?.network.received))
        this.text('.tx', rate(metrics?.network.transmitted))
        const disks = visibleDisks(metrics?.disks ?? [], this.options.showVirtualFilesystems)
        this.updateDisks(disks, state.diskError)
        if (this.activePanel) {
            this.renderPanel()
            this.positionPanel()
        }
    }

    private openPanel (kind: PanelKind, trigger: HTMLElement): void {
        if (!this.options.enabled || !trigger.isConnected || trigger.closest('[hidden]')) return
        clearTimeout(this.closeTimer)
        const changed = this.activePanel !== kind
        this.dismissedHoverTrigger = undefined
        this.activePanel = kind
        this.activeTrigger = trigger
        const panel = this.query('.panel')
        panel.hidden = false
        panel.dataset.kind = kind
        this.root.querySelectorAll('.details-trigger').forEach(item => item.setAttribute('aria-expanded', String(item === trigger)))
        this.renderPanel()
        this.positionPanel()
        if (changed) panel.scrollTop = 0
    }

    private scheduleClose (): void {
        clearTimeout(this.closeTimer)
        // Leave time to cross the small gap between the label and its popup.
        this.closeTimer = setTimeout(() => {
            if (!this.activeTrigger) return
            const panel = this.query('.panel')
            const trigger = this.activeTrigger
            if (panel.matches(':hover') || trigger.matches(':hover') || panel.contains(this.root.activeElement) || this.root.activeElement === trigger) return
            this.closePanel()
        }, 180)
    }

    private closePanel (restoreFocus = false): void {
        clearTimeout(this.closeTimer)
        const previous = this.activeTrigger
        // Rerendering content under a stationary pointer can emit another enter
        // event. An explicit dismissal stays closed until the pointer leaves.
        if (restoreFocus) this.dismissedHoverTrigger = previous
        this.activePanel = undefined
        this.activeTrigger = undefined
        this.query('.panel').hidden = true
        this.root.querySelectorAll('.details-trigger').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'))
        if (restoreFocus && previous) {
            this.suppressFocusOpen = true
            previous.focus({ preventScroll: true })
            this.suppressFocusOpen = false
        }
    }

    private renderPanel (): void {
        const panel = this.query('.panel')
        const scrollTop = panel.scrollTop
        const scroller = panel.querySelector<HTMLElement>('.table-scroll')
        const scrollLeft = scroller?.scrollLeft ?? 0
        const tableFocused = !!scroller && this.root.activeElement === scroller
        this.renderPanelContent()
        const updatedScroller = panel.querySelector<HTMLElement>('.table-scroll')
        // Rebuilding the table must not interrupt reading or keyboard scrolling
        // when a new sample arrives or the language/appearance changes.
        if (tableFocused) updatedScroller?.focus({ preventScroll: true })
        if (updatedScroller) updatedScroller.scrollLeft = scrollLeft
        panel.scrollTop = scrollTop
    }

    private renderPanelContent (): void {
        if (this.activePanel) this.query('.panel').setAttribute('aria-label', this.t(`${this.activePanel}.title`))
        const body = this.query('.panel-body')
        body.replaceChildren()
        const state = this.state
        const metrics = state?.metrics
        const add = (tag: string, parent: HTMLElement, text: string, className = ''): HTMLElement => {
            const node = this.element.ownerDocument.createElement(tag)
            node.textContent = text
            node.className = className
            parent.append(node)
            return node
        }
        if (state && state.status !== 'live') add('div', body, `${this.message(state)}${metrics ? this.t('status.previousDetails') : ''}`, 'info warning')
        if (this.activePanel === 'memory') {
            this.text('.panel-title', this.t('memory.title'))
            this.text('.panel-subtitle', this.t('memory.subtitle', { host: metrics?.hostname ?? 'Linux' }))
            const memory = metrics?.memory
            if (!memory) {
                add('div', body, this.t('memory.waiting'), 'empty')
                return
            }
            const summary = add('div', body, '', 'memory-summary')
            add('div', summary, this.t('capacity.usedTotal'), 'stat-label')
            add('div', summary, `${formatBytes(memory.used)} / ${formatBytes(memory.total)}`, 'memory-capacity')
            const table = add('table', body, '', 'memory-table')
            const tbody = add('tbody', table, '')
            const rows = [
                [this.t('memory.available'), formatBytes(memory.available), this.t(memory.availableEstimated ? 'memory.estimatedHint' : 'memory.availableHint')],
                [this.t('memory.free'), formatBytes(memory.free), this.t('memory.freeHint')],
                [this.t('memory.buffers'), formatBytes(memory.buffers), this.t('memory.buffersHint')],
                [this.t('memory.cached'), formatBytes(memory.cached), this.t('memory.cachedHint')],
                [this.t('memory.reclaimable'), formatBytes(memory.reclaimable), this.t('memory.reclaimableHint')],
                [this.t('memory.shared'), formatBytes(memory.shared), this.t('memory.sharedHint')],
                [this.t('memory.swapUsage'), memory.swapTotal ? `${formatBytes(memory.swapUsed)} / ${formatBytes(memory.swapTotal)}` : this.t('memory.swapDisabled'), this.t('memory.swapUsageHint')],
                [this.t('memory.swapFree'), formatBytes(memory.swapFree), this.t('memory.swapFreeHint')],
            ]
            for (const [label, value, description] of rows) {
                const row = add('tr', tbody, '')
                const heading = add('th', row, label)
                heading.setAttribute('scope', 'row')
                heading.title = description
                add('td', row, value, 'size')
            }
            add('div', body, this.t('memory.footnote', { time: this.timestamp(state?.updatedAt), estimate: memory.availableEstimated ? this.t('memory.estimated') : '' }), 'footnote')
            return
        }
        if (this.activePanel === 'cpu') {
            this.text('.panel-title', this.t('cpu.title'))
            this.text('.panel-subtitle', this.t('cpu.subtitle', { host: metrics?.hostname ?? 'Linux' }))
            const history = state?.cpuHistory ?? []
            const values = history.flatMap(point => point.value === null ? [] : [point.value])
            const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
            const peak = values.length ? Math.max(...values) : null
            const stats = add('div', body, '', 'cpu-stats')
            for (const [label, value] of [['cpu.current', metrics?.cpuPercent ?? null], ['cpu.average', average], ['cpu.peak', peak]] as const) {
                const stat = add('div', stats, '', 'cpu-stat')
                add('div', stat, this.t(label), 'stat-label')
                add('div', stat, value === null ? '—' : `${value.toFixed(1)}%`, 'stat-value')
                if (label === 'cpu.average') stat.title = this.t('cpu.averageHint')
            }
            const chart = add('div', body, '', 'cpu-chart')
            const axis = add('div', chart, '', 'cpu-y-axis')
            for (const label of ['100%', '50%', '0%']) add('span', axis, label)
            const plot = add('div', chart, '', 'cpu-plot')
            plot.append(this.cpuChart())
            if (!values.length) add('div', plot, this.t('cpu.empty'), 'chart-empty')
            const timeAxis = add('div', body, '', 'cpu-x-axis')
            add('span', timeAxis, this.t('cpu.start'))
            add('span', timeAxis, this.t('cpu.end'))
            add('div', body, this.t('cpu.footnote', { interval: this.options.interval, time: this.timestamp(state?.updatedAt), load: metrics?.load ?? '—' }), 'footnote')
            return
        }
        if (this.activePanel === 'network') {
            const interfaces = Object.entries(metrics?.networks ?? {}).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
            this.text('.panel-title', this.t('network.title'))
            this.text('.panel-subtitle', this.t('network.subtitle', { host: metrics?.hostname ?? 'Linux', count: interfaces.length }))
            if (interfaces.length) {
                const table = add('table', body, '', 'network-table')
                const header = add('tr', add('thead', table, ''), '')
                add('th', header, this.t('network.device'))
                add('th', header, this.t('network.received'), 'download size')
                add('th', header, this.t('network.transmitted'), 'upload size')
                const tbody = add('tbody', table, '')
                for (const [name, counters] of interfaces) {
                    const row = add('tr', tbody, '')
                    const device = add('div', add('td', row, ''), '', 'network-device')
                    add('span', device, name, 'mount').title = name
                    if (metrics?.network.interfaces.includes(name)) add('span', device, this.t('network.selected'), 'network-selected').title = this.t('network.selectedHint')
                    add('td', row, formatBytes(counters.received), 'size').title = this.t('network.bytes', { count: counters.received.toLocaleString(this.language) })
                    add('td', row, formatBytes(counters.transmitted), 'size').title = this.t('network.bytes', { count: counters.transmitted.toLocaleString(this.language) })
                }
            } else add('div', body, this.t('network.waiting'), 'empty')
            add('div', body, this.t('network.footnote', { time: this.timestamp(state?.updatedAt) }), 'footnote')
            return
        }
        this.text('.panel-title', this.t('disk.title'))
        this.text('.panel-subtitle', this.t('disk.subtitle', { host: metrics?.hostname ?? 'Linux', interval: this.options.diskInterval }))
        if (metrics) add('div', body, this.t('disk.system', { used: formatBytes(metrics.memory.used), total: formatBytes(metrics.memory.total), swapUsed: formatBytes(metrics.memory.swapUsed), swapTotal: formatBytes(metrics.memory.swapTotal), load: metrics.load }), 'info')
        const disks = visibleDisks(metrics?.disks ?? [], this.options.showVirtualFilesystems)
        if (disks.length) {
            const scroller = add('div', body, '', 'table-scroll')
            scroller.tabIndex = 0
            scroller.setAttribute('role', 'region')
            scroller.setAttribute('aria-label', this.t('disk.table'))
            const table = add('table', scroller, '', 'disk-table')
            const header = add('tr', add('thead', table, ''), '')
            for (const [key, className] of [['disk.mount', ''], ['disk.device', ''], ['disk.filesystem', ''], ['capacity.usedTotal', 'size'], ['disk.usage', 'size']] as const) add('th', header, this.t(key), className)
            const tbody = add('tbody', table, '')
            for (const disk of disks) {
                const row = add('tr', tbody, '')
                add('td', row, disk.mount, 'mount').title = disk.mount
                add('td', row, disk.device, 'device').title = disk.device
                add('td', row, disk.filesystem || '—', 'filesystem').title = disk.filesystem || this.t('disk.unknownType')
                const capacity = `${formatBytes(disk.used)} / ${formatBytes(disk.total)}`
                add('td', row, capacity, 'size').title = this.t('disk.available', { capacity, available: formatBytes(disk.available) })
                const usage = add('div', add('td', row, ''), '', 'disk-usage')
                const meter = add('div', usage, '', 'meter disk-meter')
                add('div', meter, '', 'fill').style.width = `${clampPercent(disk.percent)}%`
                add('span', usage, `${disk.percent}%`, `disk-percent ${disk.percent >= 90 ? 'critical' : disk.percent >= 75 ? 'warning' : ''}`)
            }
        } else add('div', body, this.t(state?.diskError ? 'disk.error' : 'disk.empty'), 'empty')
        if (state?.diskError && disks.length) add('div', body, this.t('disk.stale'), 'info warning')
        add('div', body, this.t('disk.footnote', { time: this.timestamp(state?.disksUpdatedAt) }), 'footnote')
    }

    private cpuChart (mini = false): SVGSVGElement {
        const width = mini ? 64 : 560
        const height = mini ? 18 : 160
        const svg = this.element.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
        svg.setAttribute('preserveAspectRatio', 'none')
        svg.setAttribute('aria-hidden', 'true')
        const add = (tag: string, attributes: Record<string, string>): void => {
            const node = this.element.ownerDocument.createElementNS(svg.namespaceURI, tag)
            for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
            svg.append(node)
        }
        if (!mini) {
            for (let i = 0; i <= 4; i++) add('path', { d: `M0 ${i * height / 4} H${width}`, class: 'chart-grid' })
            for (let i = 0; i <= 6; i++) add('path', { d: `M${i * width / 6} 0 V${height}`, class: 'chart-grid' })
        }
        const end = this.state?.updatedAt ?? Date.now()
        const segments = cpuHistorySegments(this.state?.cpuHistory ?? [], end)
        for (const segment of segments) {
            const points = segment.map(point => ({
                x: (point.time - end + CPU_HISTORY_WINDOW) / CPU_HISTORY_WINDOW * width,
                y: 1 + (1 - clampPercent(point.value!) / 100) * (height - 2),
            }))
            const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
            const first = points[0]
            const last = points[points.length - 1]
            if (points.length > 1) {
                add('path', { d: `${line} L${last.x.toFixed(2)} ${height} L${first.x.toFixed(2)} ${height} Z`, class: 'chart-area' })
                add('path', { d: line, class: 'chart-line' })
            } else add('circle', { cx: last.x.toFixed(2), cy: last.y.toFixed(2), r: mini ? '1.2' : '2', class: 'chart-point' })
        }
        return svg
    }

    destroy (): void {
        clearTimeout(this.closeTimer)
        this.resizeObserver.disconnect()
        this.element.ownerDocument.removeEventListener('pointerdown', this.outsideClick)
        this.element.ownerDocument.defaultView?.removeEventListener('resize', this.positionPanel)
        this.element.removeEventListener('keydown', this.escape)
        this.element.remove()
    }
}
