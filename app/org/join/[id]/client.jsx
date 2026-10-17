'use client';

import { use } from 'react';
import JoinOrgView from '../../../../src/views/JoinOrgPage';

export default function JoinOrgClient({ params }) {
  const { id } = use(params);
  return <JoinOrgView inviteId={id} />;
}
