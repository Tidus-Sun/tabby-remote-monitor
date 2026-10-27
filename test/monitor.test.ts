import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Monitor, Connection, MonitorState } from '../src/monitor'
import { DEFAULT_OPTIONS } from '../src/options'
import type { execute } from '../src/transport'
import { sample } from './fixtures'
import { cpuHistorySegments } from '../src/history'
import { IncompleteOutputError } from '../src/transport'
import { COLLECTOR_END } from '../src/collector'

const turn = (): Promise<void> => new Promise(resolve => setImmediate(resolve))
const connection = (): Connection => ({ identity: {}, client: { exec: () => {} }, open: true })

test('paused/hidden/disabled monitors do not send commands and resume with a fresh baseline', async () => {
    let calls = 0
    let state!: MonitorState
    const conn = connection()
    const exec: typeof execute = async () => { calls++; return { stdout: sample(), stderr: '' } }
    const monitor = new Monitor(() => conn, { ...DEFAULT_OPTIONS, pauseWhenHidden: true }, s => { state = s }, exec)
    try {
        monitor.setVisible(false)
        await turn()
        assert.equal(calls, 0)
        assert.equal(state.status, 'hidden')
        monitor.setVisible(true)
        await turn()
        assert.equal(calls, 1)
        monitor.togglePaused()
        assert.equal(state.status, 'paused')
        monitor.refresh()
        await turn()
        assert.equal(calls, 1)
        monitor.togglePaused()
        await turn()
        assert.equal(state.metrics?.cpuPercent, null)
        assert.equal(calls, 2)
        monitor.configure({ ...DEFAULT_OPTIONS, enabled: false })
        await turn()
        assert.equal(calls, 2)
    } finally { monitor.destroy() }
})

test('background polling survives tab switches, unrelated settings and manual refresh without CPU gaps', async t => {
    assert.equal(DEFAULT_OPTIONS.pauseWhenHidden, false, 'background sampling should be enabled by default')
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
    const conn = connection()
    const pending: { resolve: (value: { stdout: string; stderr: string }) => void; signal: AbortSignal }[] = []
    const monitor = new Monitor(() => conn, { ...DEFAULT_OPTIONS }, () => {}, async (_, __, ___, signal) =>
        new Promise(resolve => pending.push({ resolve, signal })))
    const finish = async (i: number): Promise<void> => {
        pending[i].resolve({ stdout: sample({ time: 100 + i * 2, cpu: `${100 + i * 20} 10 20 ${800 + i * 80} 20 10 10 30 0 0` }), stderr: '' })
        await turn()
    }
    try {
        monitor.start()
        await finish(0)
        t.mock.timers.tick(2000)
        monitor.setVisible(false)
        monitor.configure({ ...DEFAULT_OPTIONS }) // Tabby can save unrelated settings.
        monitor.configure({ ...DEFAULT_OPTIONS, showMemory: false })
        monitor.configure({ ...DEFAULT_OPTIONS, language: 'en' })
        monitor.configure({ ...DEFAULT_OPTIONS, backgroundColor: '#102a32', accentColor: '#55d6c2', glassEffect: false, panelOpacity: 95 })
        assert.equal(pending.length, 2, 'tab/settings changes must not replace the pending request')
        assert.equal(pending[1].signal.aborted, false)
        await finish(1)
        t.mock.timers.tick(2000)
        assert.equal(pending.length, 3, 'hidden tab must continue its scheduled collection')
        await finish(2)
        monitor.setVisible(true)
        monitor.setVisible(false)
        monitor.setVisible(true)
        assert.equal(pending.length, 3, 'returning to the tab must not force an extra baseline sample')
        t.mock.timers.tick(500)
        monitor.refresh()
        await finish(3)
        const history = monitor.state.cpuHistory!
        assert.equal(history.length, 4)
        assert.equal(history[0].value, null)
        assert.ok(history.slice(1).every(point => point.value !== null))
        assert.equal(cpuHistorySegments(history, monitor.state.updatedAt!).length, 1)
    } finally {
        monitor.destroy()
        t.mock.timers.reset()
    }
})

