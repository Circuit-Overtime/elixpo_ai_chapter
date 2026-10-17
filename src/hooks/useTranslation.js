import { useCallback } from 'react'
import useUIStore from '../store/useUIStore'
import { t } from '../lib/i18n'

/**
 * A custom hook to use translations in React components.
 * It subscribes to the language change from useUIStore, ensuring the component re-renders.
 */
export function useTranslation() {
  const language = useUIStore((state) => state.language)

  // t is memoized so we can pass it down safely
  const translate = useCallback(
    (key, variables) => t(key, variables),
    [language] // Re-bind when language changes
  )

  return { t: translate, language }
}
