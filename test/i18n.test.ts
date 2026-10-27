import { test } from 'node:test'
import assert from 'node:assert/strict'
import { en, zhCN, resolveLanguage, translate } from '../src/i18n'
import type { MessageKey } from '../src/i18n'
import { normalizeOptions } from '../src/options'
import { parseSnapshot } from '../src/metrics'
import { IncompleteOutputError } from '../src/transport'

test('language preferences follow Tabby, allow overrides and fall back to English', () => {
    assert.equal(normalizeOptions().language, 'auto')
    assert.equal(normalizeOptions({ language: 'invalid' as never }).language, 'auto')
    for (const locale of ['zh', 'zh-CN', 'zh_CN', 'zh-SG', 'zh-Hans-CN']) assert.equal(resolveLanguage('auto', locale), 'zh-CN')
    for (const locale of ['en', 'en-US', 'en_GB', 'fr-FR', 'ja', 'zh-TW', 'unknown']) assert.equal(resolveLanguage('auto', locale), 'en')
    assert.equal(resolveLanguage('en', 'zh-CN'), 'en')
    assert.equal(resolveLanguage('zh-CN', 'en-US'), 'zh-CN')
})

test('both catalogs cover all messages and preserve the same interpolation parameters', () => {
    assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort())
    const parameters = (message: string): string[] => [...new Set(message.match(/\{\w+\}/g) ?? [])].sort()
    for (const key of Object.keys(en) as MessageKey[]) {
        assert.ok(zhCN[key].trim())
        assert.doesNotMatch(en[key], /\p{Script=Han}/u)
        assert.deepEqual(parameters(zhCN[key]), parameters(en[key]), key)
    }
    const remoteText = '<img src=x> {mount} $&'
    assert.equal(translate('en', 'disk.mountTrigger', { mount: remoteText }), `View disk and system information for ${remoteText}`)
})

test('collection errors keep structured messages for translation after a language change', () => {
    const error = new IncompleteOutputError(42)
    assert.equal(translate('en', error.key, error.params), 'Incomplete sample (42 bytes received); retrying')
    assert.match(translate('zh-CN', error.key, error.params), /42 字节/)
    assert.throws(() => parseSnapshot('truncated'), error => {
        const structured = error as IncompleteOutputError
        assert.equal(translate('en', structured.key, structured.params), 'Incomplete sample; retrying automatically')
        return true
    })
})
