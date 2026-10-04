import './App.css'
import { MarketPreferencesProvider } from './app/MarketPreferencesContext'
import { AppRouter } from './app/AppRouter'
import { ThemeEffects } from './components/ThemeEffects'

function App() {
  return (
    <MarketPreferencesProvider>
      <ThemeEffects />
      <AppRouter />
    </MarketPreferencesProvider>
  )
}

export default App
