import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function readJson(relativePath) {
  const absolutePath = resolve(root, relativePath);
  try {
    return JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`);
  }
}

const [organization, taxonomy, repositories, directory, packages, research, licensing, sponsorship, contributors, history, brand, discussions] = await Promise.all([
  readJson("content/organization.json"),
  readJson("content/taxonomy.json"),
  readJson("content/repositories.json"),
  readJson("content/directory.json"),
  readJson("content/packages.json"),
  readJson("content/research.json"),
  readJson("content/licensing.json"),
  readJson("content/sponsorship.json"),
  readJson("content/contributors.json"),
  readJson("content/history.json"),
  readJson("content/brand.json"),
  readJson("content/discussions.json"),
]);

const errors = [];
const addError = (location, message) => errors.push(`${location}: ${message}`);
const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function valuesOf(items, key) {
  return new Set(items.map((item) => item[key]));
}

function validateUrl(location, value) {
  try {
    new URL(value);
  } catch {
    addError(location, `invalid URL ${JSON.stringify(value)}`);
  }
}

if (organization.schemaVersion !== taxonomy.schemaVersion || taxonomy.schemaVersion !== repositories.schemaVersion) {
  addError("schemaVersion", "organization, taxonomy, and repository versions must match");
}
if (licensing.schemaVersion !== organization.schemaVersion) {
  addError("schemaVersion", "licensing and organization versions must match");
}
if (directory.schemaVersion !== organization.schemaVersion) {
  addError("schemaVersion", "directory and organization versions must match");
}
if (packages.schemaVersion !== organization.schemaVersion) {
  addError("schemaVersion", "packages and organization versions must match");
}
if (research.schemaVersion !== organization.schemaVersion) {
  addError("schemaVersion", "research and organization versions must match");
}
if (sponsorship.schemaVersion !== organization.schemaVersion) {
  addError("schemaVersion", "sponsorship and organization versions must match");
}
for (const [name, record] of Object.entries({ contributors, history, brand, discussions })) {
  if (record.schemaVersion !== organization.schemaVersion) {
    addError("schemaVersion", `${name} and organization versions must match`);
  }
}

if (!isDate(organization.lastVerified)) addError("organization.lastVerified", "expected YYYY-MM-DD");
if (!isDate(taxonomy.lastVerified)) addError("taxonomy.lastVerified", "expected YYYY-MM-DD");
if (!isDate(repositories.snapshotDate)) addError("repositories.snapshotDate", "expected YYYY-MM-DD");
if (!isDate(directory.lastVerified)) addError("directory.lastVerified", "expected YYYY-MM-DD");
if (!isDate(packages.lastVerified)) addError("packages.lastVerified", "expected YYYY-MM-DD");
if (!isDate(research.lastVerified)) addError("research.lastVerified", "expected YYYY-MM-DD");
if (!isDate(licensing.lastVerified)) addError("licensing.lastVerified", "expected YYYY-MM-DD");
if (!isDate(sponsorship.lastVerified)) addError("sponsorship.lastVerified", "expected YYYY-MM-DD");
if (!isDate(contributors.lastVerified)) addError("contributors.lastVerified", "expected YYYY-MM-DD");
if (!isDate(history.lastVerified)) addError("history.lastVerified", "expected YYYY-MM-DD");
if (!isDate(brand.lastVerified)) addError("brand.lastVerified", "expected YYYY-MM-DD");
if (!isDate(brand.audit?.auditedAt)) addError("brand.audit.auditedAt", "expected YYYY-MM-DD");
if (!/^[0-9a-f]{40}$/.test(brand.audit?.sourceRevision ?? "")) addError("brand.audit.sourceRevision", "expected a full Git commit SHA");
if (!isDate(discussions.lastVerified)) addError("discussions.lastVerified", "expected YYYY-MM-DD");

validateUrl("discussions.sourceRepository", discussions.sourceRepository);
validateUrl("discussions.organizationUrl", discussions.organizationUrl);
validateUrl("discussions.apiUrl", discussions.apiUrl);
if (discussions.sourceRepository !== "https://github.com/elixpo/elixpo") {
  addError("discussions.sourceRepository", "must identify the repository currently backing organization Discussions");
}
if (discussions.moderation?.featuredRequiresEditorialSelection !== true) {
  addError("discussions.moderation.featuredRequiresEditorialSelection", "must remain true");
}
if (!Array.isArray(discussions.moderation?.excludedDiscussionNumbers)) {
  addError("discussions.moderation.excludedDiscussionNumbers", "must be an auditable list");
}
if (!Array.isArray(discussions.moderation?.excludedAuthors)) {
  addError("discussions.moderation.excludedAuthors", "must be an auditable list");
}

if (
  sponsorship.organizationAcceptsFunds !== false ||
  sponsorship.organizationRoutesFunds !== false ||
  sponsorship.publicSolicitationEnabled !== false
) {
  addError("sponsorship", "organization funding and solicitation must remain disabled until policy review");
}
if (sponsorship.legalRecipient !== null || sponsorship.accountingProcess !== null) {
  addError("sponsorship", "legal recipient and accounting process must remain null while not accepting funds");
}
if (sponsorship.stickers?.sponsorshipRequestAllowed !== false) {
  addError("sponsorship.stickers.sponsorshipRequestAllowed", "must remain false");
}
if (sponsorship.stickers?.eventPartnerships?.monetary !== false) {
  addError("sponsorship.stickers.eventPartnerships.monetary", "event partnerships must remain non-monetary while organization sponsorship is closed");
}

const contributorHandles = new Set();
const excludedContributorHandles = new Set([
  ...(contributors.excludedLeadHandles ?? []),
  ...(contributors.excludedAutomationHandles ?? []),
]);
if (!contributors.selectionPolicy?.basis) addError("contributors.selectionPolicy.basis", "is required");
validateUrl("contributors.selectionPolicy.sourceRepository", contributors.selectionPolicy?.sourceRepository);
const requiredFeaturedContributors = Math.ceil(
  (contributors.selectionPolicy?.eligibleContributorCount ?? 0) *
  (contributors.selectionPolicy?.minimumCoveragePercent ?? 0) / 100,
);
if (contributors.selectionPolicy?.minimumFeaturedCount !== requiredFeaturedContributors) {
  addError("contributors.selectionPolicy.minimumFeaturedCount", `expected ${requiredFeaturedContributors} from the published population and coverage floor`);
}
if ((contributors.featured ?? []).length < requiredFeaturedContributors) {
  addError("contributors.featured", `expected at least ${requiredFeaturedContributors} people to meet the published coverage floor`);
}
if (!Number.isInteger(contributors.selectionPolicy?.minimumObservedContributions) || contributors.selectionPolicy.minimumObservedContributions < 1) {
  addError("contributors.selectionPolicy.minimumObservedContributions", "expected a positive integer");
}
validateUrl("contributors.selectionPolicy.correctionUrl", contributors.selectionPolicy?.correctionUrl);
validateUrl("contributors.selectionPolicy.optOutUrl", contributors.selectionPolicy?.optOutUrl);
for (const [index, person] of (contributors.featured ?? []).entries()) {
  const location = `contributors.featured[${index}]`;
  if (!person.handle) addError(`${location}.handle`, "is required");
  if (contributorHandles.has(person.handle)) addError(`${location}.handle`, "duplicate handle");
  contributorHandles.add(person.handle);
  if (excludedContributorHandles.has(person.handle)) addError(`${location}.handle`, "lead or automation handle cannot be featured");
  if (!Number.isInteger(person.observedContributions) || person.observedContributions < 1) addError(`${location}.observedContributions`, "expected a positive integer");
  if (person.observedContributions < contributors.selectionPolicy.minimumObservedContributions) {
    addError(`${location}.observedContributions`, "is below the published selection threshold");
  }
  if (!["public-evidence-only", "consented"].includes(person.profileSource)) {
    addError(`${location}.profileSource`, "expected public-evidence-only or consented");
  }
  validateUrl(`${location}.github`, person.github);
  if (person.portfolio !== null) validateUrl(`${location}.portfolio`, person.portfolio);
  for (const [evidenceIndex, url] of (person.evidence ?? []).entries()) validateUrl(`${location}.evidence[${evidenceIndex}]`, url);
}

for (const [index, milestone] of (history.entries ?? []).entries()) {
  const location = `history.entries[${index}]`;
  if (!milestone.period || !milestone.title || !milestone.description) addError(location, "period, title, and description are required");
  if (!Array.isArray(milestone.evidence) || milestone.evidence.length === 0) addError(`${location}.evidence`, "at least one evidence URL is required");
  for (const [evidenceIndex, url] of (milestone.evidence ?? []).entries()) validateUrl(`${location}.evidence[${evidenceIndex}]`, url);
}

validateUrl("brand.canonicalHome", brand.canonicalHome);
validateUrl("brand.sourceRepository", brand.sourceRepository);
if (!["proposed", "approved", "retired"].includes(brand.visualDirection?.approvalStatus)) {
  addError("brand.visualDirection.approvalStatus", "expected proposed, approved, or retired");
}
if (brand.visualDirection?.approvalStatus !== "approved" && brand.migrationStatus === "complete") {
  addError("brand.migrationStatus", "cannot be complete before the visual direction is approved");
}
const paletteNames = new Set();
const paletteHexValues = new Set();
for (const [index, color] of (brand.visualDirection?.palette ?? []).entries()) {
  const location = `brand.visualDirection.palette[${index}]`;
  if (!color.name) addError(`${location}.name`, "is required");
  if (!/^#[0-9a-f]{6}$/i.test(color.hex ?? "")) addError(`${location}.hex`, "expected a six-digit hex color");
  if (paletteNames.has(color.name)) addError(`${location}.name`, "duplicate color name");
  if (paletteHexValues.has(color.hex?.toLowerCase())) addError(`${location}.hex`, "duplicate color value");
  paletteNames.add(color.name);
  paletteHexValues.add(color.hex?.toLowerCase());
}
for (const [index, group] of (brand.assetGroups ?? []).entries()) {
  const location = `brand.assetGroups[${index}]`;
  if (!group.name) addError(`${location}.name`, "is required");
  if (!group.path?.startsWith("/")) addError(`${location}.path`, "must be a root-relative public asset path");
  if (!["staged", "canonical", "retired"].includes(group.status)) addError(`${location}.status`, "unknown value");
}
if ((brand.audit?.exactMasterDuplicates ?? 0) > (brand.audit?.portalBrandFiles ?? 0)) {
  addError("brand.audit.exactMasterDuplicates", "cannot exceed the portal brand file count");
}
if (!(brand.audit?.excludedFromPublicMigration ?? []).some((item) => item.includes(".env"))) {
  addError("brand.audit.excludedFromPublicMigration", "must explicitly exclude environment files");
}

const licensingClasses = new Set();
for (const [index, policy] of licensing.defaultsForNewWork.entries()) {
  const location = `licensing.defaultsForNewWork[${index}]`;
  if (licensingClasses.has(policy.artifactClass)) addError(`${location}.artifactClass`, "duplicate artifact class");
  licensingClasses.add(policy.artifactClass);
  if (!policy.selectionRule) addError(`${location}.selectionRule`, "is required");
}

for (const requiredClass of [
  "source-code",
  "papers-and-documentation",
  "hardware-source",
  "datasets",
  "models-and-weights",
  "brand-assets-and-stickers",
]) {
  if (!licensingClasses.has(requiredClass)) addError("licensing.defaultsForNewWork", `missing ${requiredClass}`);
}

if (licensing.trademarks?.separateFromCopyright !== true) {
  addError("licensing.trademarks.separateFromCopyright", "must remain true");
}

for (const [name, endpoint] of Object.entries(organization.urls ?? {})) {
  validateUrl(`organization.urls.${name}.url`, endpoint.url);
  if (!["active", "planned", "retired"].includes(endpoint.status)) {
    addError(`organization.urls.${name}.status`, "expected active, planned, or retired");
  }
}

const publicFamilies = valuesOf(taxonomy.publicFamilies, "id");
const dispositions = new Set(taxonomy.repositoryDispositions);
const relationships = new Set(taxonomy.relationships);
const lifecycles = new Set(taxonomy.lifecycles);
const custodyValues = new Set(taxonomy.custody);
const verificationStates = new Set(taxonomy.verificationStates);
const names = new Set();
const repositoryUrls = new Set();

for (const [index, entry] of repositories.entries.entries()) {
  const location = `repositories.entries[${index}](${entry.name ?? "unnamed"})`;
  if (!entry.name || typeof entry.name !== "string") addError(`${location}.name`, "is required");
  if (names.has(entry.name)) addError(`${location}.name`, "duplicate repository name");
  names.add(entry.name);

  if (!dispositions.has(entry.disposition)) addError(`${location}.disposition`, "unknown value");
  if (!relationships.has(entry.relationship)) addError(`${location}.relationship`, "unknown value");
  if (entry.lifecycle !== null && !lifecycles.has(entry.lifecycle)) addError(`${location}.lifecycle`, "unknown value");
  if (entry.custody !== null && !custodyValues.has(entry.custody)) addError(`${location}.custody`, "unknown value");
  if (!verificationStates.has(entry.verificationState)) addError(`${location}.verificationState`, "unknown value");
  if (!isDate(entry.statusVerifiedAt)) addError(`${location}.statusVerifiedAt`, "expected YYYY-MM-DD");
  if (!entry.statusOwner) addError(`${location}.statusOwner`, "is required");

  if (entry.disposition === "public-entry" && !publicFamilies.has(entry.publicClass)) {
    addError(`${location}.publicClass`, "public entries require a known public family");
  }
  if (entry.disposition !== "public-entry" && entry.publicClass !== null) {
    addError(`${location}.publicClass`, "non-public entries must use null");
  }

  if (entry.repositoryUrl !== null) {
    validateUrl(`${location}.repositoryUrl`, entry.repositoryUrl);
    if (repositoryUrls.has(entry.repositoryUrl)) addError(`${location}.repositoryUrl`, "duplicate URL");
    repositoryUrls.add(entry.repositoryUrl);
  }

  if (entry.verificationState === "needs-decision") {
    if (!Array.isArray(entry.pendingDecisions) || entry.pendingDecisions.length === 0) {
      addError(`${location}.pendingDecisions`, "needs-decision records must list blockers");
    }
  } else if (entry.lifecycle === null || entry.custody === null) {
    addError(location, "records missing lifecycle or custody must use needs-decision");
  }

  if (entry.deletedAt) {
    if (!isDate(entry.deletedAt)) addError(`${location}.deletedAt`, "expected YYYY-MM-DD");
    if (entry.repositoryUrl !== null) addError(`${location}.repositoryUrl`, "deleted records must use null");
    if (!entry.finalCommit) addError(`${location}.finalCommit`, "deleted records require a final commit");
  }
}

for (const entry of repositories.entries) {
  if (entry.canonicalRepository && !names.has(entry.canonicalRepository)) {
    addError(`repositories.${entry.name}.canonicalRepository`, "target does not exist");
  }
}

const publicRepositoryNames = new Set(
  repositories.entries
    .filter((entry) => entry.disposition === "public-entry")
    .map((entry) => entry.name),
);
const directorySlugs = new Set();

for (const [repositoryName, detail] of Object.entries(directory.entries ?? {})) {
  const location = `directory.entries.${repositoryName}`;
  if (!publicRepositoryNames.has(repositoryName)) {
    addError(location, "does not map to a public-entry repository");
  }
  if (!detail.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(detail.slug)) {
    addError(`${location}.slug`, "expected a lowercase URL-safe slug");
  } else if (directorySlugs.has(detail.slug)) {
    addError(`${location}.slug`, "duplicate public slug");
  }
  directorySlugs.add(detail.slug);
  for (const field of ["name", "summary", "description"]) {
    if (typeof detail[field] !== "string" || detail[field].trim().length === 0) {
      addError(`${location}.${field}`, "is required");
    }
  }
  if (!Array.isArray(detail.focus) || detail.focus.length === 0) {
    addError(`${location}.focus`, "at least one focus area is required");
  }
  if (detail.website) validateUrl(`${location}.website`, detail.website);
  if (detail.icon && !detail.icon.startsWith("/")) {
    addError(`${location}.icon`, "must be a root-relative public asset path");
  }
  for (const [evidenceIndex, evidence] of (detail.evidence ?? []).entries()) {
    const evidenceLocation = `${location}.evidence[${evidenceIndex}]`;
    if (!evidence.label) addError(`${evidenceLocation}.label`, "is required");
    validateUrl(`${evidenceLocation}.url`, evidence.url);
  }
}

for (const repositoryName of publicRepositoryNames) {
  if (!directory.entries?.[repositoryName]) {
    addError(`directory.entries.${repositoryName}`, "missing editorial record for public repository");
  }
}

for (const key of ["website", "repository", "aptDocumentation"]) {
  validateUrl(`packages.distribution.${key}`, packages.distribution?.[key]);
}
const linuxPackageNames = new Set();
const packageSlugs = new Set();
const directoryRecordsBySlug = new Map(
  repositories.entries
    .filter((entry) => entry.disposition === "public-entry")
    .map((entry) => {
      const detail = directory.entries?.[entry.name];
      return [detail?.slug, { family: entry.publicClass, name: entry.name }];
    })
    .filter(([slug]) => Boolean(slug)),
);

function validateRelatedRecord(location, related) {
  const target = directoryRecordsBySlug.get(related?.slug);
  if (!target) addError(location, "must reference a public directory slug");
  else if (target.family !== related?.family) addError(`${location}.family`, `expected ${target.family} for ${target.name}`);
}

for (const [index, item] of (packages.linuxApplications ?? []).entries()) {
  const location = `packages.linuxApplications[${index}]`;
  if (packageSlugs.has(item.slug)) addError(`${location}.slug`, "duplicate slug");
  if (linuxPackageNames.has(item.packageName)) addError(`${location}.packageName`, "duplicate package name");
  packageSlugs.add(item.slug);
  linuxPackageNames.add(item.packageName);
  if (!item.version) addError(`${location}.version`, "is required");
  if (!["maintained", "deprecated", "unsupported", "archived"].includes(item.status)) addError(`${location}.status`, "unknown value");
  for (const key of ["page", "source", "releases"]) validateUrl(`${location}.${key}`, item[key]);
  if (item.icon?.startsWith("http")) validateUrl(`${location}.icon`, item.icon);
  else if (!item.icon?.startsWith("/")) addError(`${location}.icon`, "expected a URL or root-relative asset path");
  validateRelatedRecord(`${location}.related`, item.related);
  for (const [imageIndex, image] of (item.images ?? []).entries()) {
    validateUrl(`${location}.images[${imageIndex}].src`, image.src);
    if (!image.alt) addError(`${location}.images[${imageIndex}].alt`, "is required");
  }
}
const npmPackageNames = new Set();
for (const [index, item] of (packages.npmPackages ?? []).entries()) {
  const location = `packages.npmPackages[${index}]`;
  if (!item.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) addError(`${location}.slug`, "expected a lowercase URL-safe slug");
  else if (packageSlugs.has(item.slug)) addError(`${location}.slug`, "duplicate package slug");
  packageSlugs.add(item.slug);
  if (!item.name?.startsWith("@elixpo/")) addError(`${location}.name`, "must use the @elixpo scope");
  if (npmPackageNames.has(item.name)) addError(`${location}.name`, "duplicate package name");
  npmPackageNames.add(item.name);
  if (!item.version) addError(`${location}.version`, "is required");
  if (!["maintained", "deprecated", "unsupported", "archived"].includes(item.status)) addError(`${location}.status`, "unknown value");
  validateUrl(`${location}.href`, item.href);
  validateUrl(`${location}.source`, item.source);
  validateRelatedRecord(`${location}.related`, item.related);
}
if (npmPackageNames.has("@elixpo/claudeops")) {
  addError("packages.npmPackages", "ClaudeOps is not maintained and must not appear in the maintained package catalog");
}

const researchRepositoryNames = new Set(
  repositories.entries.filter((entry) => entry.disposition === "public-entry" && entry.publicClass === "research").map((entry) => entry.name),
);
const researchSlugs = new Set();
for (const [repositoryName, record] of Object.entries(research.entries ?? {})) {
  const location = `research.entries.${repositoryName}`;
  if (!researchRepositoryNames.has(repositoryName)) addError(location, "does not map to a research repository");
  if (researchSlugs.has(record.slug)) addError(`${location}.slug`, "duplicate research slug");
  researchSlugs.add(record.slug);
  if (directory.entries?.[repositoryName]?.slug !== record.slug) addError(`${location}.slug`, "must match the public directory slug");
  if (!record.title || !record.abstract) addError(location, "title and abstract are required");
  if (!["proposal", "active-experiment", "technical-report", "preprint", "released", "reproduced", "archived"].includes(record.researchStatus)) addError(`${location}.researchStatus`, "unknown value");
  if (!["not-reviewed", "editorially-reviewed", "not-peer-reviewed", "peer-reviewed"].includes(record.reviewStatus)) addError(`${location}.reviewStatus`, "unknown value");
  validateUrl(`${location}.codeUrl`, record.codeUrl);
  if (record.paperUrl) validateUrl(`${location}.paperUrl`, record.paperUrl);
  if (record.releasedAt && !isDate(record.releasedAt)) addError(`${location}.releasedAt`, "expected YYYY-MM-DD");
  if (record.paperUrl && (!record.authors?.length || !record.releasedAt)) addError(location, "paper records require at least one author and a publication date for Scholar metadata");
  for (const [artifactIndex, artifact] of (record.artifacts ?? []).entries()) validateUrl(`${location}.artifacts[${artifactIndex}].url`, artifact.url);
  for (const [demoIndex, demo] of (record.liveDemos ?? []).entries()) validateUrl(`${location}.liveDemos[${demoIndex}].url`, demo.url);
  for (const [licenseIndex, license] of (record.licenses ?? []).entries()) validateUrl(`${location}.licenses[${licenseIndex}].url`, license.url);
  if (record.citation?.cffUrl) validateUrl(`${location}.citation.cffUrl`, record.citation.cffUrl);
}
for (const repositoryName of researchRepositoryNames) {
  if (!research.entries?.[repositoryName]) addError(`research.entries.${repositoryName}`, "missing research record");
}

if (errors.length > 0) {
  console.error(`Registry validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const counts = repositories.entries.reduce((result, entry) => {
    result[entry.verificationState] = (result[entry.verificationState] ?? 0) + 1;
    return result;
  }, {});
  console.log(`Registry valid: ${repositories.entries.length} repository records.`);
  console.log(`Public directory complete: ${Object.keys(directory.entries).length} editorial records.`);
  console.log(`Package registry valid: ${packages.linuxApplications.length} Linux applications and ${packages.npmPackages.length} npm packages.`);
  console.log(`Research registry complete: ${Object.keys(research.entries).length} records.`);
  console.log(`Verification states: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}.`);
}
