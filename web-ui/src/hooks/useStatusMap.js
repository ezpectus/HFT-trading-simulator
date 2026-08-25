import { useMemo } from 'react'

export function useStatusMap(colorMap = {}, bgMap = {}) {
  return useMemo(() => ({
    color: (status) => colorMap[status] || colorMap.default || 'text-accent-red',
    bg: (status) => bgMap[status] || bgMap.default || 'bg-accent-red/20',
  }), [colorMap, bgMap])
}
