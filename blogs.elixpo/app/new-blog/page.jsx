'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

function generateBlogId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export default function New() {
  const router = useRouter();

  // /new-blog is a launcher only — it never hosts the editor itself, because a
  // slugid generated here wouldn't be in the URL and a reload would mint a new
  // one (losing the draft). Every explicit "write" action creates a fresh,
  // stable editor URL; existing drafts remain available from /stories.
  useEffect(() => {
    router.replace(`/edit/${generateBlogId()}`);
  }, [router]);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#9b7bf7] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
