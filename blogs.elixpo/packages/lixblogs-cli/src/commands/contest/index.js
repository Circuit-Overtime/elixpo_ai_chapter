function requireId(id) { if (!id) throw new Error('A contest ID or slug is required.'); }

function eligibility(options, includeDefaults = false) {
  if (options['require-bio'] && options['no-require-bio']) throw new Error('Use only one of --require-bio or --no-require-bio.');
  if (options['eligible-user']?.length && options['clear-eligible-users']) throw new Error('Use either --eligible-user or --clear-eligible-users.');
  const result = {};
  if (includeDefaults || options['minimum-account-age-months'] !== undefined) {
    const months = Number(options['minimum-account-age-months'] || 0);
    if (!Number.isInteger(months) || months < 0) throw new Error('--minimum-account-age-months must be a whole number that is zero or greater.');
    result.minimumAccountAgeMonths = months;
  }
  if (includeDefaults || options['require-bio'] || options['no-require-bio']) result.requireBio = Boolean(options['require-bio']);
  if (includeDefaults || options['eligible-user'] || options['clear-eligible-users']) result.allowedUsernames = options['clear-eligible-users'] ? [] : options['eligible-user'] || [];
  return Object.keys(result).length ? result : undefined;
}

export const contestList = ({ client, options }) => client.list({ status: options.status, mine: options.mine });
export function contestGet({ client, id }) { requireId(id); return client.get(id); }
export function contestCreate({ client, options }) {
  if (!options.title || !options['starts-at'] || !options['submissions-close-at'] || !options['judging-closes-at']) throw new Error('--title, --starts-at, --submissions-close-at, and --judging-closes-at are required.');
  if (options.limit && (Number(options.limit) < 1 || Number(options.limit) > 5)) throw new Error('--limit must be between 1 and 5.');
  return client.create({
    title: options.title, slug: options.slug, description: options.description,
    problemStatement: options.problem, rules: options.rules, theme: options.theme,
    coverUrl: options.cover, templateContent: options.template,
    startsAt: options['starts-at'], submissionsCloseAt: options['submissions-close-at'],
    judgingClosesAt: options['judging-closes-at'], resultsAt: options['results-at'],
    requiredTopics: options.tag || [], tags: options['contest-tag'] || [], allowedTargets: options['allowed-target'] || ['personal'],
    perAuthorLimit: options.limit ? Number(options.limit) : 1,
    eligibility: eligibility(options, true),
  });
}
export function contestEdit({ client, id, options }) {
  requireId(id);
  if (options.limit && (Number(options.limit) < 1 || Number(options.limit) > 5)) throw new Error('--limit must be between 1 and 5.');
  return client.update(id, Object.fromEntries(Object.entries({
    title: options.title, slug: options.slug, description: options.description, problemStatement: options.problem,
    rules: options.rules, theme: options.theme, templateContent: options.template,
    coverUrl: options.cover, startsAt: options['starts-at'],
    submissionsCloseAt: options['submissions-close-at'], judgingClosesAt: options['judging-closes-at'],
    resultsAt: options['results-at'], requiredTopics: options.tag, tags: options['contest-tag'],
    allowedTargets: options['allowed-target'], perAuthorLimit: options.limit ? Number(options.limit) : undefined,
    eligibility: eligibility(options),
  }).filter(([, value]) => value !== undefined)));
}
export function contestPublish({ client, id, options }) { requireId(id); if (!options.yes) throw new Error('Publishing a contest requires --yes.'); return client.update(id, { action: 'publish' }); }
export function contestCancel({ client, id, options }) { requireId(id); if (!options.yes) throw new Error('Cancelling a contest requires --yes.'); return client.update(id, { action: 'cancel' }); }
export function contestDelete({ client, id, options }) { requireId(id); if (!options.yes) throw new Error('Deleting a draft contest requires --yes.'); return client.delete(id); }
export function contestSubmissions({ client, id, options }) { requireId(id); return client.submissions(id, { snapshot: options.snapshot }); }
export function contestSubmit({ client, id, options }) { requireId(id); if (!options.blog) throw new Error('--blog is required.'); return client.submit(id, options.blog); }
export function contestWithdraw({ client, id, options }) { requireId(id); if (!options.submission) throw new Error('--submission is required.'); if (!options.yes) throw new Error('Withdrawing requires --yes.'); return client.withdraw(id, options.submission); }
export function contestMembers({ client, id }) { requireId(id); return client.members(id); }
export function contestRole({ client, id, options }) { requireId(id); if (!options.user || !options.role) throw new Error('--user and --role are required.'); return client.assign(id, options.user, options.role); }
export function contestRemoveMember({ client, id, options }) { requireId(id); if (!options.user || !options.yes) throw new Error('--user and --yes are required.'); return client.removeMember(id, options.user); }
export function contestResults({ client, id, options }) {
  requireId(id);
  if (!options.award?.length) throw new Error('At least one --award placement:submission-id is required.');
  if (options.finalize && !options.yes) throw new Error('Finalizing results requires --yes.');
  const awards = options.award.map((value) => { const separator = value.indexOf(':'); if (separator < 1) throw new Error(`Invalid award: ${value}`); return { placement: value.slice(0, separator), submissionId: value.slice(separator + 1) }; });
  return client.results(id, awards, options.finalize);
}
