'use strict'

const EventEmitter = require('events')
const vm = require('vm')

const CODE_CACHE = new Map()

// A serializable child process object.
class Actor extends EventEmitter {
  constructor (opts) {
    super()
    this.pid = opts.pid
    this.script = opts.script
    this.exitCode = null
    this._mailbox = []
    this._pending = []
  }
  run (extraCtx) {
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
    return this._pending.forEach(p => {
      const err = new Error(`actor exited with code ${code}`)
      err.code = code
      p.reject(err)
    })
  }
  send (msg) {
    if (
      !Buffer.isBuffer(msg) ||
      typeof msg === 'object' ||
      typeof msg === 'function'
    ) {
      try {
        JSON.stringify(msg)
      } catch (e) {
        e.message = `Messages must be JSON-serializable\n${e.message}`
        throw e
      }
    }
    this.emit('message', msg)
    const pendingIdx = this._pending.findIndex(p => p.filter(msg))
    if (pendingIdx !== -1) {
      const pending = this._pending[pendingIdx]
      this._pending.splice(pendingIdx, 1)
      pending.resolve(msg)
    } else {
      this._mailbox.unshift(msg)
    }
  }
  receive (filter) {
    filter = filter || (() => true)
    const fromMailbox = this._mailbox.findIndex(filter)
    if (fromMailbox !== -1) {
      const msg = this._mailbox[fromMailbox]
      this._mailbox.splice(fromMailbox, 1)
      return Promise.resolve(msg)
    } else {
      return new Promise((resolve, reject) => {
        this._pending.push({filter, resolve, reject})
      })
    }
  }
  flush () {
    const old = this._mailbox
    this._mailbox = []
    return old
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
