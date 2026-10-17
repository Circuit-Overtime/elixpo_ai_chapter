import React from 'react';
import { Cpu, Clock } from 'lucide-react';
import { LixSearchBadge } from './LixSearchBadge';

// Minimal mock components for standard Markdown and Citations
const MarkdownRenderer = ({ content }: { content: string }) => <span>{content}</span>;

const CitationChip = ({ citation }: { citation: any }) => (
  <a href={citation.url} className="text-xs text-blue-400 hover:underline px-2 py-1 rounded bg-surface border border-default">
    {citation.title || citation.url}
  </a>
);

export function SearchResultCard({ answer, citations = [], latency = 842 }: { answer: string; citations?: any[]; latency?: number }) {
  return (
    <div className="w-full max-w-3xl space-y-4">
      {/* Answer header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
            <Cpu size={12} className="text-white" />
          </div>
          <span className="text-sm font-medium text-primary">lixsearch</span>
          <LixSearchBadge />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <Clock size={11} />
          <span>{latency}ms</span>
        </div>
      </div>

      {/* Streamed markdown answer */}
      <div className="prose prose-invert prose-sm max-w-none">
        <MarkdownRenderer content={answer} />
      </div>

      {/* Citations row */}
      {citations.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-subtle">
          {citations.map(c => <CitationChip key={c.url} citation={c} />)}
        </div>
      )}
    </div>
  );
}
