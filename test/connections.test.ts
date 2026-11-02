import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseConnections } from '../src/connections'
import { parseSnapshot } from '../src/metrics'
import { sample } from './fixtures'

test('TCP totals include all states and IPv4/IPv6 endpoints without DNS interpretation', () => {
    const connections = parseSnapshot(sample()).connections!
    assert.equal(connections.total, 4)
    assert.equal(connections.established, 2)
    assert.equal(connections.states.LISTEN, 1)
    assert.equal(connections.states.TIME_WAIT, 1)
    assert.equal(connections.entries[0].remote, '192.0.2.20:52048')
    assert.equal(connections.entries[1].local, '[2001:db8::1]:443')
    assert.equal(connections.entries[2].remote, '0.0.0.0:*')
})

test('missing, failed, malformed and inconsistent socket data differs from zero connections', () => {
    assert.equal(parseConnections(['OK'])?.total, 0)
    for (const lines of [undefined, [], ['FAILED'], ['COUNT ESTABLISHED 1'],
        ['COUNT ESTABLISHED 1', 'OK'], ['ROW ESTABLISHED a:1 b:2', 'OK'],
        ['COUNT LISTEN 1', 'ROW ESTABLISHED a:1 b:2', 'OK'],
        ['COUNT LISTEN 1', 'COUNT LISTEN 1', 'ROW LISTEN a:1 b:2', 'OK'],
        ['COUNT ESTABLISHED 9007199254740992', 'OK'],
        ['COUNT ESTABLISHED 1', 'ROW ESTABLISHED broken b:2', 'OK']]) {
        assert.equal(parseConnections(lines), undefined)
    }
})
