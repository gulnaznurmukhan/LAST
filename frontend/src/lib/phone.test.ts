import { describe, expect, it } from 'vitest'

import { whatsappNumber, whatsappUrl } from './phone'

describe('whatsappNumber', () => {
  it.each([
    ['+7 (701) 123-45-67', '77011234567'],
    ['8 701 123 45 67', '77011234567'],
    ['701 123 45 67', '77011234567'],
    ['+49 151 2345 6789', '4915123456789'],
  ])('%s -> %s', (input, expected) => {
    expect(whatsappNumber(input)).toBe(expected)
  })

  it('rejects numbers that are too short or missing', () => {
    expect(whatsappNumber('12-34')).toBeNull()
    expect(whatsappNumber(null)).toBeNull()
  })

  it('encodes the prepared text', () => {
    expect(whatsappUrl('77011234567', 'Привет & спасибо')).toBe(
      'https://wa.me/77011234567?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82%20%26%20%D1%81%D0%BF%D0%B0%D1%81%D0%B8%D0%B1%D0%BE',
    )
  })
})
