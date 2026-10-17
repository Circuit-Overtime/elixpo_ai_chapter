'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import MentionTextarea, { renderMentions } from './MentionTextarea';
import { generatePixelAvatar } from '../utils/pixelAvatar';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Under a secret post the API returns username/avatar_url as null. Render the
// avatar unlinked in that case — an <a href="/null"> would be both broken and a
// hint that there's a profile behind it.
function CommentAvatar({ c, small = false }) {
  const box = small ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-[12px]';
  const inner = <img src={c.avatar_url || generatePixelAvatar(c.username || c.display_name || 'anonymous')} alt="" className={`${box} rounded-full object-cover`} />;
  if (!c.username) return <div className="flex-shrink-0">{inner}</div>;
  return <Link href={`/${c.username}`} className="flex-shrink-0">{inner}</Link>;
}

// "Author" badge on the post author's own comments. On a secret post user_id is
// withheld, so the server sends `is_post_author`; on a normal post the client can
// derive it from blogAuthorId. Either way the badge marks the role, never the person.
function AuthorBadge() {
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: '#9b7bf71f', color: '#9b7bf7' }}
      title="Written by the author of this post"
    >
      Author
    </span>
  );
}

function CommentName({ c, small = false }) {
  const size = small ? 'text-[12px]' : 'text-[13px]';
  const label = c.display_name || c.username || 'Anonymous';
  if (!c.username) return <span className={`${size} font-semibold`} style={{ color: 'var(--text-primary)' }}>{label}</span>;
  return <Link href={`/${c.username}`} className={`${size} font-semibold`} style={{ color: 'var(--text-primary)' }}>{label}</Link>;
}

// Placeholder for a comment whose text the server withheld. There is nothing to
// un-blur here: the content never arrived in the response, so this is purely visual.
function BlurredBody() {
  return (
    <div className="select-none">
      <div aria-hidden="true" style={{ filter: 'blur(4px)', opacity: 0.7 }}>
        <div className="h-3 rounded mb-1.5" style={{ backgroundColor: 'var(--bg-elevated)', width: '92%' }} />
        <div className="h-3 rounded" style={{ backgroundColor: 'var(--bg-elevated)', width: '58%' }} />
      </div>
      <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
        <ion-icon name="lock-closed-outline" style={{ fontSize: '11px' }} />
        Only this post’s author and collaborators can read its comments
      </p>
    </div>
  );
}

