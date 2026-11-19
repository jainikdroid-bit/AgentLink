'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { llmStatus, llmAction } = require('./llm-control.js')

function fakeServer(state = { 'qwen36-free': 'loaded' }) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push([init.method, url, init.body])
    const json = (obj, status = 200) => ({ status, text: async () => JSON.stringify(obj) })
    if (url.endsWith('/v1/models')) return json({ data: Object.entries(state).map(([id, value]) => ({ id, status: { value } })) })
    const m = /\/models\/(load|unload)$/.exec(url)
    if (m) {
      const { model } = JSON.parse(init.body)
      state[model] = m[1] === 'load' ? 'loaded' : 'unloaded'
      return json({ success: true })
    }
    return json({}, 404)
  }
  return { fetchImpl, calls, state }
}

test('status lists the models and whether they are in memory', async () => {
  const { fetchImpl } = fakeServer({ a: 'loaded', b: 'unloaded' })
  assert.deepEqual(await llmStatus({ fetchImpl, base: 'http://x' }), { available: true, models: [{ id: 'a', state: 'loaded' }, { id: 'b', state: 'unloaded' }] })
})

test('no model server means unavailable, not an error', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED') }
  assert.deepEqual(await llmStatus({ fetchImpl, base: 'http://x' }), { available: false })
})

test('unload then load a known model', async () => {
  const server = fakeServer()
  assert.deepEqual(await llmAction('unload', 'qwen36-free', { fetchImpl: server.fetchImpl, base: 'http://x' }), { ok: true })
  assert.equal(server.state['qwen36-free'], 'unloaded')
  assert.deepEqual(await llmAction('load', 'qwen36-free', { fetchImpl: server.fetchImpl, base: 'http://x' }), { ok: true })
  assert.equal(server.state['qwen36-free'], 'loaded')
})

test('unknown models and actions are refused before reaching the server', async () => {
  const server = fakeServer()
  assert.equal((await llmAction('unload', 'other', { fetchImpl: server.fetchImpl, base: 'http://x' })).ok, false)
  assert.equal((await llmAction('delete', 'qwen36-free', { fetchImpl: server.fetchImpl, base: 'http://x' })).ok, false)
  assert.ok(!server.calls.some(([method]) => method === 'POST'))
})
