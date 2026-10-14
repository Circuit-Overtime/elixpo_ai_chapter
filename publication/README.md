# Publication checklist

The manuscript is an unreviewed technical report. Keep one canonical paper DOI
and a separate software DOI so citations are not split between duplicate paper
records.

## 1. Submit the paper to engrXiv

Run:

```bash
python scripts/package_publication.py
```

Upload `dist/publication/engrxiv/monodiffuse-preprint.pdf` using the values in
[`engrxiv-metadata.md`](engrxiv-metadata.md). The PDF is the manuscript; do not
upload the source ZIP as a second manuscript. The source ZIP and checksum file
may be supplied as reproduction/supporting material if the form permits it.
The provisional BibTeX entry is in [`CITATION.bib`](CITATION.bib); add the DOI
after it is assigned.

Once engrXiv assigns a DOI:

1. replace every `10.31224/TO-BE-ASSIGNED` placeholder in this directory;
2. add the DOI to `CITATION.cff` under `preferred-citation`;
3. add the DOI to the paper's Code availability paragraph;
4. rebuild the PDF and create a new manuscript version if engrXiv permits it.

## 2. Archive the software release on Zenodo

Create GitHub release `v1.0.0` after the engrXiv DOI is known. Enable the
repository in Zenodo's GitHub integration before publishing the GitHub release.
Zenodo will read `CITATION.cff` and archive the release as software.

Use [`RELEASE_NOTES.md`](RELEASE_NOTES.md) as the GitHub release description.

Use the values in [`zenodo-software-metadata.md`](zenodo-software-metadata.md).
Relate the software to the paper with `Is supplement to` and the engrXiv DOI.
Do not upload the paper PDF as a second Zenodo publication record.

## 3. Enable the Scholar-readable mirror

The workflow in `.github/workflows/pages.yml` deploys a static landing page and
the same PDF to GitHub Pages. In GitHub, open **Settings → Pages → Build and
deployment**, select **GitHub Actions**, and run the `pages` workflow.

The canonical URL is:

<https://research.elixpo.com/monodiffuse/>

Until that site is deployed, GitHub Pages remains available as a temporary
mirror at <https://elixpo.github.io/monodiffuse/>.

After engrXiv publication, add `citation_doi` and a DOI link to
`docs/index.html`. This page is a discovery mirror, not another publication.

## 4. Verify indexing

After several weeks, search Google Scholar for the exact paper title in quotes.
Add the automatically indexed engrXiv entry to each author's profile. A manual
profile entry is only a fallback; it does not itself create a searchable Scholar
record.
