import React, { useState, useMemo } from 'react';
import { GitCompare, Trash2, Download, TrendingUp, TrendingDown, Award, Activity } from 'lucide-react';

const METRICS = [
  { key: 'sharpe', label: 'Sharpe Ratio', format: (v) => v.toFixed(2), good: (v) => v > 1.0, best: 'high' },
  { key: 'sortino', label: 'Sortino Ratio', format: (v) => v.toFixed(2), good: (v) => v > 1.5, best: 'high' },
  { key: 'totalReturn', label: 'Total Return %', format: (v) => v.toFixed(1) + '%', good: (v) => v > 0, best: 'high' },
  { key: 'maxDrawdown', label: 'Max Drawdown %', format: (v) => v.toFixed(1) + '%', good: (v) => v < 15, best: 'low' },
  { key: 'winRate', label: 'Win Rate %', format: (v) => v.toFixed(1) + '%', good: (v) => v > 50, best: 'high' },
  { key: 'profitFactor', label: 'Profit Factor', format: (v) => v.toFixed(2), good: (v) => v > 1.5, best: 'high' },
  { key: 'totalTrades', label: 'Total Trades', format: (v) => v.toString(), good: () => true, best: 'neutral' },
  { key: 'avgWin', label: 'Avg Win $', format: (v) => '$' + v.toFixed(2), good: (v) => v > 0, best: 'high' },
  { key: 'avgLoss', label: 'Avg Loss $', format: (v) => '$' + v.toFixed(2), good: (v) => v > -100, best: 'low' },
  { key: 'cagr', label: 'CAGR %', format: (v) => v.toFixed(1) + '%', good: (v) => v > 10, best: 'high' },
  { key: 'calmar', label: 'Calmar Ratio', format: (v) => v.toFixed(2), good: (v) => v > 0.5, best: 'high' },
  { key: 'volatility', label: 'Volatility %', format: (v) => v.toFixed(1) + '%', good: (v) => v < 30, best: 'low' },
];

function getBestValue(results, metricKey, best) {
  if (best === 'neutral') return null;
  const values = results.map(r => r[metricKey]).filter(v => typeof v === 'number' && !isNaN(v));
  if (values.length === 0) return null;
  return best === 'high' ? Math.max(...values) : Math.min(...values);
}

function MetricBar({ value, best, bestValue, format }) {
  const isBest = best !== 'neutral' && bestValue !== null && value === bestValue;
  const color = isBest ? '#00C853' : '#666680';
  return (
    <span style={{ color, fontWeight: isBest ? 700 : 400 }}>
      {format(value)}
      {isBest && <Award size={12} style={{ display: 'inline', marginLeft: 4, verticalAlign: 'middle' }} />}
    </span>
  );
}

