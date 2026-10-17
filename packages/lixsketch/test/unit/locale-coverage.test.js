import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

function load(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
}

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' && !Array.isArray(child) ? keys(child, path) : [path]
  }).sort()
}

describe('locale coverage', () => {
  it('keeps Hindi complete against the English source locale', () => {
    const english = load('../../../../src/locales/en.json')
    const hindi = load('../../../../src/locales/hi.json')

    expect(keys(hindi)).toEqual(keys(english))
  })

  it('keeps the docs-served locale identical to the app locale', () => {
    const app = load('../../../../src/locales/hi.json')
    const docs = load('../../../../public/locales/hi.json')

    expect(docs).toEqual(app)
  })
})
