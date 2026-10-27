// Render the real settings component and decorator with Tabby's ConfigProxy.
// Only platform storage, locale notifications and the disconnected terminal are local doubles.
const fs = require('node:fs/promises')
const path = require('node:path')
const assert = require('node:assert/strict')
const webpack = require('webpack')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(__dirname, '..')
const output = path.join(root, '.artifacts', 'settings-preview')

function moduleDirectory (name) {
    return path.dirname(require.resolve(`${name}/package.json`))
}

async function main () {
    await fs.mkdir(output, { recursive: true })
    const coreMap = JSON.parse(await fs.readFile(path.join(moduleDirectory('tabby-core'), 'dist/index.js.map'), 'utf8'))
    const configSource = coreMap.sourcesContent[coreMap.sources.findIndex(name => name.endsWith('/services/config.service.ts'))]
    const start = configSource?.indexOf('function isStructuralMember') ?? -1
    const end = configSource?.indexOf('@Injectable', start) ?? -1
    assert.ok(start >= 0 && end > start, 'Tabby ConfigProxy source must be available for the integration test')
    const proxyFile = path.join(output, 'config-proxy.cjs')
    const ts = require('typescript')
    await fs.writeFile(proxyFile, ts.transpileModule(`import deepClone from 'clone-deep'; import deepEqual from 'deep-equal';\n${configSource.slice(start, end)}`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText)
    const stub = path.join(output, 'tabby.cjs')
    await fs.writeFile(stub, 'exports.ConfigProvider = class {}; exports.ConfigService = class {}; exports.LocaleService = class {}; exports.SettingsTabProvider = class {}; exports.BaseTerminalTabComponent = class {}; exports.TerminalDecorator = class { detach () {} };')
    const entry = path.join(output, 'entry.cjs')
    await fs.writeFile(entry, `
require('reflect-metadata'); require('zone.js'); require('@angular/compiler');
const { NgModule, NgZone } = require('@angular/core');
const { BrowserModule } = require('@angular/platform-browser');
const { FormsModule } = require('@angular/forms');
const { platformBrowserDynamic } = require('@angular/platform-browser-dynamic');
const { Subject } = require('rxjs');
const { ConfigService, LocaleService } = require('tabby-core');
const { RemoteMonitorSettingsComponent } = require(${JSON.stringify(path.join(root, 'src/settings.ts'))});
const { RemoteMonitorDecorator } = require(${JSON.stringify(path.join(root, 'src/decorator.ts'))});
const { DEFAULT_OPTIONS } = require(${JSON.stringify(path.join(root, 'src/options.ts'))});
const { ConfigProxy } = require(${JSON.stringify(proxyFile)});
const yaml = require('js-yaml');
let language = 'zh-CN';
const locale = { getLocale: () => language, localeChanged$: new Subject() };
const persisted = localStorage.getItem('test-config');
const raw = persisted ? yaml.load(persisted) : { remoteMonitor: { futureOption: 'keep' }, otherPlugin: { value: 'untouched' } };
const config = { store: new ConfigProxy(raw, { remoteMonitor: { ...DEFAULT_OPTIONS } }), saves: [], changed$: new Subject(), failSave: false,
    save: async () => {
        if (config.failSave) throw new Error('Simulated storage failure');
        localStorage.setItem('test-config', yaml.dump(raw));
        config.saves.push({ ...config.store.remoteMonitor });
        config.changed$.next();
    },
    persisted: () => yaml.load(localStorage.getItem('test-config')),
};
class PreviewModule {}
NgModule({ imports: [BrowserModule, FormsModule], declarations: [RemoteMonitorSettingsComponent], providers: [
    { provide: ConfigService, useValue: config }, { provide: LocaleService, useValue: locale }
], bootstrap: [RemoteMonitorSettingsComponent] })(PreviewModule);
platformBrowserDynamic().bootstrapModule(PreviewModule).then(module => {
    const decorator = new RemoteMonitorDecorator(config, module.injector.get(NgZone), locale);
    const terminal = { profile: { type: 'ssh' }, sshSession: null, session: { open: false }, element: { nativeElement: document.querySelector('#live-terminal') }, sessionChanged$: new Subject(), visibility$: new Subject() };
    decorator.attach(terminal);
    window.settingsPreview = { config, setLocale: value => module.injector.get(NgZone).run(() => { language = value; locale.localeChanged$.next(value); }), destroy: () => { decorator.detach(terminal); module.destroy(); } };
}).catch(error => { console.error(error); window.previewError = String(error); });
`)
    const alias = { 'tabby-core': stub, 'tabby-settings': stub, 'tabby-terminal': stub }
    for (const name of ['@angular/core', '@angular/common', '@angular/forms', '@angular/compiler', '@angular/platform-browser', '@angular/platform-browser-dynamic', 'reflect-metadata', 'zone.js', 'clone-deep', 'deep-equal', 'js-yaml']) alias[name] = moduleDirectory(name)
    await new Promise((resolve, reject) => webpack({ mode: 'development', target: 'web', entry,
        // The test terminal stays disconnected, so the Node-only SSH transport is never called.
        output: { path: output, filename: 'settings.js' }, resolve: { extensions: ['.ts', '.js', '.cjs'], alias, fallback: { buffer: false } },
        module: { rules: [{ test: /\.ts$/, loader: 'ts-loader' }, { test: /\.css$/, type: 'asset/source' }] },
    }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()))
    await fs.writeFile(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Remote Monitor settings preview</title>
<style>body{margin:0;padding:30px 48px;background:#171c27;color:#d8e1f0;font:14px/1.5 'Segoe UI','Microsoft YaHei',sans-serif}h3{font-size:22px}h4{font-size:17px}.text-muted{color:#9aabc2}.form-control{display:block;background:#222c3d;color:inherit;border:1px solid #ffffff24;border-radius:4px;padding:7px;box-sizing:border-box;width:100%}.btn{font:inherit;color:inherit;border:1px solid #ffffff2b;border-radius:5px;background:#2c3648;padding:6px 10px;cursor:pointer}.mb-3{margin-bottom:16px}input{accent-color:#86b6ff}.text-danger{color:#ff858d}</style>
<div id="live-terminal" style="position:relative;margin-bottom:20px"></div><remote-monitor-settings></remote-monitor-settings><script src="settings.js"></script>`)
    const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
    try {
        const page = await browser.newPage({ viewport: { width: 1040, height: 950 } })
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.goto(require('node:url').pathToFileURL(path.join(output, 'index.html')).href)
        await page.waitForFunction(() => window.settingsPreview || window.previewError)
        assert.equal(await page.evaluate(() => window.previewError), undefined)
        assert.equal(await page.evaluate(() => Object.getOwnPropertyDescriptor(window.settingsPreview.config.store, 'remoteMonitor').set === undefined), true, 'test store must enforce Tabby’s getter-only section')
        const preview = page.locator('.appearance-preview')
        const shell = preview.locator('.shell')
        const liveShell = page.locator('#live-terminal .shell')
        await preview.locator('.cpu-sparkline .chart-line').waitFor()
        const initialChart = await preview.locator('.cpu-sparkline .chart-line').getAttribute('d')
        await page.getByRole('button', { name: '青绿', exact: true }).click()
        await page.waitForFunction(() => window.settingsPreview.config.store.remoteMonitor.backgroundColor === '#102a32', null, { timeout: 5000 })
        assert.equal(await shell.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(16, 42, 50, 0.8)')
        assert.equal(await liveShell.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(16, 42, 50, 0.8)', 'save notification updates the attached terminal')
        const saved = await page.evaluate(() => window.settingsPreview.config.persisted())
        assert.equal(saved.remoteMonitor.backgroundColor, '#102a32')
        assert.equal(saved.remoteMonitor.accentColor, '#55d6c2')
        assert.equal(saved.remoteMonitor.futureOption, 'keep')
        assert.deepEqual(saved.otherPlugin, { value: 'untouched' })
        await page.reload()
        await page.waitForFunction(() => window.settingsPreview || window.previewError)
        assert.equal(await page.evaluate(() => window.previewError), undefined)
        assert.equal(await page.getByRole('button', { name: '青绿', exact: true }).getAttribute('aria-pressed'), 'true', 'the chosen preset survives a reload from saved YAML')
        assert.equal(await liveShell.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(16, 42, 50, 0.8)', 'a new terminal reads the persisted palette')
        const reloadedChart = await preview.locator('.cpu-sparkline .chart-line').getAttribute('d')
        const beforeSaves = await page.evaluate(() => window.settingsPreview.config.saves.length)
        const opacity = page.getByRole('slider', { name: '详情面板不透明度', exact: true })
        await opacity.evaluate(node => { node.value = '68'; node.dispatchEvent(new Event('input', { bubbles: true })) })
        assert.equal(await page.evaluate(() => window.settingsPreview.config.saves.length), beforeSaves, 'dragging only previews, without repeated config saves')
        await preview.locator('.network').hover()
        assert.equal(await preview.locator('.panel').evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(16, 42, 50, 0.68)')
        assert.match(await preview.locator('.panel').evaluate(node => getComputedStyle(node).backdropFilter), /blur\(16px\)/)
        await opacity.dispatchEvent('change')
        await page.waitForFunction(() => window.settingsPreview.config.store.remoteMonitor.panelOpacity === 68)
        const accent = page.getByLabel('强调颜色', { exact: true })
        await accent.evaluate(node => { node.value = '#ffb56b'; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })) })
        await page.waitForFunction(() => window.settingsPreview.config.store.remoteMonitor.accentColor === '#ffb56b')
        await page.getByLabel('磨玻璃效果', { exact: true }).uncheck()
        assert.equal(await shell.evaluate(node => getComputedStyle(node).backdropFilter), 'none')
        assert.equal(await shell.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(16, 42, 50)')
        assert.equal(await opacity.isDisabled(), true)
        await page.getByRole('button', { name: '恢复默认外观', exact: true }).click()
        await page.waitForFunction(() => window.settingsPreview.config.store.remoteMonitor.panelOpacity === 88)
        assert.equal(await page.getByLabel('磨玻璃效果', { exact: true }).isChecked(), true)
        assert.equal(reloadedChart, initialChart)
        assert.equal(await preview.locator('.cpu-sparkline .chart-line').getAttribute('d'), reloadedChart, 'appearance edits preserve preview history')
        await page.getByRole('button', { name: '紫色', exact: true }).click()
        await preview.locator('.network').hover()
        await page.locator('.appearance-settings').screenshot({ path: path.join(root, '.artifacts', 'preview-settings-appearance.png') })
        await page.getByRole('button', { name: '浅色', exact: true }).click()
        await preview.locator('.network').hover()
        await page.locator('.appearance-settings').screenshot({ path: path.join(root, '.artifacts', 'preview-settings-light.png') })
        await page.evaluate(() => window.settingsPreview.setLocale('en'))
        await page.getByRole('button', { name: 'Frost light', exact: true }).waitFor()
        await page.getByRole('slider', { name: 'Background blur', exact: true }).waitFor()
        await page.getByLabel('Language', { exact: true }).selectOption('zh-CN')
        await page.getByRole('button', { name: '浅色', exact: true }).waitFor()
        await page.evaluate(() => { window.settingsPreview.config.failSave = true })
        await page.getByRole('button', { name: '紫色', exact: true }).click()
        await page.getByRole('alert').waitFor()
        assert.match(await page.getByRole('alert').innerText(), /设置保存失败/)
        await page.evaluate(() => { window.settingsPreview.config.failSave = false })
        await page.getByRole('button', { name: '紫色', exact: true }).click()
        await page.getByRole('alert').waitFor({ state: 'hidden' })
        assert.equal(await page.evaluate(() => window.settingsPreview.config.persisted().remoteMonitor.backgroundColor), '#241a34')
        await page.evaluate(() => window.settingsPreview.destroy())
        assert.equal(await page.locator('.tabby-remote-monitor').count(), 0)
        assert.deepEqual(errors, [])
        console.log('Angular settings checks passed with Tabby ConfigProxy: YAML persistence and reload, attached terminal updates, save error recovery, presets, live preview, commit on release, color picker, solid mode, reset, localization and cleanup.')
    } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
