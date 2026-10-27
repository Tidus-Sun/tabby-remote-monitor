import { LocalizedError } from './i18n'

export interface NetworkCounters { received: number; transmitted: number }
export interface MemoryUsage {
    total: number
    used: number
    percent: number
    available: number
    availableEstimated: boolean
    free: number | null
    buffers: number | null
    cached: number | null
    reclaimable: number | null
    shared: number | null
    swapTotal: number
    swapUsed: number
    swapFree: number
}
export interface DiskUsage {
    device: string
    mount: string
    filesystem: string
    total: number
    used: number
    available: number
    percent: number
}
export interface Snapshot {
    hostname: string
    uptime: number
    cpu: { total: number; idle: number }
    memory: MemoryUsage
    networks: Record<string, NetworkCounters>
    defaultInterface?: string
    load: string
    disks?: DiskUsage[]
    diskError: boolean
}
export interface Metrics extends Snapshot {
    cpuPercent: number | null
    network: { received: number | null; transmitted: number | null; interfaces: string[] }
}

export class UnsupportedSystemError extends LocalizedError {
    constructor () { super('status.unsupported') }
}
export class IncompleteSnapshotError extends LocalizedError {
    constructor () { super('error.incomplete') }
}
export const clampPercent = (value: number): number => Math.max(0, Math.min(100, value))
const unescapeMount = (value: string): string => value.replace(/\\(040|011|012|134)/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))

export function parseSnapshot (output: string): Snapshot {
    const lines = output.replace(/\r/g, '').split('\n')
    if (lines.includes('__TRM_UNSUPPORTED__')) {
        throw new UnsupportedSystemError()
    }
    const begin = lines.indexOf('__TRM_BEGIN__')
    const end = lines.lastIndexOf('__TRM_END__')
    if (begin < 0 || end <= begin) throw new IncompleteSnapshotError()
    const sections: Record<string, string[]> = {}
    let section = ''
    for (const line of lines.slice(begin + 1, end)) {
        const marker = /^__TRM_([A-Z_]+)__$/.exec(line)
        if (marker) {
            section = marker[1]
            sections[section] = []
        } else if (section && line.trim()) sections[section].push(line)
    }
    const uptime = Number(sections.UPTIME?.[0]?.split(/\s+/)[0])
    const cpuLine = sections.CPU?.[0]?.trim().split(/\s+/) ?? []
    // guest/guest_nice are already included in user/nice by Linux.
    const cpu = cpuLine.slice(1, 9).map(Number)
    if (cpuLine[0] !== 'cpu' || cpu.length < 4 || cpu.some(x => !Number.isFinite(x) || x < 0) || !Number.isFinite(uptime) || uptime < 0) {
        throw new LocalizedError('error.cpu')
    }
    const mem: Record<string, number> = {}
    for (const line of sections.MEM ?? []) {
        const match = /^(\w+):\s+(\d+)/.exec(line)
        if (match) mem[match[1]] = Number(match[2]) * 1024
    }
    const total = mem.MemTotal
    if (!total || !Number.isFinite(total)) throw new LocalizedError('error.memory')
    const available = Math.min(total, Math.max(0, mem.MemAvailable ?? ((mem.MemFree ?? 0) + (mem.Buffers ?? 0) + (mem.Cached ?? 0) + (mem.SReclaimable ?? 0) - (mem.Shmem ?? 0))))
    const used = total - available
    const swapTotal = mem.SwapTotal ?? 0
    const swapFree = Math.min(swapTotal, mem.SwapFree ?? 0)
    const networks: Record<string, NetworkCounters> = Object.create(null)
    for (const line of sections.NET ?? []) {
        const match = /^\s*([^:]+):\s*(.*)$/.exec(line)
        if (!match) continue
        const values = match[2].trim().split(/\s+/).map(Number)
        if (values.length >= 16 && [values[0], values[8]].every(x => Number.isFinite(x) && x >= 0)) {
            networks[match[1].trim()] = { received: values[0], transmitted: values[8] }
        }
    }
    let defaultInterface: string | undefined
    let routeMetric = Infinity
    for (const line of sections.ROUTE ?? []) {
        const route = line.trim().split(/\s+/)
        const metric = Number(route[6])
        const flags = parseInt(route[3], 16)
        // Destination zero also occurs in subnet routes (for example 0.0.0.0/1).
        // A default route needs a zero mask and must be UP without RTF_REJECT.
        if (route[1] === '00000000' && route[7] === '00000000' && (flags & 1) && !(flags & 0x200) && metric >= 0 && metric < routeMetric && networks[route[0]]) {
            defaultInterface = route[0]
            routeMetric = metric
        }
    }
    const mountTypes = new Map<string, string>()
    for (const line of sections.MOUNTS ?? []) {
        const parts = line.split(/\s+/)
        if (parts.length >= 3) mountTypes.set(unescapeMount(parts[1]), parts[2])
    }
    const disks = sections.DISK && sections.DISK.flatMap(line => {
        // POSIX df -P keeps a filesystem on one line; the mount may contain spaces.
        // df can report negative non-root available space and usage above 100%.
        const match = /^(.*?)\s+(\d+)\s+(\d+)\s+(-?\d+)\s+(\d+)%\s+(.+)$/.exec(line.trim())
        if (!match) return []
        const mount = unescapeMount(match[6])
        return [{ device: unescapeMount(match[1]), mount, filesystem: mountTypes.get(mount) ?? '',
            total: Number(match[2]) * 1024, used: Number(match[3]) * 1024,
            available: Number(match[4]) * 1024, percent: Number(match[5]) }]
    })
    return {
        hostname: sections.HOST?.[0]?.trim() || 'Linux', uptime,
        cpu: { total: cpu.reduce((a, b) => a + b, 0), idle: cpu[3] + (cpu[4] ?? 0) },
        memory: {
            total, used, percent: clampPercent(used / total * 100), available, availableEstimated: mem.MemAvailable === undefined,
            free: mem.MemFree ?? null, buffers: mem.Buffers ?? null, cached: mem.Cached ?? null,
            reclaimable: mem.SReclaimable ?? null, shared: mem.Shmem ?? null,
            swapTotal, swapUsed: swapTotal - swapFree, swapFree,
        },
        networks, defaultInterface, load: sections.LOAD?.[0]?.split(/\s+/).slice(0, 3).join(' / ') ?? '—',
        disks, diskError: !!sections.DISK_FAILED || (!!sections.DISK && !disks?.length),
    }
}

