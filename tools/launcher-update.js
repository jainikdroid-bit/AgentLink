'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn, execFileSync } = require('node:child_process')

const RELEASE_ROOT = 'https://github.com/jainikdroid-bit/AgentLink/releases/download/'
const RELEASE_API = 'https://api.github.com/repos/jainikdroid-bit/AgentLink/releases/latest'
const LIMIT = 4 * 1024 * 1024

function selectLauncherAsset(release, current) {
  const tag = release?.tag_name
  if (release?.draft || release?.prerelease || typeof tag !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(tag) || !Array.isArray(release.assets)) return null
  const candidates = release.assets.flatMap((asset) => {
    const match = /^AgentLink-launcher-(\d+)\.cjs$/.exec(asset?.name ?? '')
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) <= current) return []
    const url = RELEASE_ROOT + tag + '/' + asset.name
    if (asset.browser_download_url !== url || !/^sha256:[0-9a-f]{64}$/i.test(asset.digest ?? '') || !Number.isInteger(asset.size) || asset.size < 1 || asset.size > LIMIT) return []
    return [{ version: Number(match[1]), url, hash: asset.digest.slice(7).toLowerCase(), size: asset.size }]
  })
  return candidates.sort((a, b) => b.version - a.version)[0] ?? null
}

async function download(asset) {
  const response = await fetch(asset.url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok || !response.body) throw new Error('launcher download failed')
  const pieces = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > asset.size) throw new Error('launcher download exceeded size')
    pieces.push(chunk)
  }
  const data = Buffer.concat(pieces)
  if (size !== asset.size || crypto.createHash('sha256').update(data).digest('hex') !== asset.hash) throw new Error('launcher checksum mismatch')
  return data
}

function scheduleLauncherUpdate({ current, launcherPath, canRestart, shutdown }) {
  let checking = false
  async function check() {
    if (checking || !canRestart()) return
    checking = true
    let pending
    try {
      const response = await fetch(RELEASE_API, { signal: AbortSignal.timeout(8_000) })
      if (!response.ok) return
      const asset = selectLauncherAsset(await response.json(), current)
      if (!asset) return
      const data = await download(asset)
      if (!canRestart()) return
      pending = path.join(path.dirname(launcherPath), '.launcher-update-' + process.pid + '.cjs')
      fs.writeFileSync(pending, data, { flag: 'wx' })
      execFileSync(process.execPath, ['--check', pending], { stdio: 'ignore', timeout: 5_000 })
      // Check the exported version in a separate process before replacing the running launcher.
      execFileSync(process.execPath, ['-e', 'if (require(process.argv[1]).VERSION !== Number(process.argv[2])) process.exit(1)', pending, String(asset.version)], { stdio: 'ignore', timeout: 5_000 })
      if (!canRestart()) return
      const child = spawn(process.execPath, [path.join(path.dirname(launcherPath), 'launcher-update.js'), 'apply', launcherPath, pending, String(process.pid)], {
        detached: true, stdio: 'ignore', windowsHide: true,
      })
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject) })
      if (!canRestart()) {
        child.kill()
        return
      }
      child.unref()
      pending = undefined
      shutdown()
    } catch {
      console.warn('AgentLink launcher update deferred')
    } finally {
      if (pending) {
        try { fs.rmSync(pending, { force: true }) } catch { console.warn('AgentLink could not remove staged launcher update') }
      }
      checking = false
    }
  }
  setTimeout(() => void check(), 20_000).unref()
  setInterval(() => void check(), 60 * 60_000).unref()
}

function waitForExit(pid) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 20_000
    const timer = setInterval(() => {
      try { process.kill(pid, 0) } catch (err) {
        clearInterval(timer)
        if (err.code === 'ESRCH') resolve()
        else reject(err)
        return
      }
      if (Date.now() > deadline) { clearInterval(timer); reject(new Error('old launcher still running')) }
    }, 200)
  })
}

function startLauncher(launcher, readiness) {
  const child = spawn(process.execPath, [launcher], {
    detached: true, stdio: readiness ? ['ignore', 'ignore', 'ignore', 'ipc'] : 'ignore', windowsHide: true,
    env: { ...process.env, OPENCODE_CONNECT_DIR: path.dirname(launcher) },
  })
  if (!readiness) {
    child.on('error', () => {})
    child.unref()
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.removeListener('message', onMessage)
      child.kill()
    }, 15_000)
    function finish(error) {
      clearTimeout(timer)
      child.removeListener('exit', onExit)
      child.removeListener('error', finish)
      child.removeListener('message', onMessage)
      if (error) { reject(error); return }
      child.disconnect()
      child.unref()
      resolve()
    }
    function onExit() { finish(new Error('new launcher exited')) }
    function onMessage(message) { if (message === 'agentlink-launcher-ready') finish() }
    child.once('exit', onExit)
    child.once('error', finish)
    child.on('message', onMessage)
  })
}

async function apply(launcher, pending, pid) {
  const backup = launcher + '.previous'
  let stopped = false
  let replaced = false
  try {
    await waitForExit(pid)
    stopped = true
    fs.copyFileSync(launcher, backup)
    fs.renameSync(pending, launcher)
    replaced = true
    await startLauncher(launcher, true)
  } catch {
    if (replaced) fs.renameSync(backup, launcher)
    if (stopped) await startLauncher(launcher, false)
  } finally {
    fs.rmSync(pending, { force: true })
  }
}

module.exports = { selectLauncherAsset, scheduleLauncherUpdate }
if (require.main === module && process.argv[2] === 'apply') {
  apply(process.argv[3], process.argv[4], Number(process.argv[5])).catch(() => { process.exitCode = 1 })
}