function EquityCurve({ results }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const colors = ['#2196F3', '#FF1744', '#00C853', '#FFB300', '#9C27B0', '#00BCD4'];

  const allCurves = results.map(r => r.equityCurve).filter(Boolean);
  if (allCurves.length === 0) return null;

  const maxLen = Math.max(...allCurves.map(c => c.length));
  const allValues = allCurves.flat();
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const width = 600;
  const height = 200;
  const padding = 30;

  return (
    <div className="backtest-comparison-chart">
      <svg width={width + padding * 2} height={height + padding * 2} className="equity-svg">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(f => {
          const y = padding + f * height;
          const val = maxVal - f * range;
          return (
            <g key={f}>
              <line x1={padding} y1={y} x2={width + padding} y2={y} stroke="#2a2a4a" strokeWidth={0.5} />
              <text x={padding - 5} y={y + 4} textAnchor="end" fill="#666680" fontSize={10}>
                {val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Equity curves */}
        {results.map((r, idx) => {
          const curve = r.equityCurve;
          if (!curve || curve.length < 2) return null;
          const points = curve.map((v, i) => {
            const x = padding + (i / (maxLen - 1)) * width;
            const y = padding + (1 - (v - minVal) / range) * height;
            return `${x},${y}`;
          }).join(' ');
          const color = colors[idx % colors.length];
          return (
            <g key={r.id}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={hoverIdx === idx ? 3 : 1.5}
                opacity={hoverIdx === null || hoverIdx === idx ? 1 : 0.3}
              />
            </g>
          );
        })}

        {/* Legend */}
        {results.map((r, idx) => {
          const color = colors[idx % colors.length];
          return (
            <g key={r.id} transform={`translate(${padding + idx * 120}, ${height + padding + 15})`}>
              <rect width={12} height={12} fill={color} rx={2}
                opacity={hoverIdx === null || hoverIdx === idx ? 1 : 0.3}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              />
              <text x={16} y={10} fill="#a0a0b8" fontSize={11}
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
              >{r.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function BacktestComparison({ results: externalResults }) {
  const [results, setResults] = useState(externalResults || []);
  const [selected, setSelected] = useState(new Set());

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => (b.sharpe || 0) - (a.sharpe || 0));
  }, [results]);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 6) next.add(id);
      return next;
    });
  };

  const removeResult = (id) => {
    setResults(prev => prev.filter(r => r.id !== id));
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const clearAll = () => {
    setResults([]);
    setSelected(new Set());
  };

  const exportCSV = () => {
    const headers = ['Name', ...METRICS.map(m => m.label)];
    const rows = results.map(r => [r.name, ...METRICS.map(m => r[m.key] ?? '')]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backtest_comparison.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleResults = selected.size > 0
    ? sortedResults.filter(r => selected.has(r.id))
    : sortedResults.slice(0, 4);

  if (results.length === 0) {
    return (
      <div className="backtest-comparison-empty">
        <GitCompare size={48} className="bc-empty-icon" />
        <h3>No backtests to compare</h3>
        <p>Run multiple backtests from the Strategy Backtest Engine to compare them here.</p>
      </div>
    );
  }

  return (
    <div className="backtest-comparison">
      {/* Header */}
      <div className="bc-header">
        <div className="bc-title">
          <GitCompare size={20} />
          <span>Backtest Comparison</span>
          <span className="bc-count">{results.length} results</span>
        </div>
        <div className="bc-actions">
          <button onClick={exportCSV} className="bc-btn" title="Export CSV">
            <Download size={14} /> Export
          </button>
          <button onClick={clearAll} className="bc-btn bc-btn-danger" title="Clear all">
            <Trash2 size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Equity curve chart */}
      {visibleResults.length > 0 && visibleResults.some(r => r.equityCurve) && (
        <div className="bc-chart-section">
          <h4 className="bc-section-title">
            <Activity size={16} /> Equity Curves
          </h4>
          <EquityCurve results={visibleResults} />
        </div>
      )}

      {/* Comparison table */}
      <div className="bc-table-wrapper">
        <table className="bc-table">
          <thead>
            <tr>
              <th className="bc-th-name">
                <input
                  type="checkbox"
                  checked={selected.size === results.length && results.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelected(new Set(results.map(r => r.id)));
                    else setSelected(new Set());
                  }}
                />
                {' '}Strategy
              </th>
              {METRICS.map(m => (
                <th key={m.key} className="bc-th-metric">{m.label}</th>
              ))}
              <th className="bc-th-action"></th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.map((r, idx) => {
              const isSelected = selected.has(r.id);
              const isTopSharpe = idx === 0;
              return (
                <tr
                  key={r.id}
                  className={`bc-row ${isSelected ? 'bc-row-selected' : ''} ${isTopSharpe ? 'bc-row-top' : ''}`}
                  onClick={() => toggleSelect(r.id)}
                >
                  <td className="bc-td-name">
                    <input type="checkbox" checked={isSelected} readOnly style={{ marginRight: 8 }} />
                    <span className="bc-strategy-name">{r.name}</span>
                    {isTopSharpe && (
                      <span className="bc-badge bc-badge-best">
                        <TrendingUp size={11} /> Best Sharpe
                      </span>
                    )}
                  </td>
                  {METRICS.map(m => {
                    const val = r[m.key];
                    const bestVal = getBestValue(sortedResults, m.key, m.best);
                    return (
                      <td key={m.key} className="bc-td-metric">
                        {typeof val === 'number' && !isNaN(val) ? (
                          <MetricBar value={val} best={m.best} bestValue={bestVal} format={m.format} />
                        ) : (
                          <span className="bc-na">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="bc-td-action">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeResult(r.id); }}
                      className="bc-btn-remove"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary cards */}
      <div className="bc-summary">
        {(() => {
          const bestSharpe = sortedResults[0];
          const bestReturn = [...results].sort((a, b) => (b.totalReturn || 0) - (a.totalReturn || 0))[0];
          const bestSortino = [...results].sort((a, b) => (b.sortino || 0) - (a.sortino || 0))[0];
          const lowestDD = [...results].sort((a, b) => (a.maxDrawdown || 999) - (b.maxDrawdown || 999))[0];

          const cards = [
            { label: 'Best Sharpe', value: bestSharpe?.sharpe?.toFixed(2), name: bestSharpe?.name, icon: TrendingUp, color: '#00C853' },
            { label: 'Best Return', value: bestReturn?.totalReturn?.toFixed(1) + '%', name: bestReturn?.name, icon: TrendingUp, color: '#2196F3' },
            { label: 'Best Sortino', value: bestSortino?.sortino?.toFixed(2), name: bestSortino?.name, icon: Activity, color: '#FFB300' },
            { label: 'Lowest DD', value: lowestDD?.maxDrawdown?.toFixed(1) + '%', name: lowestDD?.name, icon: TrendingDown, color: '#9C27B0' },
          ];

          return cards.map(c => (
            <div key={c.label} className="bc-summary-card">
              <div className="bc-card-icon" style={{ color: c.color }}><c.icon size={18} /></div>
              <div className="bc-card-info">
                <span className="bc-card-label">{c.label}</span>
                <span className="bc-card-value">{c.value || '—'}</span>
                <span className="bc-card-name">{c.name || '—'}</span>
              </div>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
