'use strict'

const EventEmitter = require('events')
class Mailbox extends EventEmitter {
  constructor () {
    super()
    this.queue = []
    this.pending = []
    this.closed = false
  }
  send (msg) {
    if (this.closed) { throw new Error('mailbox closed') }
    if (typeof msg === 'function') {
      throw new Error(`${msg} is not JSON-serializable`)
    }
    if (typeof msg === 'object' && !Buffer.isBuffer(msg)) {
      try {
        JSON.stringify(msg)
      } catch (e) {
        e.message = `Messages must be JSON-serializable\n${e.message}`
        throw e
      }
    }
    this.emit('message', msg)
    const pendingIdx = this.pending.findIndex(p => p.match(msg))
    if (pendingIdx !== -1) {
      const pending = this.pending[pendingIdx]
      this.pending.splice(pendingIdx, 1)
      pending.resolve(msg)
    } else {
      this.queue.push(msg)
    }
    return this
  }
  recv (match) {
    if (this.closed) { return Promise.reject(new Error('mailbox closed')) }
    match = match || (() => true)
    const fromQ = this.queue.findIndex(match)
    if (fromQ !== -1) {
      const msg = this.queue[fromQ]
      this.queue.splice(fromQ, 1)
      return Promise.resolve(msg)
    } else {
      return new Promise((resolve, reject) => {
        this.pending.push({match, resolve, reject})
      })
    }
  }
  close (err) {
    this.closed = true
    err = err || new Error('mailbox closed')
    while (this.pending.length) {
      this.pending.shift().reject(err)
    }
  }
  flush () {
    const old = this.queue
    this.queue = []
    return old
  }
}
module.exports = Mailbox
