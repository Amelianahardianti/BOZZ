import { describe, expect, it } from 'vitest'
import { fakeJwt } from '../../test/fixtures'
import { decodeJwtExpiryMs } from './jwt'

describe('decodeJwtExpiryMs', () => {
  it('baca klaim exp (detik) jadi epoch ms', () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 3600
    const token = fakeJwt({ sub: 'user-1', role: 'owner', exp: expSeconds })

    expect(decodeJwtExpiryMs(token)).toBe(expSeconds * 1000)
  })

  it('null kalau token bukan format JWT sama sekali', () => {
    expect(decodeJwtExpiryMs('bukan-jwt-sama-sekali')).toBeNull()
  })

  it('null kalau payload bukan JSON valid', () => {
    expect(decodeJwtExpiryMs('header.***bukan-base64-json-valid***.sig')).toBeNull()
  })

  it('null kalau payload gak punya klaim exp', () => {
    const token = fakeJwt({ sub: 'user-1', role: 'owner' })
    expect(decodeJwtExpiryMs(token)).toBeNull()
  })

  it('null kalau exp bukan angka', () => {
    const token = fakeJwt({ sub: 'user-1', exp: 'bukan-angka' })
    expect(decodeJwtExpiryMs(token)).toBeNull()
  })
})
