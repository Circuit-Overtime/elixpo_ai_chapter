export const runtime = 'edge'

import { NextResponse } from 'next/server'
import {
  SYSTEM_PROMPT,
  USER_PROMPT_TEXT,
  USER_PROMPT_MERMAID,
  USER_PROMPT_EDIT,
  RESEARCH_PAPER_SYSTEM_PROMPT,
  RESEARCH_PAPER_USER_PROMPT,
  RESEARCH_PAPER_EDIT_PROMPT,
} from '@elixpo/lixsketch/src/core/ai-system-prompt.js'
import {
  LIXSCRIPT_LLM_SPEC,
  LIXSCRIPT_USER_PROMPT,
  LIXSCRIPT_EDIT_PROMPT,
  LIXSCRIPT_MERMAID_PROMPT,
  LIXSCRIPT_RESEARCH_PROMPT,
  LIXSCRIPT_RESEARCH_EDIT_PROMPT,
} from '@/lib/lixscript-llm-spec.js'

const POLLINATIONS_URL = 'https://gen.pollinations.ai/v1/chat/completions'

export async function POST(request) {
  try {
    const { prompt, mode, history, previousDiagram, previousLixCode } = await request.json()

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = process.env.POLLINATIONS_TEXT_API
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // Determine generation mode
    const isLixScript = mode === 'lixscript'
    const isResearchPaper = mode === 'research'
    const isResearchLixScript = mode === 'research-lixscript'

    // Build the user message based on context
    let systemPrompt
    let userMessage

    if (isResearchLixScript) {
      // Research paper mode generating LixScript
      systemPrompt = LIXSCRIPT_LLM_SPEC
      if (previousLixCode) {
        userMessage = LIXSCRIPT_RESEARCH_EDIT_PROMPT(prompt, previousLixCode)
      } else {
        userMessage = LIXSCRIPT_RESEARCH_PROMPT(prompt)
      }
    } else if (isResearchPaper) {
      // Research paper mode generating JSON diagram
      systemPrompt = RESEARCH_PAPER_SYSTEM_PROMPT
      if (previousDiagram && previousDiagram.nodes) {
        userMessage = RESEARCH_PAPER_EDIT_PROMPT(prompt, previousDiagram)
      } else {
        userMessage = RESEARCH_PAPER_USER_PROMPT(prompt)
      }
    } else if (isLixScript) {
      systemPrompt = LIXSCRIPT_LLM_SPEC
      if (previousLixCode) {
        userMessage = LIXSCRIPT_EDIT_PROMPT(prompt, previousLixCode)
      } else {
        userMessage = LIXSCRIPT_USER_PROMPT(prompt)
      }
    } else {
      systemPrompt = SYSTEM_PROMPT
      if (previousDiagram && previousDiagram.nodes) {
        userMessage = USER_PROMPT_EDIT(prompt, previousDiagram)
      } else if (mode === 'mermaid') {
        userMessage = USER_PROMPT_MERMAID(prompt)
      } else {
        userMessage = USER_PROMPT_TEXT(prompt)
      }
    }

    console.log('[AI Generate] Request:', {
      mode,
      isLixScript,
      isResearchPaper,
      isResearchLixScript,
      promptLength: prompt.length,
      isEdit: (isLixScript || isResearchLixScript) ? !!previousLixCode : !!previousDiagram,
      historyLength: history?.length || 0,
    })

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)

    // Build messages array with conversation history for context
    const messages = [{ role: 'system', content: systemPrompt }]

    // Include relevant history for multi-turn edits
    if (history && Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-4)
      recentHistory.forEach(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content })
        }
      })
    }

    messages.push({ role: 'user', content: userMessage })

    const response = await fetch(POLLINATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'claude-fast',
        messages,
        temperature: 0.3,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[AI Generate] API error:', response.status, errorText)
      return NextResponse.json(
        { error: `AI service returned ${response.status}. Please try again.` },
        { status: 502 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.error('[AI Generate] No content in response:', data)
      return NextResponse.json({ error: 'Empty AI response' }, { status: 500 })
    }

    console.log('[AI Generate] Model output:', content.slice(0, 200))

    // LixScript mode (including research-lixscript) — return the code directly
    if (isLixScript || isResearchLixScript) {
      // Strip markdown fences if the model wrapped it
      const cleaned = content
        .replace(/```(?:lixscript|text|plaintext)?\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()

      if (!cleaned || cleaned.length < 10) {
        return NextResponse.json({ error: 'AI returned empty LixScript. Try rephrasing.' }, { status: 500 })
      }

      console.log('[AI Generate] LixScript success:', cleaned.length, 'chars')
      return NextResponse.json({ lixscript: cleaned })
    }

    // JSON diagram mode (including research paper) — parse and validate
    let diagram
    try {
      const cleaned = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()
      diagram = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error('[AI Generate] JSON parse failed. Raw content:', content)
      return NextResponse.json({ error: 'AI returned invalid format. Try again.' }, { status: 500 })
    }

    if (!diagram.nodes || !Array.isArray(diagram.nodes) || diagram.nodes.length === 0) {
      console.error('[AI Generate] Invalid diagram structure:', diagram)
      return NextResponse.json({ error: 'AI returned empty diagram. Try rephrasing.' }, { status: 500 })
    }

    console.log('[AI Generate] Success:', {
      title: diagram.title,
      nodes: diagram.nodes.length,
      edges: diagram.edges?.length || 0,
    })

    return NextResponse.json({ diagram })
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[AI Generate] Request timed out')
      return NextResponse.json({ error: 'AI request timed out. Try a simpler prompt.' }, { status: 504 })
    }
    console.error('[AI Generate] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
