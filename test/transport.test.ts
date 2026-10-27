import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Subject } from 'rxjs'
import { execute, RusshChannel, RusshClient, SSH2Channel, IncompleteOutputError } from '../src/transport'
import { COLLECTOR_END } from '../src/collector'
import { sample } from './fixtures'

function mockRussh (): { channel: RusshChannel; client: RusshClient; data: Subject<Uint8Array>; eof: Subject<void>; closed: Subject<void>; closeCount: () => number } {
    const data = new Subject<Uint8Array>()
    const eof = new Subject<void>()
    const closed = new Subject<void>()
    let count = 0
    const channel: RusshChannel = { data$: data, eof$: eof, closed$: closed, requestExec: async () => {}, close: async () => { count++ } }
    return { channel, client: { openSessionChannel: async () => ({}), activateChannel: async () => channel }, data, eof, closed, closeCount: () => count }
}
const nextTurn = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

test('russh subscribes before exec, keeps split UTF-8 and closes only its own channel', async () => {
    const mock = mockRussh()
    mock.channel.requestExec = async command => {
        assert.equal(command, 'test')
        const bytes = Buffer.from('主机名')
        mock.data.next(bytes.subarray(0, 2))
        mock.data.next(bytes.subarray(2))
        mock.eof.next()
    }
    assert.equal((await execute(mock.client, 'test', 1000, new AbortController().signal)).stdout, '主机名')
    assert.equal(mock.closeCount(), 1)
    assert.equal(mock.data.observed, false)
})

test('channel close without EOF also completes', async () => {
    const mock = mockRussh()
    mock.channel.requestExec = async () => { mock.data.next(Buffer.from('ok')); mock.closed.next() }
    assert.equal((await execute(mock.client, '', 1000, new AbortController().signal)).stdout, 'ok')
})

test('framed russh output drains late data after EOF and acknowledges only the complete frame', async () => {
    const mock = mockRussh()
    let acknowledgements = 0
    mock.channel.eof = async () => { acknowledgements++; mock.closed.next() }
    const output = Buffer.from(sample())
    mock.channel.requestExec = async () => {
        mock.data.next(output.subarray(0, 73))
        mock.eof.next() // Independent native callbacks can overtake the stdout callback queue.
        await nextTurn()
        assert.equal(mock.data.observed, true, 'do not unsubscribe at the early EOF')
        assert.equal(acknowledgements, 0)
        mock.data.next(output.subarray(73, output.length - 3))
        mock.data.next(output.subarray(output.length - 3))
    }
    const result = await execute(mock.client, 'test', 1000, new AbortController().signal, { completionMarker: COLLECTOR_END })
    assert.equal(result.stdout, sample())
    await nextTurn()
    assert.equal(acknowledgements, 1)
    assert.equal(mock.closeCount(), 1)
    assert.equal(mock.data.observed, false)
})

test('framed exec rejects genuinely truncated output and cancellation still stops draining', async () => {
    const mock = mockRussh()
    let acknowledgements = 0
    mock.channel.eof = async () => { acknowledgements++ }
    mock.channel.requestExec = async () => {
        mock.data.next(Buffer.from('__TRM_BEGIN__\npartial'))
        mock.closed.next()
    }
    await assert.rejects(execute(mock.client, '', 1000, new AbortController().signal, { completionMarker: COLLECTOR_END }), IncompleteOutputError)
    const controller = new AbortController()
    const pending = execute(mock.client, '', 1000, controller.signal, { completionMarker: COLLECTOR_END })
    await nextTurn()
    controller.abort()
    await assert.rejects(pending, /取消/)
    assert.equal(mock.data.observed, false)
    assert.equal(acknowledgements, 0)
    assert.equal(mock.closeCount(), 2)
})

test('framed legacy ssh2 exec closes stdin to release the collector handshake', async () => {
    const active = new EventEmitter() as SSH2Channel
    let ended = 0
    let closed = 0
    active.end = () => { ended++; active.emit('close', 0) }
    active.close = () => { closed++ }
    const client = { exec: (_: string, callback: (error: Error | undefined, channel: SSH2Channel) => void): void => {
        callback(undefined, active)
        active.emit('data', Buffer.from(sample()))
    } }
    const result = await execute(client, '', 1000, new AbortController().signal, { completionMarker: COLLECTOR_END })
    assert.equal(result.stdout, sample())
    await nextTurn()
    assert.equal(ended, 1)
    assert.equal(closed, 1)
})

test('timeout and abort cancel subscriptions without disconnecting the SSH client', async () => {
    const mock = mockRussh()
    await assert.rejects(execute(mock.client, '', 10, new AbortController().signal), /超时/)
    assert.equal(mock.closeCount(), 1)
    const controller = new AbortController()
    const pending = execute(mock.client, '', 1000, controller.signal)
    await nextTurn()
    controller.abort()
    await assert.rejects(pending, /取消/)
    assert.equal(mock.data.observed, false)
    assert.equal(mock.closeCount(), 2)
})

test('channel arriving after an opening timeout is closed and never executes', async () => {
    const mock = mockRussh()
    let release!: (value: unknown) => void
    mock.client.openSessionChannel = () => new Promise(resolve => { release = resolve })
    mock.channel.requestExec = async () => assert.fail('late channel must not execute')
    await assert.rejects(execute(mock.client, '', 10, new AbortController().signal), /超时/)
    release({})
    await nextTurn()
    assert.equal(mock.closeCount(), 1)
})

test('output limits bound memory and request failures clean up', async () => {
    const mock = mockRussh()
    mock.channel.requestExec = async () => { mock.data.next(Buffer.alloc(1024 * 1024 + 1)) }
    await assert.rejects(execute(mock.client, '', 1000, new AbortController().signal), /1 MiB/)
    mock.channel.requestExec = async () => { throw new Error('denied') }
    await assert.rejects(execute(mock.client, '', 1000, new AbortController().signal), /denied/)
    assert.equal(mock.closeCount(), 2)
})

test('legacy ssh2 handles output, nonzero exit and late channel errors', async () => {
    const active = new EventEmitter() as SSH2Channel
    let closes = 0
    active.close = () => { closes++ }
    const client = { exec: (_: string, callback: (error: Error | undefined, channel: SSH2Channel) => void): void => {
        callback(undefined, active)
        active.emit('data', Buffer.from('hello'))
        active.emit('close', 0)
        active.emit('error', new Error('late close'))
    } }
    assert.equal((await execute(client, '', 1000, new AbortController().signal)).stdout, 'hello')
    assert.equal(closes, 1)
    client.exec = (_, callback) => { callback(undefined, active); active.emit('close', 2) }
    await assert.rejects(execute(client, '', 1000, new AbortController().signal), /退出：2/)
})
