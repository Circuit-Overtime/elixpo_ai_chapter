export const runtime = 'edge';

import HandleClient from './client';

export default function Handle({ params }) {
  return <HandleClient params={params} />;
}
