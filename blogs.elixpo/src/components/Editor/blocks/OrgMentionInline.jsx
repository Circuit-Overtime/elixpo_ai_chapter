'use client';

import { createReactInlineContentSpec } from '@blocknote/react';

export const OrgMentionInline = createReactInlineContentSpec(
  {
    type: 'orgMention',
    propSchema: {
      name: { default: '' },
      slug: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => {
      return (
        <a href={`/${inlineContent.props.slug}`} className="mention-chip" data-mention-type="org" data-slug={inlineContent.props.slug} data-name={inlineContent.props.name} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }} spellCheck={false}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
          </svg>
          @{inlineContent.props.slug}
        </a>
      );
    },
    parse: (el) => {
      if (el.getAttribute('data-mention-type') === 'org') {
        return {
          name: el.getAttribute('data-name') || el.textContent?.replace(/^@/, '').trim() || '',
          slug: el.getAttribute('data-slug') || '',
        };
      }
      return undefined;
    },
  }
);
