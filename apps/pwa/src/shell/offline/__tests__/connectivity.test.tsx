import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { isOnline, subscribeToConnectivity, useOnlineStatus } from '../connectivity'

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('isOnline', () => {
  it('cerminan navigator.onLine', () => {
    setNavigatorOnLine(true)
    expect(isOnline()).toBe(true)

    setNavigatorOnLine(false)
    expect(isOnline()).toBe(false)
  })
})

describe('subscribeToConnectivity', () => {
  it('manggil callback pas event online/offline browser', () => {
    const changes: boolean[] = []
    const unsubscribe = subscribeToConnectivity((online) => changes.push(online))

    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))

    expect(changes).toEqual([false, true])
    unsubscribe()
  })

  it('unsubscribe beneran berhenti, gak ke-panggil lagi abis itu', () => {
    const changes: boolean[] = []
    const unsubscribe = subscribeToConnectivity((online) => changes.push(online))
    unsubscribe()

    window.dispatchEvent(new Event('offline'))

    expect(changes).toEqual([])
  })
})

describe('useOnlineStatus', () => {
  it('mulai dari navigator.onLine, update pas event online/offline', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
