export const runtime = 'edge';

import { apiSuccess, requestContext } from '../../../lib/api/v1/responses';

export async function GET() {
  const context = requestContext();
  return apiSuccess(context, {
    name: 'LixBlogs API',
    version: '1.0.0',
    minCliVersion: '0.1.0',
    resourceOrigin: 'https://blogs.elixpo.com',
    authentication: {
      types: ['oauth2-bearer', 'personal-access-token'],
      issuer: 'https://accounts.elixpo.com',
      audience: 'blogs.elixpo.com',
      tokenSettings: 'https://blogs.elixpo.com/settings?tab=api',
    },
    capabilities: {
      secretPublishing: {
        scope: 'lixblogs:blog:write',
        semantics: 'anonymous-public',
        mutableWhile: 'draft',
      },
    },
    resources: {
      profile: '/api/v1/me',
      blogs: '/api/v1/blogs',
      blog: '/api/v1/blogs/{id}',
      publish: '/api/v1/blogs/{id}/publish',
      unpublish: '/api/v1/blogs/{id}/unpublish',
      restore: '/api/v1/blogs/{id}/restore',
      organizations: '/api/v1/orgs',
      organization: '/api/v1/orgs/{id}',
      organizationCollections: '/api/v1/orgs/{id}/collections',
      organizationMembers: '/api/v1/orgs/{id}/members',
      collections: '/api/v1/collections',
      collection: '/api/v1/collections/{id}',
      collectionEntries: '/api/v1/collections/{id}/entries',
      contests: '/api/v1/contests',
      contest: '/api/v1/contests/{id}',
      contestSubmissions: '/api/v1/contests/{id}/submissions',
      contestMembers: '/api/v1/contests/{id}/members',
      contestResults: '/api/v1/contests/{id}/results',
      collaborators: '/api/v1/blogs/{id}/collaborators',
      collaborationInvitations: '/api/v1/collaboration/invitations',
      analytics: '/api/v1/analytics',
    },
  });
}
