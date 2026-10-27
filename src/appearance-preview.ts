import type { MonitorOptions } from './options'
import type { MonitorState } from './monitor'
import { StatusBar } from './statusbar'

/** Local, clearly labeled sample data for the settings preview. No SSH or timers. */
function sampleState (): MonitorState {
    const now = Date.now()
    const gib = 1024 ** 3
    const values = [18, 24, 19, 32, 42, 28, 36, 22, 17, 29, 44, 58, 37, 26, 23]
    return {
        status: 'live', message: '', messageKey: 'status.live', paused: false, diskError: false, updatedAt: now, disksUpdatedAt: now,
        cpuHistory: values.map((value, index) => ({ time: now - (values.length - 1 - index) * 4000, value })),
        metrics: {
            hostname: 'demo-linux', uptime: 86400 * 3, cpu: { total: 1000, idle: 770 }, cpuPercent: 23,
            memory: { total: 8 * gib, used: 3.2 * gib, percent: 40, available: 4.8 * gib, availableEstimated: false,
                free: 3 * gib, buffers: .1 * gib, cached: 1.6 * gib, reclaimable: .2 * gib, shared: .1 * gib,
                swapTotal: 2 * gib, swapUsed: .1 * gib, swapFree: 1.9 * gib },
            networks: { eth0: { received: 12.5 * gib, transmitted: 3.6 * gib } },
            network: { received: 2.4 * 1024 ** 2, transmitted: 128 * 1024, interfaces: ['eth0'] },
            load: '0.20 / 0.34 / 0.28', diskError: false,
            disks: [{ mount: '/', device: '/dev/sda1', filesystem: 'ext4', total: 100 * gib, used: 28 * gib, available: 67 * gib, percent: 30 }],
        },
    }
}

export class AppearancePreview {
    private bar: StatusBar
    private state = sampleState()
    constructor (host: HTMLElement, options: MonitorOptions, hostLocale: string) {
        this.bar = new StatusBar(host, this.previewOptions(options), () => {
            this.state.paused = !this.state.paused
            this.state.status = this.state.paused ? 'paused' : 'live'
            this.state.messageKey = this.state.paused ? 'status.paused' : 'status.live'
            this.bar.update(this.state)
        }, () => { this.state = sampleState(); this.bar.update(this.state) }, hostLocale)
        this.bar.update(this.state)
    }
    private previewOptions (options: MonitorOptions): MonitorOptions {
        return { ...options, enabled: true, showHostname: true, showCPU: true, showMemory: true, showNetwork: true, showDisks: true }
    }
    configure (options: MonitorOptions, hostLocale: string): void { this.bar.configure(this.previewOptions(options), hostLocale) }
    destroy (): void { this.bar.destroy() }
}
