import { collectorCommand, COLLECTOR_END } from './collector'
import { calculateMetrics, parseSnapshot, UnsupportedSystemError, IncompleteSnapshotError } from './metrics'
import type { Metrics, Snapshot } from './metrics'
import type { MonitorOptions } from './options'
import { execute, IncompleteOutputError } from './transport'
import type { ExecClient } from './transport'
import { appendCPUHistory } from './history'
import type { CPUHistoryPoint } from './history'
import { LocalizedError, translate } from './i18n'
import type { MessageKey, TranslationParams } from './i18n'

export interface Connection { identity: object; client: ExecClient; open: boolean }
export type MonitorStatus = 'waiting' | 'loading' | 'live' | 'paused' | 'hidden' | 'error' | 'unsupported'
export interface MonitorState {
    status: MonitorStatus
    message: string
    messageKey?: MessageKey
    messageParams?: TranslationParams
    metrics?: Metrics
    updatedAt?: number
    disksUpdatedAt?: number
    diskError: boolean
    paused: boolean
    cpuHistory?: CPUHistoryPoint[]
}

export class Monitor {
    state: MonitorState = { status: 'waiting', message: translate('zh-CN', 'status.waiting'), messageKey: 'status.waiting', diskError: false, paused: false }
    private timer?: ReturnType<typeof setTimeout>
    private abort?: AbortController
    private previous?: Snapshot
    private identity?: object
    private diskAttempt = 0
    private generation = 0
    private failures = 0
    private stopped = false
    private visible = true
    private unsupported = false

    constructor (
        private connection: () => Connection | undefined,
        private options: MonitorOptions,
        private render: (state: MonitorState) => void,
        private exec: typeof execute = execute,
    ) {}

    start (): void { this.wake() }
    configure (options: MonitorOptions): void {
        const samplingChanged = (['enabled', 'interval', 'diskInterval', 'timeout', 'pauseWhenHidden', 'interfaces', 'showDisks'] as const)
            .some(key => this.options[key] !== options[key])
        this.options = options
        // Tabby's config event also covers unrelated preferences and display-only changes.
        if (samplingChanged) this.wake()
    }
    setVisible (visible: boolean): void {
        if (this.visible !== visible) {
            this.visible = visible
            if (this.options.pauseWhenHidden) this.wake()
        }
    }
    togglePaused (): void { this.state.paused = !this.state.paused; this.wake() }
    refresh (): void { this.unsupported = false; this.wake() }

    /** Cancels pending work before starting a new generation (configuration, visibility, reconnection). */
    wake (): void {
        if (this.stopped) return
        this.generation++
        clearTimeout(this.timer)
        this.abort?.abort()
        // Retain the counter baseline for a refresh or schedule change. Only an
        // actual pause or changed connection invalidates it.
        this.diskAttempt = 0
        this.failures = 0
        void this.tick(this.generation)
    }

    destroy (): void {
        this.stopped = true
        this.generation++
        clearTimeout(this.timer)
        this.abort?.abort()
    }

    private publish (status: MonitorStatus, messageKey: MessageKey, messageParams: TranslationParams = {}): void {
        this.state = { ...this.state, status, message: translate('zh-CN', messageKey, messageParams), messageKey, messageParams }
        this.render(this.state)
    }

    private async tick (generation: number): Promise<void> {
        let delay = this.options.interval * 1000
        try {
            const connection = this.connection()
            if (!connection?.open) {
                this.previous = undefined
                this.identity = undefined
                this.unsupported = false
                this.state = { status: 'waiting', message: '', diskError: false, paused: this.state.paused }
                this.publish('waiting', 'status.waiting')
                delay = 1000
                return
            }
            if (this.identity !== connection.identity) {
                this.identity = connection.identity
                this.previous = undefined
                this.diskAttempt = 0
                this.unsupported = false
                this.state = { status: 'loading', message: translate('zh-CN', 'status.loading'), messageKey: 'status.loading', diskError: false, paused: this.state.paused }
            }
            if (!this.options.enabled || this.state.paused) {
                this.previous = undefined
                this.publish('paused', 'status.paused')
                return
            }
            if (this.options.pauseWhenHidden && !this.visible) {
                this.previous = undefined
                this.publish('hidden', 'status.hidden')
                return
            }
            if (this.unsupported) { this.publish('unsupported', 'status.unsupported'); return }
            if (!this.state.metrics) this.publish('loading', 'status.loading')

            const includeDisks = this.options.showDisks && Date.now() - this.diskAttempt >= this.options.diskInterval * 1000
            if (includeDisks) this.diskAttempt = Date.now()
            const controller = new AbortController()
            this.abort = controller
            let snapshot: Snapshot | undefined
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const result = await this.exec(connection.client, collectorCommand(includeDisks), this.options.timeout * 1000, controller.signal, { completionMarker: COLLECTOR_END })
                    const latest = this.connection()
                    if (generation !== this.generation || this.stopped || latest?.identity !== connection.identity || !latest.open) return
                    snapshot = parseSnapshot(result.stdout)
                    break
                } catch (error) {
                    const latest = this.connection()
                    if (generation !== this.generation || this.stopped || latest?.identity !== connection.identity || !latest.open) return
                    if (attempt || !(error instanceof IncompleteOutputError || error instanceof IncompleteSnapshotError)) throw error
                }
            }
            if (!snapshot) return
            const metrics = calculateMetrics(snapshot, this.previous, this.options.interfaces)
            const sampleTime = Date.now()
            const rebooted = this.previous && snapshot.uptime < this.previous.uptime
            this.state.cpuHistory = appendCPUHistory(rebooted ? [] : this.state.cpuHistory ?? [], sampleTime, metrics.cpuPercent)
            if (!snapshot.disks || snapshot.diskError) metrics.disks = this.state.metrics?.disks
            if (includeDisks) {
                this.state.diskError = snapshot.diskError
                if (!snapshot.diskError) this.state.disksUpdatedAt = Date.now()
            }
            this.previous = snapshot
            this.state.metrics = metrics
            this.state.updatedAt = sampleTime
            this.failures = 0
            this.publish('live', 'status.live')
        } catch (error) {
            if (generation !== this.generation || this.stopped) return
            if (error instanceof UnsupportedSystemError) {
                this.previous = undefined
                this.unsupported = true
                this.publish('unsupported', error.key, error.params)
            } else {
                this.failures++
                delay = Math.min(30000, this.options.interval * 1000 * 2 ** Math.min(this.failures, 5))
                if (error instanceof LocalizedError) this.publish('error', error.key, error.params)
                else if (error instanceof Error) this.publish('error', 'error.external', { detail: error.message })
                else this.publish('error', 'error.collection')
            }
        } finally {
            if (generation === this.generation && !this.stopped) {
                this.abort = undefined
                this.timer = setTimeout(() => { void this.tick(generation) }, delay)
            }
        }
    }
}
