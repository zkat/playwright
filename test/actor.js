'use strict'

const test = require('tap').test

const Actor = require('../lib/Actor.js')

test('has proper global context', t => {
  const actor = new Actor({
    pid: 1,
    script: 'process._global = global'})
  return actor.run().then(() => {
    // NOTE: `vm.Script` seems to change identity for require
    t.ok(actor._global.require, 'require() present')
    t.equal(actor._global.process, actor, 'actor object is process')
    t.equal(actor._global.console, console)
    t.equal(actor._global.Buffer, Buffer)
    t.equal(actor._global.clearImmediate, clearImmediate)
    t.equal(actor._global.clearInterval, clearInterval)
    t.equal(actor._global.clearTimeout, clearTimeout)
    t.equal(actor._global.setImmediate, setImmediate)
    t.equal(actor._global.setInterval, setInterval)
    t.equal(actor._global.setTimeout, setTimeout)
  })
})

test('looks mostly like `process`', t => {
  const actor = new Actor({pid: 1234, script: 'process.exitCode = 4321'})
  return actor.run().then(() => {
    const processProps = [
      'getuid', 'geteuid', 'getgid', 'getegid', 'cwd', 'uptime', 'cpuUsage',
      'getgroups', 'memoryUsage', 'hrtime', 'nextTick', 'emitWarning', 'argv0',
      'argv', 'mainModule', 'env', 'config', 'arch', 'title', 'release',
      'version', 'versions', 'execArgv', 'execPath', 'platform'
    ]
    processProps.forEach(k => {
      t.equal(actor[k], process[k], `actor['${k}'] matches process['${k}']`)
    })
    t.equal(actor.pid, 1234, 'uses pid from actor construction')
    t.notEqual(actor.exitCode, process.exitCode, 'exitCode set separately')
    t.equal(actor.exitCode, 4321, 'exitCode set from within actor')
  })
})

test('can receive messages', t => {
  const actor = new Actor({
    pid: 1,
    script: `
    Promise.all([
      process.receive(),
      process.receive(),
      process.receive(x => x === 1),
      process.receive(x => x === 2),
      process.receive(x => x === 3)
    ]).then(msgs => { process._msgs = msgs })
    `
  })
  const msgs = []
  actor.on('message', m => msgs.push(m))
  actor.send('hello')
  const ret = actor.run()
  actor.send('world')
  actor.send(2)
  actor.send(3)
  actor.send(1)
  return ret.then(() => {
    t.deepEqual(msgs, ['hello', 'world', 2, 3, 1], 'can hook up a listener')
    const q = actor._msgs
    t.equal(q[0], 'hello', 'accepts messages before .run() and saves them')
    t.equal(q[1], 'world', 'receives message on post-.run() send')
    t.deepEqual(q.slice(2), [1, 2, 3], 'allows skipping messages with filter')
  })
})

test('rejects non-JSON messages', t => {
  const actor = new Actor({
    pid: 1,
    script: 'process.receive().then(msg => { process._msg = msg })'
  })
  const circ = {}
  circ.circ = circ
  t.throws(() => {
    actor.send(circ)
  }, /JSON/i, 'throws if a non-JSON-serializable object is passed')
  const buf = Buffer.from([])
  actor.send(buf)
  return actor.run().then(() => {
    t.equal(actor._msg, buf, 'buffers special-cased and preserve identity')
  })
})
