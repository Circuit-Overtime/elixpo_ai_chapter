export const runtime = 'edge';

import EditBlogClient from './client';

export default function EditBlog({ params }) {
  return <EditBlogClient params={params} />;
}
