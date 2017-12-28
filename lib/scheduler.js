'use strict'

const cp = require('child_process')
const EventEmitter = require('events')
const uuid = require('uuid/v4')

const CHILD_PATH = require.resolve('./scheduler-child.js')

class Scheduler extends EventEmitter {
  constructor (opts) {
    super()
    opts = opts || {}
    this.ppid = opts.pid
    this.pendingActors = new Map()
    this.pendingCalls = new Map()
  }

  start () {
    if (this.child) {
      throw new Error('Scheduler already running')
    }
    this.child = cp.fork(CHILD_PATH)
    this.child.on('message', msg => this.handleMsg(msg))
    this.child.on('error', err => this.handleError(err))
    this.child.on('exit', (code, sig) => this.handleExit(code, sig))
    return this.call('ppid', this.ppid)
  }

  stop (code) {
    return new Promise((resolve, reject) => {
      this.child.on('exit', () => resolve())
      this.child.on('error', reject)
      this.call('stop', code || 0).catch(reject)
    }).then(() => true)
  }

  handleMsg (msg) {
    if (msg.type === 'response') {
      const callHandle = this.pendingCalls.get(msg.id)
      if (callHandle && msg.error) {
        callHandle.reject(new Error(msg.error))
      } else if (callHandle) {
        callHandle.resolve(msg.data)
      }
    } else if (msg.type === 'call') {
      this.handleCall(msg.id, msg.name, msg.args)
    } else {
      this.handleCast(msg)
    }
  }

  handleCall (id, name, args) {
    // No calls right now
    this.cast({id, type: 'response', error: `No call handler for ${name}`})
  }

  handleCast (msg) {
    let actor
    switch (msg.type) {
      case 'actor-done':
        actor = this.pendingActors.get(msg.pid)
        actor.emit('exit', msg.exitCode)
        this.pendingActors.delete(msg.pid)
        break
      case 'actor-error':
        actor = this.pendingActors.get(msg.pid)
        const err = new Error(msg.message)
        err.code = msg.code
        actor.emit('error', err)
        this.pendingActors.delete(msg.pid)
        break
      default:
        this.emit('error', new Error(`Unknown message type: '${msg.type}'`))
    }
  }

  handleError (err) {
    const code = err.code || 1
    this.pendingActors.forEach(actor => {
      actor.emit('exit', code, 'SIGCHLD')
    })
    this.pendingCalls.forEach(handle => {
      handle.reject(err)
    })
    this.pendingActors.clear()
    this.pendingCalls.clear()
  }

  handleExit (code, sig) {
    const err = new Error(
      `scheduler process exited with code ${code} and ${sig}`
    )
    err.code = code
    err.signal = sig
    this.handleError(err)
    this.child = code ? cp.fork(CHILD_PATH) : null
  }

  schedule (actor) {
    this.pendingActors.set(actor.pid, actor)
    actor.scheduler = this
    return this.call('actor', actor)
    .then(
      () => this.pendingActors.delete(actor),
      err => {
        this.pendingActors.delete(actor)
        throw err
      }
    )
  }

  ping () {
    const start = Date.now()
    return this.call('ping').then(() => Date.now() - start)
  }

  cast (msg) {
    // "Cast" means you throw it out there without worrying about a response
    this.child.send(msg)
  }

  call (name, args, timeout) {
    // "Call" means you want a reply to this specific message
    return new Promise((resolve, reject) => {
      const id = uuid()
      this.pendingCalls.set(id, {resolve, reject})
      if (timeout != null) {
        setTimeout(() => {
          if (this.pendingCalls.has(id)) {
            reject(new Error(`Call timeout exceeded`))
          }
        })
      }
      this.child.send({
        id,
        type: 'call',
        name,
        args
      })
    })
  }
}
module.exports = Scheduler
