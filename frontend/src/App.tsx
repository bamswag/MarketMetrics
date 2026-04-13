import './App.css'
import { MarketPreferencesProvider } from './app/MarketPreferencesContext'
import { AppRouter } from './app/AppRouter'

function App() {
  return (
    <MarketPreferencesProvider>
      <AppRouter />
    </MarketPreferencesProvider>
  )
}

export default App
