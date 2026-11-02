import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatUptime } from '../src/uptime'
import { parseSnapshot } from '../src/metrics'
import { sample } from './fixtures'

test('uptime handles minute/hour/day boundaries, long uptimes and invalid samples', () => {
    for (const [seconds, expected] of [[0, '0m'], [59.99, '0m'], [60, '1m'], [3599, '59m'], [3600, '1h 0m'], [86400, '1d 0h 0m'], [86400 * 400 + 3661, '400d 1h 1m']] as const) {
        assert.equal(formatUptime(seconds, 'en'), expected)
    }
    assert.equal(formatUptime(90061.9, 'zh-CN'), '1天 1时 1分')
    assert.equal(formatUptime(90061.9, 'zh-CN', true), '1 天 1 小时 1 分钟 1 秒')
    for (const invalid of [undefined, NaN, Infinity, -1]) assert.equal(formatUptime(invalid, 'en'), '—')
})

test('boot time comes from the remote kernel and missing/invalid values stay unavailable', () => {
    assert.equal(parseSnapshot(sample()).bootTime, 1793000000000)
    for (const invalid of ['', 'garbage', '-1', '0', '8640000000001']) {
        assert.equal(parseSnapshot(sample().replace('1793000000', invalid)).bootTime, undefined)
    }
})
