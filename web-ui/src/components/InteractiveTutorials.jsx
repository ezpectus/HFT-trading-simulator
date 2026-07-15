import React, { useState, useCallback } from 'react';
import { BookOpen, ChevronRight, ChevronLeft, Code, Lightbulb, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';

const TUTORIALS = [
  {
    id: 'intro',
    title: 'Introduction to HFT',
    level: 'Beginner',
    duration: '5 min',
    steps: [
      {
        title: 'What is High-Frequency Trading?',
        content: 'High-Frequency Trading (HFT) uses algorithms to execute trades at microsecond speeds. This simulator teaches you the fundamentals without risking real money.',
        tip: 'HFT accounts for ~50% of US equity trading volume.',
      },
      {
        title: 'Market Microstructure Basics',
        content: 'Every market has an order book — a list of buy (bid) and sell (ask) orders. The difference between best bid and best ask is the spread.',
        tip: 'Tighter spread = more liquid market.',
        code: 'best_bid = 65100.50\nbest_ask = 65100.55\nspread = best_ask - best_bid  # 0.05',
      },
      {
        title: 'Order Types',
        content: 'Market orders execute immediately at the best available price. Limit orders specify a maximum/minimum price. IOC (Immediate or Cancel) combines both.',
        tip: 'HFT firms almost exclusively use limit orders.',
      },
    ],
    quiz: [
      { q: 'What is High-Frequency Trading?', a: ['Algorithmic trading at microsecond speeds', 'Trading with high leverage', 'Trading only high-priced stocks', 'Trading during high volatility'], correct: 0 },
      { q: 'What is the bid-ask spread?', a: ['The difference between best bid and best ask', 'The difference between high and low', 'The commission fee', 'The slippage amount'], correct: 0 },
      { q: 'Which order type do HFT firms primarily use?', a: ['Limit orders', 'Market orders', 'Stop orders', 'IOC orders'], correct: 0 },
    ],
  },
  {
    id: 'signals',
    title: 'Signal Generation',
    level: 'Intermediate',
    duration: '10 min',
    steps: [
      {
        title: 'What is a Trading Signal?',
        content: 'A signal is an indicator that suggests when to buy or sell. Common signals: RSI, MACD, EMA crossovers, order book imbalance (OBI).',
        tip: 'A good signal has positive expectancy — it wins more than it loses over time.',
      },
      {
        title: 'RSI (Relative Strength Index)',
        content: 'RSI measures momentum on a 0-100 scale. RSI < 30 = oversold (buy signal), RSI > 70 = overbought (sell signal).',
        tip: 'RSI works best in ranging markets, not in strong trends.',
        code: 'def rsi(prices, period=14):\n    gains = [p2-p1 for p1,p2 in zip(prices, prices[1:]) if p2>p1]\n    losses = [p1-p2 for p1,p2 in zip(prices, prices[1:]) if p2<p1]\n    rs = mean(gains) / mean(losses)\n    return 100 - 100/(1+rs)',
      },
      {
        title: 'Order Book Imbalance (OBI)',
        content: 'OBI compares buy vs sell volume in the order book. High OBI = more buyers = price likely to go up.',
        tip: 'OBI is a leading indicator — it predicts short-term price movement.',
        code: 'obi = (bid_volume - ask_volume) / (bid_volume + ask_volume)\n# obi > 0.3 → bullish signal',
      },
    ],
    quiz: [
      { q: 'What does RSI < 30 indicate?', a: ['Oversold — potential buy signal', 'Overbought — potential sell signal', 'Strong uptrend', 'High volatility'], correct: 0 },
      { q: 'What does OBI > 0.3 suggest?', a: ['More buyers than sellers — bullish', 'More sellers than buyers — bearish', 'Balanced market', 'Low liquidity'], correct: 0 },
      { q: 'What makes a trading signal good?', a: ['Positive expectancy over time', 'High frequency', 'Complex math', 'Always wins'], correct: 0 },
    ],
  },
  {
    id: 'risk',
    title: 'Risk Management',
    level: 'Intermediate',
    duration: '8 min',
    steps: [
      {
        title: 'Position Sizing',
        content: 'Never risk more than 1-2% of your capital on a single trade. The Kelly Criterion provides optimal position sizing.',
        tip: 'Kelly fraction = edge / odds. Use half-Kelly for safety.',
        code: 'kelly = win_rate * avg_win - loss_rate * avg_loss\nposition_size = capital * kelly * 0.5  # half-Kelly',
      },
      {
        title: 'Stop-Loss and Take-Profit',
        content: 'Always set stop-loss to limit downside. Use ATR-based stops for volatility-adjusted risk. Take-profit at 2:1 reward:risk minimum.',
        tip: 'ATR stop = entry_price - 2 * ATR (for longs)',
      },
    ],
    quiz: [
      { q: 'What is the recommended max risk per trade?', a: ['1-2% of capital', '5-10% of capital', '25% of capital', '100% of capital'], correct: 0 },
      { q: 'What does the Kelly Criterion calculate?', a: ['Optimal position size based on edge and odds', 'Maximum drawdown', 'Sharpe ratio', 'Win rate'], correct: 0 },
      { q: 'What is half-Kelly?', a: ['Using half the Kelly fraction for safety', 'Trading half the day', 'Using half your capital', 'Half the win rate'], correct: 0 },
    ],
  },
  {
    id: 'backtesting',
    title: 'Backtesting Strategies',
    level: 'Advanced',
    duration: '15 min',
    steps: [
      {
        title: 'What is Backtesting?',
        content: 'Backtesting runs your strategy on historical data to see how it would have performed. Key metrics: Sharpe ratio, max drawdown, win rate.',
        tip: 'Always account for transaction costs in backtests!',
      },
      {
        title: 'Walk-Forward Analysis',
        content: 'Instead of one backtest, split data into segments. Optimize on segment 1, test on segment 2, then roll forward. Prevents overfitting.',
        tip: 'If a strategy only works on one period, it\'s overfitted.',
      },
      {
        title: 'Common Pitfalls',
        content: 'Survivorship bias (only testing stocks that survived), look-ahead bias (using future data), and overfitting (too many parameters).',
        tip: 'Fewer parameters = more robust strategy.',
      },
    ],
    quiz: [
      { q: 'What is survivorship bias in backtesting?', a: ['Only testing strategies on assets that still exist', 'Using too many parameters', 'Testing on future data', 'Ignoring transaction costs'], correct: 0 },
      { q: 'What does walk-forward analysis prevent?', a: ['Overfitting', 'Slippage', 'Latency', 'Market crashes'], correct: 0 },
      { q: 'What is look-ahead bias?', a: ['Using future data that would not be available at decision time', 'Looking at too many charts', 'Testing too far back in time', 'Using too much leverage'], correct: 0 },
    ],
  },
];

export default function InteractiveTutorials() {
  const [activeTutorial, setActiveTutorial] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(new Set());
  const [quizAnswers, setQuizAnswers] = useState({});
  const [showQuiz, setShowQuiz] = useState(false);

  const tutorial = TUTORIALS[activeTutorial];
  const step = tutorial.steps[currentStep];
  const isLastStep = currentStep === tutorial.steps.length - 1;
  const isFirstStep = currentStep === 0;

  const next = useCallback(() => {
    if (isLastStep) {
      if (tutorial.quiz && !showQuiz) {
        setShowQuiz(true);
        return;
      }
      setCompleted(prev => new Set([...prev, tutorial.id]));
      setShowQuiz(false);
      setQuizAnswers({});
      if (activeTutorial < TUTORIALS.length - 1) {
        setActiveTutorial(activeTutorial + 1);
        setCurrentStep(0);
      }
    } else {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep, isLastStep, activeTutorial, tutorial.id, tutorial.quiz, showQuiz]);

  const prev = useCallback(() => {
    if (isFirstStep && activeTutorial > 0) {
      setActiveTutorial(activeTutorial - 1);
      setCurrentStep(TUTORIALS[activeTutorial - 1].steps.length - 1);
    } else if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep, isFirstStep, activeTutorial]);

  return (
    <div className="tutorials-container">
      <div className="tutorials-sidebar">
        <h3 className="tutorials-title">
          <BookOpen size={20} /> Tutorials
        </h3>
        {TUTORIALS.map((t, i) => (
          <button
            key={t.id}
            className={`tutorial-item ${activeTutorial === i ? 'active' : ''}`}
            onClick={() => { setActiveTutorial(i); setCurrentStep(0); }}
          >
            <div className="tutorial-item-info">
              <span className="tutorial-item-title">{t.title}</span>
              <span className="tutorial-item-meta">{t.level} · {t.duration}</span>
            </div>
            {completed.has(t.id) && <CheckCircle2 size={16} className="tutorial-complete" />}
          </button>
        ))}
      </div>

      <div className="tutorial-content">
        <div className="tutorial-header">
          <h2>{tutorial.title}</h2>
          <div className="tutorial-progress">
            {tutorial.steps.map((_, i) => (
              <div key={i} className={`progress-dot ${i <= currentStep ? 'filled' : ''}`} />
            ))}
          </div>
        </div>

        {showQuiz && tutorial.quiz ? (
          <div className="tutorial-quiz">
            <h3 className="step-title"><HelpCircle size={16} style={{display:'inline',marginRight:'4px'}} />Quiz Time!</h3>
            {tutorial.quiz.map((item, qi) => (
              <div key={qi} className="quiz-question">
                <p className="quiz-q">{qi + 1}. {item.q}</p>
                {item.a.map((ans, ai) => {
                  const answered = quizAnswers[qi] !== undefined;
                  const isCorrect = ai === item.correct;
                  const isSelected = quizAnswers[qi] === ai;
                  return (
                    <button
                      key={ai}
                      onClick={() => !answered && setQuizAnswers(prev => ({ ...prev, [qi]: ai }))}
                      className={`quiz-option ${!answered ? '' : isCorrect ? 'quiz-correct' : isSelected ? 'quiz-wrong' : ''}`}
                      disabled={answered}
                    >
                      {answered && isCorrect && <CheckCircle2 size={12} style={{display:'inline',marginRight:'4px'}} />}
                      {answered && isSelected && !isCorrect && <XCircle size={12} style={{display:'inline',marginRight:'4px'}} />}
                      {ans}
                    </button>
                  );
                })}
              </div>
            ))}
            <p className="quiz-score">
              Score: {Object.entries(quizAnswers).filter(([qi, ai]) => tutorial.quiz[Number(qi)].correct === ai).length} / {tutorial.quiz.length}
            </p>
          </div>
        ) : (
          <div className="tutorial-step">
            <h3 className="step-title">{step.title}</h3>
            <p className="step-content">{step.content}</p>

            {step.code && (
              <pre className="step-code">
                <Code size={14} className="step-code-icon" />
                {step.code}
              </pre>
            )}

            {step.tip && (
              <div className="step-tip">
                <Lightbulb size={16} />
                <span>{step.tip}</span>
              </div>
            )}
          </div>
        )}

        <div className="tutorial-nav">
          <button onClick={prev} disabled={isFirstStep && activeTutorial === 0} className="tutorial-btn">
            <ChevronLeft size={16} /> Previous
          </button>
          <span className="step-counter">{currentStep + 1} / {tutorial.steps.length}</span>
          <button onClick={next} className="tutorial-btn tutorial-btn-next">
            {showQuiz ? 'Finish' : isLastStep ? (tutorial.quiz ? 'Start Quiz' : 'Complete') : 'Next'} <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
