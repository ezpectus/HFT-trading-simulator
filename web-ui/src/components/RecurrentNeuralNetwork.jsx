import React, { useMemo, useState } from 'react'

// ─── Recurrent Neural Network (RNN) for Price Prediction ────────────────────
// Implements a simplified Elman RNN with BPTT (Backpropagation Through Time)
// for sequence prediction. Includes LSTM-style gating (input, forget, output gates)
// for long-range dependency capture.
//
// Mathematical foundation:
//   Elman RNN:
//   h_t = tanh(W_xh·x_t + W_hh·h_{t-1} + b_h)
//   y_t = W_hy·h_t + b_y
//
//   LSTM:
//   f_t = σ(W_f·[x_t, h_{t-1}] + b_f)  (forget gate)
//   i_t = σ(W_i·[x_t, h_{t-1}] + b_i)  (input gate)
//   g_t = tanh(W_g·[x_t, h_{t-1}] + b_g) (candidate)
//   c_t = f_t ⊙ c_{t-1} + i_t ⊙ g_t   (cell state)
//   o_t = σ(W_o·[x_t, h_{t-1}] + b_o)  (output gate)
//   h_t = o_t ⊙ tanh(c_t)              (hidden state)
//
//   BPTT: unfold through time, compute gradients, accumulate
//   Loss: MSE = (1/n)·Σ(y_pred - y_true)²

const sigmoid = (x) => 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))))
const tanh = (x) => Math.tanh(x)
const dsigmoid = (y) => y * (1 - y)
const dtanh = (y) => 1 - y * y

// Xavier initialization
const xavier = (fanIn, fanOut) => {
  const std = Math.sqrt(2 / (fanIn + fanOut))
  return (Math.random() * 2 - 1) * std
}

const initMatrix = (rows, cols, fanIn, fanOut) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => xavier(fanIn, fanOut)))

const initVector = (size) => new Array(size).fill(0)

// LSTM Cell
class LSTMCell {
  constructor(inputSize, hiddenSize) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    const concat = inputSize + hiddenSize
    // Combined weights for all gates [W_f; W_i; W_g; W_o]
    this.Wf = initMatrix(4, concat, concat, hiddenSize)
    this.bf = [initVector(hiddenSize), initVector(hiddenSize), initVector(hiddenSize), initVector(hiddenSize)]
  }

  forward(x, hPrev, cPrev) {
    const concat = [...x, ...hPrev]
    const gates = []
    for (let g = 0; g < 4; g++) {
      const gate = new Array(this.hiddenSize).fill(0)
      for (let i = 0; i < this.hiddenSize; i++) {
        let sum = this.bf[g][i]
        for (let j = 0; j < concat.length; j++) {
          sum += this.Wf[g * this.hiddenSize + i][j] * concat[j]
        }
        gate[i] = sum
      }
      gates.push(gate)
    }

    const f = gates[0].map(sigmoid)  // forget
    const i = gates[1].map(sigmoid)  // input
    const g = gates[2].map(tanh)     // candidate
    const o = gates[3].map(sigmoid)  // output

    const c = f.map((fv, k) => fv * cPrev[k] + i[k] * g[k])
    const h = o.map((ov, k) => ov * tanh(c[k]))

    return { h, c, f, i, g, o, concat }
  }
}

// Simple LSTM network
const createLSTM = (inputSize, hiddenSize, outputSize) => {
  const cell = new LSTMCell(inputSize, hiddenSize)
  const Wy = initMatrix(outputSize, hiddenSize, hiddenSize, outputSize)
  const by = initVector(outputSize)
  return { cell, Wy, by, hiddenSize, outputSize, inputSize }
}

// Forward pass through sequence
const lstmForward = (lstm, sequence, h0 = null, c0 = null) => {
  const { cell, Wy, by, hiddenSize } = lstm
  const T = sequence.length
  let h = h0 || initVector(hiddenSize)
  let c = c0 || initVector(hiddenSize)
  const cache = []

  for (let t = 0; t < T; t++) {
    const result = cell.forward(sequence[t], h, c)
    h = result.h
    c = result.c
    cache.push(result)
  }

  // Output layer
  const y = new Array(lstm.outputSize).fill(0)
  for (let i = 0; i < lstm.outputSize; i++) {
    y[i] = by[i]
    for (let j = 0; j < hiddenSize; j++) {
      y[i] += Wy[i][j] * h[j]
    }
  }

  return { y, h, c, cache }
}

