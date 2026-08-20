import { useExchange } from '../contexts/ExchangeContext'

export default function ExchangeSelector() {
  const { selectedExchange, switchExchange, availableExchanges, exchangeThemes } = useExchange()

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400">Exchange:</span>
      <div className="flex gap-1">
        {availableExchanges.map((exchangeId) => {
          const theme = exchangeThemes[exchangeId]
          const isSelected = selectedExchange === exchangeId
          
          return (
            <button
              key={exchangeId}
              onClick={() => switchExchange(exchangeId)}
              className={`
                px-3 py-1.5 text-xs font-medium  transition-all
                ${isSelected 
                  ? 'text-white shadow-lg' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-bg-700'
                }
              `}
              style={{
                backgroundColor: isSelected ? theme.primary : undefined,
                borderColor: isSelected ? theme.primaryDark : undefined,
              }}
              title={`Switch to ${theme.name}`}
            >
              {theme.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