test('reconnection and destruction discard delayed output and abort in-flight channels', async () => {
    let conn: Connection | undefined = connection()
    const states: MonitorState[] = []
    let resolve!: (result: { stdout: string; stderr: string }) => void
    let signal!: AbortSignal
    const exec: typeof execute = async (_, __, ___, abortSignal) => {
        signal = abortSignal
        return new Promise(done => { resolve = done })
    }
    const monitor = new Monitor(() => conn, { ...DEFAULT_OPTIONS }, state => states.push({ ...state }), exec)
    monitor.start()
    conn = undefined
    monitor.wake()
    assert.equal(signal.aborted, true)
    resolve({ stdout: sample(), stderr: '' })
    await turn()
    assert.equal(states.at(-1)?.status, 'waiting')
    assert.equal(states.at(-1)?.metrics, undefined)
    monitor.destroy()
    const count = states.length
    monitor.refresh()
    await turn()
    assert.equal(states.length, count)
})

test('unsupported hosts stop exec retries until manual refresh', async () => {
    let calls = 0
    const conn = connection()
    const monitor = new Monitor(() => conn, { ...DEFAULT_OPTIONS }, () => {}, async () => {
        calls++
        return { stdout: '__TRM_UNSUPPORTED__\n', stderr: '' }
    })
    try {
        monitor.start()
        await turn()
        assert.equal(monitor.state.status, 'unsupported')
        monitor.wake()
        await turn()
        assert.equal(calls, 1)
        monitor.refresh()
        await turn()
        assert.equal(calls, 2)
    } finally { monitor.destroy() }
})

test('an error preserves previous readings and labels them stale', async () => {
    let calls = 0
    const conn = connection()
    const monitor = new Monitor(() => conn, { ...DEFAULT_OPTIONS }, () => {}, async () => {
        if (calls++) throw new Error('exec denied')
        return { stdout: sample(), stderr: '' }
    })
    try {
        monitor.start()
        await turn()
        monitor.refresh()
        await turn()
        assert.equal(monitor.state.status, 'error')
        assert.equal(monitor.state.metrics?.hostname, 'edge-linux')
        assert.equal(monitor.state.messageKey, 'error.external')
        assert.equal(monitor.state.messageParams?.detail, 'exec denied')
    } finally { monitor.destroy() }
})

test('incomplete samples retry once, and recovery keeps the last valid CPU baseline', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
    const conn = connection()
    const snapshot = (i: number): string => sample({ time: 100 + i * 2, cpu: `${100 + i * 20} 10 20 ${800 + i * 80} 20 10 10 30 0 0` })
    const responses: (string | Error)[] = [snapshot(0), snapshot(1), snapshot(2).replace('__TRM_END__', ''), snapshot(2),
        new IncompleteOutputError(12), snapshot(3), new IncompleteOutputError(12), new IncompleteOutputError(24), snapshot(6)]
    let calls = 0
    const monitor = new Monitor(() => conn, { ...DEFAULT_OPTIONS }, () => {}, async (_, command, __, ___, options) => {
        assert.equal(options?.completionMarker, COLLECTOR_END)
        assert.match(command, /read -r trm_ack/)
        const result = responses[calls++]
        if (result instanceof Error) throw result
        assert.equal(typeof result, 'string', 'retry count must be bounded')
        return { stdout: result, stderr: '' }
    })
    try {
        monitor.start()
        await turn()
        for (let i = 0; i < 4; i++) { t.mock.timers.tick(2000); await turn() }
        assert.equal(calls, 8, 'two unsuccessful attempts must enter normal backoff')
        assert.equal(monitor.state.status, 'error')
        assert.equal(monitor.state.cpuHistory?.length, 4, 'never append a fabricated value on failure')
        t.mock.timers.tick(4000)
        await turn()
        assert.equal(monitor.state.status, 'live')
        const history = monitor.state.cpuHistory!
        assert.equal(history.length, 5)
        assert.ok(history.slice(1).every(point => point.value !== null && Math.abs(point.value - 20) < 0.001))
        assert.equal(cpuHistorySegments(history, monitor.state.updatedAt!).length, 1)
    } finally {
        monitor.destroy()
        t.mock.timers.reset()
    }
})

