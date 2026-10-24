'use client';

import { use } from 'react';
import OrgManagePage from '../../../../src/views/settings/OrgManagePage';

export default function OrgSettingsClient({ params }) {
  const { slug } = use(params);
  return <OrgManagePage slug={slug} />;
}
