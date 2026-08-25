import { memo, useMemo, useState } from 'react'
import { Dna, Trophy, Users, TrendingUp } from 'lucide-react'
import { StatCard, Bar, WarningBanner, Label, SectionTitle } from '../utils/ui-helpers'

const MOCK_GENERATIONS = [
  { gen: 1, best: 0.45, avg: 0.28, worst: 0.12, diversity: 0.85, population: 50 },
  { gen: 2, best: 0.52, avg: 0.35, worst: 0.18, diversity: 0.78, population: 50 },
  { gen: 3, best: 0.58, avg: 0.41, worst: 0.22, diversity: 0.72, population: 50 },
  { gen: 4, best: 0.63, avg: 0.45, worst: 0.25, diversity: 0.68, population: 50 },
  { gen: 5, best: 0.68, avg: 0.48, worst: 0.28, diversity: 0.62, population: 50 },
  { gen: 6, best: 0.72, avg: 0.52, worst: 0.30, diversity: 0.55, population: 50 },
  { gen: 7, best: 0.75, avg: 0.55, worst: 0.32, diversity: 0.48, population: 50 },
  { gen: 8, best: 0.78, avg: 0.58, worst: 0.35, diversity: 0.42, population: 50 },
  { gen: 9, best: 0.81, avg: 0.61, worst: 0.38, diversity: 0.38, population: 50 },
  { gen: 10, best: 0.85, avg: 0.65, worst: 0.42, diversity: 0.32, population: 50 },
]

const MOCK_TOP_INDIVIDUALS = [
  { rank: 1, id: 'ind_042', fitness: 0.85, genome: 'RSI+EMA+VOL', sharpe: 2.15, maxDD: -5.2, trades: 142 },
  { rank: 2, id: 'ind_017', fitness: 0.82, genome: 'MACD+ATR+OBV', sharpe: 1.92, maxDD: -6.8, trades: 128 },
  { rank: 3, id: 'ind_038', fitness: 0.78, genome: 'BB+RSI+FUND', sharpe: 1.78, maxDD: -4.5, trades: 95 },
  { rank: 4, id: 'ind_009', fitness: 0.75, genome: 'EMA+SMA+VWAP', sharpe: 1.65, maxDD: -7.2, trades: 110 },
  { rank: 5, id: 'ind_025', fitness: 0.72, genome: 'RSI+MACD+VOL', sharpe: 1.52, maxDD: -8.5, trades: 165 },
]

const MOCK_OPERATORS = [
  { op: 'Crossover', count: 320, pct: 45 },
  { op: 'Mutation', count: 180, pct: 25 },
  { op: 'Selection', count: 120, pct: 17 },
  { op: 'Elitism', count: 50, pct: 7 },
  { op: 'Immigration', count: 30, pct: 4 },
  { op: 'Other', count: 10, pct: 2 },
]

const GeneticViewer = memo(function GeneticViewer() {
  const [selectedGen, setSelectedGen] = useState(10)

  const stats = useMemo(() => {
    const currentGen = MOCK_GENERATIONS[MOCK_GENERATIONS.length - 1]
    const firstGen = MOCK_GENERATIONS[0]
    const improvement = ((currentGen.best - firstGen.best) / firstGen.best * 100)
    return { currentGen, firstGen, improvement }
  }, [])

  return (
    <div className="p-3 bg-bg-800 text-gray-200 text-xs space-y-2">
      <SectionTitle icon={Dna} title="Genetic Algorithm Viewer" iconColor="text-accent-purple" right={<span className="text-[10px] text-gray-600">Gen {stats.currentGen.gen}</span>} />

      {/* Summary */}
      <div className="grid grid-cols-4 gap-1">
        <StatCard label="Best Fitness" value={stats.currentGen.best.toFixed(2)} color="text-accent-green" compact />
        <StatCard label="Avg Fitness" value={stats.currentGen.avg.toFixed(2)} color="text-gray-300" compact />
        <StatCard label="Diversity" value={`${(stats.currentGen.diversity * 100).toFixed(0)}%`} color={stats.currentGen.diversity > 0.4 ? 'text-accent-green' : 'text-accent-yellow'} compact />
        <StatCard label="Improvement" value={`+${stats.improvement.toFixed(0)}%`} color="text-accent-blue" compact />
      </div>

      {/* Fitness evolution chart */}
      <div className="p-2 bg-bg-700 border border-bg-600">
        <div className="flex items-center gap-1 mb-1">
          <TrendingUp size={11} className="text-gray-500" />
          <Label>Fitness Evolution</Label>
        </div>
        <div className="flex items-end gap-1 h-16">
          {MOCK_GENERATIONS.map(g => (
            <div
              key={g.gen}
              onClick={() => setSelectedGen(g.gen)}
              className={`flex-1 flex flex-col items-center cursor-pointer ${selectedGen === g.gen ? 'ring-1 ring-accent-purple rounded' : ''}`}
            >
              <div className="flex items-end gap-0.5 h-12">
                <div className="w-1.5 bg-accent-green" style={{ height: `${(g.best / 0.9) * 100}%` }} />
                <div className="w-1.5 bg-accent-yellow" style={{ height: `${(g.avg / 0.9) * 100}%` }} />
                <div className="w-1.5 bg-accent-red" style={{ height: `${(g.worst / 0.9) * 100}%` }} />
              </div>
              <span className="text-[7px] text-gray-600 mt-0.5">G{g.gen}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[8px]">
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-green" />Best</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-yellow" />Avg</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-accent-red" />Worst</span>
        </div>
      </div>

      {/* Top individuals */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Trophy size={11} className="text-gray-500" />
          <Label>Top Individuals (Gen {selectedGen})</Label>
        </div>
        <div className="space-y-0.5">
          {MOCK_TOP_INDIVIDUALS.map(ind => (
            <div key={ind.rank} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className={`text-[9px] font-mono w-4 ${ind.rank === 1 ? 'text-accent-yellow font-bold' : 'text-gray-500'}`}>
                #{ind.rank}
              </span>
              <span className="text-[9px] text-gray-400 font-mono w-16">{ind.id}</span>
              <span className="text-[10px] text-gray-300 flex-1 truncate">{ind.genome}</span>
              <span className="text-[9px] font-mono text-accent-green w-10 text-right">{ind.fitness.toFixed(2)}</span>
              <span className="text-[9px] font-mono text-accent-blue w-10 text-right">{ind.sharpe.toFixed(2)}</span>
              <span className="text-[9px] font-mono text-accent-red w-10 text-right">{ind.maxDD.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Genetic operators */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <Users size={11} className="text-gray-500" />
          <Label>Operator Distribution</Label>
        </div>
        <div className="space-y-0.5">
          {MOCK_OPERATORS.map(op => (
            <div key={op.op} className="flex items-center gap-2 py-0.5 px-1.5 bg-bg-700">
              <span className="text-[10px] text-gray-300 w-20">{op.op}</span>
              <Bar value={op.pct} max={100} color="bg-accent-purple" />
              <span className="text-[9px] font-mono text-gray-400 w-10 text-right">{op.count}</span>
              <span className="text-[9px] text-gray-600 w-8 text-right">{op.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {stats.currentGen.diversity < 0.4 && (
        <WarningBanner icon={null} color="text-accent-yellow">
          Low diversity ({(stats.currentGen.diversity * 100).toFixed(0)}%) — consider increasing mutation rate
        </WarningBanner>
      )}
    </div>
  )
})

export default GeneticViewer
