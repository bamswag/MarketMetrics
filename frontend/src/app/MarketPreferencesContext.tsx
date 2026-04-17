import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  DEFAULT_MARKET_PREFERENCES,
  type MarketAssetCategory,
  type MarketPreferences,
  MARKET_PREFERENCES_STORAGE_KEY,
  MARKET_ASSET_CATEGORY_ORDER,
  normalizeMarketPreferences,
  readStoredMarketPreferences,
  saveStoredMarketPreferences,
} from '../lib/marketPreferences'

type MarketPreferencesContextValue = {
  preferences: MarketPreferences
  updatePreferences: (patch: Partial<MarketPreferences>) => void
  togglePreferredAssetClass: (assetCategory: MarketAssetCategory) => void
}

const MarketPreferencesContext = createContext<MarketPreferencesContextValue | null>(null)

type MarketPreferencesProviderProps = {
  children: ReactNode
}

export function MarketPreferencesProvider({ children }: MarketPreferencesProviderProps) {
  const [preferences, setPreferences] = useState<MarketPreferences>(() => readStoredMarketPreferences())

  useEffect(() => {
    saveStoredMarketPreferences(preferences)
  }, [preferences])

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== MARKET_PREFERENCES_STORAGE_KEY) {
        return
      }

      setPreferences(readStoredMarketPreferences())
    }

    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const updatePreferences = useCallback((patch: Partial<MarketPreferences>) => {
    setPreferences((currentPreferences) =>
      normalizeMarketPreferences({
        ...currentPreferences,
        ...patch,
      }),
    )
  }, [])

  const togglePreferredAssetClass = useCallback((assetCategory: MarketAssetCategory) => {
    setPreferences((currentPreferences) => {
      const isEnabled = currentPreferences.preferredAssetClasses.includes(assetCategory)
      if (isEnabled && currentPreferences.preferredAssetClasses.length === 1) {
        return currentPreferences
      }

      const nextPreferredAssetClasses = isEnabled
        ? currentPreferences.preferredAssetClasses.filter((category) => category !== assetCategory)
        : MARKET_ASSET_CATEGORY_ORDER.filter((category) =>
            category === assetCategory || currentPreferences.preferredAssetClasses.includes(category),
          )

      return normalizeMarketPreferences({
        ...currentPreferences,
        preferredAssetClasses: nextPreferredAssetClasses,
      })
    })
  }, [])

  const contextValue = useMemo(
    () => ({
      preferences: preferences ?? DEFAULT_MARKET_PREFERENCES,
      updatePreferences,
      togglePreferredAssetClass,
    }),
    [preferences, togglePreferredAssetClass, updatePreferences],
  )

  return (
    <MarketPreferencesContext.Provider value={contextValue}>
      {children}
    </MarketPreferencesContext.Provider>
  )
}

export function useMarketPreferences() {
  const context = useContext(MarketPreferencesContext)
  if (!context) {
    throw new Error('useMarketPreferences must be used within a MarketPreferencesProvider.')
  }

  return context
}
