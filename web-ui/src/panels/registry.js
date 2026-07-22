/**
 * Component Panel Registry
 *
 * Central registry for all sidebar panels. New components are added here
 * instead of App.jsx. This enables:
 * - Adding panels without touching App.jsx
 * - Categorized collapsible sections
 * - User-toggleable visibility (localStorage)
 * - Lazy loading via React.lazy + Suspense (code-splitting per panel)
 * - Future: plugin architecture, dynamic imports
 *
 * To add a new panel:
 * 1. Import your component
 * 2. Add an entry to PANELS with: id, name, category, component, propsBuilder
 * 3. propsBuilder receives a context object and returns props for the component
 *
 * Context object shape:
 * { exchange, signals, selectedExchange, selectedSymbol, chartCandles,
 *   currentPrice, SYMBOLS, EXCHANGES, toasts, addToast,
 *   setSelectedSymbol, exchange: { ...hookData } }
 */

import { lazy } from 'react'

const DepthChart = lazy(() => import('../components/DepthChart'))
const OrderFlowImbalance = lazy(() => import('../components/OrderFlowImbalance'))
const SpoofingDetector = lazy(() => import('../components/SpoofingDetector'))
const OrderBookHeatmap = lazy(() => import('../components/OrderBookHeatmap'))
const LiquidityHeatmap = lazy(() => import('../components/LiquidityHeatmap'))
const TradeTimeline = lazy(() => import('../components/TradeTimeline'))
const TradeReplay = lazy(() => import('../components/TradeReplay'))
const OrderFlowTape = lazy(() => import('../components/OrderFlowTape'))
const CumulativeVolumeDelta = lazy(() => import('../components/CumulativeVolumeDelta'))
const DarkOrderFlow = lazy(() => import('../components/DarkOrderFlow'))
const VolumeProfile = lazy(() => import('../components/VolumeProfile'))
const MarketProfile = lazy(() => import('../components/MarketProfile'))
const MarketRegime = lazy(() => import('../components/MarketRegime'))
const FibonacciLevels = lazy(() => import('../components/FibonacciLevels'))
const FairValueGap = lazy(() => import('../components/FairValueGap'))
const PatternScanner = lazy(() => import('../components/PatternScanner'))
const PatternDetector = lazy(() => import('../components/PatternDetector'))
const SupportResistance = lazy(() => import('../components/SupportResistance'))
const ExecutionBot = lazy(() => import('../components/ExecutionBot'))
const PriceAlerts = lazy(() => import('../components/PriceAlerts'))
const IndicatorBuilder = lazy(() => import('../components/IndicatorBuilder'))
const ReplayControls = lazy(() => import('../components/ReplayControls'))
const ConfigPanel = lazy(() => import('../components/ConfigPanel'))
const SessionStats = lazy(() => import('../components/SessionStats'))
const HeatmapCalendar = lazy(() => import('../components/HeatmapCalendar'))
const TimeOfDayPerformance = lazy(() => import('../components/TimeOfDayPerformance'))
const TradeClustering = lazy(() => import('../components/TradeClustering'))
const CorrelationMatrix = lazy(() => import('../components/CorrelationMatrix'))
const PositionCorrelation = lazy(() => import('../components/PositionCorrelation'))
const HedgingSuggestions = lazy(() => import('../components/HedgingSuggestions'))
const VolatilitySurface = lazy(() => import('../components/VolatilitySurface'))
const RiskParityCalculator = lazy(() => import('../components/RiskParityCalculator'))
const GreeksCalculator = lazy(() => import('../components/GreeksCalculator'))
const OptionsStrategySimulator = lazy(() => import('../components/OptionsStrategySimulator'))
const MultiLegOptions = lazy(() => import('../components/MultiLegOptions'))
const KellyCalculator = lazy(() => import('../components/KellyCalculator'))
const DrawdownAnalysis = lazy(() => import('../components/DrawdownAnalysis'))
const RiskAdjustedComparison = lazy(() => import('../components/RiskAdjustedComparison'))
const RiskDashboard = lazy(() => import('../components/RiskDashboard'))
const PnLAttribution = lazy(() => import('../components/PnLAttribution'))
const PnLAttributionChart = lazy(() => import('../components/PnLAttributionChart'))
const MonteCarlo = lazy(() => import('../components/MonteCarlo'))
const WalkForward = lazy(() => import('../components/WalkForward'))
const SentimentIndicator = lazy(() => import('../components/SentimentIndicator'))
const PortfolioOptimizer = lazy(() => import('../components/PortfolioOptimizer'))
const AutoRebalance = lazy(() => import('../components/AutoRebalance'))
const Watchlist = lazy(() => import('../components/Watchlist'))
const StrategyBuilder = lazy(() => import('../components/StrategyBuilder'))
const AlertWebhook = lazy(() => import('../components/AlertWebhook'))
const SessionExport = lazy(() => import('../components/SessionExport'))
const TradeStatsExport = lazy(() => import('../components/TradeStatsExport'))
const MultiAccountView = lazy(() => import('../components/MultiAccountView'))
const SmartOrderRouter = lazy(() => import('../components/SmartOrderRouter'))
const TradeJournal = lazy(() => import('../components/TradeJournal'))
const OBVIndicator = lazy(() => import('../components/OBVIndicator'))
const MFIIndicator = lazy(() => import('../components/MFIIndicator'))
const WilliamsRIndicator = lazy(() => import('../components/WilliamsRIndicator'))
const IchimokuCloud = lazy(() => import('../components/IchimokuCloud'))
const RenkoChart = lazy(() => import('../components/RenkoChart'))
const StochasticOscillator = lazy(() => import('../components/StochasticOscillator'))
const ATRIndicator = lazy(() => import('../components/ATRIndicator'))
const ParabolicSAR = lazy(() => import('../components/ParabolicSAR'))
const ADXIndicator = lazy(() => import('../components/ADXIndicator'))
const CCIIndicator = lazy(() => import('../components/CCIIndicator'))
const AwesomeOscillator = lazy(() => import('../components/AwesomeOscillator'))
const VWAPMACD = lazy(() => import('../components/VWAPMACD'))
const HeikinAshi = lazy(() => import('../components/HeikinAshi'))
const MultiTimeframeComparison = lazy(() => import('../components/MultiTimeframeComparison'))
const PointAndFigure = lazy(() => import('../components/PointAndFigure'))
const KagiChart = lazy(() => import('../components/KagiChart'))
const ThreeLineBreak = lazy(() => import('../components/ThreeLineBreak'))
const OrderBlocks = lazy(() => import('../components/OrderBlocks'))
const SessionVolumeProfile = lazy(() => import('../components/SessionVolumeProfile'))
const VolatilityRegime = lazy(() => import('../components/VolatilityRegime'))
const PairTradingSignals = lazy(() => import('../components/PairTradingSignals'))
const TickChart = lazy(() => import('../components/TickChart'))
const VolumeClockChart = lazy(() => import('../components/VolumeClockChart'))
const LiquidationMap = lazy(() => import('../components/LiquidationMap'))
const FundingRateHistory = lazy(() => import('../components/FundingRateHistory'))
const WhaleAlerts = lazy(() => import('../components/WhaleAlerts'))
const OpenInterestTracker = lazy(() => import('../components/OpenInterestTracker'))
const FearGreedIndex = lazy(() => import('../components/FearGreedIndex'))
const CumulativeTickIndex = lazy(() => import('../components/CumulativeTickIndex'))
const InterExchangeSpread = lazy(() => import('../components/InterExchangeSpread'))
const PositionSizeOptimizer = lazy(() => import('../components/PositionSizeOptimizer'))
const LiquidationCascade = lazy(() => import('../components/LiquidationCascade'))
const FootprintChart = lazy(() => import('../components/FootprintChart'))
const DeltaDivergence = lazy(() => import('../components/DeltaDivergence'))
const TrailingStopCalculator = lazy(() => import('../components/TrailingStopCalculator'))
const RiskOfRuin = lazy(() => import('../components/RiskOfRuin'))
const ExpectedValueCalculator = lazy(() => import('../components/ExpectedValueCalculator'))
const RegimeSwitching = lazy(() => import('../components/RegimeSwitching'))
const SmartMoneyConcepts = lazy(() => import('../components/SmartMoneyConcepts'))
const LiquidityGrabDetector = lazy(() => import('../components/LiquidityGrabDetector'))
const CustomIndicatorPlugin = lazy(() => import('../components/CustomIndicatorPlugin'))
const VolumeAnomalyDetector = lazy(() => import('../components/VolumeAnomalyDetector'))
const MultiTimeframeConfluence = lazy(() => import('../components/MultiTimeframeConfluence'))
const OrderFlowAbsorption = lazy(() => import('../components/OrderFlowAbsorption'))
const SessionVWAP = lazy(() => import('../components/SessionVWAP'))
const CompositeSignalDashboard = lazy(() => import('../components/CompositeSignalDashboard'))
const ConfidenceScorer = lazy(() => import('../components/ConfidenceScorer'))
const RegimeAdaptiveStrategy = lazy(() => import('../components/RegimeAdaptiveStrategy'))
const CrossMarketDivergence = lazy(() => import('../components/CrossMarketDivergence'))
const PerformanceAttribution = lazy(() => import('../components/PerformanceAttribution'))
const PriceActionScore = lazy(() => import('../components/PriceActionScore'))
const TickSpeedAnomaly = lazy(() => import('../components/TickSpeedAnomaly'))
const PutCallRatio = lazy(() => import('../components/PutCallRatio'))
const CorrelationHeatmap = lazy(() => import('../components/CorrelationHeatmap'))
const SignalMatrixHeatmap = lazy(() => import('../components/SignalMatrixHeatmap'))
const MITOrderSimulator = lazy(() => import('../components/MITOrderSimulator'))
const SlippageSimulator = lazy(() => import('../components/SlippageSimulator'))
const OrderFlowHeatmap = lazy(() => import('../components/OrderFlowHeatmap'))
const MarketDepthReplay = lazy(() => import('../components/MarketDepthReplay'))
const IndicatorFormulaParser = lazy(() => import('../components/IndicatorFormulaParser'))
const GARCHVolatility = lazy(() => import('../components/GARCHVolatility'))
const CointegrationScanner = lazy(() => import('../components/CointegrationScanner'))
const MarkovRegimePredictor = lazy(() => import('../components/MarkovRegimePredictor'))
const FractalAnalyzer = lazy(() => import('../components/FractalAnalyzer'))
const KalmanFilterPrice = lazy(() => import('../components/KalmanFilterPrice'))
const SpectralAnalysis = lazy(() => import('../components/SpectralAnalysis'))
const EhlersSuperSmoother = lazy(() => import('../components/EhlersSuperSmoother'))
const BayesianPricePredictor = lazy(() => import('../components/BayesianPricePredictor'))
const AlmgrenChriss = lazy(() => import('../components/AlmgrenChriss'))
const WaveletDecomposition = lazy(() => import('../components/WaveletDecomposition'))
const KMeansClustering = lazy(() => import('../components/KMeansClustering'))
const CopulaModel = lazy(() => import('../components/CopulaModel'))
const HiddenMarkovModel = lazy(() => import('../components/HiddenMarkovModel'))
const PrincipalComponentAnalysis = lazy(() => import('../components/PrincipalComponentAnalysis'))
const OptimalStopping = lazy(() => import('../components/OptimalStopping'))
const IsolationForest = lazy(() => import('../components/IsolationForest'))
const VariationalModeDecomposition = lazy(() => import('../components/VariationalModeDecomposition'))
const EmpiricalModeDecomposition = lazy(() => import('../components/EmpiricalModeDecomposition'))
const SupportVectorMachine = lazy(() => import('../components/SupportVectorMachine'))
const BlackLitterman = lazy(() => import('../components/BlackLitterman'))
const HawkesProcess = lazy(() => import('../components/HawkesProcess'))
const DynamicTimeWarping = lazy(() => import('../components/DynamicTimeWarping'))
const RecurrentNeuralNetwork = lazy(() => import('../components/RecurrentNeuralNetwork'))
const KellyCriterion = lazy(() => import('../components/KellyCriterion'))
const GaussianProcessRegression = lazy(() => import('../components/GaussianProcessRegression'))
const MarkovSwitchingGARCH = lazy(() => import('../components/MarkovSwitchingGARCH'))
const EmpiricalDynamicModeling = lazy(() => import('../components/EmpiricalDynamicModeling'))
const Autoencoder = lazy(() => import('../components/Autoencoder'))
const OptimalTransport = lazy(() => import('../components/OptimalTransport'))
const RoughVolatility = lazy(() => import('../components/RoughVolatility'))
const TransferEntropy = lazy(() => import('../components/TransferEntropy'))
const GraphTheoryNetwork = lazy(() => import('../components/GraphTheoryNetwork'))
const ConditionalValueAtRisk = lazy(() => import('../components/ConditionalValueAtRisk'))
const NonStationarySpectral = lazy(() => import('../components/NonStationarySpectral'))
const RandomMatrixTheory = lazy(() => import('../components/RandomMatrixTheory'))
const BayesianStructuralTimeSeries = lazy(() => import('../components/BayesianStructuralTimeSeries'))
const TopologicalDataAnalysis = lazy(() => import('../components/TopologicalDataAnalysis'))
const StochasticDifferentialEquations = lazy(() => import('../components/StochasticDifferentialEquations'))
const GaussianMixtureModel = lazy(() => import('../components/GaussianMixtureModel'))
const WaveletPacketDecomposition = lazy(() => import('../components/WaveletPacketDecomposition'))
const InformationBottleneck = lazy(() => import('../components/InformationBottleneck'))
const AffineArithmetic = lazy(() => import('../components/AffineArithmetic'))
const RenormalizationGroup = lazy(() => import('../components/RenormalizationGroup'))
const FreeEnergyPrinciple = lazy(() => import('../components/FreeEnergyPrinciple'))
const TensorDecomposition = lazy(() => import('../components/TensorDecomposition'))
const CompressedSensing = lazy(() => import('../components/CompressedSensing'))
const MalliavinCalculus = lazy(() => import('../components/MalliavinCalculus'))
const HamiltonianMonteCarlo = lazy(() => import('../components/HamiltonianMonteCarlo'))
const ReproducingKernelHilbertSpace = lazy(() => import('../components/ReproducingKernelHilbertSpace'))
const VariationalAutoencoder = lazy(() => import('../components/VariationalAutoencoder'))
const SchrodingerBridge = lazy(() => import('../components/SchrodingerBridge'))
const LieGroupSymmetries = lazy(() => import('../components/LieGroupSymmetries'))
const KolmogorovSinaiEntropy = lazy(() => import('../components/KolmogorovSinaiEntropy'))
const PersistentHomologyLandscape = lazy(() => import('../components/PersistentHomologyLandscape'))
const FokkerPlanckEquation = lazy(() => import('../components/FokkerPlanckEquation'))
const HopfBifurcation = lazy(() => import('../components/HopfBifurcation'))
const CramerRaoBound = lazy(() => import('../components/CramerRaoBound'))
const WassersteinBarycenters = lazy(() => import('../components/WassersteinBarycenters'))
const KoopmanOperatorTheory = lazy(() => import('../components/KoopmanOperatorTheory'))
const StochasticOptimalControl = lazy(() => import('../components/StochasticOptimalControl'))
const RenyiEntropyDynamics = lazy(() => import('../components/RenyiEntropyDynamics'))
const PontryaginMaximumPrinciple = lazy(() => import('../components/PontryaginMaximumPrinciple'))
const BurgersEquation = lazy(() => import('../components/BurgersEquation'))
const SobolevSpaceRegularization = lazy(() => import('../components/SobolevSpaceRegularization'))
const ItoCalculusGenerator = lazy(() => import('../components/ItoCalculusGenerator'))
const BanachFixedPoint = lazy(() => import('../components/BanachFixedPoint'))
const CesaroFejerKernel = lazy(() => import('../components/CesaroFejerKernel'))
const GirsanovTheorem = lazy(() => import('../components/GirsanovTheorem'))
const StoneCechCompactification = lazy(() => import('../components/StoneCechCompactification'))
const MalliavinSteinSensitivity = lazy(() => import('../components/MalliavinSteinSensitivity'))
const ProkhorovMetric = lazy(() => import('../components/ProkhorovMetric'))
const RadonNikodymDerivative = lazy(() => import('../components/RadonNikodymDerivative'))
const HahnDecomposition = lazy(() => import('../components/HahnDecomposition'))
const CameronMartinFormula = lazy(() => import('../components/CameronMartinFormula'))
const ArzelaAscoli = lazy(() => import('../components/ArzelaAscoli'))
const RieszRepresentation = lazy(() => import('../components/RieszRepresentation'))
const LaxMilgram = lazy(() => import('../components/LaxMilgram'))
const StrategyBacktest = lazy(() => import('../components/StrategyBacktest'))
const BacktestComparison = lazy(() => import('../components/BacktestComparison'))
const StrategyMarketplace = lazy(() => import('../components/StrategyMarketplace'))
const SessionReplay = lazy(() => import('../components/SessionReplay'))
const SessionReportExport = lazy(() => import('../components/SessionReportExport'))
const CompetitionFramework = lazy(() => import('../components/CompetitionFramework'))

