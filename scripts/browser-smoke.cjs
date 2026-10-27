// Optional visual QA: PLAYWRIGHT_MODULE can point to an existing Playwright installation.
const path = require('node:path')
const fs = require('node:fs/promises')
const assert = require('node:assert/strict')
const webpack = require('webpack')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(__dirname, '..')

async function main () {
    const output = path.join(root, '.artifacts')
    await fs.mkdir(output, { recursive: true })
    await new Promise((resolve, reject) => webpack({
        mode: 'development', target: 'web', entry: path.join(root, 'test/preview.ts'),
        output: { path: output, filename: 'preview.js' },
        resolve: { extensions: ['.ts', '.js'] },
        module: { rules: [{ test: /\.ts$/, loader: 'ts-loader' }, { test: /\.css$/, type: 'asset/source' }] },
    }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()))
    const html = `<!doctype html><meta charset="utf-8"><title>Remote Monitor — fixture preview</title>
    <style>*{box-sizing:border-box}body{margin:0;background:#0d111a;color:#d7dfed;font:14px 'Segoe UI',sans-serif;padding:42px 40px}h1{font-size:22px;font-weight:600;margin:0 0 8px}p{color:#78889e;margin:0 0 26px;font-size:12px}.frame{border:1px solid #303a4c;border-radius:10px;overflow:hidden;box-shadow:0 20px 70px #0003}.tabs{display:flex;height:43px;align-items:stretch;background:#1a2230;padding-left:14px;gap:3px;font-size:12px}.tab{padding:13px 18px;color:#8e9cb1}.active{background:#101722;color:#dbe5f7;border-top:2px solid #74a5fa;padding-top:11px}#terminal{display:flex;flex-direction:column;position:relative;height:510px;background:#101722}.content{flex:1;min-height:0;padding:24px 28px;font:13px/1.9 Consolas,monospace;color:#9ba9be;overflow:hidden;white-space:pre}.green{color:#62d8ad}.blue{color:#84aef4}.muted{color:#65758f}.cursor{background:#86b0fa;display:inline-block;width:8px;height:15px;vertical-align:middle}</style>
    <h1>Tabby Remote Monitor</h1><p>界面预览 · 示例数据 · SSH 终端底部的 Linux 系统监控</p>
    <div class="frame"><div class="tabs"><div class="tab active">◉ &nbsp; production-01 &nbsp; ×</div><div class="tab">staging-02</div><div class="tab">＋</div></div><div id="terminal"><div class="content"><span class="muted">Connected to production-01 via SSH</span>

<span class="green">ops@production-01</span>:<span class="blue">~</span>$ uname -sr
Linux 6.8.0-55-generic

<span class="green">ops@production-01</span>:<span class="blue">~</span>$ <span class="cursor"></span></div></div></div><script src="preview.js"></script>`
    await fs.writeFile(path.join(output, 'preview.html'), html)
    const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
    try {
        const page = await browser.newPage({ viewport: { width: 1240, height: 740 }, deviceScaleFactor: 1.5 })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(require('node:url').pathToFileURL(path.join(output, 'preview.html')).href)
        const mountTrigger = mount => page.getByRole('button', { name: `查看挂载点 ${mount} 的磁盘和系统信息`, exact: true })
        const diskTrigger = mountTrigger('/')
        const networkTrigger = page.getByRole('button', { name: '查看所有网络设备的流量总量' })
        const cpuTrigger = page.getByRole('button', { name: '查看 CPU 使用率历史' })
        const memoryTrigger = page.getByRole('button', { name: '查看内存使用详情' })
        const panel = page.locator('.tabby-remote-monitor .panel')
        const assertAnchored = async kind => {
            const rects = await page.evaluate(kind => {
                const host = document.querySelector('.tabby-remote-monitor')
                return { host: host.getBoundingClientRect().toJSON(),
                    anchor: host.shadowRoot.querySelector(`.${kind}[aria-expanded="true"]`).getBoundingClientRect().toJSON(),
                    panel: host.shadowRoot.querySelector('.panel').getBoundingClientRect().toJSON() }
            }, kind)
            const expectedLeft = Math.max(rects.host.left, Math.min(rects.host.right - rects.panel.width, (rects.anchor.left + rects.anchor.right - rects.panel.width) / 2))
            assert.ok(Math.abs(rects.panel.left - expectedLeft) <= 2, `${kind} panel must follow its label, clamped to the pane edges`)
            assert.ok(rects.panel.bottom < rects.anchor.top && rects.anchor.top - rects.panel.bottom <= 8, `${kind} panel must sit just above its label`)
            assert.ok(rects.panel.left >= rects.host.left - 1 && rects.panel.right <= rects.host.right + 1)
        }
        const initialHistory = await page.evaluate(() => window.monitorPreview.state.cpuHistory)
        await page.evaluate(() => {
            const { bar, options } = window.monitorPreview
            bar.configure({ ...options, language: 'en' }, 'zh-CN')
        })
        assert.equal(await page.locator('.tabby-remote-monitor').getAttribute('lang'), 'en')
        for (const [kind, title] of [['disk', 'Disk and system information'], ['memory', 'Memory usage'], ['network', 'Network traffic totals'], ['cpu', 'CPU usage']]) {
            await page.locator(`.tabby-remote-monitor .${kind}.details-trigger`).first().hover()
            await assertAnchored(kind)
            assert.equal(await panel.locator('.panel-title').innerText(), title)
            assert.doesNotMatch(await panel.innerText(), /\p{Script=Han}/u)
            const labels = await page.evaluate(() => [...document.querySelector('.tabby-remote-monitor').shadowRoot.querySelectorAll('[aria-label], [title]')].map(node => [node.getAttribute('aria-label'), node.getAttribute('title')]).flat().join(' '))
            assert.doesNotMatch(labels, /\p{Script=Han}/u, 'accessible labels and tooltips also switch languages')
            await page.screenshot({ path: path.join(output, `preview-${kind}-en.png`), fullPage: true })
        }
        await page.setViewportSize({ width: 460, height: 740 })
        for (const kind of ['disk', 'memory', 'network', 'cpu']) {
            await page.locator(`.tabby-remote-monitor .${kind}.details-trigger`).first().hover()
            await assertAnchored(kind)
            assert.equal(await panel.evaluate(node => node.scrollWidth > node.clientWidth), false, `English ${kind} panel fits narrow panes`)
        }
        await page.locator('.disk.details-trigger').first().focus()
        await page.locator('h1').hover()
        await panel.locator('.table-scroll').focus()
        const diskScroll = await panel.locator('.table-scroll').evaluate(node => { node.scrollLeft = 180; return node.scrollLeft })
        assert.ok(diskScroll > 0, 'the narrow disk table must be horizontally scrollable')
        for (const operation of ['sample', 'appearance', 'language']) {
            await page.evaluate(operation => {
                const { bar, state, options } = window.monitorPreview
                if (operation === 'sample') bar.update(state)
                else bar.configure({ ...options, ...(operation === 'appearance' ? { backgroundColor: '#102a32' } : { language: 'zh-CN' }) })
            }, operation)
            const reading = await panel.locator('.table-scroll').evaluate(node => ({ scroll: node.scrollLeft, focused: node.getRootNode().activeElement === node }))
            assert.equal(reading.scroll, diskScroll, `${operation} must preserve the disk table's horizontal position`)
            assert.equal(reading.focused, true, `${operation} must preserve keyboard focus in the table`)
        }
        await page.keyboard.press('ArrowRight')
        await page.waitForFunction(previous => document.querySelector('.tabby-remote-monitor').shadowRoot.querySelector('.table-scroll').scrollLeft > previous, diskScroll)
        await page.keyboard.press('Escape')
        assert.equal(await panel.isHidden(), true, 'Escape still dismisses the panel after a focused table update')
        assert.equal(await page.locator('.disk.details-trigger').first().evaluate(node => node.getRootNode().activeElement === node), true)
        await page.locator('.memory.details-trigger').focus()
        await page.locator('h1').hover()
        await page.evaluate(() => {
            const { bar, options } = window.monitorPreview
            bar.configure(options, 'zh-CN')
        })
        assert.equal(await panel.locator('.panel-title').innerText(), '内存使用详情', 'an open panel follows Tabby immediately')
        await page.evaluate(() => {
            const { bar, options } = window.monitorPreview
            bar.configure(options, 'en-US')
        })
        assert.equal(await panel.locator('.panel-title').innerText(), 'Memory usage')
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.status = 'error'
            state.messageKey = 'error.timeout'
            bar.update(state)
        })
        assert.match(await panel.innerText(), /Collection timed out; retrying automatically · Previous sample shown below/)
        await page.evaluate(() => {
            const { bar, options } = window.monitorPreview
            bar.configure({ ...options, language: 'zh-CN' }, 'en-US')
        })
        assert.match(await panel.innerText(), /采集超时，稍后自动重试/)
        await page.evaluate(() => {
            const { bar, state, options } = window.monitorPreview
            state.status = 'live'
            state.messageKey = 'status.live'
            bar.configure(options, 'zh-CN')
        })
        assert.deepEqual(await page.evaluate(() => window.monitorPreview.state.cpuHistory), initialHistory, 'switching language preserves CPU history')
        await page.keyboard.press('Escape')
        await page.setViewportSize({ width: 1240, height: 740 })
        await page.locator('.bar').evaluate(node => { node.scrollLeft = 0 })
        await diskTrigger.hover()
        await page.getByRole('cell', { name: '/mnt/backups' }).waitFor()
        await assertAnchored('disk')
        assert.doesNotMatch(await panel.innerText(), /网络|接收|发送/, 'disk details must not contain network information')
        assert.deepEqual(await panel.getByRole('columnheader').allTextContents(), ['挂载点', '设备', '文件系统', '已用 / 总量', '使用率'])
        const diskLayout = await panel.evaluate(node => {
            const rows = [...node.querySelectorAll('tbody tr')]
            return {
                heights: rows.map(row => row.getBoundingClientRect().height),
                columns: rows.map(row => [...row.cells].map(cell => cell.getBoundingClientRect().left)),
                overflows: [...node.querySelectorAll('tbody .size')].some(cell => cell.scrollWidth > cell.clientWidth),
            }
        })
        assert.deepEqual(diskLayout.columns[0], diskLayout.columns[1], 'mounts, devices, filesystem types and numbers must share column positions')
        assert.ok(diskLayout.heights.every(height => Math.abs(height - 27) <= 1), 'disk rows should stay compact and uniform')
        assert.equal(diskLayout.overflows, false, 'capacity must be fully visible at normal width')
        assert.equal(await page.locator('.tabby-remote-monitor .metric > svg.icon').count(), 11)
        assert.deepEqual(await page.locator('.disk-mount').allTextContents(), ['/', '/data', '/mnt/backups'])
        assert.deepEqual(await page.locator('.disk-value').allTextContents(), ['46%', '85%', '27%'])
        const labels = await page.locator('.tabby-remote-monitor .bar').innerText()
        assert.ok(!/CPU|MEM|DISK/.test(labels), 'status labels use SVG icons instead of text')
        await page.screenshot({ path: path.join(output, 'preview.png'), fullPage: true })
        const diskBox = await diskTrigger.boundingBox()
        await page.mouse.move(diskBox.x + diskBox.width / 2, diskBox.y - 3)
        await page.waitForTimeout(80) // Crossing the gap must not dismiss the hover panel.
        await page.locator('.panel-title').hover()
        await page.waitForTimeout(250)
        assert.equal(await panel.isVisible(), true)
        await page.locator('h1').hover()
        await panel.waitFor({ state: 'hidden' })
        const originalDisks = await page.evaluate(() => window.monitorPreview.state.metrics.disks)
        for (const mount of ['/data', '/mnt/backups']) {
            await mountTrigger(mount).hover()
            await assertAnchored('disk')
            assert.equal(await panel.locator('.disk-table tbody tr').count(), 3, 'each mount opens the complete disk list')
            assert.equal(await diskTrigger.getAttribute('aria-expanded'), 'false')
            assert.equal(await page.locator('.disk[aria-expanded="true"]').count(), 1)
        }
        await mountTrigger('/data').focus()
        await page.locator('h1').hover()
        assert.equal(await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            const root = bar.element.shadowRoot
            const focused = root.activeElement
            state.metrics.disks.find(disk => disk.mount === '/data').percent = 86
            state.metrics.disks.push({ ...state.metrics.disks[0], mount: '/run', filesystem: 'tmpfs' })
            bar.update(state)
            return root.activeElement === focused && focused.isConnected
        }), true, 'sampling updates retain the focused mount button')
        assert.equal(await mountTrigger('/data').locator('.disk-value').innerText(), '86%')
        assert.equal(await mountTrigger('/run').count(), 0, 'virtual mounts follow the existing filter')
        await page.evaluate(() => {
            const { bar, options } = window.monitorPreview
            bar.configure({ ...options, showVirtualFilesystems: true })
        })
        assert.equal(await mountTrigger('/run').count(), 1)
        await page.keyboard.press('Escape')
        assert.equal(await mountTrigger('/data').evaluate(node => node.getRootNode().activeElement === node), true, 'Escape returns focus to the actual mount')
        assert.equal(await panel.isVisible(), false)
        await mountTrigger('/data').click()
        await page.locator('h1').hover()
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.metrics.disks = state.metrics.disks.filter(disk => disk.mount !== '/data')
            bar.update(state)
        })
        assert.equal(await mountTrigger('/data').count(), 0)
        assert.equal(await panel.isVisible(), false, 'removing the active mount closes its popup')
        await diskTrigger.focus()
        await page.evaluate(() => {
            const { bar, options } = window.monitorPreview
            bar.configure({ ...options, showDisks: false })
        })
        assert.equal(await page.locator('.disk:visible').count(), 0, 'disk visibility applies to every mount')
        assert.equal(await panel.isVisible(), false)
        await page.evaluate(disks => {
            const { bar, state, options } = window.monitorPreview
            state.metrics.disks = disks
            bar.configure(options)
        }, originalDisks)
        assert.equal(await memoryTrigger.locator('.value').innerText(), '6.4 GiB / 16.0 GiB')
        assert.doesNotMatch(await memoryTrigger.innerText(), /%/, 'memory label must show capacity instead of percentage')
        await memoryTrigger.hover()
        await panel.getByText('内存使用详情', { exact: true }).waitFor()
        await assertAnchored('memory')
        const memoryRow = label => panel.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) }).getByRole('cell')
        assert.equal(await memoryRow('可用内存').innerText(), '9.6 GiB')
        assert.equal(await memoryRow('文件缓存').innerText(), '3.5 GiB')
        assert.equal(await memoryRow('Swap 已用 / 总量').innerText(), '128 MiB / 2.0 GiB')
        const memoryHeights = await panel.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))
        assert.ok(memoryHeights.every(height => Math.abs(height - diskLayout.heights[0]) <= 1), 'memory and disk row heights must match')
        assert.equal(await panel.evaluate(node => node.scrollHeight > node.clientHeight), false, 'memory details should fit the available height')
        await page.screenshot({ path: path.join(output, 'preview-memory.png'), fullPage: true })
        const originalMemory = await page.evaluate(() => window.monitorPreview.state.metrics.memory)
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            Object.assign(state.metrics.memory, { used: 8 * 1024 ** 3, available: 8 * 1024 ** 3, percent: 50, free: null, swapTotal: 0, swapUsed: 0, swapFree: 0 })
            bar.update(state)
        })
        assert.equal(await memoryTrigger.locator('.value').innerText(), '8.0 GiB / 16.0 GiB')
        assert.equal(await panel.locator('.memory-capacity').innerText(), '8.0 GiB / 16.0 GiB')
        assert.equal(await memoryRow('空闲内存').innerText(), '—')
        assert.equal(await memoryRow('Swap 已用 / 总量').innerText(), '未启用')
        await page.evaluate(memory => {
            const { bar, state } = window.monitorPreview
            state.metrics.memory = memory
            bar.update(state)
        }, originalMemory)
        await memoryTrigger.focus()
        await page.keyboard.press('Escape')
        assert.equal(await panel.isVisible(), false, 'memory details support keyboard dismissal')
        await networkTrigger.hover()
        await page.getByRole('columnheader', { name: '↓ 累计接收' }).waitFor()
        await assertAnchored('network')
        assert.equal(await panel.locator('tbody tr').count(), 4)
        for (const name of ['eth0', 'eth1', 'docker0', 'lo']) {
            const row = panel.getByRole('row').filter({ has: page.getByText(name, { exact: true }) })
            assert.equal(await row.count(), 1, `all interfaces must be shown, including ${name}`)
        }
        const eth0 = panel.getByRole('row').filter({ has: page.getByText('eth0', { exact: true }) })
        assert.equal(await eth0.getByRole('cell').nth(1).innerText(), '129 GiB')
        assert.equal(await eth0.getByRole('cell').nth(2).innerText(), '42.8 GiB')
        assert.equal(await panel.getByText('速率统计', { exact: true }).count(), 1)
        const networkHeights = await panel.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height))
        assert.ok(networkHeights.every(height => Math.abs(height - diskLayout.heights[0]) <= 1), 'network and disk row heights must match')
        assert.equal(await panel.evaluate(node => node.scrollHeight > node.clientHeight), false, 'ordinary interface lists must not need a scrollbar')
        await page.screenshot({ path: path.join(output, 'preview-network.png'), fullPage: true })
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.metrics.networks.eth1.received = 10 * 1024 ** 3
            bar.update(state)
        })
        assert.equal(await panel.getByRole('row').filter({ has: page.getByText('eth1', { exact: true }) }).getByRole('cell').nth(1).innerText(), '10.0 GiB')
        await diskTrigger.hover()
        assert.equal(await networkTrigger.getAttribute('aria-expanded'), 'false')
        await page.getByRole('cell', { name: '/mnt/backups' }).waitFor()
        await page.locator('h1').hover()
        await panel.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '暂停监控' }).click()
        assert.equal(await page.locator('.tabby-remote-monitor').getAttribute('data-status'), 'paused')
        await page.getByRole('button', { name: '继续监控' }).click()
        await diskTrigger.focus()
        await page.keyboard.press('Escape')
        assert.equal(await diskTrigger.getAttribute('aria-expanded'), 'false')
        await networkTrigger.focus()
        await panel.waitFor({ state: 'visible' })
        await page.getByRole('button', { name: '关闭详情' }).click()
        assert.equal(await panel.isVisible(), false, 'returning focus must not reopen the panel')
        await cpuTrigger.hover()
        await panel.getByText('CPU 使用率', { exact: true }).waitFor()
        await assertAnchored('cpu')
        assert.equal(await panel.locator('.cpu-stat').count(), 3)
        assert.equal(await panel.locator('.cpu-stat').first().locator('.stat-value').innerText(), '18.5%')
        assert.equal(await panel.locator('.cpu-stat').last().locator('.stat-value').innerText(), '82.0%')
        assert.equal(await panel.locator('.cpu-plot .chart-line').count(), 1)
        assert.equal(await panel.locator('.cpu-plot .chart-grid').count(), 12)
        await page.screenshot({ path: path.join(output, 'preview-cpu.png'), fullPage: true })
        const beforeLine = await panel.locator('.cpu-plot .chart-line').getAttribute('d')
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.updatedAt += 2000
            state.metrics.cpuPercent = 95
            state.cpuHistory = state.cpuHistory.slice(1).concat({ time: state.updatedAt, value: 95 })
            bar.update(state)
        })
        assert.notEqual(await panel.locator('.cpu-plot .chart-line').getAttribute('d'), beforeLine)
        assert.equal(await panel.locator('.cpu-stat').first().locator('.stat-value').innerText(), '95.0%')
        const savedHistory = await page.evaluate(() => window.monitorPreview.state.cpuHistory)
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.cpuHistory = [
                { time: state.updatedAt - 20000, value: 10 },
                { time: state.updatedAt - 18000, value: 20 },
                { time: state.updatedAt - 9000, value: 40 },
                { time: state.updatedAt, value: 95 },
            ]
            bar.update(state)
        })
        assert.equal(await panel.locator('.cpu-plot .chart-line').count(), 1, 'successful slow SSH samples must stay connected')
        assert.equal(await page.locator('.cpu-sparkline .chart-line').count(), 1, 'the mini chart must use the same continuity rule')
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.cpuHistory.splice(2, 0, { time: state.updatedAt - 12000, value: null })
            bar.update(state)
        })
        assert.equal(await panel.locator('.cpu-plot .chart-line').count(), 2, 'a real sampling interruption must remain visible')
        await page.evaluate(history => {
            const { bar, state } = window.monitorPreview
            state.cpuHistory = history
            bar.update(state)
        }, savedHistory)
        await cpuTrigger.focus()
        await page.keyboard.press('Escape')
        assert.equal(await cpuTrigger.getAttribute('aria-expanded'), 'false')
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.metrics.hostname = '<img src=x onerror=alert(1)>'
            bar.update(state)
        })
        assert.equal(await page.locator('.tabby-remote-monitor img').count(), 0)
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.metrics.hostname = 'production-01'
            bar.update(state)
        })
        await page.setViewportSize({ width: 460, height: 740 })
        const layout = await page.evaluate(() => {
            const host = document.querySelector('.tabby-remote-monitor')
            const parent = document.querySelector('#terminal')
            const content = document.querySelector('.content')
            const actions = host.shadowRoot.querySelector('.actions')
            return { host: host.getBoundingClientRect().toJSON(), parent: parent.getBoundingClientRect().toJSON(), content: content.getBoundingClientRect().toJSON(), actions: actions.getBoundingClientRect().toJSON() }
        })
        assert.ok(layout.content.bottom <= layout.host.top + 1, 'footer must reserve space, not cover the terminal')
        assert.ok(layout.actions.right <= layout.parent.right + 1, 'controls must stay reachable in a narrow pane')
        await diskTrigger.hover()
        await assertAnchored('disk')
        assert.equal(await panel.locator('.table-scroll').evaluate(node => node.scrollWidth > node.clientWidth), true, 'narrow panes can scroll disk columns without squeezing text')
        await page.screenshot({ path: path.join(output, 'preview-narrow.png'), fullPage: true })
        await mountTrigger('/mnt/backups').hover()
        await assertAnchored('disk')
        assert.equal(await panel.locator('.disk-table tbody tr').count(), 3, 'last mount remains accessible in narrow panes')
        await page.locator('h1').hover()
        await page.locator('.bar').evaluate(node => { node.scrollLeft = 0 })
        await panel.waitFor({ state: 'hidden' })
        await memoryTrigger.hover()
        await assertAnchored('memory')
        assert.equal(await panel.evaluate(node => node.scrollWidth > node.clientWidth), false, 'memory details fit narrow panes')
        await page.screenshot({ path: path.join(output, 'preview-memory-narrow.png'), fullPage: true })
        await cpuTrigger.hover()
        await assertAnchored('cpu')
        assert.equal(await panel.evaluate(node => node.scrollWidth > node.clientWidth), false, 'CPU chart fits narrow panes')
        await page.screenshot({ path: path.join(output, 'preview-cpu-narrow.png'), fullPage: true })
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.cpuHistory = []
            state.metrics.cpuPercent = null
            bar.update(state)
        })
        assert.equal(await panel.locator('.chart-empty').count(), 1)
        assert.equal(await panel.locator('.chart-line').count(), 0, 'CPU chart must not invent a line before samples arrive')
        await networkTrigger.hover()
        await assertAnchored('network')
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.metrics.networks = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`veth${i}`, { received: i * 1024, transmitted: i * 2048 }]))
            bar.update(state)
        })
        assert.equal(await panel.locator('tbody tr').count(), 40)
        assert.equal(await panel.evaluate(node => node.scrollHeight > node.clientHeight), true)
        await panel.hover()
        await panel.evaluate(node => { node.scrollTop = 100 })
        await page.evaluate(() => window.monitorPreview.bar.update(window.monitorPreview.state))
        assert.equal(await panel.evaluate(node => node.scrollTop), 100)
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.status = 'error'
            state.message = '采集超时'
            state.messageKey = 'error.timeout'
            bar.update(state)
        })
        assert.equal(await panel.getByText('采集超时，稍后自动重试 · 以下为上次采样数据', { exact: true }).count(), 1)
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.metrics.networks = {}
            bar.update(state)
        })
        assert.equal(await panel.getByText('等待网络设备信息。', { exact: true }).count(), 1)
        await memoryTrigger.hover()
        assert.equal(await panel.getByText('采集超时，稍后自动重试 · 以下为上次采样数据', { exact: true }).count(), 1)
        assert.equal(await panel.locator('.memory-capacity').innerText(), '6.4 GiB / 16.0 GiB')
        await page.evaluate(() => {
            const { bar, state } = window.monitorPreview
            state.metrics = undefined
            state.status = 'waiting'
            state.message = '等待 SSH 连接'
            state.messageKey = 'status.waiting'
            bar.update(state)
        })
        assert.equal(await memoryTrigger.locator('.value').innerText(), '—')
        assert.equal(await panel.getByText('等待内存信息。', { exact: true }).count(), 1)
        assert.equal(await page.locator('.disk').count(), 1, 'no data keeps a single disk placeholder')
        assert.equal(await page.locator('.disk-value').innerText(), '—')
        await page.evaluate(() => window.monitorPreview.bar.destroy())
        assert.equal(await page.locator('.tabby-remote-monitor').count(), 0)
        assert.deepEqual(errors, [])
        console.log('Browser checks passed: Chinese/English switching, translated errors and accessible labels, English narrow layouts, per-mount disk labels, mount changes and filtering, anchored shared disk panel, SVG icons, aligned disk columns, shared row heights, memory capacities and details, CPU history charts and updates, table scroll/focus preserved across refresh and configuration changes, keyboard access, all network counters, stale/empty data, narrow layout and destroy.')
        console.log(path.join(output, 'preview.png'))
    } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
