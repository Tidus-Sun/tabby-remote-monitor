import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendCPUHistory, cpuHistorySegments } from '../src/history'
import type { CPUHistoryPoint } from '../src/history'

test('CPU history keeps a bounded real-time window and does not duplicate rerenders', () => {
    let history: CPUHistoryPoint[] = []
    for (let i = 0; i <= 100; i++) history = appendCPUHistory(history, i * 1000, i)
    assert.equal(history.length, 61)
    assert.equal(history[0].time, 40000)
    history = appendCPUHistory(history, 100000, 75)
    assert.equal(history.length, 61)
    assert.equal(history[60].value, 75)
    assert.deepEqual(appendCPUHistory(history, 10, null), [{ time: 10, value: null }])
    for (let i = 11; i < 1011; i++) history = appendCPUHistory(history, i, 200)
    assert.equal(history.length, 600)
    assert.equal(history[599].value, 100)
})

test('CPU graph leaves missing samples and outages disconnected, including pauses and resume baselines', () => {
    const history: CPUHistoryPoint[] = [
        { time: 0, value: 15 }, { time: 2000, value: 25 }, { time: 4000, value: null },
        { time: 6000, value: 50 }, { time: 8000, value: 60 },
        { time: 28000, value: null }, { time: 30000, value: 0 }, { time: 32000, value: 100 },
    ]
    assert.deepEqual(cpuHistorySegments(history, 32000).map(segment => segment.map(point => point.value)), [[15, 25], [50, 60], [0, 100]])
    assert.deepEqual(cpuHistorySegments(history, 80000).map(segment => segment.map(point => point.value)), [[0, 100]])
    assert.deepEqual(cpuHistorySegments([{ time: 0, value: null }], 0), [])
})

test('valid CPU samples stay connected when SSH responses are delayed', () => {
    const history: CPUHistoryPoint[] = [
        { time: 0, value: 10 }, { time: 2000, value: 20 },
        { time: 9000, value: 40 }, { time: 16000, value: 30 },
    ]
    assert.deepEqual(cpuHistorySegments(history, 16000), [history])
})
