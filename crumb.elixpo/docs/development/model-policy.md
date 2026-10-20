# Initial model policy

The connector requests only the models Crumb currently exposes. The source
snapshot is `docs/pollinations_models.md`; runtime identifiers are centralized
in `crumb.elixpo/lib/model-policy.ts`.

| Modality | Initial model |
| --- | --- |
| Harness text | `nova-fast`, `nova`, `qwen-coder`, `Circuit-Overtime/OreoLook` |
| Web search | `perplexity` |
| Image | `flux`, `klein` |
| Video | `wan-fast` |
| Audio | `elevenflash` |
| 3D | `trellis-2` |
| Transcription | `whisper` |
| Embeddings | `openai-3-small` |

The harness keeps these text models behind one replaceable policy. Quick uses
`nova-fast`; Balanced defaults to the stronger cache-capable `nova` route;
and coding requests can route to `qwen-coder`. OreoLook is
an optional Elixpo-owned reasoning and vision route with a low per-user request
ceiling, so it is not the default. `perplexity` is the dedicated web-grounded
route and must only run through an explicitly approved network tool. Every
other modality begins with one default except image, where both Flux and Klein
are intentional user-facing choices.
