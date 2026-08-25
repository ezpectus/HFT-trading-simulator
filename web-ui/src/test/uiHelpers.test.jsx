import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  pnlColor,
  pnlBg,
  sideColor,
  sideBg,
  statusColor,
  statusBg,
  statusIcon,
  ICONS,
  CLASS,
  StatCard,
  Bar,
  Label,
  SectionTitle,
  WarningBanner,
} from '../utils/ui-helpers'
import { Activity } from 'lucide-react'

describe('ui-helpers', () => {
  describe('pnlColor', () => {
    it('returns green for positive pnl', () => {
      expect(pnlColor(100)).toBe('text-accent-green')
    })
    it('returns green for zero pnl', () => {
      expect(pnlColor(0)).toBe('text-accent-green')
    })
    it('returns red for negative pnl', () => {
      expect(pnlColor(-50)).toBe('text-accent-red')
    })
  })

  describe('pnlBg', () => {
    it('returns green bg for positive pnl', () => {
      expect(pnlBg(100)).toBe('bg-accent-green')
    })
    it('returns red bg for negative pnl', () => {
      expect(pnlBg(-1)).toBe('bg-accent-red')
    })
  })

  describe('sideColor', () => {
    it('returns green for BUY', () => {
      expect(sideColor('BUY')).toBe('text-accent-green')
    })
    it('returns green for LONG', () => {
      expect(sideColor('LONG')).toBe('text-accent-green')
    })
    it('returns red for SELL', () => {
      expect(sideColor('SELL')).toBe('text-accent-red')
    })
    it('returns red for SHORT', () => {
      expect(sideColor('SHORT')).toBe('text-accent-red')
    })
  })

  describe('sideBg', () => {
    it('returns green bg for BUY', () => {
      expect(sideBg('BUY')).toBe('bg-accent-green')
    })
    it('returns red bg for SELL', () => {
      expect(sideBg('SELL')).toBe('bg-accent-red')
    })
  })

  describe('statusColor', () => {
    it('returns mapped color for known status', () => {
      expect(statusColor('active', { active: 'text-green-500' })).toBe('text-green-500')
    })
    it('returns default color for unknown status', () => {
      expect(statusColor('unknown', { default: 'text-gray-500' })).toBe('text-gray-500')
    })
    it('returns fallback red for empty map', () => {
      expect(statusColor('unknown', {})).toBe('text-accent-red')
    })
  })

  describe('statusBg', () => {
    it('returns mapped bg for known status', () => {
      expect(statusBg('active', { active: 'bg-green-500' })).toBe('bg-green-500')
    })
    it('returns default bg for unknown status', () => {
      expect(statusBg('unknown', { default: 'bg-gray-500' })).toBe('bg-gray-500')
    })
    it('returns fallback bg for empty map', () => {
      expect(statusBg('unknown', {})).toBe('bg-accent-red/20')
    })
  })

  describe('statusIcon', () => {
    it('returns icon for known status', () => {
      const Icon = statusIcon('active', { active: Activity })
      expect(Icon).toBe(Activity)
    })
    it('returns default icon for unknown status', () => {
      const Icon = statusIcon('unknown', { default: Activity })
      expect(Icon).toBe(Activity)
    })
    it('returns null for empty map', () => {
      expect(statusIcon('unknown', {})).toBeNull()
    })
  })

  describe('ICONS', () => {
    it('has green, yellow, red, blue, gray, spinning keys', () => {
      expect(Object.keys(ICONS)).toEqual(['green', 'yellow', 'red', 'blue', 'gray', 'spinning'])
    })
    it('each icon is a function returning JSX', () => {
      for (const key of Object.keys(ICONS)) {
        expect(typeof ICONS[key]).toBe('function')
      }
    })
  })

  describe('CLASS constants', () => {
    it('has expected keys', () => {
      expect(CLASS.mono10).toContain('font-mono')
      expect(CLASS.panelBase).toContain('bg-bg-800')
      expect(CLASS.cardBorder).toContain('border')
    })
  })

  describe('StatCard', () => {
    it('renders label and value', () => {
      render(<StatCard label="Test Label" value="123.45" />)
      expect(screen.getByText('Test Label')).toBeInTheDocument()
      expect(screen.getByText('123.45')).toBeInTheDocument()
    })
    it('applies custom color', () => {
      render(<StatCard label="L" value="V" color="text-accent-green" />)
      expect(screen.getByText('V')).toHaveClass('text-accent-green')
    })
  })

  describe('Bar', () => {
    it('renders with correct width percentage', () => {
      const { container } = render(<Bar value={50} max={100} />)
      const inner = container.querySelector('.h-full')
      expect(inner.style.width).toBe('50%')
    })
    it('clamps to 100% when value exceeds max', () => {
      const { container } = render(<Bar value={150} max={100} />)
      const inner = container.querySelector('.h-full')
      expect(inner.style.width).toBe('100%')
    })
    it('shows 0% when max is 0', () => {
      const { container } = render(<Bar value={50} max={0} />)
      const inner = container.querySelector('.h-full')
      expect(inner.style.width).toBe('0%')
    })
  })

  describe('Label', () => {
    it('renders children text', () => {
      render(<Label>Test Label</Label>)
      expect(screen.getByText('Test Label')).toBeInTheDocument()
    })
    it('applies 9px size class', () => {
      render(<Label size="9px">Small</Label>)
      expect(screen.getByText('Small')).toHaveClass('text-[9px]')
    })
  })

  describe('SectionTitle', () => {
    it('renders title text', () => {
      render(<SectionTitle title="My Section" />)
      expect(screen.getByText('My Section')).toBeInTheDocument()
    })
    it('renders right content', () => {
      render(<SectionTitle title="S" right={<span>Right Content</span>} />)
      expect(screen.getByText('Right Content')).toBeInTheDocument()
    })
  })

  describe('WarningBanner', () => {
    it('renders children text', () => {
      render(<WarningBanner>Warning text</WarningBanner>)
      expect(screen.getByText('Warning text')).toBeInTheDocument()
    })
    it('applies color class', () => {
      render(<WarningBanner color="text-accent-red">Danger</WarningBanner>)
      expect(screen.getByText('Danger')).toHaveClass('text-accent-red')
    })
  })
})
