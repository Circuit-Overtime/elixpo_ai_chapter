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

const [organization, taxonomy, repositories, licensing, sponsorship, contributors, history, brand] = await Promise.all([
  readJson("content/organization.json"),
  readJson("content/taxonomy.json"),
  readJson("content/repositories.json"),
  readJson("content/licensing.json"),
  readJson("content/sponsorship.json"),
  readJson("content/contributors.json"),
  readJson("content/history.json"),
  readJson("content/brand.json"),
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
if (sponsorship.schemaVersion !== organization.schemaVersion) {
  addError("schemaVersion", "sponsorship and organization versions must match");
}
for (const [name, record] of Object.entries({ contributors, history, brand })) {
  if (record.schemaVersion !== organization.schemaVersion) {
    addError("schemaVersion", `${name} and organization versions must match`);
  }
}

if (!isDate(organization.lastVerified)) addError("organization.lastVerified", "expected YYYY-MM-DD");
if (!isDate(taxonomy.lastVerified)) addError("taxonomy.lastVerified", "expected YYYY-MM-DD");
if (!isDate(repositories.snapshotDate)) addError("repositories.snapshotDate", "expected YYYY-MM-DD");
if (!isDate(licensing.lastVerified)) addError("licensing.lastVerified", "expected YYYY-MM-DD");
if (!isDate(sponsorship.lastVerified)) addError("sponsorship.lastVerified", "expected YYYY-MM-DD");
if (!isDate(contributors.lastVerified)) addError("contributors.lastVerified", "expected YYYY-MM-DD");
if (!isDate(history.lastVerified)) addError("history.lastVerified", "expected YYYY-MM-DD");
if (!isDate(brand.lastVerified)) addError("brand.lastVerified", "expected YYYY-MM-DD");

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
for (const [index, person] of (contributors.featured ?? []).entries()) {
  const location = `contributors.featured[${index}]`;
  if (!person.handle) addError(`${location}.handle`, "is required");
  if (contributorHandles.has(person.handle)) addError(`${location}.handle`, "duplicate handle");
  contributorHandles.add(person.handle);
  if (excludedContributorHandles.has(person.handle)) addError(`${location}.handle`, "lead or automation handle cannot be featured");
  if (!Number.isInteger(person.observedContributions) || person.observedContributions < 1) addError(`${location}.observedContributions`, "expected a positive integer");
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
  console.log(`Verification states: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}.`);
}
