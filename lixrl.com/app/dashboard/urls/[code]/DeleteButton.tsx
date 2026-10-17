'use client';

import { useRouter } from 'next/navigation';

export default function DeleteButton({ code }: { code: string }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('Delete this URL permanently?')) return;
    const res = await fetch(`/api/urls/${code}`, { method: 'DELETE' });
    if (res.ok) router.push('/dashboard/urls');
  };

  return (
    <button onClick={handleDelete} className="btn-danger text-sm">
      Delete
    </button>
  );
}
