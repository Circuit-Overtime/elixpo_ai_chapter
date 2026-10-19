import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourcePath = path.join(repositoryRoot, 'marketplace/catalog.json')
const publicRoot = path.join(repositoryRoot, 'crumb.elixpo/public/marketplace')
const publicCatalogPath = path.join(publicRoot, 'catalog.json')
const discoveryPath = path.join(publicRoot, 'discovery.json')
const manifestsRoot = path.join(publicRoot, 'manifests')
const publicBase = 'https://crumb.elixpo.com/marketplace'
const checkOnly = process.argv.includes('--check')

const sourceCatalog = JSON.parse(await readFile(sourcePath, 'utf8'))
const publicCatalog = structuredClone(sourceCatalog)

for (const packageRelease of publicCatalog.packages) {
  const packageDirectory = packageRelease.source.replace(/^\.\/packages\//, '')
  if (!packageDirectory || packageDirectory.includes('..') || packageDirectory.includes('\\')) {
    throw new Error(`unsafe marketplace source for ${packageRelease.id}`)
  }
  packageRelease.source = `${publicBase}/packages/${packageDirectory}`
  packageRelease.provenance.trust = { kind: 'sigstore_bundle' }
  for (const artifact of packageRelease.artifacts) {
    const artifactPath = artifact.path.split('/').map(encodeURIComponent).join('/')
    const url = `${publicBase}/packages/${packageDirectory}/${artifactPath}`
    artifact.url = url
    artifact.bundle_url = `${url}.sigstore.json`
  }
}

const revocations = new Set(
  publicCatalog.revocations.map(revocation => `${revocation.package}\0${revocation.version}`),
)
const manifests = new Map()
const releases = publicCatalog.packages.map(packageRelease => {
  const manifest = Buffer.from(JSON.stringify(packageRelease))
  const digest = createHash('sha256').update(manifest).digest('hex')
  manifests.set(`${digest}.json`, manifest)
  return {
    release: {
      id: packageRelease.id,
      version: packageRelease.version,
      manifest_sha256: digest,
      manifest_size_bytes: manifest.byteLength,
    },
    publisher: packageRelease.publisher,
    package_class: packageRelease.package_class,
    display_name: packageRelease.display_name,
    description: packageRelease.description,
    license: packageRelease.license,
    compatibility: packageRelease.compatibility,
    trust: packageRelease.provenance.trust,
    revoked: revocations.has(`${packageRelease.id}\0${packageRelease.version}`),
    deprecated: packageRelease.deprecation !== null,
  }
}).sort((left, right) => {
  const byId = left.release.id.localeCompare(right.release.id)
  return byId || left.release.version.localeCompare(right.release.version, 'en', { numeric: true })
})

const outputs = new Map([
  [publicCatalogPath, Buffer.from(`${JSON.stringify(publicCatalog, null, 2)}\n`)],
  [discoveryPath, Buffer.from(JSON.stringify({ schema_version: 1, name: publicCatalog.name, releases }))],
])
for (const [name, manifest] of manifests) outputs.set(path.join(manifestsRoot, name), manifest)

if (checkOnly) {
  for (const [destination, expected] of outputs) {
    const actual = await readFile(destination).catch(() => null)
    if (!actual?.equals(expected)) throw new Error(`${path.relative(repositoryRoot, destination)} is stale; run publish-marketplace.mjs`)
  }
  const expectedManifests = new Set(manifests.keys())
  const actualManifests = await readdir(manifestsRoot).catch(() => [])
  const stale = actualManifests.filter(name => name.endsWith('.json') && !expectedManifests.has(name))
  if (stale.length) throw new Error(`stale marketplace manifests: ${stale.join(', ')}`)
} else {
  await mkdir(manifestsRoot, { recursive: true })
  for (const name of await readdir(manifestsRoot)) {
    if (name.endsWith('.json') && !manifests.has(name)) await rm(path.join(manifestsRoot, name))
  }
  for (const [destination, contents] of outputs) await writeFile(destination, contents)
}
