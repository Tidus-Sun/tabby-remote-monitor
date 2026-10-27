import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const exec = promisify(execFile)
const workspace = path.resolve(__dirname, '..')
const enginePath = process.env.TABBY_ARBORIST_MODULE || require.resolve('@npmcli/arborist')
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'))
const save = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2))

for (const installer of ['node', 'powershell']) {
    test(`${installer} local install survives Tabby's dependency cleanup and a same-version reinstall`, {
        skip: installer === 'powershell' && process.platform !== 'win32' ? 'Windows installer' : false,
    }, async () => {
        const Arborist = require(enginePath!)
        const artifacts = path.join(workspace, '.artifacts')
        await mkdir(artifacts, { recursive: true })
        const temporary = await mkdtemp(path.join(artifacts, 'installer regression '))
        try {
            const source = path.join(temporary, 'checkout')
            const plugins = path.join(temporary, 'plugins')
            const peer = path.join(plugins, 'peer-source')
            const installed = path.join(plugins, 'node_modules', 'tabby-remote-monitor')
            await mkdir(path.join(source, 'dist'), { recursive: true })
            await mkdir(peer, { recursive: true })
            await cp(path.join(workspace, 'scripts'), path.join(source, 'scripts'), { recursive: true })
            await save(path.join(source, 'package.json'), {
                name: 'tabby-remote-monitor', version: '0.1.4', main: 'dist/index.js', author: 'Test',
                devDependencies: { 'must-never-fetch-build-dependencies': '1.0.0' },
                scripts: { install: 'exit 1' },
            })
            await writeFile(path.join(source, 'README.md'), 'Test documentation')
            await writeFile(path.join(source, 'LICENSE'), 'Test license')
            await writeFile(path.join(source, 'dist', 'index.js'), 'module.exports = 1')
            await save(path.join(peer, 'package.json'), { name: 'tabby-test-peer', version: '1.0.0' })
            const original = {
                name: 'plugins', private: true, custom: { label: '保留其他设置' },
                dependencies: { 'tabby-test-peer': 'file:peer-source' },
            }
            await save(path.join(plugins, 'package.json'), original)
            const reify = () => new Arborist({
                path: plugins, save: false, audit: false, fund: false, offline: true,
            }).reify({ add: ['tabby-test-peer@file:peer-source'] })

            // Reproduce the old copy-only installation disappearing during a plugin update.
            await mkdir(installed, { recursive: true })
            await save(path.join(installed, 'package.json'), { name: 'tabby-remote-monitor', version: '0.1.3' })
            await reify()
            await assert.rejects(readFile(path.join(installed, 'package.json')), { code: 'ENOENT' })

            const runInstaller = () => installer === 'node'
                ? exec(process.execPath, [path.join(source, 'scripts', 'install-local.mjs'), '--plugins-dir', plugins])
                : exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                    path.join(source, 'scripts', 'install-local.ps1'), '-PluginsDir', plugins], { windowsHide: true })
            await runInstaller()
            const registered = await json(path.join(plugins, 'package.json'))
            assert.deepEqual(registered.custom, original.custom)
            assert.equal(registered.private, true)
            assert.equal(registered.dependencies['tabby-test-peer'], original.dependencies['tabby-test-peer'])
            assert.match(registered.dependencies['tabby-remote-monitor'], /^file:remote-monitor-local\//)
            const installedMetadata = await json(path.join(installed, 'package.json'))
            assert.equal(installedMetadata.author, 'Test')
            assert.equal(installedMetadata.devDependencies, undefined)
            assert.equal(installedMetadata.scripts, undefined)
            await reify()
            assert.equal(await readFile(path.join(installed, 'dist', 'index.js'), 'utf8'), 'module.exports = 1')

            // Reinstall after Arborist has made a link; verify a stale lock cannot restore old code.
            await writeFile(path.join(source, 'dist', 'index.js'), 'module.exports = 2')
            await runInstaller()
            await reify()
            assert.equal(await readFile(path.join(installed, 'dist', 'index.js'), 'utf8'), 'module.exports = 2')
            assert.equal((await json(path.join(plugins, 'node_modules', 'tabby-test-peer', 'package.json'))).version, '1.0.0')
        } finally {
            // Only remove the isolated fixture created inside this workspace.
            assert.equal(path.dirname(temporary), artifacts)
            await rm(temporary, { recursive: true, force: true })
        }
    })
}
