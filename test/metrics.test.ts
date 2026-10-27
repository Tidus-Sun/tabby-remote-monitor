import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateMetrics, parseSnapshot, visibleDisks, UnsupportedSystemError, formatBytes } from '../src/metrics'
import { normalizeOptions } from '../src/options'
import { sample } from './fixtures'

test('parses memory, CPU counters, spaced mounts and df reserved-block percentage', () => {
    const snapshot = parseSnapshot(sample())
    assert.equal(snapshot.hostname, 'edge-linux')
    assert.equal(snapshot.cpu.total, 1000) // Guest time must not be counted twice.
    assert.equal(snapshot.cpu.idle, 820)
    assert.equal(snapshot.memory.percent, 60)
    assert.equal(snapshot.memory.available, 400000 * 1024)
    assert.equal(snapshot.memory.availableEstimated, false)
    assert.equal(snapshot.memory.free, null, 'missing detail fields must not be presented as zero')
    assert.equal(snapshot.memory.swapUsed, 50000 * 1024)
    assert.equal(snapshot.memory.swapFree, 150000 * 1024)
    assert.equal(snapshot.disks?.[0].percent, 43)
    assert.equal(snapshot.disks?.[1].mount, '/mnt/my data')
    assert.equal(snapshot.disks?.[1].filesystem, 'xfs')
    assert.equal(visibleDisks(snapshot.disks!, false).length, 2)
    assert.equal(visibleDisks(snapshot.disks!, true).length, 3)
})

test('computes rates from remote uptime and lowest-metric default interface', () => {
    const a = parseSnapshot(sample())
    const b = parseSnapshot(sample({ time: 102, cpu: '150 10 40 830 20 10 10 30 70 10', rx: 5096, tx: 3024 }))
    const metrics = calculateMetrics(b, a)
    assert.equal(metrics.cpuPercent, 70)
    assert.equal(metrics.network.received, 2048)
    assert.equal(metrics.network.transmitted, 512)
    assert.deepEqual(metrics.network.interfaces, ['eth0'])
    assert.equal(calculateMetrics(a, undefined).cpuPercent, null)
    assert.equal(calculateMetrics(a, undefined).network.received, null)
})

test('automatic interface selection excludes subnet and rejected routes', () => {
    const output = sample().replace('__TRM_LOAD__',
        'docker0 00000000 00000000 0001 0 0 0 00000080 0 0 0\n' +
        'lo 00000000 00000000 0201 0 0 0 00000000 0 0 0\n__TRM_LOAD__')
    const snapshot = parseSnapshot(output)
    assert.equal(snapshot.defaultInterface, 'eth0', 'only a usable /0 route should select the default interface')
    const withoutDefault = output.replace(/^\w+ 00000000 0100000A.*\n/gm, '')
    const fallback = parseSnapshot(withoutDefault)
    assert.equal(fallback.defaultInterface, undefined)
    assert.deepEqual(calculateMetrics(fallback, undefined).network.interfaces, ['eth0', 'docker0'])
})

test('disk rows with negative available space and usage over 100 percent remain visible', () => {
    const snapshot = parseSnapshot(sample().replace('/dev/sda1 1000000 400000 550000 43% /', '/dev/sda1 1000000 990000 -10000 102% /'))
    const root = snapshot.disks?.find(disk => disk.mount === '/')
    assert.ok(root, 'a full filesystem must not disappear from monitoring')
    assert.equal(root.available, -10000 * 1024)
    assert.equal(root.percent, 102)
    assert.equal(snapshot.diskError, false)
    assert.equal(formatBytes(root.available), '-9.8 MiB')
})

test('reboot, counter reset, missing interfaces and first samples show no invented rates', () => {
    const a = parseSnapshot(sample())
    const reset = parseSnapshot(sample({ time: 102, rx: 50, tx: 100 }))
    assert.equal(calculateMetrics(reset, a).network.received, null)
    assert.equal(calculateMetrics(a, reset).cpuPercent, null)
    assert.equal(calculateMetrics(reset, a, 'absent0').network.received, null)
    const b = parseSnapshot(sample({ time: 102, rx: 5096, tx: 3024 }))
    assert.equal(calculateMetrics(b, a, 'eth0,eth0,docker0').network.received, 2048)
})

test('older Linux memory fallback subtracts shmem and respects reclaimable slab', () => {
    const snapshot = parseSnapshot(sample({ memory: 'MemTotal: 1000 kB\nMemFree: 100 kB\nBuffers: 50 kB\nCached: 200 kB\nSReclaimable: 50 kB\nShmem: 100 kB' }))
    assert.equal(snapshot.memory.percent, 70)
    assert.equal(snapshot.memory.available, 300 * 1024)
    assert.equal(snapshot.memory.availableEstimated, true)
    assert.deepEqual([snapshot.memory.free, snapshot.memory.buffers, snapshot.memory.cached, snapshot.memory.reclaimable, snapshot.memory.shared], [100, 50, 200, 50, 100].map(value => value * 1024))
    assert.equal(snapshot.memory.swapUsed, 0)
    assert.equal(snapshot.memory.swapFree, 0)
    const excessiveCache = parseSnapshot(sample({ memory: 'MemTotal: 1000 kB\nMemFree: 100 kB\nCached: 1200 kB' })).memory
    assert.equal(excessiveCache.available, excessiveCache.total)
    assert.equal(excessiveCache.used, 0)
})

test('rejects incomplete, malformed and unsupported output', () => {
    assert.throws(() => parseSnapshot(sample().replace('__TRM_END__', '')), /不完整/)
    assert.throws(() => parseSnapshot(sample({ cpu: 'NaN' })), /CPU/)
    assert.throws(() => parseSnapshot('__TRM_UNSUPPORTED__\n'), UnsupportedSystemError)
    assert.equal(parseSnapshot(sample({ disks: false })).disks, undefined)
    assert.equal(parseSnapshot(sample().replace('__TRM_END__', '__TRM_DISK_FAILED__\n__TRM_END__')).diskError, true)
})

test('normalizes persisted settings and formats bytes', () => {
    assert.equal(normalizeOptions({ interval: -10 }).interval, 1)
    assert.equal(normalizeOptions({ interval: NaN }).interval, 2)
    assert.equal(normalizeOptions({ timeout: 1e6 }).timeout, 30)
    assert.equal(formatBytes(1024), '1.0 KiB')
    assert.equal(formatBytes(null), '—')
})
