export const runtime = 'edge';

import OrgSettingsClient from './client';

export default function OrgSettings({ params }) {
  return <OrgSettingsClient params={params} />;
}