export function calculateMetrics (current: Snapshot, previous: Snapshot | undefined, configuredInterfaces = ''): Metrics {
    const requested = [...new Set(configuredInterfaces.split(',').map(x => x.trim()).filter(Boolean))]
    const interfaces = requested.length ? requested : current.defaultInterface ? [current.defaultInterface] : Object.keys(current.networks).filter(x => x !== 'lo')
    let cpuPercent: number | null = null
    let received: number | null = null
    let transmitted: number | null = null
    if (previous && current.uptime > previous.uptime) {
        const total = current.cpu.total - previous.cpu.total
        const idle = current.cpu.idle - previous.cpu.idle
        if (total > 0 && idle >= 0 && idle <= total) cpuPercent = clampPercent((1 - idle / total) * 100)
        const seconds = current.uptime - previous.uptime
        const comparable = interfaces.length > 0 && interfaces.every(name => {
            const a = current.networks[name]
            const b = previous.networks[name]
            return a && b && a.received >= b.received && a.transmitted >= b.transmitted
        })
        if (comparable) {
            received = interfaces.reduce((sum, name) => sum + current.networks[name].received - previous.networks[name].received, 0) / seconds
            transmitted = interfaces.reduce((sum, name) => sum + current.networks[name].transmitted - previous.networks[name].transmitted, 0) / seconds
        }
    }
    return { ...current, cpuPercent, network: { received, transmitted, interfaces } }
}

export function visibleDisks (disks: DiskUsage[], includeVirtual: boolean): DiskUsage[] {
    return disks.filter(d => includeVirtual || d.mount === '/' || !/^(tmpfs|devtmpfs|squashfs|proc|sysfs|devpts|cgroup2?|ramfs|securityfs|debugfs|tracefs|pstore|mqueue|hugetlbfs|fusectl|configfs|autofs)$/.test(d.filesystem || d.device))
        .sort((a, b) => a.mount === '/' ? -1 : b.mount === '/' ? 1 : a.mount.localeCompare(b.mount))
}

export function formatBytes (value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '—'
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let unit = 0
    while (Math.abs(value) >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
    return `${value.toFixed(unit === 0 || Math.abs(value) >= 100 ? 0 : 1)} ${units[unit]}`
}
