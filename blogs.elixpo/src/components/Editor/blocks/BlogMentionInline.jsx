'use client';

import { createReactInlineContentSpec } from '@blocknote/react';

export const BlogMentionInline = createReactInlineContentSpec(
  {
    type: 'blogMention',
    propSchema: {
      title: { default: '' },
      slugid: { default: '' },
      author: { default: '' },
      slug: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => {
      const { slugid, author, slug, title } = inlineContent.props;
      const href = author && slug ? `/${author}/${slug}` : `/${slugid}`;
      return (
        <a href={href} className="mention-chip" data-mention-type="blog" data-slugid={slugid} data-author={author} data-slug={slug} data-title={title} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none' }} spellCheck={false}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          {title || 'Untitled blog'}
        </a>
      );
    },
    parse: (el) => {
      if (el.getAttribute('data-mention-type') === 'blog') {
        return {
          title: el.getAttribute('data-title') || el.textContent?.trim() || '',
          slugid: el.getAttribute('data-slugid') || '',
          author: el.getAttribute('data-author') || '',
          slug: el.getAttribute('data-slug') || '',
        };
      }
      return undefined;
    },
  }
);