// BPTT (simplified — gradient computation for output layer + last timestep)
const lstmTrain = (lstm, sequences, targets, lr = 0.01, epochs = 50) => {
  const { cell, Wy, by, hiddenSize, outputSize } = lstm
  let losses = []

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0

    for (let s = 0; s < sequences.length; s++) {
      const seq = sequences[s]
      const target = targets[s]
      const { y, cache } = lstmForward(lstm, seq)

      // Loss: MSE
      let loss = 0
      const dy = new Array(outputSize).fill(0)
      for (let i = 0; i < outputSize; i++) {
        const diff = y[i] - target[i]
        loss += diff * diff
        dy[i] = 2 * diff / outputSize
      }
      totalLoss += loss / outputSize

      // Gradient for output layer
      const lastH = cache[cache.length - 1].h
      for (let i = 0; i < outputSize; i++) {
        by[i] -= lr * dy[i]
        for (let j = 0; j < hiddenSize; j++) {
          Wy[i][j] -= lr * dy[i] * lastH[j]
        }
      }

      // BPTT through last few timesteps (truncated)
      let dh = new Array(hiddenSize).fill(0)
      let dc = new Array(hiddenSize).fill(0)
      const truncSteps = Math.min(5, cache.length)

      for (let t = cache.length - 1; t >= cache.length - truncSteps; t--) {
        const step = cache[t]
        const { f, i, g, o, c, h, concat } = step

        // Gradient from output layer (only at last timestep)
        if (t === cache.length - 1) {
          for (let j = 0; j < hiddenSize; j++) {
            for (let k = 0; k < outputSize; k++) {
              dh[j] += dy[k] * Wy[k][j]
            }
          }
        }

        // Output gate gradient
        const do_ = dh.map((d, k) => d * tanh(c[k]))
        const dcFromO = dh.map((d, k) => d * o[k] * dtanh(tanh(c[k])))
        dc = dc.map((v, k) => v + dcFromO[k])

        // Gate gradients
        const df = dc.map((v, k) => v * (t > 0 ? (cache[t - 1].c[k] || 0) : 0))
        const di = dc.map((v, k) => v * g[k])
        const dg = dc.map((v, k) => v * i[k])

        const dfPre = df.map((v, k) => v * dsigmoid(f[k]))
        const diPre = di.map((v, k) => v * dsigmoid(i[k]))
        const dgPre = dg.map((v, k) => v * dtanh(g[k]))
        const doPre = do_.map((v, k) => v * dsigmoid(o[k]))

        // Update weights (simplified — update all gate weights)
        const allGateGrads = [dfPre, diPre, dgPre, doPre]
        for (let gateIdx = 0; gateIdx < 4; gateIdx++) {
          const grad = allGateGrads[gateIdx]
          for (let neuronIdx = 0; neuronIdx < hiddenSize; neuronIdx++) {
            cell.bf[gateIdx][neuronIdx] -= lr * grad[neuronIdx]
            for (let j = 0; j < concat.length; j++) {
              const wIdx = gateIdx * hiddenSize + neuronIdx
              if (cell.Wf[wIdx]) {
                cell.Wf[wIdx][j] -= lr * grad[neuronIdx] * concat[j]
              }
            }
          }
        }

        // Propagate dh to previous timestep
        const newDh = new Array(hiddenSize).fill(0)
        for (let gateIdx = 0; gateIdx < 4; gateIdx++) {
          const grad = allGateGrads[gateIdx]
          for (let neuronIdx = 0; neuronIdx < hiddenSize; neuronIdx++) {
            const wIdx = gateIdx * hiddenSize + neuronIdx
            if (cell.Wf[wIdx]) {
              for (let j = this.inputSize; j < concat.length; j++) {
                newDh[j - this.inputSize] += grad[neuronIdx] * cell.Wf[wIdx][j]
              }
            }
          }
        }
        dh = newDh

        // dc from forget gate
        const newDc = new Array(hiddenSize).fill(0)
        for (let k = 0; k < hiddenSize; k++) {
          newDc[k] = dc[k] * f[k]
        }
        dc = newDc
      }
    }

    losses.push(totalLoss / sequences.length)
  }

  return losses
}

// Prepare sequences from returns
const prepareSequences = (returns, seqLen = 10, inputSize = 1) => {
  const sequences = []
  const targets = []
  for (let i = 0; i < returns.length - seqLen - 1; i++) {
    const seq = []
    for (let t = 0; t < seqLen; t++) {
      seq.push([returns[i + t]])
    }
    sequences.push(seq)
    targets.push([returns[i + seqLen]])
  }
  return { sequences, targets }
}

