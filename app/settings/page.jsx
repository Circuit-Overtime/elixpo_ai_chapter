import { Suspense } from 'react';
import SettingsPage from '../../src/views/settings/SettingsPage';

export const metadata = {
  title: 'Settings',
  description: 'Manage your LixBlogs account settings, profile, and preferences.',
};

export default function Settings() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
