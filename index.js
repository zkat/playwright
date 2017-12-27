'use strict'

const Actor = require('./lib/actor-simulator.js')
const Scheduler = require('./lib/scheduler.js')
const uuid = require('uuid/v4')

class Playwright {
  constructor (opts) {
    this.opts = opts || {}
    this.schedulers = []
    this.schedIndex = 0
    this.pid = uuid()
  }
  nextPid () { return uuid() }
  start (opts) {
    // Launch schedulers
    const schedCount = (
      (opts && opts.maxSchedulers) ||
      this.opts.maxSchedulers ||
      // There's a bug on some versions of node where `cpus()` is undefined :|
      (require('os').cpus() || [1]).length
    )
    for (let i = 0; i < schedCount; i++) {
      this.schedulers.push(new Scheduler(this))
    }
    return Promise.all(this.schedulers.map(s => s.start())).then(() => this)
  }
  ping () {
    return Promise.all(this.schedulers.map(s => s.ping()))
  }
  run (code) {
    const messages = [].slice.call(code, 1)
    if (typeof code !== 'function') {
      return Promise.reject(new Error('run() can only use functions'))
    }
    const actor = this.spawn(
      `process.send({pid: process.pid, data: (${code.toString()})()}, process.ppid)`
    )
    messages.forEach(m => actor.send(m))
    return this.receive(m => m && m.pid === actor.pid)
    .then(m => actor.done().then(() => m.data))
  }
  spawn (code) {
    const actor = new Actor({
      pid: this.nextPid(),
      script: code.toString()
    })
    this.schedule(actor)
    return actor
  }
  spawnModule (module) {
    const modPath = require.resolve(module)
    return this.spawn(`require(${JSON.stringify(modPath)})`)
  }
  schedule (actor) {
    // Straightforward round-robin scheduling logic -- works best when all
    // actors are a similar workload.
    const scheduler = this.schedulers[this.schedIndex]
    this.schedIndex = (this.schedIndex + 1) % this.schedulers.length
    scheduler.schedule(actor)
  }
  stop (opts) {
    // Shut down scheduler and all active processes
    return Promise.all(this.schedulers.map(s => s.stop()))
  }
}
module.exports = Playwright
