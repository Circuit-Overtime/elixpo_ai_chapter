export const runtime = 'edge';

import SubpageClient from './client';

export default function SubpageEdit({ params }) {
  return <SubpageClient params={params} />;
}
