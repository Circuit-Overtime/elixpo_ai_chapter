import { describe, expect, it } from 'vitest'

import { parseSequenceDiagram } from '../../src/core/MermaidSequenceParser.js'

describe('MermaidSequenceParser', () => {
  it('parses declarations, title, autonumber, and message styles', () => {
    const result = parseSequenceDiagram(`
      sequenceDiagram
      title: Login flow
      autonumber
      actor Browser
      participant API
      Browser->>API: Sign in
      API-->>Browser: Session
    `)

    expect(result.title).toBe('Login flow')
    expect(result.autoNumber).toBe(true)
    expect(result.participants).toEqual([
      { name: 'Browser', type: 'actor' },
      { name: 'API', type: 'participant' },
    ])
    expect(result.messages).toEqual([
      expect.objectContaining({ from: 'Browser', to: 'API', text: 'Sign in', number: 1, solid: true }),
      expect.objectContaining({ from: 'API', to: 'Browser', text: 'Session', number: 2, solid: false }),
    ])
  })

  it('creates implicit participants and positioned notes', () => {
    const result = parseSequenceDiagram(`
      sequenceDiagram
      Client->Server: Ping
      Note over Client,Server: Shared context
      Note right of Server: Ready
    `)

    expect(result.participants.map(({ name }) => name)).toEqual(['Client', 'Server'])
    expect(result.notes).toEqual([
      { position: 'over', targets: ['Client', 'Server'], text: 'Shared context', atMessage: 1 },
      { position: 'right of', targets: ['Server'], text: 'Ready', atMessage: 1 },
    ])
  })

  it('parses alt sections and loop blocks', () => {
    const result = parseSequenceDiagram(`
      sequenceDiagram
      A->>B: Start
      alt accepted
        B-->>A: OK
      else rejected
        B--xA: Error
      end
      loop retry
        A->>B: Again
      end
    `)

    expect(result.blocks).toHaveLength(2)
    expect(result.blocks[0]).toMatchObject({
      type: 'alt',
      label: 'accepted',
      startMsg: 1,
      endMsg: 3,
      sections: [
        { label: 'accepted', startMsg: 1 },
        { label: 'rejected', startMsg: 2 },
      ],
    })
    expect(result.blocks[1]).toMatchObject({ type: 'loop', label: 'retry', startMsg: 3, endMsg: 4 })
  })

  it.each([null, undefined, 42, {}, '', 'flowchart LR', 'sequenceDiagram\n%% comments only'])('rejects invalid or empty input: %s', (source) => {
    expect(parseSequenceDiagram(source)).toBeNull()
  })

  it('ignores surrounding whitespace and comments', () => {
    const result = parseSequenceDiagram(`
      %% setup
      sequenceDiagram

      %% request
      A ->> B : Hello
    `)

    expect(result.messages).toEqual([
      expect.objectContaining({ from: 'A', to: 'B', text: 'Hello' }),
    ])
  })

  it('preserves unicode participant and message labels', () => {
    const result = parseSequenceDiagram(`
      sequenceDiagram
      participant 利用者
      利用者->>Сервер: नमस्ते 🌿
    `)

    expect(result.participants.map(({ name }) => name)).toEqual(['利用者', 'Сервер'])
    expect(result.messages[0].text).toBe('नमस्ते 🌿')
  })

  it('parses a long sequence without dropping messages', () => {
    const messages = Array.from(
      { length: 2_000 },
      (_, index) => `A->>B: Message ${index}`,
    ).join('\n')

    const result = parseSequenceDiagram(`sequenceDiagram\n${messages}`)
    expect(result.messages).toHaveLength(2_000)
    expect(result.messages.at(-1).text).toBe('Message 1999')
  })
})