test('CPU history records samples, freezes when paused, and resets with the SSH connection', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
    let conn = connection()
    let calls = 0
    const monitor = new Monitor(() => conn, { ...DEFAULT_OPTIONS }, () => {}, async () => {
        const i = calls++
        return { stdout: sample({ time: 100 + i * 2, cpu: `${100 + i * 20} 10 20 ${800 + i * 80} 20 10 10 30 0 0` }), stderr: '' }
    })
    try {
        monitor.start()
        await turn()
        t.mock.timers.tick(2000)
        await turn()
        assert.equal(monitor.state.cpuHistory?.length, 2)
        assert.equal(monitor.state.cpuHistory?.[0].value, null)
        assert.ok(Math.abs(monitor.state.cpuHistory![1].value! - 20) < 0.001)
        const history = monitor.state.cpuHistory
        monitor.togglePaused()
        t.mock.timers.tick(2000)
        await turn()
        assert.equal(monitor.state.cpuHistory, history)
        assert.equal(calls, 2)
        monitor.togglePaused()
        await turn()
        assert.equal(monitor.state.cpuHistory?.at(-1)?.value, null, 'resume must insert a discontinuity')
        conn = connection()
        t.mock.timers.tick(2000)
        monitor.wake()
        await turn()
        assert.equal(monitor.state.cpuHistory?.length, 1)
        assert.equal(monitor.state.cpuHistory?.[0].value, null)
    } finally {
        monitor.destroy()
        t.mock.timers.reset()
    }
})

test('extended polling stays serial and bounded through capped backoff and recovery', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 })
    const conn = connection()
    const attempts: number[] = []
    let active = 0
    let peakActive = 0
    let diskRequests = 0
    const monitor = new Monitor(() => conn, { ...DEFAULT_OPTIONS }, () => {}, async (_, command) => {
        const call = attempts.length
        attempts.push(Date.now())
        active++
        peakActive = Math.max(peakActive, active)
        const disks = command.includes('df -kP -l')
        if (disks) diskRequests++
        try {
            await turn()
            if (call >= 500 && call < 506) throw new Error('temporary transport outage')
            const seconds = Date.now() / 1000
            return { stdout: sample({ time: seconds, cpu: `${seconds * 20} 0 0 ${seconds * 80} 0 0 0 0`, rx: seconds * 2048, tx: seconds * 512, disks }), stderr: '' }
        } finally { active-- }
    })
    try {
        monitor.start()
        await turn()
        // Forty minutes of scheduled time, including six consecutive failures.
        for (let step = 0; step < 1200; step++) { t.mock.timers.tick(2000); await turn() }
        assert.equal(peakActive, 1, 'requests on a terminal must never overlap')
        assert.deepEqual(attempts.slice(501, 507).map((time, i) => time - attempts[500 + i]), [4000, 8000, 16000, 30000, 30000, 30000])
        assert.equal(monitor.state.status, 'live')
        assert.equal(monitor.state.metrics?.network.received, 2048)
        assert.equal(monitor.state.metrics?.network.transmitted, 512)
        assert.equal(monitor.state.metrics?.disks?.length, 3, 'non-disk samples keep the latest disk readings')
        assert.ok(diskRequests > 100 && diskRequests < attempts.length / 5, 'df follows its separate interval')
        const history = monitor.state.cpuHistory!
        assert.ok(history.length <= 61 && history.length >= 30)
        assert.ok(history.every(point => point.time >= Date.now() - 60000 && point.value !== null))
        assert.equal(cpuHistorySegments(history, monitor.state.updatedAt!).length, 1)
        monitor.destroy()
        const count = attempts.length
        t.mock.timers.tick(60000)
        await turn()
        assert.equal(attempts.length, count, 'destroy must leave no polling timer running')
    } finally {
        monitor.destroy()
        t.mock.timers.reset()
    }
})
