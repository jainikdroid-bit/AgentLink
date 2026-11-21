'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')
const { selectLauncherAsset } = require('./launcher-update.js')

const tag = 'v0.26.0'
const hash = 'a'.repeat(64)
function asset(version, overrides = {}) {
  const name = 'AgentLink-launcher-' + version + '.cjs'
  return {
    name,
    size: 500,
    digest: 'sha256:' + hash,
    browser_download_url: 'https://github.com/jainikdroid-bit/AgentLink/releases/download/' + tag + '/' + name,
    ...overrides,
  }
}

test('selects the newest compatible launcher from a stable release', () => {
  const release = { tag_name: tag, assets: [asset(6), asset(8), asset(7)] }
  assert.equal(selectLauncherAsset(release, 6).version, 8)
  assert.equal(selectLauncherAsset(release, 8), null)
  assert.equal(selectLauncherAsset({ ...release, prerelease: true }, 6), null)
})

test('ignores an asset with an unexpected origin, checksum, or size', () => {
  const assets = [
    asset(9, { browser_download_url: 'https://example.com/launcher.cjs' }),
    asset(8, { digest: 'sha256:bad' }),
    asset(7, { size: 5 * 1024 * 1024 }),
  ]
  assert.equal(selectLauncherAsset({ tag_name: tag, assets }, 6), null)
})
