'use strict'

const test = require('tap').test

const Playwright = require('../index.js')

test('it works', t => {
  return (new Playwright()).start()
  .then(
    p => p.ping()
    .then(() => p.stop())
  )
})

test('spawning and two-way comms with actors works', {skip: true}, t => {
  return (new Playwright()).start()
  .then(p =>
    p.run(() => process.receive(), 'hello')
    .then(msg => t.deepEqual(msg, 'hello', 'got the message'))
    .then(
      () => p.stop(),
      err => { p.stop(); throw err }
    )
  )
})
