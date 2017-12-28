'use strict'

const test = require('tap').test

const Mailbox = require('../lib/mailbox.js')

test('can receive messages', t => {
  const box = new Mailbox()
  box.send('hello')
  return box.recv()
  .then(m => t.equal(m, 'hello', 'message without pending receive delivered'))
  .then(() => box.send('world'))
  .then(() => box.recv())
  .then(m => t.equal(m, 'world', 'message with pending receive delivered'))
  .then(() => {
    const first2 = [box.recv(m => m === 1), box.recv(m => m === 2)]
    box.send(2).send(3).send(1)
    return Promise.all(first2.concat([box.recv(m => m === 3)]))
  })
  .then(reordered => {
    t.deepEqual(
      reordered, [1, 2, 3], 'messages skipped based on recv matcher.'
    )
  })
})

test('recv matcher', t => {
  const box = new Mailbox()
  const first2 = [box.recv(m => m === 1), box.recv(m => m === 2)]
  box.send(2).send(3).send(1)
  return Promise.all(first2.concat([box.recv(m => m === 3)]))
  .then(reordered => {
    t.deepEqual(
      reordered, [1, 2, 3], 'messages picked up based on recv matcher.'
    )
  })
})

test('.on("message") handler', t => {
  const box = new Mailbox()
  box.send('hello')
  const msgs = []
  box.on('message', m => msgs.push(m))
  box.send('world')
  t.deepEqual(msgs, ['world'], 'can attach a free-flowing message handler')
  return Promise.all([box.recv(), box.recv()])
  .then(messages =>
    t.deepEqual(messages, ['hello', 'world'], 'regular queue unaffected')
  )
})

test('rejects non-JSON messages', t => {
  const box = new Mailbox()
  const circ = {}
  circ.circ = circ
  t.throws(() => {
    box.send(circ)
  }, /JSON/i, 'throws if a non-JSON-serializable object is passed')
  const buf = Buffer.from([])
  box.send(buf)
  return box.recv().then(msg => {
    t.equal(msg, buf, 'buffers special-cased and preserve identity')
  })
})

test('flushing messages', t => {
  const box = new Mailbox()
  box.send(1).send(2).send(3)
  t.deepEqual(box.flush(), [1, 2, 3], 'flushes all messages out in send order')
  const p = box.recv()
  box.send(4)
  return p.then(msg => t.equal(msg, 4, 'new messages received normally'))
})

test('closing mailbox', t => {
  const box = new Mailbox()
  function recvFail () {
    return box.recv().then(
      () => { throw new Error('should not have succeeded') },
      err => err
    )
  }
  const waiting = [recvFail(), recvFail()]
  box.close(new Error('boy bye'))
  waiting.push(recvFail())
  t.throws(() => box.send('hi'), /closed/i, 'box.send() throws when closed')
  return Promise.all(waiting)
  .then(errors => errors.map(x => x.message))
  .then(msgs =>
    t.deepEqual(msgs, ['boy bye', 'boy bye', 'mailbox closed'])
  )
})
