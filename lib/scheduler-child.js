'use strict'

const Actor = require('./actor.js')

class SchedulerChild {
  constructor () {
    this.actors = new Map()
  }

  start () {
    process.on('message', msg => this.handleMsg(msg))
  }

  stop (code) {
    if (this.actors.size) {
      console.error('Error while shutting down:', this.actors.size, 'actors still pending in scheduler')
      process.exit(1)
    }
    process.exit()
  }

  handleMsg (msg) {
    switch (msg.type) {
      case 'call':
        this.handleCall(msg.id, msg.name, msg.args)
        break
      case 'actor-msg':
        const actor = this.actors.get(msg.pid)
        actor._send(msg.data)
        break
      default:
        throw new Error(`Unknown message type: ${msg.type}`)
    }
  }

  handleCall (id, name, args) {
    switch (name) {
      case 'ping':
        this.cast({id, type: 'response', data: 'pong'})
        break
      case 'ppid':
        this.ppid = args
        this.cast({id, type: 'response', data: 'ok'})
        break
      case 'stop':
        this.cast({id, type: 'response', data: 'ok'})
        this.stop(args)
        break
      case 'actor':
        // We have an actor! Let's get to work. 💪🏼
        this.schedule(new Actor(args))
        .then(
          () => this.cast({id, type: 'response', data: true}),
          error => this.cast({id, type: 'response', error})
        )
        break
    }
  }

  cast (msg) {
    process.send(msg)
  }

  schedule (actor) {
    this.actors.set(actor.pid, actor)
    actor.run()
    .then(
      () => this.cast({type: 'actor-done', pid: actor.pid, exitCode: actor.exitCode || 0}),
      err => this.cast({
        type: 'actor-error',
        pid: actor.pid,
        code: err.code || 1,
        error: err.message
      })
    )
    .then(() => this.actors.delete(actor.pid))
    return Promise.resolve()
  }
}
module.exports = SchedulerChild

if (require.main === module) {
  new SchedulerChild().start()
}
