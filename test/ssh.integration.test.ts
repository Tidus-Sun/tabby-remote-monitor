import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { once } from 'node:events'
import { execute, ExecClient } from '../src/transport'
import { collectorCommand, COLLECTOR_END } from '../src/collector'
import { parseSnapshot } from '../src/metrics'
import { sample } from './fixtures'

// A disposable loopback SSH server: never opens a user's saved profile or remote server.
const { Server, Client } = require('ssh2')
const hostKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' })

async function withServer (run: (port: number) => Promise<void>): Promise<void> {
    const sockets = new Set<any>()
    const server = new Server({ hostKeys: [hostKey] }, (socket: any) => {
        sockets.add(socket)
        socket.on('close', () => sockets.delete(socket))
        socket.on('error', () => {})
        socket.on('authentication', (context: any) => context.username === 'monitor-test' ? context.accept() : context.reject())
        socket.on('ready', () => socket.on('session', (accept: () => any) => {
            const session = accept()
            session.on('pty', () => assert.fail('monitor must not request a PTY'))
            session.on('shell', () => assert.fail('monitor must not open an interactive shell'))
            session.on('exec', (acceptExec: () => any, rejectExec: () => void, info: { command: string }) => {
                if (info.command === 'deny') { rejectExec(); return }
                const stream = acceptExec()
                stream.on('error', () => {})
                if (info.command === 'stall') return
                if (info.command !== 'fragmented') assert.match(info.command, /__TRM_BEGIN__/)
                stream.stderr.write('test stderr\n')
                const output = Buffer.from(sample())
                if (info.command === 'fragmented') {
                    // Many SSH packets ending immediately, as with individual printf/cat calls.
                    for (let start = 0; start < output.length; start += 16) stream.write(output.subarray(start, start + 16))
                } else {
                    stream.write(output.subarray(0, 73))
                    stream.write(output.subarray(73))
                }
                const complete = (): void => { stream.exit(0); stream.end() }
                if (info.command.includes('read -r trm_ack') || info.command === 'fragmented') {
                    // Like the real collector, keep stdout open until the client confirms receipt.
                    stream.once('end', complete)
                    stream.resume()
                } else complete()
                if (info.command === 'fragmented') {
                    // Model a busy Electron renderer while the native SSH thread queues callbacks.
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
                }
            })
        }))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try { await run(server.address().port) } finally {
        for (const socket of sockets) socket.end()
        await new Promise<void>(resolve => server.close(resolve))
    }
}

async function exercise (client: ExecClient): Promise<void> {
    for (let i = 0; i < 5; i++) {
        const result = await execute(client, collectorCommand(true), 3000, new AbortController().signal, { completionMarker: COLLECTOR_END })
        assert.equal(parseSnapshot(result.stdout).hostname, 'edge-linux')
        assert.match(result.stderr, /test stderr/)
    }
    await assert.rejects(execute(client, 'stall', 50, new AbortController().signal), /超时/)
    await assert.rejects(execute(client, 'deny', 3000, new AbortController().signal))
    // A timeout/denial must leave the shared SSH connection usable.
    const result = await execute(client, collectorCommand(false), 3000, new AbortController().signal, { completionMarker: COLLECTOR_END })
    assert.equal(parseSnapshot(result.stdout).hostname, 'edge-linux')
}

test('actual ssh2 exec channels survive timeout and rejection', { timeout: 15000 }, async () => {
    await withServer(async port => {
        const client = new Client()
        client.on('error', () => {})
        client.connect({ host: '127.0.0.1', port, username: 'monitor-test' })
        await once(client, 'ready')
        try { await exercise(client) } finally { client.end() }
    })
})

test('installed Tabby russh drains fragmented exec output before EOF', { timeout: 60000, skip: !process.env.TABBY_RUSSH }, async () => {
    const russh = require(process.env.TABBY_RUSSH!)
    await withServer(async port => {
        const transport = await russh.SshTransport.newSocket(`127.0.0.1:${port}`)
        const client = await russh.SSHClient.connect(transport, async () => true, { connectionTimeoutSeconds: 3 })
        const authenticated = await client.authenticateNone('monitor-test')
        try {
            for (let i = 0; i < 40; i++) {
                const result = await execute(authenticated, 'fragmented', 3000, new AbortController().signal, { completionMarker: COLLECTOR_END })
                assert.equal(result.stdout, sample(), `fragmented sample ${i + 1} must include the complete frame`)
            }
        } finally { await authenticated.disconnect() }
    })
})

test('installed Tabby russh: actual channels, stderr, timeout and rejection', { timeout: 15000, skip: !process.env.TABBY_RUSSH }, async () => {
    const russh = require(process.env.TABBY_RUSSH!)
    await withServer(async port => {
        const transport = await russh.SshTransport.newSocket(`127.0.0.1:${port}`)
        // Only this ephemeral loopback test server is trusted here. Production inherits Tabby's verification.
        const client = await russh.SSHClient.connect(transport, async () => true, { connectionTimeoutSeconds: 3 })
        const authenticated = await client.authenticateNone('monitor-test')
        assert.ok(authenticated instanceof russh.AuthenticatedSSHClient)
        try { await exercise(authenticated) } finally { await authenticated.disconnect() }
    })
})
