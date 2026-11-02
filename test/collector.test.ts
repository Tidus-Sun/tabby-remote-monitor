import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer, createConnection } from 'node:net'
import { once } from 'node:events'
import { collectorCommand } from '../src/collector'
import { parseSnapshot } from '../src/metrics'
import { sample } from './fixtures'

function defaultShell (): string | undefined {
    if (process.platform !== 'win32') return '/bin/sh'
    const gitPaths = spawnSync('where.exe', ['git'], { encoding: 'utf8', windowsHide: true }).stdout?.trim().split(/\r?\n/) ?? []
    return gitPaths.map(git => path.resolve(path.dirname(git), '../bin/bash.exe')).find(candidate => existsSync(candidate))
}
const shell = process.env.POSIX_SHELL || defaultShell()

test('Linux collector reads live proc counters and a loopback TCP connection', { skip: process.platform !== 'linux', timeout: 15000 }, async () => {
    const server = createServer()
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const accepted = once(server, 'connection')
    const client = createConnection({ host: '127.0.0.1', port: address.port })
    const connected = once(client, 'connect')
    const [peer] = await accepted
    try {
        await connected
        const result = spawnSync('/bin/sh', ['-c', collectorCommand(false)], { encoding: 'utf8', input: '', timeout: 10000 })
        assert.ifError(result.error)
        assert.equal(result.status, 0, result.stderr)
        const snapshot = parseSnapshot(result.stdout)
        assert.ok(snapshot.uptime > 0)
        assert.ok(snapshot.bootTime && snapshot.bootTime <= Date.now())
        assert.ok(snapshot.memory.total > 0)
        assert.ok(snapshot.connections, 'Linux CI must provide ss or netstat to validate actual socket output')
        const endpoint = `127.0.0.1:${address.port}`
        assert.ok(snapshot.connections.entries.some(entry => entry.state === 'ESTABLISHED' && (entry.local === endpoint || entry.remote === endpoint)))
        assert.ok(snapshot.connections.states.LISTEN > 0)
    } finally {
        client.destroy()
        peer.destroy()
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
})

test('real POSIX shell executes the collector against proc fixtures, with and without df', { skip: !shell }, async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'tabby-monitor-'))
    const bin = path.join(temp, 'bin')
    const proc = path.join(temp, 'proc fixture') // Explicitly exercises spaces in fixture paths.
    try {
        await mkdir(bin)
        await mkdir(path.join(proc, 'sys/kernel'), { recursive: true })
        await mkdir(path.join(proc, 'net'))
        const sections = Object.fromEntries(sample().split(/__TRM_([A-Z]+)__\n/).slice(1).reduce<string[][]>((entries, value, index, values) => {
            if (index % 2 === 0) entries.push([value, values[index + 1]])
            return entries
        }, []))
        for (const [section, file] of Object.entries({ HOST: 'sys/kernel/hostname', CPU: 'stat', UPTIME: 'uptime', MEM: 'meminfo', NET: 'net/dev', ROUTE: 'net/route', LOAD: 'loadavg', MOUNTS: 'mounts', DISK: 'df.txt' })) {
            await writeFile(path.join(proc, file), sections[section] + (section === 'CPU' ? 'btime 1793000000\n' : ''))
        }
        const commands = {
            uname: '#!/bin/sh\nprintf "%s\\n" "${TRM_UNAME:-Linux}"\n',
            df: '#!/bin/sh\n[ "$TRM_DF_FAIL" = 1 ] && exit 1\nexec cat "$TRM_PROC/df.txt"\n',
            ss: '#!/bin/sh\n[ "$TRM_SOCKET_FAIL" = 1 ] && exit 1\ncat "$TRM_PROC/ss.txt"\n[ "$TRM_SOCKET_FAIL" = partial ] && exit 1\nexit 0\n',
            netstat: '#!/bin/sh\n[ "$1" = -antW ] || exit 1\n[ "$TRM_SOCKET_FAIL" = 1 ] && exit 1\nexec cat "$TRM_PROC/netstat.txt"\n',
        }
        await writeFile(path.join(proc, 'ss.txt'), 'LISTEN 0 128 0.0.0.0:22 0.0.0.0:*\nESTAB 0 0 192.0.2.10:22 192.0.2.20:52048\nESTAB 0 0 [2001:db8::1]:443 [2001:db8::2]:53000\nTIME-WAIT 0 0 192.0.2.10:33000 198.51.100.10:443\n')
        await writeFile(path.join(proc, 'netstat.txt'), 'Active Internet connections (servers and established)\nProto Recv-Q Send-Q Local Address Foreign Address State\ntcp 0 0 0.0.0.0:22 0.0.0.0:* LISTEN\ntcp6 0 0 2001:db8::1:443 2001:db8::2:53000 ESTABLISHED\n')
        for (const [name, content] of Object.entries(commands)) await writeFile(path.join(bin, name), content, { mode: 0o755 })
        const run = (disk: boolean, environment: Record<string, string> = {}): string => {
            const posixBin = bin.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`)
            // Redirect every proc path, including the shell's readability check, to
            // the fixture. macOS has no /proc; cat/head remain real shell commands.
            let command = collectorCommand(disk, environment.TRM_NO_CONNECTIONS !== '1').replace(/\/proc\//g, '"$TRM_PROC"/')
            if (environment.TRM_SOURCE === 'netstat') command = command.replace('command -v ss >/dev/null 2>&1', 'false')
            if (environment.TRM_SOURCE === 'missing') command = command.replace(/command -v (ss|netstat) >\/dev\/null 2>&1/g, 'false')
            const result = spawnSync(shell!, ['-c', 'export PATH="$TRM_BIN:$PATH"\n' + command], { encoding: 'utf8', timeout: 5000,
                env: { ...process.env, TRM_BIN: posixBin, TRM_PROC: proc.replace(/\\/g, '/'), ...environment } })
            assert.ifError(result.error)
            assert.equal(result.status, 0, result.stderr)
            return result.stdout
        }
        const full = parseSnapshot(run(true))
        assert.equal(full.hostname, 'edge-linux')
        assert.equal(full.bootTime, 1793000000000)
        assert.equal(full.connections?.established, 2)
        assert.equal(full.connections?.total, 4)
        assert.equal(full.connections?.states.TIME_WAIT, 1)
        assert.equal(full.connections?.entries[0].state, 'ESTABLISHED')
        assert.equal(full.connections?.entries[1].remote, '[2001:db8::2]:53000')
        assert.equal(parseSnapshot(run(false, { TRM_SOURCE: 'netstat' })).connections?.established, 1)
        assert.equal(parseSnapshot(run(false, { TRM_SOURCE: 'netstat' })).connections?.entries[0].local, '[2001:db8::1]:443')
        for (const environment of [{ TRM_SOCKET_FAIL: '1' }, { TRM_SOCKET_FAIL: 'partial' }, { TRM_SOURCE: 'missing' }] as Record<string, string>[]) {
            const snapshot = parseSnapshot(run(false, environment))
            assert.equal(snapshot.connections, undefined, 'optional socket failures must not abort core metrics or claim zero connections')
            assert.equal(snapshot.memory.percent, 60)
        }
        assert.doesNotMatch(run(false, { TRM_NO_CONNECTIONS: '1' }), /__TRM_CONNECTIONS__/)
        await writeFile(path.join(proc, 'ss.txt'), 'LISTEN 0 128 *:22 *:*\n'.repeat(150) + 'ESTAB 0 0 192.0.2.10:22 192.0.2.20:52048\n'.repeat(120))
        const large = parseSnapshot(run(false)).connections!
        assert.equal(large.total, 270)
        assert.equal(large.established, 120)
        assert.equal(large.states.LISTEN, 150)
        assert.equal(large.entries.length, 100)
        assert.ok(large.entries.every(entry => entry.state === 'ESTABLISHED'))
        await writeFile(path.join(proc, 'ss.txt'), '')
        assert.equal(parseSnapshot(run(false)).connections?.total, 0)
        await writeFile(path.join(proc, 'ss.txt'), 'unrecognized output\n')
        assert.equal(parseSnapshot(run(false)).connections, undefined)
        assert.equal(full.diskError, false, 'df fixture must produce valid disk output')
        assert.deepEqual(full.disks?.map(disk => disk.mount), ['/', '/mnt/my data', '/run'])
        assert.equal(full.networks.eth0.transmitted, 2000)
        assert.equal(parseSnapshot(run(false)).disks, undefined)
        assert.equal(parseSnapshot(run(true, { TRM_DF_FAIL: '1' })).diskError, true)
        assert.match(run(false, { TRM_UNAME: 'Darwin' }), /__TRM_UNSUPPORTED__/)
        assert.match(run(false, { TRM_PROC: path.join(temp, 'missing proc').replace(/\\/g, '/') }), /__TRM_UNSUPPORTED__/)
    } finally {
        // Only this mkdtemp-created test directory is removed.
        const resolved = path.resolve(temp)
        assert.equal(path.dirname(resolved), path.resolve(tmpdir()))
        assert.ok(path.basename(resolved).startsWith('tabby-monitor-'))
        await rm(resolved, { recursive: true, force: true })
    }
})
