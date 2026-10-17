'use client'

import { useEffect } from 'react'
import hljs from 'highlight.js'

export default function InitHljs() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.hljs = hljs
    }
  }, [])

  return null
}
