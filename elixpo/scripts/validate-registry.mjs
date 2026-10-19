import { access, readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = process.cwd();

async function readJson(relativePath) {
  const absolutePath = resolve(root, relativePath);
  try {
    return JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`${relativePath}: ${error.message}`);
  }
}

const [organization, taxonomy, repositories, directory, packages, research, licensing, repositoryLicenses, sponsorship, contributors, people, history, brand, discussions, recognition, brandProvenance] = await Promise.all([
  readJson("content/organization.json"),
  readJson("content/taxonomy.json"),
  readJson("content/repositories.json"),
  readJson("content/directory.json"),
  readJson("content/packages.json"),
  readJson("content/research.json"),
  readJson("content/licensing.json"),
  readJson("content/repository-licenses.json"),
  readJson("content/sponsorship.json"),
  readJson("content/contributors.json"),
  readJson("content/people.json"),
  readJson("content/history.json"),
  readJson("content/brand.json"),
  readJson("content/discussions.json"),
  readJson("content/recognition.json"),
  readJson("brand/provenance.json"),
]);

const errors = [];
const addError = (location, message) => errors.push(`${location}: ${message}`);
const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const verificationMaxAgeDays = 183;
const millisecondsPerDay = 86_400_000;

const declaredSchemaRecords = [
  ["content/organization.json", organization],
  ["content/taxonomy.json", taxonomy],
  ["content/repositories.json", repositories],
  ["content/directory.json", directory],
  ["content/packages.json", packages],
  ["content/research.json", research],
  ["content/licensing.json", licensing],
  ["content/repository-licenses.json", repositoryLicenses],
  ["content/sponsorship.json", sponsorship],
  ["content/contributors.json", contributors],
  ["content/people.json", people],
  ["content/history.json", history],
  ["content/brand.json", brand],
  ["content/discussions.json", discussions],
  ["content/recognition.json", recognition],
  ["brand/provenance.json", brandProvenance],
];
const declaredSchemaPaths = new Set(declaredSchemaRecords.map(([recordPath]) => recordPath));
for (const entry of await readdir(resolve(root, "content"), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".json")) {
    const recordPath = `content/${entry.name}`;
    if (!declaredSchemaPaths.has(recordPath)) addError(recordPath, "canonical JSON record is not included in schema validation");
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
let schemaValidatedRecords = 0;

for (const [recordPath, record] of declaredSchemaRecords) {
  if (typeof record.$schema !== "string" || record.$schema.length === 0) {
    addError(`${recordPath}.$schema`, "must declare its canonical JSON Schema");
    continue;
  }

  const absoluteSchemaPath = resolve(dirname(resolve(root, recordPath)), record.$schema);
  const schemaPath = relative(root, absoluteSchemaPath);
  if (schemaPath.startsWith("..") || schemaPath.startsWith("/")) {
    addError(`${recordPath}.$schema`, "must resolve inside this repository");
    continue;
  }
  try {
    const schema = await readJson(schemaPath);
    const validate = ajv.compile(schema);
    if (!validate(record)) {
      for (const issue of validate.errors ?? []) {
        const instancePath = issue.instancePath || "/";
        addError(`${recordPath}${instancePath}`, `${issue.message ?? "failed schema validation"} (${issue.keyword})`);
      }
      continue;
    }
    schemaValidatedRecords += 1;
  } catch (error) {
    addError(`${recordPath}.$schema`, `could not compile ${schemaPath}: ${error.message}`);
  }
}

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

function validateFreshness(location, value) {
  if (!isDate(value)) return;
  const verifiedAt = Date.parse(`${value}T23:59:59.999Z`);
  const ageDays = (Date.now() - verifiedAt) / millisecondsPerDay;
  if (ageDays < -1) addError(location, "verification date cannot be in the future");
  else if (ageDays > verificationMaxAgeDays) addError(location, `verification is stale by policy (maximum ${verificationMaxAgeDays} days)`);
}

async function validatePublicAsset(location, publicPath) {
  if (typeof publicPath !== "string" || !publicPath.startsWith("/")) return;
  const publicRoot = resolve(root, "public");
  const assetPath = resolve(publicRoot, publicPath.slice(1));
  if (relative(publicRoot, assetPath).startsWith("..")) {
    addError(location, "public asset path escapes the public directory");
    return;
  }
  try {
    await access(assetPath);
  } catch {
    addError(location, `public asset does not exist at ${publicPath}`);
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
for (const [name, record] of Object.entries({ contributors, people, history, brand, discussions, recognition })) {
  if (record.schemaVersion !== organization.schemaVersion) {
    addError("schemaVersion", `${name} and organization versions must match`);
  }
}

if (!isDate(organization.lastVerified)) addError("organization.lastVerified", "expected YYYY-MM-DD");
if (!isDate(taxonomy.lastVerified)) addError("taxonomy.lastVerified", "expected YYYY-MM-DD");
if (!isDate(repositories.snapshotDate)) addError("repositories.snapshotDate", "expected YYYY-MM-DD");
if (!isDate(repositories.verificationMethodology?.repositoryStandardAssessment?.assessedAt)) addError("repositories.verificationMethodology.repositoryStandardAssessment.assessedAt", "expected YYYY-MM-DD");
if (!isDate(directory.lastVerified)) addError("directory.lastVerified", "expected YYYY-MM-DD");
if (!isDate(packages.lastVerified)) addError("packages.lastVerified", "expected YYYY-MM-DD");
if (!isDate(research.lastVerified)) addError("research.lastVerified", "expected YYYY-MM-DD");
if (!isDate(licensing.lastVerified)) addError("licensing.lastVerified", "expected YYYY-MM-DD");
if (!isDate(sponsorship.lastVerified)) addError("sponsorship.lastVerified", "expected YYYY-MM-DD");
if (!isDate(contributors.lastVerified)) addError("contributors.lastVerified", "expected YYYY-MM-DD");
if (!isDate(people.lastVerified)) addError("people.lastVerified", "expected YYYY-MM-DD");
if (!isDate(history.lastVerified)) addError("history.lastVerified", "expected YYYY-MM-DD");
if (!isDate(brand.lastVerified)) addError("brand.lastVerified", "expected YYYY-MM-DD");
if (!isDate(brand.audit?.auditedAt)) addError("brand.audit.auditedAt", "expected YYYY-MM-DD");
if (!/^[0-9a-f]{40}$/.test(brand.audit?.sourceRevision ?? "")) addError("brand.audit.sourceRevision", "expected a full Git commit SHA");
if (!isDate(brandProvenance.verifiedAt)) addError("brandProvenance.verifiedAt", "expected YYYY-MM-DD");
if (brandProvenance.sourceRevision !== brand.audit?.sourceRevision) addError("brandProvenance.sourceRevision", "must match the audited brand source revision");
if (brandProvenance.sourceRepository !== brand.sourceRepository) addError("brandProvenance.sourceRepository", "must match the canonical brand source repository");
const provenanceGroupIds = new Set();
let provenanceFileCount = 0;
for (const [index, group] of (brandProvenance.groups ?? []).entries()) {
  const location = `brandProvenance.groups[${index}]`;
  if (provenanceGroupIds.has(group.id)) addError(`${location}.id`, "duplicate group identifier");
  provenanceGroupIds.add(group.id);
  if (group.files?.length !== group.fileCount) addError(`${location}.fileCount`, "must equal the number of listed files");
  if (!/^[0-9a-f]{64}$/.test(group.treeSha256 ?? "")) addError(`${location}.treeSha256`, "expected a SHA-256 digest");
  provenanceFileCount += group.fileCount ?? 0;
}
if (provenanceFileCount !== brand.audit?.exactMasterDuplicates) addError("brandProvenance.groups", "verified group file count must match exactMasterDuplicates");
if (!isDate(discussions.lastVerified)) addError("discussions.lastVerified", "expected YYYY-MM-DD");
if (!isDate(recognition.lastVerified)) addError("recognition.lastVerified", "expected YYYY-MM-DD");

for (const [location, value] of [
  ["organization.lastVerified", organization.lastVerified],
  ["taxonomy.lastVerified", taxonomy.lastVerified],
  ["repositories.snapshotDate", repositories.snapshotDate],
  ["directory.lastVerified", directory.lastVerified],
  ["packages.lastVerified", packages.lastVerified],
  ["research.lastVerified", research.lastVerified],
  ["licensing.lastVerified", licensing.lastVerified],
  ["repositoryLicenses.lastVerified", repositoryLicenses.lastVerified],
  ["sponsorship.lastVerified", sponsorship.lastVerified],
  ["contributors.lastVerified", contributors.lastVerified],
  ["people.lastVerified", people.lastVerified],
  ["history.lastVerified", history.lastVerified],
  ["brand.lastVerified", brand.lastVerified],
  ["brand.audit.auditedAt", brand.audit?.auditedAt],
  ["brandProvenance.verifiedAt", brandProvenance.verifiedAt],
  ["discussions.lastVerified", discussions.lastVerified],
  ["recognition.lastVerified", recognition.lastVerified],
]) validateFreshness(location, value);

validateUrl("discussions.sourceRepository", discussions.sourceRepository);
validateUrl("discussions.organizationUrl", discussions.organizationUrl);
validateUrl("discussions.apiUrl", discussions.apiUrl);
if (discussions.sourceRepository !== "https://github.com/elixpo/elixpo") {
  addError("discussions.sourceRepository", "must identify the repository currently backing organization Discussions");
}
for (const category of ["Announcements", "Show and tell", "Q&A"]) {
  if (!discussions.eligibleCategories.includes(category)) {
    addError("discussions.eligibleCategories", `must preserve the established ${category} category`);
  }
}
if (discussions.responsePolicy?.commitment !== "best-effort-public-review") {
  addError("discussions.responsePolicy.commitment", "must not imply a guaranteed support SLA");
}
if (!Number.isInteger(discussions.responsePolicy?.unansweredReviewDays)) {
  addError("discussions.responsePolicy.unansweredReviewDays", "must define the review window");
}
validateUrl("discussions.responsePolicy.escalationUrl", discussions.responsePolicy?.escalationUrl);
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
if (sponsorship.stickers?.sponsorshipRequestAllowed !== true) {
  addError("sponsorship.stickers.sponsorshipRequestAllowed", "must remain true for the documented event-partnership request path");
}
if (sponsorship.stickers?.eventPartnerships?.monetary !== false) {
  addError("sponsorship.stickers.eventPartnerships.monetary", "event partnerships must remain non-monetary while organization sponsorship is closed");
}
if (brand.stickerAccess?.publicAccess !== "watermarked-preview-only") {
  addError("brand.stickerAccess.publicAccess", "must keep public sticker files limited to watermarked previews");
}
if (brand.stickerAccess?.printReadyAccess !== "approved-partnership-request") {
  addError("brand.stickerAccess.printReadyAccess", "must route print-ready sticker access through an approved partnership request");
}
validateUrl("brand.stickerAccess.requestUrl", brand.stickerAccess?.requestUrl);
if (brand.stickerAccess?.requestUrl !== "https://elixpo.com/partnerships") {
  addError("brand.stickerAccess.requestUrl", "must use the canonical partnership request route");
}

const contributorHandles = new Set();
const contributorRecordIds = new Set();
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
  if (!/^ECR-[0-9]{4}-[0-9]{3}$/.test(person.recordId ?? "")) addError(`${location}.recordId`, "expected ECR-YYYY-NNN");
  if (contributorRecordIds.has(person.recordId)) addError(`${location}.recordId`, "duplicate stable record ID");
  contributorRecordIds.add(person.recordId);
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
  if (!Array.isArray(person.workRecords) || person.workRecords.length === 0) {
    addError(`${location}.workRecords`, "requires at least one structured public outcome");
  }
  for (const [recordIndex, record] of (person.workRecords ?? []).entries()) {
    const recordLocation = `${location}.workRecords[${recordIndex}]`;
    if (!record.label || !record.role || !record.dateRange || !record.outcome) {
      addError(recordLocation, "label, role, dateRange, and outcome are required");
    }
    for (const projectId of (record.projectIds ?? [])) {
      if (!Object.hasOwn(directory.entries ?? {}, projectId)) {
        addError(`${recordLocation}.projectIds`, `unknown canonical project ${projectId}`);
      }
    }
    if (!Array.isArray(record.demonstratedSkills) || record.demonstratedSkills.length === 0) {
      addError(`${recordLocation}.demonstratedSkills`, "requires at least one evidence-supported skill");
    }
    for (const evidenceIndex of (record.evidenceIndexes ?? [])) {
      if (!Number.isInteger(evidenceIndex) || evidenceIndex < 0 || evidenceIndex >= (person.evidence?.length ?? 0)) {
        addError(`${recordLocation}.evidenceIndexes`, `invalid evidence index ${evidenceIndex}`);
      }
    }
    const attribution = record.reviewAttribution;
    if (!attribution || !["named-reviewer", "repository-review-record", "not-publicly-attributed"].includes(attribution.status)) {
      addError(`${recordLocation}.reviewAttribution.status`, "unknown review-attribution state");
    }
    if (attribution?.status === "named-reviewer" && !attribution.reviewer) {
      addError(`${recordLocation}.reviewAttribution.reviewer`, "named-reviewer records require a reviewer");
    }
  }
}
if (contributors.recordPolicy?.recordType !== "public-evidence-record") {
  addError("contributors.recordPolicy.recordType", "must distinguish the record from a certification or employment credential");
}
for (const field of ["verificationRule", "correctionRule", "fraudRule", "withdrawalRule"]) {
  if (typeof contributors.recordPolicy?.[field] !== "string" || contributors.recordPolicy[field].trim().length < 60) {
    addError(`contributors.recordPolicy.${field}`, "requires a substantive public rule");
  }
}

validateUrl("people.correctionUrl", people.correctionUrl);
validateUrl("people.majorContributors.url", people.majorContributors?.url);
if (people.majorContributors?.source !== "contributors.json") addError("people.majorContributors.source", "must reference contributors.json");
for (const roleCategory of ["currentTeam", "projectMaintainers", "researchContributors", "majorContributors", "alumni", "advisors"]) {
  if (typeof people.roleDefinitions?.[roleCategory] !== "string" || people.roleDefinitions[roleCategory].trim().length < 20) {
    addError(`people.roleDefinitions.${roleCategory}`, "requires a plain-language definition");
  }
}
const peopleHandles = new Set();
for (const category of ["currentTeam", "projectMaintainers", "researchContributors", "alumni", "advisors"]) {
  if (!Array.isArray(people[category])) {
    addError(`people.${category}`, "must be an array");
    continue;
  }
  for (const [index, person] of people[category].entries()) {
    const location = `people.${category}[${index}]`;
    if (!person.handle || !person.name || !person.role || !person.summary) addError(location, "handle, name, role, and summary are required");
    const scopedHandle = `${category}:${person.handle.toLowerCase()}`;
    if (peopleHandles.has(scopedHandle)) addError(`${location}.handle`, "duplicate handle within role category");
    peopleHandles.add(scopedHandle);
    validateUrl(`${location}.github`, person.github);
    if (person.portfolio !== null) validateUrl(`${location}.portfolio`, person.portfolio);
    if (!["public-evidence-only", "consented"].includes(person.profileSource)) addError(`${location}.profileSource`, "unknown value");
    if (!["current", "ended"].includes(person.rolePeriod?.status)) addError(`${location}.rolePeriod.status`, "unknown value");
    if (!["verified-day", "verified-month", "verified-year", "not-publicly-established"].includes(person.rolePeriod?.precision)) addError(`${location}.rolePeriod.precision`, "unknown value");
    if (person.rolePeriod?.start !== null && !isDate(person.rolePeriod?.start)) addError(`${location}.rolePeriod.start`, "expected YYYY-MM-DD or null");
    if (person.rolePeriod?.end !== null && !isDate(person.rolePeriod?.end)) addError(`${location}.rolePeriod.end`, "expected YYYY-MM-DD or null");
    if (person.rolePeriod?.status === "current" && person.rolePeriod?.end !== null) addError(`${location}.rolePeriod.end`, "current roles cannot have an end date");
    if (person.rolePeriod?.status === "ended" && person.rolePeriod?.end === null) addError(`${location}.rolePeriod.end`, "ended roles require an end date");
    if (!Array.isArray(person.evidence) || person.evidence.length === 0) addError(`${location}.evidence`, "at least one public record is required");
    for (const [evidenceIndex, url] of (person.evidence ?? []).entries()) validateUrl(`${location}.evidence[${evidenceIndex}]`, url);
  }
}

for (const [index, milestone] of (history.entries ?? []).entries()) {
  const location = `history.entries[${index}]`;
  if (!milestone.period || !milestone.title || !milestone.description) addError(location, "period, title, and description are required");
  if (!["verified-day", "verified-month", "verified-year", "verified-range", "approximate"].includes(milestone.datePrecision)) addError(`${location}.datePrecision`, "unknown date precision");
  if (!Array.isArray(milestone.evidence) || milestone.evidence.length === 0) addError(`${location}.evidence`, "at least one evidence URL is required");
  for (const [evidenceIndex, evidence] of (milestone.evidence ?? []).entries()) {
    if (!evidence.label) addError(`${location}.evidence[${evidenceIndex}].label`, "is required");
    validateUrl(`${location}.evidence[${evidenceIndex}].url`, evidence.url);
  }
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

const standardAssessment = repositories.verificationMethodology?.repositoryStandardAssessment;
const standardBuckets = [
  ...(standardAssessment?.conformantRepositories ?? []),
  ...(standardAssessment?.conformantWithExceptions ?? []),
  ...(standardAssessment?.deferredAgentRepositories ?? []),
  ...(standardAssessment?.outOfScopeRepositories ?? []),
  ...(standardAssessment?.centrallyRecordedArchives ?? []),
];
const standardBucketSet = new Set(standardBuckets);
if (standardBucketSet.size !== standardBuckets.length) {
  addError("repositories.verificationMethodology.repositoryStandardAssessment", "a repository may appear in only one assessment bucket");
}

for (const [index, entry] of repositories.entries.entries()) {
  const location = `repositories.entries[${index}](${entry.name ?? "unnamed"})`;
  if (!standardBucketSet.has(entry.name)) addError(`${location}.repositoryStandard`, "repository is missing from the Standard 1.0 assessment");
  if (!entry.name || typeof entry.name !== "string") addError(`${location}.name`, "is required");
  if (names.has(entry.name)) addError(`${location}.name`, "duplicate repository name");
  names.add(entry.name);

  if (!dispositions.has(entry.disposition)) addError(`${location}.disposition`, "unknown value");
  if (!relationships.has(entry.relationship)) addError(`${location}.relationship`, "unknown value");
  if (entry.lifecycle !== null && !lifecycles.has(entry.lifecycle)) addError(`${location}.lifecycle`, "unknown value");
  if (entry.custody !== null && !custodyValues.has(entry.custody)) addError(`${location}.custody`, "unknown value");
  if (!verificationStates.has(entry.verificationState)) addError(`${location}.verificationState`, "unknown value");
  if (!isDate(entry.statusVerifiedAt)) addError(`${location}.statusVerifiedAt`, "expected YYYY-MM-DD");
  validateFreshness(`${location}.statusVerifiedAt`, entry.statusVerifiedAt);
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
const licensedRepositoryNames = new Set(Object.keys(repositoryLicenses.entries ?? {}));
for (const repositoryName of publicRepositoryNames) {
  if (!licensedRepositoryNames.has(repositoryName)) {
    addError(`repositoryLicenses.entries.${repositoryName}`, "every public repository requires current license evidence");
  }
}
for (const [repositoryName, evidence] of Object.entries(repositoryLicenses.entries ?? {})) {
  const location = `repositoryLicenses.entries.${repositoryName}`;
  if (!publicRepositoryNames.has(repositoryName)) addError(location, "does not map to a public-entry repository");
  if (!isDate(evidence.verifiedAt)) addError(`${location}.verifiedAt`, "expected YYYY-MM-DD");
  validateFreshness(`${location}.verifiedAt`, evidence.verifiedAt);
  if (evidence.evidenceUrl) validateUrl(`${location}.evidenceUrl`, evidence.evidenceUrl);
  if (evidence.classification === "missing" && (evidence.spdxId !== null || evidence.evidenceUrl !== null)) {
    addError(location, "missing licenses must not imply an SPDX identifier or evidence file");
  }
  if (["spdx-recognized", "external-spdx"].includes(evidence.classification) && !evidence.spdxId) {
    addError(`${location}.spdxId`, "recognized license evidence requires an SPDX identifier");
  }
  if (evidence.classification === "custom-mixed" && evidence.spdxId !== null) {
    addError(`${location}.spdxId`, "custom mixed terms must not be presented as a recognized SPDX expression");
  }
}
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
  if (detail.icon?.startsWith("/")) await validatePublicAsset(`${location}.icon`, detail.icon);
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
  else await validatePublicAsset(`${location}.icon`, item.icon);
  validateRelatedRecord(`${location}.related`, item.related);
  for (const [imageIndex, image] of (item.images ?? []).entries()) {
    validateUrl(`${location}.images[${imageIndex}].src`, image.src);
    if (!image.alt) addError(`${location}.images[${imageIndex}].alt`, "is required");
  }
}
for (const [index, item] of (packages.nativeTools ?? []).entries()) {
  const location = `packages.nativeTools[${index}]`;
  if (!item.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) addError(`${location}.slug`, "expected a lowercase URL-safe slug");
  else if (packageSlugs.has(item.slug)) addError(`${location}.slug`, "duplicate package slug");
  packageSlugs.add(item.slug);
  if (!item.version) addError(`${location}.version`, "is required");
  if (!["maintained", "deprecated", "unsupported", "archived"].includes(item.status)) addError(`${location}.status`, "unknown value");
  for (const key of ["page", "source", "releases", "icon"]) validateUrl(`${location}.${key}`, item[key]);
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

const recognitionIds = new Set();
const recognitionHandles = new Set();
for (const [index, record] of (recognition.records ?? []).entries()) {
  const location = `recognition.records[${index}]`;
  if (recognitionIds.has(record.id)) addError(`${location}.id`, "duplicate recognition ID");
  recognitionIds.add(record.id);
  const normalizedHandle = record.handle.toLowerCase();
  if (recognitionHandles.has(normalizedHandle)) addError(`${location}.handle`, "duplicate recognized GitHub identity");
  recognitionHandles.add(normalizedHandle);
  if (!isDate(record.issuedAt)) addError(`${location}.issuedAt`, "expected YYYY-MM-DD");
  else validateFreshness(`${location}.issuedAt`, record.issuedAt);
  if (record.recordUrl.startsWith("http")) validateUrl(`${location}.recordUrl`, record.recordUrl);
  else if (!record.recordUrl.startsWith("/")) addError(`${location}.recordUrl`, "expected an absolute URL or root-relative public record");
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
  console.log(`Package registry valid: ${packages.linuxApplications.length} Linux applications, ${packages.nativeTools.length} native tools, and ${packages.npmPackages.length} npm packages.`);
  console.log(`Research registry complete: ${Object.keys(research.entries).length} records.`);
  console.log(`JSON Schema validation complete: ${schemaValidatedRecords} canonical records.`);
  console.log(`Verification states: ${Object.entries(counts).map(([key, value]) => `${key}=${value}`).join(", ")}.`);
}