export default function RecurrentNeuralNetwork({ candles, symbol, exchange }) {
  const [hiddenSize, setHiddenSize] = useState(8)
  const [seqLen, setSeqLen] = useState(10)
  const [epochs, setEpochs] = useState(50)
  const [lr, setLr] = useState(0.01)

  const data = useMemo(() => {
    if (!candles?.[exchange]?.[symbol] || candles[exchange][symbol].length < 40) return null
    const cds = candles[exchange][symbol]
    const prices = cds.map(c => c.close)
    const returns = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1])
    }

    // Normalize returns
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length
    const stdR = Math.sqrt(returns.reduce((s, r) => s + (r - meanR) ** 2, 0) / returns.length)
    const normR = returns.map(r => stdR > 0 ? (r - meanR) / stdR : 0)

    // Prepare sequences
    const { sequences, targets } = prepareSequences(normR, seqLen)
    if (sequences.length < 10) return null

    // Train/test split
    const splitIdx = Math.floor(sequences.length * 0.8)
    const trainSeq = sequences.slice(0, splitIdx)
    const trainTgt = targets.slice(0, splitIdx)
    const testSeq = sequences.slice(splitIdx)
    const testTgt = targets.slice(splitIdx)

    // Create and train LSTM
    const lstm = createLSTM(1, hiddenSize, 1)
    const losses = lstmTrain(lstm, trainSeq, trainTgt, lr, epochs)

    // Predictions
    const trainPreds = trainSeq.map(seq => {
      const { y } = lstmForward(lstm, seq)
      return y[0]
    })
    const testPreds = testSeq.map(seq => {
      const { y } = lstmForward(lstm, seq)
      return y[0]
    })

    // Denormalize
    const denorm = (v) => v * stdR + meanR
    const trainPredsD = trainPreds.map(denorm)
    const testPredsD = testPreds.map(denorm)
    const trainTgtD = trainTgt.map(t => denorm(t[0]))
    const testTgtD = testTgt.map(t => denorm(t[0]))

    // Accuracy: direction prediction
    let trainDir = 0, testDir = 0
    for (let i = 0; i < trainPredsD.length; i++) {
      if (Math.sign(trainPredsD[i]) === Math.sign(trainTgtD[i])) trainDir++
    }
    for (let i = 0; i < testPredsD.length; i++) {
      if (Math.sign(testPredsD[i]) === Math.sign(testTgtD[i])) testDir++
    }

    // Current prediction
    const lastSeq = sequences[sequences.length - 1]
    const { y: currentPred } = lstmForward(lstm, lastSeq)
    const predReturn = denorm(currentPred[0])
    const predPrice = prices[prices.length - 1] * (1 + predReturn)

    // Signal
    let signal = 'NEUTRAL'
    if (predReturn > 0.001) signal = 'BUY'
    else if (predReturn < -0.001) signal = 'SELL'

    return {
      losses,
      trainPreds: trainPredsD.slice(-30),
      trainTgt: trainTgtD.slice(-30),
      testPreds: testPredsD,
      testTgt: testTgtD,
      trainDirAcc: trainPredsD.length > 0 ? trainDir / trainPredsD.length : 0,
      testDirAcc: testPredsD.length > 0 ? testDir / testPredsD.length : 0,
      predReturn, predPrice, signal,
      currentPrice: prices[prices.length - 1],
      nTrain: trainSeq.length, nTest: testSeq.length,
      finalLoss: losses[losses.length - 1],
    }
  }, [candles, exchange, symbol, hiddenSize, seqLen, epochs, lr])

  if (!data) {
    return <div className="p-4 text-sm text-slate-400">Need at least 40 candles for {symbol} on {exchange}</div>
  }

  const W = 800, H = 250, P = 30
  const sigColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#94a3b8'

  // Loss chart
  const maxLoss = Math.max(...data.losses)
  const sx = (i) => P + (i / Math.max(1, data.losses.length - 1)) * (W - 2 * P)
  const sy = (v) => H - P - (v / maxLoss) * (H - 2 * P)

  // Prediction chart
  const allPreds = [...data.trainPreds, ...data.testPreds]
  const allTgts = [...data.trainTgt, ...data.testTgt]
  const maxR = Math.max(0.01, ...allPreds.map(Math.abs), ...allTgts.map(Math.abs))
  const sxPred = (i) => P + (i / Math.max(1, allPreds.length - 1)) * (W - 2 * P)
  const syPred = (v) => H / 2 - (v / maxR) * (H / 2 - P)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-slate-200">LSTM Recurrent Neural Network — {symbol}</span>
        <span className="px-2 py-0.5 text-xs rounded" style={{ background: sigColor + '22', color: sigColor }}>
          {data.signal}
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Hidden units:</span>
          <input type="number" value={hiddenSize} onChange={e => setHiddenSize(Math.max(2, Math.min(32, +e.target.value)))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Seq length:</span>
          <input type="number" value={seqLen} onChange={e => setSeqLen(Math.max(3, +e.target.value))} className="w-12 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Epochs:</span>
          <input type="number" value={epochs} onChange={e => setEpochs(Math.max(10, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
        <label className="flex items-center gap-1">
          <span className="text-slate-400">Learning rate:</span>
          <input type="number" step="0.001" value={lr} onChange={e => setLr(Math.max(0.0001, +e.target.value))} className="w-16 px-1 bg-slate-800 border border-slate-600 rounded text-slate-200" />
        </label>
      </div>

      {/* Loss curve */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Training Loss (MSE) over Epochs</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#334155" />
          <line x1={P} y1={P} x2={P} y2={H - P} stroke="#334155" />
          <path d={data.losses.map((l, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(l)}`).join(' ')} fill="none" stroke="#06b6d4" strokeWidth={2} />
          <text x={W - P} y={H - 5} textAnchor="end" fill="#475569" fontSize={10}>Epoch</text>
          <text x={5} y={P + 10} fill="#475569" fontSize={10}>Loss</text>
          <text x={W - P} y={20} textAnchor="end" fill="#06b6d4" fontSize={9}>Final: {data.finalLoss.toFixed(6)}</text>
        </svg>
      </div>

      {/* Predictions vs actual */}
      <div className="bg-slate-800 rounded p-3">
        <div className="text-xs text-slate-400 mb-1">Return Predictions vs Actual (last 30 train + test)</div>
        <svg width={W} height={H} className="bg-slate-900 rounded">
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#334155" strokeDasharray="3,2" />
          {/* Actual */}
          <path d={allTgts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxPred(i)} ${syPred(v)}`).join(' ')} fill="none" stroke="#64748b" strokeWidth={1.5} opacity={0.5} />
          {/* Predicted */}
          <path d={allPreds.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sxPred(i)} ${syPred(v)}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
          {/* Train/test boundary */}
          <line x1={sxPred(data.trainPreds.length - 1)} y1={P} x2={sxPred(data.trainPreds.length - 1)} y2={H - P} stroke="#475569" strokeDasharray="4,3" />
          <text x={sxPred(data.trainPreds.length - 1) - 5} y={P + 10} textAnchor="end" fill="#475569" fontSize={9}>train</text>
          <text x={sxPred(data.trainPreds.length - 1) + 5} y={P + 10} fill="#475569" fontSize={9}>test</text>
          <text x={W - P} y={20} textAnchor="end" fill="#f59e0b" fontSize={9}>Predicted</text>
          <text x={W - P} y={34} textAnchor="end" fill="#64748b" fontSize={9}>Actual</text>
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-2 text-xs">
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Final Loss</div>
          <div className="text-cyan-400 font-mono">{data.finalLoss.toFixed(6)}</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Train Dir Acc</div>
          <div className="text-emerald-400 font-mono">{(data.trainDirAcc * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Test Dir Acc</div>
          <div className="text-amber-400 font-mono">{(data.testDirAcc * 100).toFixed(1)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pred Return</div>
          <div className="font-mono" style={{ color: sigColor }}>{(data.predReturn * 100).toFixed(4)}%</div>
        </div>
        <div className="bg-slate-800 rounded p-2">
          <div className="text-slate-400">Pred Price</div>
          <div className="text-slate-300 font-mono">${data.predPrice.toFixed(2)}</div>
        </div>
      </div>

      <div className="text-xs text-slate-400 bg-slate-800 rounded p-2">
        <strong>Architecture:</strong> LSTM({hiddenSize} units) → Dense(1) |
        <strong> BPTT:</strong> 5 timesteps truncated |
        <strong> Train/Test:</strong> {data.nTrain}/{data.nTest} sequences |
        <strong> Current:</strong> ${data.currentPrice.toFixed(2)} → ${data.predPrice.toFixed(2)}
      </div>
    </div>
  )
}
