# Publication checklist

The manuscript is an unreviewed technical report. Keep one canonical paper DOI
and a separate software DOI so citations are not split between duplicate paper
records.

## 1. Archived preprint

The preprint was published on Zenodo on 17 October 2026:

- exact version: <https://doi.org/10.5281/zenodo.23424654>;
- all-versions concept record: <https://doi.org/10.5281/zenodo.23424653>.

Use the exact-version DOI when citing the reported results. The concept DOI is a
stable route to the newest version. Rebuild the preservation bundles with:

```bash
python scripts/package_publication.py
```

The Zenodo upload files are written under `dist/publication/zenodo-preprint/`.
[`CITATION.bib`](CITATION.bib) and the repository's `CITATION.cff` contain the
version-specific DOI.

## 2. Archive the software release on Zenodo

Create GitHub release `v1.0.0` and enable the repository in Zenodo's GitHub
integration before publishing the release. Zenodo will read `CITATION.cff` and
archive the release as software.

Use [`RELEASE_NOTES.md`](RELEASE_NOTES.md) as the GitHub release description.

Use the values in [`zenodo-software-metadata.md`](zenodo-software-metadata.md).
Relate the software to the paper with `Is supplement to` and DOI
`10.5281/zenodo.23424654`.
Do not upload the paper PDF as a second Zenodo publication record.

## 3. Enable the Scholar-readable mirror

The workflow in `.github/workflows/pages.yml` deploys a static landing page and
the same PDF to GitHub Pages. In GitHub, open **Settings → Pages → Build and
deployment**, select **GitHub Actions**, and run the `pages` workflow.

The canonical URL is:

<https://research.elixpo.com/monodiffuse/>

Until that site is deployed, GitHub Pages remains available as a temporary
mirror at <https://elixpo.github.io/monodiffuse/>.

The page contains `citation_doi`, `citation_pdf_url`, and author metadata for
discovery. It is a mirror, not another publication.

## 4. Verify indexing

After several weeks, search Google Scholar for the exact paper title in quotes.
Add the automatically indexed record to each author's profile. A manual profile
entry is only a fallback; it does not itself create a searchable Scholar record.
