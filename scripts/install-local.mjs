import { cp, mkdir, readFile, access, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
if (metadata.name !== 'tabby-remote-monitor') throw new Error('Unexpected plugin package')
await access(path.join(root, 'dist', 'index.js'))
const argument = process.argv.indexOf('--plugins-dir')
if (argument >= 0 && !process.argv[argument + 1]) throw new Error('--plugins-dir requires a directory')
const defaultDirectory = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'tabby', 'plugins')
    : process.platform === 'darwin'
        ? path.join(homedir(), 'Library', 'Application Support', 'tabby', 'plugins')
        : path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'tabby', 'plugins')
const plugins = path.resolve(argument >= 0 ? process.argv[argument + 1] : defaultDirectory)
const target = path.join(plugins, 'node_modules', metadata.name)
const manifestPath = path.join(plugins, 'package.json')
let manifestText
try { manifestText = await readFile(manifestPath, 'utf8') } catch (error) {
    if (error.code !== 'ENOENT') throw error
}
const manifest = manifestText ? JSON.parse(manifestText.replace(/^\uFEFF/, '')) : {}
const id = `${metadata.name}-${randomUUID()}`
// Keep the source outside node_modules: npm/Tabby's Arborist may prune that directory.
// A unique path also invalidates stale lockfile entries when reinstalling the same version.
const localRelative = `remote-monitor-local/${id}`
const localSource = path.join(plugins, localRelative)
const backup = path.join(plugins, 'remote-monitor-backups', id)
const runtimeMetadata = Object.fromEntries(
    ['name', 'version', 'description', 'keywords', 'main', 'author', 'license', 'engines']
        .filter(key => metadata[key] !== undefined).map(key => [key, metadata[key]]),
)
await mkdir(localSource, { recursive: true })
await writeFile(path.join(localSource, 'package.json'), JSON.stringify(runtimeMetadata, null, 2) + '\n')
for (const file of ['dist', 'README.md', 'LICENSE']) {
    await cp(path.join(root, file), path.join(localSource, file), { recursive: true })
}
await mkdir(backup, { recursive: true })
if (manifestText !== undefined) await writeFile(path.join(backup, 'plugins-package.json'), manifestText)
await mkdir(path.dirname(target), { recursive: true })
// Backups live outside node_modules so Tabby cannot load the previous copy as a second plugin.
try {
    await rename(target, path.join(backup, metadata.name))
    console.log(`Previous installation backed up: ${backup}`)
} catch (error) {
    if (error.code !== 'ENOENT') throw error
}
await cp(localSource, target, { recursive: true })
manifest.dependencies = { ...manifest.dependencies, [metadata.name]: `file:${localRelative}` }
const stagedManifest = path.join(plugins, `.${id}.json`)
await writeFile(stagedManifest, JSON.stringify(manifest, null, 2) + '\n')
await rename(stagedManifest, manifestPath)
// Leave other packages and the lockfile alone. Arborist reconciles the new file:
// dependency from package.json the next time Tabby installs or updates a plugin.
console.log(`Installed ${metadata.name} ${metadata.version} at ${target}`)
console.log(`Registered persistent local dependency: ${localSource}`)
console.log('Restart Tabby after saving your terminal work, then open a Linux SSH connection.')
