import { StatusBar } from '../src/statusbar'
import { DEFAULT_OPTIONS } from '../src/options'
import { calculateMetrics, parseSnapshot } from '../src/metrics'
import { sample } from './fixtures'
import type { MonitorState } from '../src/monitor'

const previous = parseSnapshot(sample())
const current = parseSnapshot(sample({ time: 102, cpu: '115 10 32 963 20 10 10 40 50 10', rx: 5034165, tx: 381904 }))
const metrics = calculateMetrics(current, previous)
metrics.hostname = 'production-01'
metrics.memory = {
    total: 16 * 1024 ** 3, used: 6.4 * 1024 ** 3, percent: 40,
    available: 9.6 * 1024 ** 3, availableEstimated: false, free: 5.6 * 1024 ** 3,
    buffers: 128 * 1024 ** 2, cached: 3.5 * 1024 ** 3, reclaimable: 768 * 1024 ** 2, shared: 96 * 1024 ** 2,
    swapTotal: 2 * 1024 ** 3, swapUsed: 128 * 1024 ** 2, swapFree: 1920 * 1024 ** 2,
}
metrics.networks = {
    eth0: { received: 128.6 * 1024 ** 3, transmitted: 42.8 * 1024 ** 3 },
    eth1: { received: 3.2 * 1024 ** 3, transmitted: 768 * 1024 ** 2 },
    docker0: { received: 12.4 * 1024 ** 3, transmitted: 8.1 * 1024 ** 3 },
    lo: { received: 640 * 1024 ** 2, transmitted: 640 * 1024 ** 2 },
}
metrics.disks = [
    { device: '/dev/nvme0n1p2', mount: '/', filesystem: 'ext4', total: 240 * 1024 ** 3, used: 103.2 * 1024 ** 3, available: 124.8 * 1024 ** 3, percent: 46 },
    { device: '/dev/sdb1', mount: '/data', filesystem: 'xfs', total: 1024 ** 4, used: 870.4 * 1024 ** 3, available: 153.6 * 1024 ** 3, percent: 85 },
    { device: '/dev/sdc1', mount: '/mnt/backups', filesystem: 'ext4', total: 2 * 1024 ** 4, used: 512 * 1024 ** 3, available: 1433.6 * 1024 ** 3, percent: 27 },
]
const now = Date.now()
// Synthetic history is used only in this preview, never in the plugin.
const cpuValues = [12, 15, 13, 18, 27, 43, 38, 22, 16, 18, 21, 65, 82, 74, 48, 32, 25, 28, 34, 31, 23, 17, 20, 37, 55, 46, 33, 25, 22, 19, 18.5]
metrics.cpuPercent = cpuValues[cpuValues.length - 1]
const state: MonitorState = { status: 'live', message: '实时监控', messageKey: 'status.live', metrics, updatedAt: now, disksUpdatedAt: now, diskError: false, paused: false,
    cpuHistory: cpuValues.map((value, index) => ({ time: now - 60000 + index * 2000, value })),
}
const bar = new StatusBar(document.getElementById('terminal')!, DEFAULT_OPTIONS, () => {
    state.paused = !state.paused
    state.status = state.paused ? 'paused' : 'live'
    state.message = state.paused ? '监控已暂停' : '实时监控'
    state.messageKey = state.paused ? 'status.paused' : 'status.live'
    bar.update(state)
}, () => { state.updatedAt = Date.now(); bar.update(state) }, 'zh-CN')
bar.update(state)
Object.assign(window, { monitorPreview: { bar, state, options: DEFAULT_OPTIONS } })
