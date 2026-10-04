import { useEffect } from 'react'

const THEME_SURFACE_SELECTOR = [
  '.top-bar',
  '.user-menu-dropdown',
  '.global-search-dropdown',
  '.landing-copy',
  '.panel',
  '.dashboard-hero-card',
  '.display-card',
  '.feature-card',
  '.process-card',
  '.auth-panel',
  '.auth-support-panel',
  '.login-auth-card',
  '.instrument-surface',
  '.daily-mover-panel',
  '.mover-card',
  '.tracked-symbol-card',
  '.tracked-symbols-preview',
  '.watchlist-card',
  '.alerts-summary-card',
  '.search-results-header',
  '.search-result-card',
  '.top-result-card',
  '.forecast-hero',
  '.forecast-verdict-card',
  '.forecast-chart-card',
  '.forecast-accuracy-card',
  '.forecast-features-card',
  '.forecast-page-cta-card',
  '.projection-hero',
  '.projection-summary-card',
  '.account-card',
  '.settings-row',
  '.settings-preference-card',
  '.theme-choice',
  '.guides-hero',
  '.guides-hero-panel',
  '.guides-category-card',
  '.guides-content',
  '.guides-footer-cta',
  '.movers-direction-hero',
  '.movers-direction-summary-card',
  '.movers-direction-card',
  '.similar-instrument-card',
  '.sim-history-hero',
  '.sim-card',
  '.tracked-symbols-page-hero',
  '.tracked-symbols-summary-card',
  '.admin-table-card',
  '.admin-modal',
  '.admin-detail-panel',
  '.alert-toast',
  '.rq-card',
].join(',')

export function ThemeEffects() {
  useEffect(() => {
    const observedElements = new Set<Element>()

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-theme-surface-visible', 'true')
          } else {
            entry.target.removeAttribute('data-theme-surface-visible')
          }
        }
      },
      { rootMargin: '120px' },
    )

    function registerSurfaces(root: ParentNode) {
      const candidates = root instanceof Element && root.matches(THEME_SURFACE_SELECTOR)
        ? [root, ...root.querySelectorAll(THEME_SURFACE_SELECTOR)]
        : [...root.querySelectorAll(THEME_SURFACE_SELECTOR)]

      for (const element of candidates) {
        if (observedElements.has(element)) continue
        element.setAttribute('data-theme-surface', 'true')
        observedElements.add(element)
        visibilityObserver.observe(element)
      }
    }

    registerSurfaces(document)

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (addedNode instanceof Element) {
            registerSurfaces(addedNode)
          }
        }
      }
    })

    mutationObserver.observe(document.body, { childList: true, subtree: true })

    return () => {
      mutationObserver.disconnect()
      visibilityObserver.disconnect()
      for (const element of observedElements) {
        element.removeAttribute('data-theme-surface')
        element.removeAttribute('data-theme-surface-visible')
      }
    }
  }, [])

  return null
}
