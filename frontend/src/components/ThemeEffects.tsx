import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

const MOTION_SELECTOR = '[data-scroll-reveal], [data-scroll-stagger], [data-scroll-item], [data-theme-glare]'
const MOTION_RESET_EVENT = 'marketmetrics:route-motion-reset'

type MotionProfile = 'landing' | 'public' | 'application' | 'admin'

function motionProfileForPath(pathname: string): MotionProfile {
  if (pathname === '/') return 'landing'
  if (pathname.startsWith('/admin/')) return 'admin'
  if (
    pathname === '/login'
    || pathname === '/signup'
    || pathname.startsWith('/forgot-password')
    || pathname.startsWith('/reset-password')
    || pathname.startsWith('/verify-email')
    || pathname === '/guides'
    || pathname === '/terms'
    || pathname === '/privacy'
  ) return 'public'
  return 'application'
}

function candidatesFrom(root: ParentNode, selector: string): Element[] {
  const nested = [...root.querySelectorAll(selector)]
  return root instanceof Element && root.matches(selector) ? [root, ...nested] : nested
}

function isInitiallyVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  return rect.bottom >= -32 && rect.top <= window.innerHeight + 48
}

function isGroupedItem(element: Element): boolean {
  return element.hasAttribute('data-scroll-item')
    && element.parentElement?.hasAttribute('data-scroll-stagger') === true
}

