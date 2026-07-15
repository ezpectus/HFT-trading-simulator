/** Format helpers for display. */

export function formatPrice(price: number | null | undefined, decimals: number = 2): string {
  if (price == null || isNaN(price)) return '--'
  return Number(price).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatVolume(vol: number | null | undefined): string {
  if (vol == null || isNaN(vol)) return '--'
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M'
  if (vol >= 1e3) return (vol / 1e3).toFixed(2) + 'K'
  return vol.toFixed(2)
}

export function formatPct(pct: number | null | undefined, decimals: number = 2): string {
  if (pct == null || isNaN(pct)) return '--'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${Number(pct).toFixed(decimals)}%`
}

export function formatUsd(amount: number | null | undefined, decimals: number = 2): string {
  if (amount == null || isNaN(amount)) return '--'
  const sign = amount < 0 ? '-' : ''
  return `${sign}$${Math.abs(Number(amount)).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

export function formatTime(ts: number): string {
  if (!ts) return '--'
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('en-US', { hour12: false })
}

export function colorForSide(side: string): string {
  return side === 'BUY' || side === 'LONG' ? 'text-accent-green' : 'text-accent-red'
}

export function bgColorForSide(side: string): string {
  return side === 'BUY' || side === 'LONG' ? 'bg-accent-green' : 'bg-accent-red'
}
