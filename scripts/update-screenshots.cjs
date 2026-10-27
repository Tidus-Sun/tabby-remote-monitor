// Run pnpm test:browser first. Only known fixture screenshots are published.
const fs = require('node:fs/promises')
const path = require('node:path')

async function main () {
    const root = path.resolve(__dirname, '..')
    const destination = path.join(root, 'docs', 'images')
    const screenshots = {
        'preview.png': 'disk-details.png',
        'preview-cpu.png': 'cpu-history.png',
        'preview-memory.png': 'memory-details.png',
        'preview-network.png': 'network-details.png',
        'preview-settings-appearance.png': 'appearance-dark.png',
        'preview-settings-light.png': 'appearance-light.png',
    }
    // Check every source before changing tracked screenshots.
    await Promise.all(Object.keys(screenshots).map(name => fs.access(path.join(root, '.artifacts', name))))
    await fs.mkdir(destination, { recursive: true })
    for (const [source, name] of Object.entries(screenshots)) {
        await fs.copyFile(path.join(root, '.artifacts', source), path.join(destination, name))
    }
    console.log(`Updated ${Object.keys(screenshots).length} fixture screenshots in docs/images.`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
