import { describe, expect, it } from 'vitest'
import { MAX_LOGO_FILE_BYTES, validateLogoFile } from './image'

function fileOf(type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], 'file', { type })
}

describe('validateLogoFile', () => {
  it('terima JPG dalam batas ukuran', () => {
    expect(validateLogoFile(fileOf('image/jpeg', 1024))).toBeNull()
  })

  it('terima PNG dalam batas ukuran', () => {
    expect(validateLogoFile(fileOf('image/png', 1024))).toBeNull()
  })

  it('tolak tipe file selain JPG/PNG', () => {
    expect(validateLogoFile(fileOf('application/pdf', 1024))).toBe('Format logo harus JPG atau PNG.')
  })

  it('tolak file di atas batas ukuran mentah', () => {
    expect(validateLogoFile(fileOf('image/jpeg', MAX_LOGO_FILE_BYTES + 1))).toBe('Ukuran file maksimal 5MB.')
  })

  it('terima file PERSIS di batas ukuran', () => {
    expect(validateLogoFile(fileOf('image/jpeg', MAX_LOGO_FILE_BYTES))).toBeNull()
  })
})