export default function BlogComments({ blogId, blogAuthorId }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const signInHref = pathname
    ? `/sign-in?next=${encodeURIComponent(`${pathname}#comments`)}`
    : '/sign-in';
  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // { id, username }
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState(null); // { id, content }
  const [toast, setToast] = useState('');
  const [highlighted, setHighlighted] = useState(null); // comment id from the URL hash
  const flashToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/blogs/${blogId}/comments?limit=30`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [blogId]);

  // Copy a permalink to a single comment. Under a secret post this shares only the
  // location, not access — the blur rules still apply to whoever opens it.
  const copyCommentLink = async (commentId) => {
    const url = `${window.location.origin}${window.location.pathname}#comment-${commentId}`;
    try {
      await navigator.clipboard.writeText(url);
      flashToast('Link copied');
    } catch {
      flashToast(url);
    }
  };

  // Deep link: once comments are on screen, jump to the one named in the hash and
  // flash it, so a shared link lands somewhere obvious instead of the page top.
  useEffect(() => {
    if (loading || !comments.length) return;
    const m = window.location.hash.match(/^#comment-(.+)$/);
    if (!m) return;
    const id = m[1];
    const el = document.getElementById(`comment-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(id);
    const t = setTimeout(() => setHighlighted(null), 2600);
    return () => clearTimeout(t);
  }, [loading, comments]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const postComment = async (content, parentId = null) => {
    if (!content.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/blogs/${blogId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), parentId }),
      });
      if (res.ok) {
        if (parentId) { setReplyText(''); setReplyTo(null); }
        else setNewComment('');
        fetchComments();
        flashToast(parentId ? 'Reply posted' : 'Comment posted');
      }
    } catch {}
    setPosting(false);
  };

  const saveEdit = async () => {
    if (!editing || !editing.content.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/blogs/${blogId}/comments/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editing.content.trim() }),
      });
      if (res.ok) { setEditing(null); fetchComments(); }
    } catch {}
    setPosting(false);
  };

  const deleteComment = async (commentId) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await fetch(`/api/blogs/${blogId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugid: blogId, userId: user?.id }),
      });
      fetchComments();
    } catch {}
  };

  return (
    <div className="mt-10" id="comments">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium" style={{ backgroundColor: 'var(--text-primary)', color: 'var(--bg-app)', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
          <ion-icon name="checkmark-circle" style={{ fontSize: '15px' }} /> {toast}
        </div>
      )}
      <h3 className="text-[18px] font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        Comments {total > 0 && <span className="text-[14px] font-normal" style={{ color: 'var(--text-faint)' }}>({total})</span>}
      </h3>

      {/* New comment input */}
      {user ? (
        <div className="flex gap-3 mb-8">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-1" />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 mt-1" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              {(user.display_name || user.username || '?')[0].toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <MentionTextarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); postComment(newComment); } }}
              placeholder="Add a comment... (@ to mention, :emoji:)"
              rows={2}
              className="w-full px-1 py-3 outline-none text-[14px] resize-none bg-transparent"
              style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Ctrl + Enter to post</span>
              <button
                onClick={() => postComment(newComment)}
                disabled={!newComment.trim() || posting}
                className="px-4 py-1.5 text-[13px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] rounded-lg transition-colors disabled:opacity-40"
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 mb-8 rounded-xl" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
          <p className="text-[14px]" style={{ color: 'var(--text-muted)' }}>
            <Link href={signInHref} className="font-medium" style={{ color: 'var(--accent)' }}>Sign in</Link> to join the conversation.
          </p>
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-elevated)' }} />)}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center py-8 text-[14px]" style={{ color: 'var(--text-faint)' }}>No comments yet. Be the first!</p>
      ) : (
        <div className="space-y-1">
          {comments.map(c => (
            <div key={c.id}>
              {/* Top-level comment — id is the permalink target for #comment-<id> */}
              <div
                id={`comment-${c.id}`}
                className="flex gap-3 py-4 px-3 -mx-3 rounded-lg transition-colors"
                style={{
                  borderBottom: '1px solid var(--divider)',
                  backgroundColor: highlighted === c.id ? 'var(--accent-subtle)' : 'transparent',
                }}
              >
                <CommentAvatar c={c} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <CommentName c={c} />
                    {(c.is_post_author ?? (blogAuthorId && c.user_id === blogAuthorId)) && <AuthorBadge />}
                    <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{timeAgo(c.created_at)}</span>
                    {c.updated_at > c.created_at && <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>(edited)</span>}
                  </div>

                  {/* Edit mode or display */}
                  {editing?.id === c.id ? (
                    <div>
                      <textarea
                        value={editing.content}
                        onChange={e => setEditing({ ...editing, content: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit(); } }}
                        rows={3}
                        className="w-full px-1 py-2 outline-none text-[14px] resize-none bg-transparent"
                        style={{ borderBottom: '1px solid var(--accent)', color: 'var(--text-primary)' }}
                        autoFocus
                      />
                      <div className="flex items-center gap-2 mt-1.5">
                        <button onClick={saveEdit} disabled={!editing.content.trim() || posting} className="text-[12px] font-medium px-3 py-1 rounded-md text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] disabled:opacity-40">Save</button>
                        <button onClick={() => setEditing(null)} className="text-[12px] font-medium" style={{ color: 'var(--text-faint)' }}>Cancel</button>
                      </div>
                    </div>
                  ) : c.blurred ? (
                    <BlurredBody />
                  ) : (
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-body)' }}>{renderMentions(c.content, c.mentions, Link)}</p>
                  )}

                  {/* Actions: reply, edit, delete */}
                  {user && editing?.id !== c.id && (
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => setReplyTo(replyTo?.id === c.id ? null : { id: c.id, username: c.display_name || c.username })}
                        className="text-[12px] font-medium transition-colors"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        {replyTo?.id === c.id ? 'Cancel' : `Reply${c.reply_count > 0 ? ` (${c.reply_count})` : ''}`}
                      </button>
                      {/* Under a secret post the API withholds user_id, so ownership
                          comes from the server's is_mine flag instead. */}
                      {(c.is_mine ?? user.id === c.user_id) && !c.blurred && (
                        <button onClick={() => setEditing({ id: c.id, content: c.content })} className="text-[12px] font-medium transition-colors" style={{ color: 'var(--text-faint)' }}>Edit</button>
                      )}
                      {((c.is_mine ?? user.id === c.user_id) || user.id === blogAuthorId) && (
                        <button onClick={() => deleteComment(c.id)} className="text-[12px] font-medium transition-colors" style={{ color: '#f87171' }}>Delete</button>
                      )}
                      <button
                        onClick={() => copyCommentLink(c.id)}
                        className="text-[12px] font-medium transition-colors ml-auto flex items-center gap-1"
                        style={{ color: 'var(--text-faint)' }}
                        title="Copy a link to this comment"
                      >
                        <ion-icon name="link-outline" style={{ fontSize: '13px' }} />
                        Share
                      </button>
                    </div>
                  )}

                  {/* Reply input */}
                  {replyTo?.id === c.id && (
                    <div className="flex gap-2 mt-3">
                      <MentionTextarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder={`Reply to ${replyTo.username}... (@ to mention, :emoji:)`}
                        rows={2}
                        className="w-full rounded-lg px-3 py-2 outline-none text-[13px] resize-none"
                        style={{ flex: 1, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                        autoFocus
                      />
                      <button
                        onClick={() => postComment(replyText, c.id)}
                        disabled={!replyText.trim() || posting}
                        className="px-3 py-2 text-[12px] font-medium text-white bg-[#9b7bf7] hover:bg-[#8b6ae6] rounded-lg self-end disabled:opacity-40"
                      >
                        Reply
                      </button>
                    </div>
                  )}

                  {/* Replies */}
                  {(c.replies || []).length > 0 && (
                    <div className="mt-3 ml-2 pl-4" style={{ borderLeft: '2px solid var(--border-default)' }}>
                      {c.replies.map(r => (
                        <div
                          key={r.id}
                          id={`comment-${r.id}`}
                          className="flex gap-2.5 py-3 px-2 -mx-2 rounded-lg transition-colors"
                          style={{ backgroundColor: highlighted === r.id ? 'var(--accent-subtle)' : 'transparent' }}
                        >
                          <CommentAvatar c={r} small />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <CommentName c={r} small />
                              {(r.is_post_author ?? (blogAuthorId && r.user_id === blogAuthorId)) && <AuthorBadge />}
                              <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{timeAgo(r.created_at)}</span>
                            </div>
                            {r.blurred ? (
                              <BlurredBody />
                            ) : (
                              <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-body)' }}>{renderMentions(r.content, r.mentions, Link)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
