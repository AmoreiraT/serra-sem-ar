import * as React from "react"

const MOBILE_BREAKPOINT = 768
const MOBILE_LANDSCAPE_MAX_WIDTH = 1100
const MOBILE_LANDSCAPE_MAX_HEIGHT = 540

const getIsMobileViewport = () => {
  if (typeof window === "undefined") return false

  const width = window.innerWidth
  const height = window.innerHeight
  const hasMobilePointer = window.matchMedia("(pointer: coarse)").matches
  const isNarrow = width < MOBILE_BREAKPOINT
  const isPhoneLandscape = width <= MOBILE_LANDSCAPE_MAX_WIDTH && height <= MOBILE_LANDSCAPE_MAX_HEIGHT
  const isTouchTablet = hasMobilePointer && width < 1180

  return isNarrow || isPhoneLandscape || isTouchTablet
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px), (pointer: coarse)`)
    const onChange = () => {
      setIsMobile(getIsMobileViewport())
    }
    mql.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    window.addEventListener("orientationchange", onChange)
    setIsMobile(getIsMobileViewport())
    return () => {
      mql.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
      window.removeEventListener("orientationchange", onChange)
    };
  }, [])

  return !!isMobile
}
