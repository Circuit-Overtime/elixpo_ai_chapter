'use client';

import { useState, useEffect } from 'react';

const MODELS_URL = 'https://gen.pollinations.ai/image/models';
const CACHE_KEY = 'elixpo_models_cache';
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const FALLBACK = {
  imageModels: [
    { id: 'flux', label: 'Flux Schnell', desc: 'Fast high-quality image generation', canEdit: false },
    { id: 'gptimage', label: 'GPT Image 1 Mini', desc: "OpenAI's image generation model", canEdit: true },
    { id: 'klein', label: 'FLUX.2 Klein 4B', desc: 'Fast image generation and editing', canEdit: true },
    { id: 'zimage', label: 'Z-Image Turbo', desc: 'Fast 6B Flux with 2x upscaling', canEdit: false },
  ],
  videoModels: [
    { id: 'ltx-2', label: 'LTX-2.3', desc: 'Fast text-to-video generation with upscaler', canEdit: false },
  ],
  editModels: [
    { id: 'gptimage', label: 'GPT Image 1 Mini', desc: "OpenAI's image generation model", canEdit: true },
    { id: 'klein', label: 'FLUX.2 Klein 4B', desc: 'Fast image generation and editing', canEdit: true },
  ],
};

FALLBACK.all = [...FALLBACK.imageModels, ...FALLBACK.videoModels];

function parseModels(raw) {
  const imageModels = [];
  const videoModels = [];
  const editModels = [];

  for (const m of raw) {
    if (m.paid_only) continue;

    const canEdit = m.input_modalities?.includes('text') && m.input_modalities?.includes('image');
    const entry = {
      id: m.name,
      label: m.description?.split(' - ')[0] || m.name,
      desc: m.description?.split(' - ')[1] || '',
      canEdit,
    };

    if (m.output_modalities?.includes('video')) {
      videoModels.push(entry);
    } else {
      imageModels.push(entry);
    }

    // Models that accept both text + image input can be used for editing
    if (canEdit && !m.output_modalities?.includes('video')) {
      editModels.push(entry);
    }
  }

  return { imageModels, videoModels, editModels, all: [...imageModels, ...videoModels] };
}

export function useModels() {
  const [models, setModels] = useState(() => {
    // Try loading from sessionStorage cache on init
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, time } = JSON.parse(cached);
          if (Date.now() - time < CACHE_TTL) return data;
        }
      } catch {}
    }
    return FALLBACK;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Check cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, time } = JSON.parse(cached);
        if (Date.now() - time < CACHE_TTL) {
          setModels(data);
          setLoading(false);
          return;
        }
      }
    } catch {}

    fetch(MODELS_URL)
      .then((r) => r.json())
      .then((raw) => {
        if (cancelled) return;
        const parsed = parseModels(raw);
        setModels(parsed);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: parsed, time: Date.now() }));
      })
      .catch(() => {
        if (!cancelled) setModels(FALLBACK);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  return { ...models, loading };
}

// Helper to get label from model id
export function modelLabel(allModels, id) {
  return allModels?.find((m) => m.id === id)?.label || id;
}