export function ThemeEffects() {
  const { pathname } = useLocation()
  const progressRef = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.motionProfile = motionProfileForPath(pathname)
    if (progressRef.current) progressRef.current.style.transform = 'scaleX(0)'

    const resetFrame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event(MOTION_RESET_EVENT))
    })
    return () => window.cancelAnimationFrame(resetFrame)
  }, [pathname])

  useLayoutEffect(() => {
    const root = document.documentElement
    const appRoot = document.getElementById('root')
    const progressElement = progressRef.current
    if (!appRoot) return undefined

    const observedElements = new Set<Element>()
    const revealElements = new Set<Element>()
    const staggerGroups = new Set<Element>()
    const glareElements = new Set<Element>()
    const preparedItems = new Set<HTMLElement>()
    const autoItems = new Set<HTMLElement>()
    const pendingRegistrationRoots = new Set<Element>()
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let scrollFrame = 0
    let registrationFrame = 0
    let previousProgress = -1

    function reveal(element: Element) {
      element.setAttribute('data-scroll-visible', 'true')
      element.setAttribute('data-scroll-revealed', 'true')
    }

    function prepareGroup(group: Element) {
      const directChildren = [...group.children].filter(
        (child): child is HTMLElement => child instanceof HTMLElement,
      )
      for (const [index, child] of directChildren.entries()) {
        if (!child.hasAttribute('data-scroll-item') && !child.hasAttribute('data-scroll-reveal')) {
          child.setAttribute('data-scroll-item', '')
          child.setAttribute('data-scroll-auto-item', 'true')
          autoItems.add(child)
        }
        child.setAttribute('data-scroll-prepared', 'true')
        child.style.setProperty('--scroll-order', String(index))
        preparedItems.add(child)
      }
    }

    function stopObserving(element: Element) {
      visibilityObserver.unobserve(element)
      observedElements.delete(element)
    }

    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const element = entry.target
          if (glareElements.has(element)) {
            element.setAttribute('data-theme-surface-visible', 'true')
          }
          if (revealElements.has(element) || staggerGroups.has(element)) reveal(element)
          stopObserving(element)
        }
      },
      { rootMargin: '96px 0px -7% 0px', threshold: 0.08 },
    )

    function observe(element: Element) {
      if (observedElements.has(element)) return
      observedElements.add(element)
      visibilityObserver.observe(element)
    }

    function registerMotion(scope: ParentNode) {
      for (const group of candidatesFrom(scope, '[data-scroll-stagger]')) {
        if (staggerGroups.has(group)) continue
        staggerGroups.add(group)
        prepareGroup(group)
        if (reducedMotionQuery.matches || isInitiallyVisible(group)) reveal(group)
        else observe(group)
      }

      for (const element of candidatesFrom(scope, '[data-scroll-reveal]')) {
        if (revealElements.has(element)) continue
        if (isGroupedItem(element)) continue
        element.setAttribute('data-scroll-prepared', 'true')
        revealElements.add(element)
        if (reducedMotionQuery.matches || isInitiallyVisible(element)) reveal(element)
        else observe(element)
      }

      for (const element of candidatesFrom(scope, '[data-scroll-item]')) {
        if (isGroupedItem(element) || revealElements.has(element)) continue
        if (!(element instanceof HTMLElement)) continue
        element.setAttribute('data-scroll-prepared', 'true')
        preparedItems.add(element)
        revealElements.add(element)
        if (reducedMotionQuery.matches || isInitiallyVisible(element)) reveal(element)
        else observe(element)
      }

      for (const element of candidatesFrom(scope, '[data-theme-glare]')) {
        if (glareElements.has(element)) continue
        glareElements.add(element)
        if (reducedMotionQuery.matches || isInitiallyVisible(element)) {
          element.setAttribute('data-theme-surface-visible', 'true')
        } else observe(element)
      }
    }

    function unregisterTree(tree: Element) {
      for (const element of candidatesFrom(tree, MOTION_SELECTOR)) {
        if (observedElements.has(element)) stopObserving(element)
        revealElements.delete(element)
        staggerGroups.delete(element)
        glareElements.delete(element)
        if (element instanceof HTMLElement) {
          preparedItems.delete(element)
          autoItems.delete(element)
        }
      }
    }

    function flushRegistrations() {
      registrationFrame = 0
      for (const scope of pendingRegistrationRoots) registerMotion(scope)
      pendingRegistrationRoots.clear()
    }

    function queueRegistration(scope: Element) {
      if (!scope.matches(MOTION_SELECTOR) && !scope.querySelector(MOTION_SELECTOR)) return
      pendingRegistrationRoots.add(scope)
      if (registrationFrame === 0) registrationFrame = window.requestAnimationFrame(flushRegistrations)
    }

    function updateScrollProgress() {
      scrollFrame = 0
      if (document.visibilityState === 'hidden') return
      const scrollingElement = document.scrollingElement ?? document.documentElement
      const scrollRange = Math.max(scrollingElement.scrollHeight - window.innerHeight, 1)
      const progress = Math.min(Math.max(window.scrollY / scrollRange, 0), 1)
      if (progressElement && Math.abs(progress - previousProgress) >= 0.001) {
        progressElement.style.transform = `scaleX(${progress.toFixed(4)})`
        previousProgress = progress
      }
    }

    function requestScrollUpdate() {
      if (scrollFrame !== 0) return
      scrollFrame = window.requestAnimationFrame(updateScrollProgress)
    }

    function handleReducedMotionChange() {
      if (reducedMotionQuery.matches) {
        root.dataset.motionReduced = 'true'
        if (progressElement) progressElement.style.transform = 'scaleX(0)'
        for (const element of revealElements) reveal(element)
        for (const element of staggerGroups) reveal(element)
        for (const element of glareElements) element.setAttribute('data-theme-surface-visible', 'true')
        for (const element of [...observedElements]) stopObserving(element)
      } else {
        delete root.dataset.motionReduced
        previousProgress = -1
      }
      requestScrollUpdate()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        root.dataset.motionPaused = 'true'
        if (scrollFrame !== 0) {
          window.cancelAnimationFrame(scrollFrame)
          scrollFrame = 0
        }
        if (registrationFrame !== 0) {
          window.cancelAnimationFrame(registrationFrame)
          registrationFrame = 0
        }
        return
      }
      delete root.dataset.motionPaused
      if (pendingRegistrationRoots.size > 0 && registrationFrame === 0) {
        registrationFrame = window.requestAnimationFrame(flushRegistrations)
      }
      requestScrollUpdate()
    }

    registerMotion(appRoot)
    handleReducedMotionChange()
    root.dataset.motionReady = 'true'
    updateScrollProgress()

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNode of mutation.removedNodes) {
          if (removedNode instanceof Element) unregisterTree(removedNode)
        }
        for (const addedNode of mutation.addedNodes) {
          if (addedNode instanceof Element) queueRegistration(addedNode)
        }
      }
    })

    mutationObserver.observe(appRoot, { childList: true, subtree: true })
    window.addEventListener('scroll', requestScrollUpdate, { passive: true })
    window.addEventListener('resize', requestScrollUpdate, { passive: true })
    window.addEventListener(MOTION_RESET_EVENT, requestScrollUpdate)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange)

    return () => {
      if (scrollFrame !== 0) window.cancelAnimationFrame(scrollFrame)
      if (registrationFrame !== 0) window.cancelAnimationFrame(registrationFrame)
      mutationObserver.disconnect()
      visibilityObserver.disconnect()
      window.removeEventListener('scroll', requestScrollUpdate)
      window.removeEventListener('resize', requestScrollUpdate)
      window.removeEventListener(MOTION_RESET_EVENT, requestScrollUpdate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange)

      for (const element of revealElements) {
        element.removeAttribute('data-scroll-prepared')
        element.removeAttribute('data-scroll-visible')
        element.removeAttribute('data-scroll-revealed')
      }
      for (const element of staggerGroups) {
        element.removeAttribute('data-scroll-visible')
        element.removeAttribute('data-scroll-revealed')
      }
      for (const element of preparedItems) {
        element.removeAttribute('data-scroll-prepared')
        element.style.removeProperty('--scroll-order')
      }
      for (const element of autoItems) {
        element.removeAttribute('data-scroll-item')
        element.removeAttribute('data-scroll-auto-item')
      }
      for (const element of glareElements) element.removeAttribute('data-theme-surface-visible')

      delete root.dataset.motionReady
      delete root.dataset.motionReduced
      delete root.dataset.motionPaused
      delete root.dataset.motionProfile
      if (progressElement) progressElement.style.removeProperty('transform')
    }
  }, [])

  return (
    <>
      <div aria-hidden="true" className="scroll-ambient" />
      <div aria-hidden="true" className="scroll-progress-rail">
        <span className="scroll-progress-value" ref={progressRef} />
      </div>
    </>
  )
}
