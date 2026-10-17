import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PollinationsBadge from './PollinationsBadge';
import type { UIMessage } from 'ai';

export function ChatMessage({ message }: { message: any }) {
  const isUser = message.role === 'user';

  // AI SDK v6 uses parts-based content. Extract text from parts or fall back to string content.
  const textContent = typeof message.content === 'string'
    ? message.content
    : (message.parts
        ?.filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('\n') || '');

  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} mb-6`}>
      <div 
        className={`max-w-[85%] sm:max-w-[75%] rounded-none border p-4 ${
          isUser 
            ? 'bg-[#1a1a2e] border-[rgba(99,102,241,0.2)] text-[#f0ede6]' 
            : 'bg-[#0a0a0a] border-[rgba(240,237,230,0.15)] text-[rgba(240,237,230,0.85)]'
        }`}
        style={{
          clipPath: isUser 
            ? 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' 
            : 'polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px)'
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          {isUser ? (
            <>
              <div className="w-5 h-5 bg-[#6366f1] flex items-center justify-center text-[9px] font-bold text-[#f0ede6]" style={{ clipPath: 'polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 3px 100%, 0 calc(100% - 3px))' }}>
                U
              </div>
              <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-[rgba(240,237,230,0.4)]">
                You
              </span>
            </>
          ) : (
            <>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                </svg>
              </div>
              <span className="font-mono text-[10px] font-bold tracking-[0.1em] uppercase text-[rgba(240,237,230,0.4)]">
                Elixpo Chat
              </span>
              <PollinationsBadge />
            </>
          )}
        </div>
        
        {isUser ? (
          <p className="text-[14px] leading-relaxed">{textContent}</p>
        ) : (
          <div className="prose prose-invert max-w-none text-[14px] leading-relaxed prose-pre:bg-[#05050a] prose-pre:border prose-pre:border-[rgba(240,237,230,0.1)] prose-pre:rounded-none prose-code:text-[#6366f1] prose-headings:text-[#f0ede6] prose-strong:text-[#f0ede6] prose-a:text-[#6366f1]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {textContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
