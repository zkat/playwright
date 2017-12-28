'use strict'

const EventEmitter = require('events')
const Mailbox = require('./mailbox.js')
const vm = require('vm')

const CODE_CACHE = new Map()

// A serializable child process object.
class Actor extends EventEmitter {
  constructor (opts) {
    super()
    this.pid = opts.pid
    this.script = opts.script
    this.exitCode = null
    this._mailbox = new Mailbox()
  }
  run (extraCtx) {
    this._mailbox.on('message', m => this.emit('message', m))
    const context = vm.createContext({
      process: this,
      console,
      require,
      Buffer,
      clearImmediate,
      clearInterval,
      clearTimeout,
      setImmediate,
      setInterval,
      setTimeout
    })
    context.self = context
    context.global = context
    extraCtx && Object.assign(context, extraCtx)
    this._done = new Promise((resolve, reject) => {
      const code = new vm.Script(this.script, {
        cachedData: CODE_CACHE.get(this.script),
        produceCachedData: true
      })
      if (code.cachedDataRejected) {
        CODE_CACHE.delete(this.script)
      }
      if (code.cachedDataProduced) {
        CODE_CACHE.set(this.script, code.cachedData)
      }
      resolve(code.runInContext(context))
    })
    return this._done
  }
  done () { return this._done }
  abort () {
    throw new Error('actor process aborted')
  }
  exit (code) {
    if (code == null) {
      code = this.exitCode
    }
    if (code == null) {
      code = 0
    }
    const err = new Error(`actor exited with code ${code}`)
    err.code = code
    return this._mailbox.close(err)
  }
  _send (msg) {
    return this._mailbox.send(msg)
  }
  receive (filter) {
    return this._mailbox.recv(filter)
  }
  flush () {
    return this._mailbox.flush()
  }
}
module.exports = Actor

const PROCESS_PROPS = [
  'getuid', 'geteuid', 'getgid', 'getegid', 'cwd', 'uptime', 'cpuUsage',
  'getgroups', 'memoryUsage', 'hrtime', 'nextTick', 'emitWarning', 'argv0',
  'argv', 'mainModule', 'env', 'config', 'arch', 'title', 'release', 'version',
  'versions', 'execArgv', 'execPath', 'platform'
]
PROCESS_PROPS.forEach(k => {
  Object.defineProperty(Actor.prototype, k, {
    get () { return process[k] },
    configurable: true,
    enumerable: true
  })
})
