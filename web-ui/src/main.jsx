import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import TopErrorBoundary from './components/TopErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TopErrorBoundary>
      <App />
    </TopErrorBoundary>
  </React.StrictMode>,
)
