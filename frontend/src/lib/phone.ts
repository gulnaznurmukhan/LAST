/**
 * Phone number in the international digits-only form wa.me expects, or null.
 * Kazakhstan / Russia numbers are often written the local way: "8 701 …" -> "7701…",
 * and a bare 10-digit mobile "701 …" gets the country code 7.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  else if (digits.length === 10 && digits.startsWith('7')) digits = `7${digits}`
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

/** Opens a chat with the number and the text already typed in. */
export function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
