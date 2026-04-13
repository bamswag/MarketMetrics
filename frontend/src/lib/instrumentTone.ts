export type InstrumentTone = 'positive' | 'negative' | 'neutral'

export function resolveInstrumentTone(changePercent?: string | null): InstrumentTone {
  const normalizedChange = changePercent?.trim() ?? ''

  if (!normalizedChange || normalizedChange === '--') {
    return 'neutral'
  }

  return normalizedChange.startsWith('-') ? 'negative' : 'positive'
}

export function resolveInstrumentTonePillClass(
  tone: InstrumentTone,
): 'positive-pill' | 'negative-pill' | 'neutral-pill' {
  switch (tone) {
    case 'positive':
      return 'positive-pill'
    case 'negative':
      return 'negative-pill'
    default:
      return 'neutral-pill'
  }
}
