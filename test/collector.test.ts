import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { collectorCommand } from '../src/collector'
import { parseSnapshot } from '../src/metrics'
import { sample } from './fixtures'

function defaultShell (): string | undefined {
    if (process.platform !== 'win32') return '/bin/sh'
    const gitPaths = spawnSync('where.exe', ['git'], { encoding: 'utf8', windowsHide: true }).stdout?.trim().split(/\r?\n/) ?? []
    return gitPaths.map(git => path.resolve(path.dirname(git), '../bin/bash.exe')).find(candidate => existsSync(candidate))
}
const shell = process.env.POSIX_SHELL || defaultShell()

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
            await writeFile(path.join(proc, file), sections[section])
        }
        const commands = {
            uname: '#!/bin/sh\nprintf "%s\\n" "${TRM_UNAME:-Linux}"\n',
            df: '#!/bin/sh\n[ "$TRM_DF_FAIL" = 1 ] && exit 1\nexec cat "$TRM_PROC/df.txt"\n',
        }
        for (const [name, content] of Object.entries(commands)) await writeFile(path.join(bin, name), content, { mode: 0o755 })
        const run = (disk: boolean, environment: Record<string, string> = {}): string => {
            const posixBin = bin.replace(/\\/g, '/').replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`)
            // Redirect every proc path, including the shell's readability check, to
            // the fixture. macOS has no /proc; cat/head remain real shell commands.
            const command = collectorCommand(disk).replace(/\/proc\//g, '"$TRM_PROC"/')
            const result = spawnSync(shell!, ['-c', 'export PATH="$TRM_BIN:$PATH"\n' + command], { encoding: 'utf8', timeout: 5000,
                env: { ...process.env, TRM_BIN: posixBin, TRM_PROC: proc.replace(/\\/g, '/'), ...environment } })
            assert.ifError(result.error)
            assert.equal(result.status, 0, result.stderr)
            return result.stdout
        }
        const full = parseSnapshot(run(true))
        assert.equal(full.hostname, 'edge-linux')
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
