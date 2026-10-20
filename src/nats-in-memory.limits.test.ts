import { describe, expect, it } from 'vitest'

import { isValidSubscriptionSubject } from './nats-in-memory.limits.js'

describe('isValidSubscriptionSubject', () => {
  it.each(['a', 'a.b', 'a.*', '*', '>', 'a.>', 'a.*.>', 'a*', 'a.b>'])('accepts %s', subject => {
    expect(isValidSubscriptionSubject(subject)).toBe(true)
  })

  it.each(['a..b', '.a', 'a.', '.', 'a.>.b', '>.a'])('refuses %s', subject => {
    expect(isValidSubscriptionSubject(subject)).toBe(false)
  })
})
