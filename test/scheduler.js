'use strict'

const test = require('tap').test

const Scheduler = require('../lib/scheduler.js')

test('can start and stop scheduler', t => {
  const sched = new Scheduler()
  sched.start()
  t.ok(sched.child, 'scheduler has a child process')
  let exited = false
  let pong = false
  sched.child.on('exit', () => { exited = true })
  sched.child.on('message', msg => {
    if (msg.data === 'pong') { pong = true }
  })
  return sched.ping()
  .then(() => t.ok(pong, 'child process responded to ping'))
  .then(() => sched.stop())
  .then(() => {
    t.ok(exited, 'child process exited')
    t.notOk(sched.child, 'no more child')
  })
})