// Category metadata
export const CATEGORIES = [
  { id: 'orderflow', label: 'Order Flow', icon: 'Activity', order: 1 },
  { id: 'technical', label: 'Technical Analysis', icon: 'TrendingUp', order: 2 },
  { id: 'risk', label: 'Risk & Analytics', icon: 'Shield', order: 3 },
  { id: 'portfolio', label: 'Portfolio & Optimization', icon: 'Briefcase', order: 4 },
  { id: 'strategy', label: 'Strategy & Automation', icon: 'Bot', order: 5 },
  { id: 'export', label: 'Export & Tools', icon: 'Download', order: 6 },
  { id: 'config', label: 'Config & Session', icon: 'Settings', order: 7 },
]

// Helper: get orderbook data for selected symbol
const ob = (ctx) => ctx.exchange?.orderbooks?.[`${ctx.selectedExchange}|${ctx.selectedSymbol}`]

export const PANELS = [
  // === ORDER FLOW ===
  { id: 'depth-chart', name: 'Depth Chart', category: 'orderflow', component: DepthChart,
    props: (ctx) => ({ orderbookData: ob(ctx), currentPrice: ctx.currentPrice }) },
  { id: 'order-flow-imbalance', name: 'Order Flow Imbalance', category: 'orderflow', component: OrderFlowImbalance,
    props: (ctx) => ({ orderbookData: ob(ctx), currentPrice: ctx.currentPrice }) },
  { id: 'spoofing-detector', name: 'Spoofing Detector', category: 'orderflow', component: SpoofingDetector,
    props: (ctx) => ({ orderbookData: ob(ctx), currentPrice: ctx.currentPrice }) },
  { id: 'order-book-heatmap', name: 'Order Book Heatmap', category: 'orderflow', component: OrderBookHeatmap,
    props: (ctx) => ({ orderbookData: ob(ctx), currentPrice: ctx.currentPrice }) },
  { id: 'liquidity-heatmap', name: 'Liquidity Heatmap', category: 'orderflow', component: LiquidityHeatmap,
    props: (ctx) => ({ orderbookData: ob(ctx), currentPrice: ctx.currentPrice }) },
  { id: 'trade-timeline', name: 'Execution Timeline', category: 'orderflow', component: TradeTimeline,
    props: (ctx) => ({ fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, selectedExchange: ctx.selectedExchange }) },
  { id: 'trade-replay', name: 'Trade Replay', category: 'orderflow', component: TradeReplay,
    props: (ctx) => ({ fills: ctx.exchange.fills, candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, selectedExchange: ctx.selectedExchange }) },
  { id: 'order-flow-tape', name: 'Order Flow Tape', category: 'orderflow', component: OrderFlowTape,
    props: (ctx) => ({ fills: ctx.exchange.fills, candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, selectedExchange: ctx.selectedExchange }) },
  { id: 'cvd', name: 'Cumulative Volume Delta', category: 'orderflow', component: CumulativeVolumeDelta,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'dark-order-flow', name: 'Dark Order Flow', category: 'orderflow', component: DarkOrderFlow,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'of-heatmap', name: 'Order Flow Heatmap', category: 'orderflow', component: OrderFlowHeatmap,
    props: (ctx) => ({ candles: ctx.exchange.candles, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'depth-replay', name: 'Market Depth Replay', category: 'orderflow', component: MarketDepthReplay,
    props: (ctx) => ({ candles: ctx.exchange.candles, orderbooks: ctx.exchange.orderbooks, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },

  // === TECHNICAL ANALYSIS ===
  { id: 'volume-profile', name: 'Volume Profile', category: 'technical', component: VolumeProfile,
    props: (ctx) => ({ candles: ctx.chartCandles, symbol: ctx.selectedSymbol }) },
  { id: 'market-profile', name: 'Market Profile (TPO)', category: 'technical', component: MarketProfile,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'market-regime', name: 'Market Regime', category: 'technical', component: MarketRegime,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'fibonacci', name: 'Fibonacci Levels', category: 'technical', component: FibonacciLevels,
    props: (ctx) => ({ candles: ctx.chartCandles, currentPrice: ctx.currentPrice }) },
  { id: 'fvg', name: 'Fair Value Gaps', category: 'technical', component: FairValueGap,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'pattern-scanner', name: 'Pattern Scanner', category: 'technical', component: PatternScanner,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'pattern-detector', name: 'Candle Pattern Detector', category: 'technical', component: PatternDetector,
    props: (ctx) => ({ candles: ctx.chartCandles, symbol: ctx.selectedSymbol }) },
  { id: 'support-resistance', name: 'Support / Resistance', category: 'technical', component: SupportResistance,
    props: (ctx) => ({ candles: ctx.chartCandles, currentPrice: ctx.currentPrice }) },
  { id: 'indicator-builder', name: 'Custom Indicator Builder', category: 'technical', component: IndicatorBuilder,
    props: (ctx) => ({ candles: ctx.chartCandles }) },
  { id: 'formula-parser', name: 'Indicator Formula Parser', category: 'technical', component: IndicatorFormulaParser,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'obv', name: 'On-Balance Volume (OBV)', category: 'technical', component: OBVIndicator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'mfi', name: 'Money Flow Index (MFI)', category: 'technical', component: MFIIndicator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'williams-r', name: 'Williams %R', category: 'technical', component: WilliamsRIndicator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'ichimoku', name: 'Ichimoku Cloud', category: 'technical', component: IchimokuCloud,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'renko', name: 'Renko Chart', category: 'technical', component: RenkoChart,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'stochastic', name: 'Stochastic Oscillator', category: 'technical', component: StochasticOscillator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'atr', name: 'Average True Range (ATR)', category: 'technical', component: ATRIndicator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'psar', name: 'Parabolic SAR', category: 'technical', component: ParabolicSAR,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'adx', name: 'ADX / DI (Trend Strength)', category: 'technical', component: ADXIndicator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'cci', name: 'Commodity Channel Index', category: 'technical', component: CCIIndicator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'awesome-osc', name: 'Awesome Oscillator', category: 'technical', component: AwesomeOscillator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'vwap-macd', name: 'Volume-Weighted MACD', category: 'technical', component: VWAPMACD,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'heikin-ashi', name: 'Heikin-Ashi Candles', category: 'technical', component: HeikinAshi,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'multi-timeframe', name: 'Multi-Timeframe Analysis', category: 'technical', component: MultiTimeframeComparison,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'point-figure', name: 'Point & Figure Chart', category: 'technical', component: PointAndFigure,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'kagi', name: 'Kagi Chart', category: 'technical', component: KagiChart,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'three-line-break', name: 'Three-Line Break', category: 'technical', component: ThreeLineBreak,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'order-blocks', name: 'Order Block Detection', category: 'technical', component: OrderBlocks,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'session-volume', name: 'Session Volume Profile', category: 'technical', component: SessionVolumeProfile,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'volatility-regime', name: 'Volatility Regime', category: 'technical', component: VolatilityRegime,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'tick-chart', name: 'Tick Chart', category: 'technical', component: TickChart,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'volume-clock', name: 'Volume Clock Chart', category: 'technical', component: VolumeClockChart,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'liquidation-map', name: 'Liquidation Map', category: 'technical', component: LiquidationMap,
    props: (ctx) => ({ candles: ctx.exchange.candles, accounts: ctx.exchange.accounts, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'funding-history', name: 'Funding Rate History', category: 'technical', component: FundingRateHistory,
    props: (ctx) => ({ fundingRates: ctx.exchange.fundingRates, candlesToFunding: ctx.exchange.candlesToFunding, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'open-interest', name: 'Open Interest Tracker', category: 'technical', component: OpenInterestTracker,
    props: (ctx) => ({ candles: ctx.exchange.candles, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'cumulative-tick', name: 'Cumulative Tick Index', category: 'technical', component: CumulativeTickIndex,
    props: (ctx) => ({ candles: ctx.exchange.candles, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'inter-exchange-spread', name: 'Inter-Exchange Spread', category: 'technical', component: InterExchangeSpread,
    props: (ctx) => ({ candles: ctx.exchange.candles, prices: ctx.exchange.prices, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'footprint', name: 'Footprint Chart', category: 'technical', component: FootprintChart,
    props: (ctx) => ({ candles: ctx.exchange.candles, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'regime-switch', name: 'Regime Switching Detection', category: 'technical', component: RegimeSwitching,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'smc', name: 'Smart Money Concepts', category: 'technical', component: SmartMoneyConcepts,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'liquidity-grab', name: 'Liquidity Grab Detector', category: 'technical', component: LiquidityGrabDetector,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'custom-indicator', name: 'Custom Indicator Plugin', category: 'technical', component: CustomIndicatorPlugin,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol }) },
  { id: 'volume-anomaly', name: 'Volume Anomaly Detector', category: 'technical', component: VolumeAnomalyDetector,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'mtf-confluence', name: 'Multi-Timeframe Confluence', category: 'technical', component: MultiTimeframeConfluence,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'session-vwap', name: 'Session VWAP', category: 'technical', component: SessionVWAP,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'price-action-score', name: 'Price Action Score', category: 'technical', component: PriceActionScore,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },

  // === RISK & ANALYTICS ===
  { id: 'session-stats', name: 'Session Stats', category: 'risk', component: SessionStats,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills }) },
  { id: 'heatmap-calendar', name: 'PnL Heatmap Calendar', category: 'risk', component: HeatmapCalendar,
    props: (ctx) => ({ accounts: ctx.exchange.accounts }) },
  { id: 'time-of-day', name: 'Performance by Hour', category: 'risk', component: TimeOfDayPerformance,
    props: (ctx) => ({ accounts: ctx.exchange.accounts }) },
  { id: 'trade-clustering', name: 'Trade Clustering', category: 'risk', component: TradeClustering,
    props: (ctx) => ({ fills: ctx.exchange.fills }) },
  { id: 'correlation-matrix', name: 'Correlation Matrix', category: 'risk', component: CorrelationMatrix,
    props: (ctx) => ({ candles: ctx.exchange.candles, exchange: ctx.selectedExchange, symbols: ctx.SYMBOLS }) },
  { id: 'position-correlation', name: 'Position Correlation', category: 'risk', component: PositionCorrelation,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, candles: ctx.exchange.candles, exchange: ctx.selectedExchange }) },
  { id: 'volatility-surface', name: 'Volatility Surface', category: 'risk', component: VolatilitySurface,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'drawdown', name: 'Drawdown Analysis', category: 'risk', component: DrawdownAnalysis,
    props: (ctx) => ({ fills: ctx.exchange.fills }) },
  { id: 'risk-adjusted', name: 'Risk-Adjusted Returns', category: 'risk', component: RiskAdjustedComparison,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills }) },
  { id: 'risk-dashboard', name: 'Risk Dashboard (VaR/CVaR)', category: 'risk', component: RiskDashboard,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'pnl-attribution', name: 'PnL Attribution', category: 'risk', component: PnLAttribution,
    props: (ctx) => ({ accounts: ctx.exchange.accounts }) },
  { id: 'pnl-attribution-chart', name: 'PnL Attribution Chart', category: 'risk', component: PnLAttributionChart,
    props: (ctx) => ({ accounts: ctx.exchange.accounts }) },
  { id: 'monte-carlo', name: 'Monte Carlo Simulation', category: 'risk', component: MonteCarlo,
    props: (ctx) => ({ accounts: ctx.exchange.accounts }) },
  { id: 'walk-forward', name: 'Walk-Forward Analysis', category: 'risk', component: WalkForward,
    props: (ctx) => ({ accounts: ctx.exchange.accounts }) },
  { id: 'sentiment', name: 'Sentiment Indicator', category: 'risk', component: SentimentIndicator,
    props: (ctx) => ({ candles: ctx.exchange.candles, signals: ctx.signals.signals, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'fear-greed', name: 'Fear & Greed Index', category: 'risk', component: FearGreedIndex,
    props: (ctx) => ({ candles: ctx.exchange.candles, signals: ctx.signals.signals, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'delta-divergence', name: 'Delta Divergence Detector', category: 'risk', component: DeltaDivergence,
    props: (ctx) => ({ candles: ctx.exchange.candles, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'risk-of-ruin', name: 'Risk of Ruin Calculator', category: 'risk', component: RiskOfRuin,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills }) },
  { id: 'ev-calc', name: 'Expected Value Calculator', category: 'risk', component: ExpectedValueCalculator,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills, signals: ctx.signals.signals }) },
  { id: 'absorption', name: 'Order Flow Absorption', category: 'risk', component: OrderFlowAbsorption,
    props: (ctx) => ({ candles: ctx.exchange.candles, fills: ctx.exchange.fills, orderbooks: ctx.exchange.orderbooks, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'composite-dashboard', name: 'Composite Signal Dashboard', category: 'risk', component: CompositeSignalDashboard,
    props: (ctx) => ({ candles: ctx.exchange.candles, signals: ctx.signals.signals, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'confidence-scorer', name: 'Signal Confidence Scorer', category: 'risk', component: ConfidenceScorer,
    props: (ctx) => ({ candles: ctx.exchange.candles, signals: ctx.signals.signals, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'regime-strategy', name: 'Regime Adaptive Strategy', category: 'risk', component: RegimeAdaptiveStrategy,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'cross-market', name: 'Cross-Market Divergence', category: 'risk', component: CrossMarketDivergence,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'perf-attribution', name: 'Performance Attribution', category: 'risk', component: PerformanceAttribution,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills, signals: ctx.signals.signals }) },
  { id: 'tick-speed', name: 'Tick Speed Anomaly', category: 'risk', component: TickSpeedAnomaly,
    props: (ctx) => ({ candles: ctx.exchange.candles, fills: ctx.exchange.fills, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'put-call', name: 'Put/Call Ratio (Sim)', category: 'risk', component: PutCallRatio,
    props: (ctx) => ({ fills: ctx.exchange.fills, candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'signal-matrix', name: 'Signal Matrix Heatmap', category: 'risk', component: SignalMatrixHeatmap,
    props: (ctx) => ({ candles: ctx.exchange.candles, signals: ctx.signals.signals, fills: ctx.exchange.fills, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'slippage-sim', name: 'Slippage Simulator', category: 'risk', component: SlippageSimulator,
    props: (ctx) => ({ candles: ctx.exchange.candles, orderbooks: ctx.exchange.orderbooks, accounts: ctx.exchange.accounts, currentPrice: ctx.currentPrice, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'garch-vol', name: 'GARCH Volatility Forecaster', category: 'risk', component: GARCHVolatility,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'cointegration', name: 'Cointegration Scanner', category: 'risk', component: CointegrationScanner,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'markov-regime', name: 'Markov Regime Predictor', category: 'risk', component: MarkovRegimePredictor,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'fractal', name: 'Hurst Exponent + Fractal Dim', category: 'risk', component: FractalAnalyzer,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'kalman', name: 'Kalman Filter Price', category: 'risk', component: KalmanFilterPrice,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'spectral', name: 'Spectral Analysis (Welch PSD)', category: 'risk', component: SpectralAnalysis,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'ehlers-super', name: 'Ehlers SuperSmoother (DSP)', category: 'risk', component: EhlersSuperSmoother,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'bayesian-predictor', name: 'Bayesian Price Predictor', category: 'risk', component: BayesianPricePredictor,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'wavelet', name: 'Wavelet Decomposition (MRA)', category: 'risk', component: WaveletDecomposition,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'kmeans', name: 'K-Means Market Clustering', category: 'risk', component: KMeansClustering,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'copula', name: 'Copula Dependency Model', category: 'risk', component: CopulaModel,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'almgren-chriss', name: 'Almgren-Chriss Execution', category: 'portfolio', component: AlmgrenChriss,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange, currentPrice: ctx.currentPrice }) },
  { id: 'hmm', name: 'Hidden Markov Model', category: 'risk', component: HiddenMarkovModel,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'pca', name: 'Principal Component Analysis', category: 'risk', component: PrincipalComponentAnalysis,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'optimal-stopping', name: 'Optimal Stopping (Snell)', category: 'portfolio', component: OptimalStopping,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange, currentPrice: ctx.currentPrice }) },
  { id: 'isolation-forest', name: 'Isolation Forest Anomaly', category: 'risk', component: IsolationForest,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'vmd', name: 'Variational Mode Decomp', category: 'risk', component: VariationalModeDecomposition,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'emd', name: 'Empirical Mode Decomp (HHT)', category: 'risk', component: EmpiricalModeDecomposition,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'svm', name: 'SVM Signal Classifier', category: 'risk', component: SupportVectorMachine,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'black-litterman', name: 'Black-Litterman Allocation', category: 'portfolio', component: BlackLitterman,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'hawkes', name: 'Hawkes Process (Trade Clustering)', category: 'risk', component: HawkesProcess,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'dtw', name: 'Dynamic Time Warping', category: 'risk', component: DynamicTimeWarping,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'rnn-lstm', name: 'LSTM Neural Network', category: 'risk', component: RecurrentNeuralNetwork,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'kelly', name: 'Kelly Criterion Sizing', category: 'portfolio', component: KellyCriterion,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'gp-regression', name: 'Gaussian Process Regression', category: 'risk', component: GaussianProcessRegression,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'ms-garch', name: 'Markov-Switching GARCH', category: 'risk', component: MarkovSwitchingGARCH,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'edm', name: 'Empirical Dynamic Modeling', category: 'risk', component: EmpiricalDynamicModeling,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange, symbols: ctx.SYMBOLS }) },
  { id: 'autoencoder', name: 'Autoencoder Anomaly', category: 'risk', component: Autoencoder,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'optimal-transport', name: 'Optimal Transport (Wasserstein)', category: 'risk', component: OptimalTransport,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'rough-vol', name: 'Rough Volatility (rBergomi)', category: 'risk', component: RoughVolatility,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'transfer-entropy', name: 'Transfer Entropy (Causality)', category: 'risk', component: TransferEntropy,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange, symbols: ctx.SYMBOLS }) },
  { id: 'graph-network', name: 'Graph Theory Network', category: 'portfolio', component: GraphTheoryNetwork,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'cvar', name: 'Conditional VaR (Expected Shortfall)', category: 'portfolio', component: ConditionalValueAtRisk,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'nonstat-spectral', name: 'Non-Stationary Spectral (STFT+CWT)', category: 'risk', component: NonStationarySpectral,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'rmt', name: 'Random Matrix Theory', category: 'portfolio', component: RandomMatrixTheory,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'bsts', name: 'Bayesian Structural Time Series', category: 'risk', component: BayesianStructuralTimeSeries,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'tda', name: 'Topological Data Analysis', category: 'risk', component: TopologicalDataAnalysis,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'sde', name: 'Stochastic Differential Equations', category: 'risk', component: StochasticDifferentialEquations,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'gmm', name: 'Gaussian Mixture Model (EM)', category: 'risk', component: GaussianMixtureModel,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'wpd', name: 'Wavelet Packet Decomposition', category: 'risk', component: WaveletPacketDecomposition,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'info-bottleneck', name: 'Information Bottleneck', category: 'risk', component: InformationBottleneck,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'affine-arithmetic', name: 'Affine Arithmetic (Uncertainty)', category: 'risk', component: AffineArithmetic,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'rg', name: 'Renormalization Group (Multi-Scale)', category: 'risk', component: RenormalizationGroup,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'fep', name: 'Free Energy Principle (Active Inference)', category: 'risk', component: FreeEnergyPrinciple,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'tensor-decomp', name: 'Tensor Decomposition (CP/ALS)', category: 'portfolio', component: TensorDecomposition,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'compressed-sensing', name: 'Compressed Sensing (Sparse Recovery)', category: 'risk', component: CompressedSensing,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'malliavin', name: 'Malliavin Calculus (Greeks)', category: 'risk', component: MalliavinCalculus,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'hmc', name: 'Hamiltonian Monte Carlo (Bayesian)', category: 'risk', component: HamiltonianMonteCarlo,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'rkhs', name: 'RKHS (Kernel Methods)', category: 'risk', component: ReproducingKernelHilbertSpace,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'vae', name: 'Variational Autoencoder (VAE)', category: 'risk', component: VariationalAutoencoder,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'schrodinger-bridge', name: 'Schrödinger Bridge (Entropy OT)', category: 'risk', component: SchrodingerBridge,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'lie-group', name: 'Lie Group Symmetries', category: 'risk', component: LieGroupSymmetries,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'ks-entropy', name: 'Kolmogorov-Sinai Entropy (Chaos)', category: 'risk', component: KolmogorovSinaiEntropy,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'ph-landscape', name: 'Persistent Homology Landscape', category: 'risk', component: PersistentHomologyLandscape,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'fokker-planck', name: 'Fokker-Planck Equation (Density)', category: 'risk', component: FokkerPlanckEquation,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'hopf-bifurcation', name: 'Hopf Bifurcation (Cycles)', category: 'risk', component: HopfBifurcation,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'cramer-rao', name: 'Cramér-Rao Lower Bound', category: 'risk', component: CramerRaoBound,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'wasserstein-bary', name: 'Wasserstein Barycenters (OT Mean)', category: 'portfolio', component: WassersteinBarycenters,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'koopman', name: 'Koopman Operator Theory (EDMD)', category: 'risk', component: KoopmanOperatorTheory,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'stochastic-control', name: 'Stochastic Optimal Control (HJB)', category: 'risk', component: StochasticOptimalControl,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'renyi-entropy', name: 'Rényi Entropy Dynamics', category: 'risk', component: RenyiEntropyDynamics,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'pontryagin', name: 'Pontryagin Maximum Principle', category: 'portfolio', component: PontryaginMaximumPrinciple,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'burgers-eq', name: 'Burgers Equation (Shock Formation)', category: 'risk', component: BurgersEquation,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'sobolev-reg', name: 'Sobolev Space Regularization', category: 'risk', component: SobolevSpaceRegularization,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'ito-generator', name: 'Ito Calculus Generator', category: 'risk', component: ItoCalculusGenerator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'banach-fixed', name: 'Banach Fixed-Point Iteration', category: 'strategy', component: BanachFixedPoint,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'cesaro-fejer', name: 'Cesaro/Fejer Kernel (Trend)', category: 'technical', component: CesaroFejerKernel,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'girsanov', name: 'Girsanov Theorem (Measure Change)', category: 'risk', component: GirsanovTheorem,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'stone-cech', name: 'Stone-Cech Compactification', category: 'risk', component: StoneCechCompactification,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'malliavin-stein', name: 'Malliavin-Stein Sensitivity', category: 'risk', component: MalliavinSteinSensitivity,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'prokhorov', name: 'Prokhorov Metric (Weak Conv.)', category: 'risk', component: ProkhorovMetric,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'radon-nikodym', name: 'Radon-Nikodym Derivative', category: 'risk', component: RadonNikodymDerivative,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'hahn-decomp', name: 'Hahn Decomposition (Signal/Noise)', category: 'risk', component: HahnDecomposition,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'cameron-martin', name: 'Cameron-Martin Formula', category: 'risk', component: CameronMartinFormula,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'arzela-ascoli', name: 'Arzela-Ascoli (Equicontinuity)', category: 'risk', component: ArzelaAscoli,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'riesz-rep', name: 'Riesz Representation', category: 'risk', component: RieszRepresentation,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'lax-milgram', name: 'Lax-Milgram (Variational PDE)', category: 'risk', component: LaxMilgram,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },

  // === PORTFOLIO & OPTIMIZATION ===
  { id: 'hedging', name: 'Hedging Suggestions', category: 'portfolio', component: HedgingSuggestions,
    props: (ctx) => ({ candles: ctx.exchange.candles, accounts: ctx.exchange.accounts, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'risk-parity', name: 'Risk Parity Calculator', category: 'portfolio', component: RiskParityCalculator,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'portfolio-optimizer', name: 'Portfolio Optimizer', category: 'portfolio', component: PortfolioOptimizer,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'auto-rebalance', name: 'Auto-Rebalance', category: 'portfolio', component: AutoRebalance,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange, onSubmit: ctx.exchange.submitOrder }) },
  { id: 'multi-account', name: 'Multi-Account View', category: 'portfolio', component: MultiAccountView,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, exchanges: ctx.EXCHANGES }) },
  { id: 'smart-router', name: 'Smart Order Router', category: 'portfolio', component: SmartOrderRouter,
    props: (ctx) => ({ candles: ctx.exchange.candles, orderbooks: ctx.exchange.orderbooks, symbols: ctx.SYMBOLS, exchanges: ctx.EXCHANGES, onSubmit: ctx.exchange.submitOrder }) },
  { id: 'kelly-calc', name: 'Kelly Criterion', category: 'portfolio', component: KellyCalculator,
    props: (ctx) => ({ accounts: ctx.exchange.accounts }) },
  { id: 'greeks', name: 'Greeks Calculator', category: 'portfolio', component: GreeksCalculator,
    props: (ctx) => ({ currentPrice: ctx.currentPrice }) },
  { id: 'options-strategy-sim', name: 'Options Strategy P&L', category: 'portfolio', component: OptionsStrategySimulator,
    props: (ctx) => ({ currentPrice: ctx.currentPrice }) },
  { id: 'multi-leg-options', name: 'Multi-Leg Options', category: 'portfolio', component: MultiLegOptions,
    props: (ctx) => ({ currentPrice: ctx.currentPrice }) },

  { id: 'pair-trading', name: 'Pair Trading Signals', category: 'portfolio', component: PairTradingSignals,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },
  { id: 'whale-alerts', name: 'Whale Alert Monitor', category: 'portfolio', component: WhaleAlerts,
    props: (ctx) => ({ fills: ctx.exchange.fills, candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'position-optimizer', name: 'Position Size Optimizer', category: 'portfolio', component: PositionSizeOptimizer,
    props: (ctx) => ({ candles: ctx.exchange.candles, accounts: ctx.exchange.accounts, currentPrice: ctx.currentPrice, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'liq-cascade', name: 'Liquidation Cascade Simulator', category: 'portfolio', component: LiquidationCascade,
    props: (ctx) => ({ candles: ctx.exchange.candles, accounts: ctx.exchange.accounts, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'trailing-stop', name: 'Trailing Stop Calculator', category: 'portfolio', component: TrailingStopCalculator,
    props: (ctx) => ({ candles: ctx.exchange.candles, accounts: ctx.exchange.accounts, currentPrice: ctx.currentPrice, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'corr-heatmap', name: 'Correlation Heatmap', category: 'portfolio', component: CorrelationHeatmap,
    props: (ctx) => ({ candles: ctx.exchange.candles, symbols: ctx.SYMBOLS, exchange: ctx.selectedExchange }) },

  // === STRATEGY & AUTOMATION ===
  { id: 'strategy-backtest', name: 'Strategy Backtest Engine', category: 'strategy', component: StrategyBacktest,
    props: () => ({}) },
  { id: 'backtest-comparison', name: 'Backtest Comparison', category: 'strategy', component: BacktestComparison,
    props: () => ({}) },
  { id: 'execution-bot', name: 'Execution Bot (TWAP/VWAP)', category: 'strategy', component: ExecutionBot,
    props: (ctx) => ({ currentPrice: ctx.currentPrice, onSubmit: ctx.exchange.submitOrder, connected: ctx.exchange.connected && ctx.exchange.tradingActive, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'watchlist', name: 'Watchlist', category: 'strategy', component: Watchlist,
    props: (ctx) => ({ candles: ctx.exchange.candles, prices: ctx.exchange.prices, onSelectSymbol: ctx.setSelectedSymbol }) },
  { id: 'strategy-builder', name: 'Strategy Builder', category: 'strategy', component: StrategyBuilder,
    props: (ctx) => ({ currentPrice: ctx.currentPrice }) },
  { id: 'strategy-marketplace', name: 'Strategy Marketplace', category: 'strategy', component: StrategyMarketplace,
    props: () => ({}) },
  { id: 'competition', name: 'Strategy Competition', category: 'strategy', component: CompetitionFramework,
    props: () => ({}) },
  { id: 'session-replay', name: 'Session Replay', category: 'export', component: SessionReplay,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills, signals: ctx.signals.signals, candles: ctx.exchange.candles, prices: ctx.exchange.prices, orderbooks: ctx.exchange.orderbooks, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'session-report', name: 'Session Report (PDF)', category: 'export', component: SessionReportExport,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills, candles: ctx.exchange.candles, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange }) },
  { id: 'alert-webhook', name: 'Alert Webhooks', category: 'strategy', component: AlertWebhook,
    props: (ctx) => ({ fills: ctx.exchange.fills, toasts: ctx.toasts }) },
  { id: 'trade-journal', name: 'Trade Journal', category: 'strategy', component: TradeJournal,
    props: (ctx) => ({ accounts: ctx.exchange.accounts }) },
  { id: 'mit-simulator', name: 'MIT Order Simulator', category: 'strategy', component: MITOrderSimulator,
    props: (ctx) => ({ candles: ctx.exchange.candles, accounts: ctx.exchange.accounts, currentPrice: ctx.currentPrice, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange, onSubmit: ctx.exchange.submitOrder }) },

  // === EXPORT & TOOLS ===
  { id: 'session-export', name: 'Session Export (JSON)', category: 'export', component: SessionExport,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills, candles: ctx.exchange.candles, signals: ctx.signals.signals }) },
  { id: 'trade-stats-export', name: 'Trade Stats Export (CSV)', category: 'export', component: TradeStatsExport,
    props: (ctx) => ({ accounts: ctx.exchange.accounts, fills: ctx.exchange.fills }) },

  // === CONFIG & SESSION ===
  { id: 'price-alerts', name: 'Price Alerts', category: 'config', component: PriceAlerts,
    props: (ctx) => ({ currentPrice: ctx.currentPrice, symbol: ctx.selectedSymbol, exchange: ctx.selectedExchange,
      onAlert: (alert) => ctx.addToast({ type: 'warning', title: 'Price Alert Triggered',
        message: `${alert.symbol} ${alert.direction} $${alert.threshold} on ${alert.exchange}`, duration: 6000 }) }) },
  { id: 'replay-controls', name: 'Replay Controls', category: 'config', component: ReplayControls,
    props: (ctx) => ({ paused: ctx.exchange.replayPaused, onToggle: ctx.exchange.toggleReplay, onScrub: ctx.exchange.scrubReplay, candleCount: ctx.chartCandles.length }) },
  { id: 'config-panel', name: 'Simulator Config', category: 'config', component: ConfigPanel,
    props: (ctx) => ({ onConfigUpdate: ctx.exchange.sendConfigUpdate, fundingRates: ctx.exchange.fundingRates, weekendMode: ctx.exchange.weekendMode }) },
]

// Default visible panels (all visible by default)
export const DEFAULT_VISIBLE = PANELS.map(p => p.id)

// Get panels by category
export function getPanelsByCategory(categoryId) {
  return PANELS.filter(p => p.category === categoryId)
}

// Preload all panels in a category by triggering their lazy imports.
// Called on hover to warm up the chunk cache before the user clicks.
const _preloadedCategories = new Set()
export function preloadCategory(categoryId) {
  if (_preloadedCategories.has(categoryId)) return
  _preloadedCategories.add(categoryId)
  const panels = getPanelsByCategory(categoryId)
  for (const panel of panels) {
    // Trigger the lazy import promise without rendering
    const cmp = panel.component
    if (cmp && typeof cmp._payload !== 'undefined') {
      // React.lazy stores the import promise internally; calling .then() triggers fetch
      try {
        const payload = cmp._payload
        if (payload && typeof payload.then === 'function') {
          payload.then(() => {}).catch(() => {})
        } else if (payload && payload._status === -1) {
          // Not yet started
          payload._result().then(() => {}).catch(() => {})
        }
      } catch {
        // Fallback: read the lazy component's internal import function
      }
    }
  }
}
