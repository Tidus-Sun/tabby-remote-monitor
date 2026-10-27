import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APPEARANCE_PRESETS, DEFAULT_APPEARANCE, appearanceVariables, contrastRatio } from '../src/appearance'
import { normalizeOptions } from '../src/options'

test('appearance accepts only colors and bounded finite values, with defaults for older configs', () => {
    const defaults = normalizeOptions()
    for (const [key, value] of Object.entries(DEFAULT_APPEARANCE)) assert.equal(defaults[key as keyof typeof defaults], value)
    const normalized = normalizeOptions({ backgroundColor: '#AbC', accentColor: 'url(https://example.invalid)', barOpacity: -10, panelOpacity: 120, blur: NaN })
    assert.equal(normalized.backgroundColor, '#aabbcc')
    assert.equal(normalized.accentColor, DEFAULT_APPEARANCE.accentColor)
    assert.equal(normalized.barOpacity, 50)
    assert.equal(normalized.panelOpacity, 100)
    assert.equal(normalized.blur, DEFAULT_APPEARANCE.blur)
    const solid = appearanceVariables({ glassEffect: false, barOpacity: 50, panelOpacity: 60, blur: 32 })
    assert.equal(solid['--trm-backdrop'], 'none')
    assert.match(solid['--trm-bar-background'], /, 1\)$/)
    assert.match(solid['--trm-panel-background'], /, 1\)$/)
})

test('light, dark and low-contrast custom palettes keep text and chart colors readable', () => {
    for (const palette of [...APPEARANCE_PRESETS, { backgroundColor: '#777777', accentColor: '#777777' }, { backgroundColor: '#ffffff', accentColor: '#ffffff' }, { backgroundColor: '#000000', accentColor: '#000000' }]) {
        const colors = appearanceVariables(palette)
        for (const role of ['text', 'strong', 'muted', 'accent', 'memory', 'download', 'upload', 'warning', 'critical']) {
            assert.ok(contrastRatio(colors[`--trm-${role}`], palette.backgroundColor) >= 4.5, `${palette.backgroundColor} ${role}`)
        }
        assert.ok(contrastRatio(colors['--trm-chart-accent'], colors['--trm-chart-background']) >= 4.5)
    }
})
