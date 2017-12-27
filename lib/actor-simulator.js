'use strict'

const EventEmitter = require('events')

class ActorSimulator extends EventEmitter {
  constructor (opts) {
    super()
    this.pid = opts.pid
    this.script = opts.script
    this.scheduler = opts.scheduler
    this._pending = new Promise((resolve, reject) => {
      this.on('exit', resolve)
      this.on('error', reject)
    })
  }
  send (msg) {
    return this.scheduler.cast({
      type: 'actor-msg',
      pid: this.pid,
      data: msg
    })
  }
  done () {
    [].slice.call(arguments).forEach(m => this.send(m))
    return this._pending
  }
  toJSON () {
    return {pid: this.pid, script: this.script}
  }
}
module.exports = ActorSimulator
