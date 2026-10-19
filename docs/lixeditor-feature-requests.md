# @elixpo/lixeditor — feature requests (from mail.elixpo)

Spec for changes to implement in the **lixeditor package repo** (dogfooded by
mail.elixpo). Current consumed version: **2.6.9**. Suggested target: **2.7.0**.

mail.elixpo embeds LixEditor as its email-template WYSIWYG. Two things block us
today, plus a few that would make the editor a clean embed for any host app.
The contracts below are what mail.elixpo will code against — please keep the
prop names / signatures exact so integration is drop-in.

---

## P0 — must have

### 1. `uploadFile` hook (host-controlled media upload)

**Problem.** The ImageBlock currently reads dropped/pasted/selected images with
`FileReader.readAsDataURL` and stores them as **base64 `data:` URLs** inside the
document. That's fatal for email: clients (Gmail, Outlook) strip or block inline
base64, and the document/HTML balloons. The editor must let the host upload the
file somewhere (we use Cloudinary) and store the returned **hosted URL** instead.

**Contract.** Add an optional prop on `LixEditor`:

```ts
uploadFile?: (file: File) => Promise<string>;
// Resolve to a public URL for the stored asset.
// Reject (throw) to signal failure — the editor should toast and keep the block editable.
```

**Behavior.**
- If `uploadFile` is provided, the ImageBlock (and any future media block) calls
  it for every drop / paste / file-input selection, shows the existing
  "uploading…" state while the promise is pending, then sets
  `block.props.url = <resolved url>` and `block.props.name = file.name`.
- If `uploadFile` is **omitted**, keep today's base64 `readAsDataURL` behavior as
  the fallback (so the package still works standalone with zero config).
- On reject: show the existing fail toast, call `onUploadError?.(err, file)` if
  provided, and leave the block in an editable/empty state (don't insert base64).

**Threading.** Deep block components can't see top-level props directly. Pick one
(either is fine — we'll adapt):
- **Preferred:** a React context set by `<LixEditor>` (e.g. `LixUploadContext`)
  that the ImageBlock reads via a `useUploadFile()` hook, **or**
- a module-level setter mirroring the existing link-preview pattern:
  `export function setImageUploader(fn: (file: File) => Promise<string>): void`.
  (You already ship `setLinkPreviewEndpoint`, so this is consistent — but a prop
  threaded through context is cleaner and SSR-safe.)

**Nice-to-haves on the same hook:**
```ts
acceptImageTypes?: string[];   // default ["image/png","image/jpeg","image/gif","image/webp"]
maxFileSizeBytes?: number;     // reject + toast over this; default unlimited
onUploadError?: (err: Error, file: File) => void;
```

**How mail.elixpo will use it** (so the contract is unambiguous):
```tsx
<LixEditor
  uploadFile={async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads/image", { method: "POST", body: form });
    if (!res.ok) throw new Error("upload failed");
    const { url } = await res.json();   // already Cloudinary f_auto,q_auto URL
    return url;
  }}
  features={{ images: true, /* … */ }}
/>
```

---

### 2. Button block, insertable from the `/` slash menu

**Problem.** `features.buttons` / `ButtonBlock` exist, but there's no first-class
way to **insert** a CTA button from the slash menu and edit its label/link/style.
Email templates need bulletproof CTA buttons.

**Contract.**
- When `features.buttons` is true, register a slash-menu item **"Button"** (group
  "Basic" or "Embed", aliases: `button`, `cta`, `link button`). Selecting it
  inserts a `button` block with default props.
- Block props (all editable via an inline popover/toolbar on the block):
  ```ts
  interface ButtonBlockProps {
    text: string;          // "Get started"
    url: string;           // "https://…" — supports {{variables}} (left as-is in HTML)
    align: "left" | "center" | "right";   // default "left"
    variant: "solid" | "outline";          // default "solid"
    color: string;         // hex, default theme accent (e.g. "#7c5cff")
    radius?: number;       // px, default 8
  }
  ```
- Allow the host to set defaults:
  ```ts
  buttonDefaults?: Partial<ButtonBlockProps>;   // prop on <LixEditor>
  ```

**Email-safe HTML export (important).** `renderBlocksToHTML` / `getHTML()` must
emit a **table/anchor "bulletproof button"**, not a styled `<div>` — inline
styles only, no external CSS, Outlook-safe. Target shape:
```html
<table role="presentation" cellspacing="0" cellpadding="0" align="left">
  <tr><td style="border-radius:8px;background:#7c5cff;">
    <a href="{{url}}" target="_blank"
       style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;
              font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
      Get started
    </a>
  </td></tr>
</table>
```
(For `variant:"outline"`: transparent background, `border:2px solid {color}`,
text color = `{color}`.) Leave `{{variables}}` in `url`/`text` untouched so the
host's merge step can substitute them.

---

## P1 — high value for our use case

### 3. Merge-variable token `{{variable}}` (inline)

Email templates are built around `{{firstName}}`-style merge fields. Today users
type raw `{{…}}` text. A first-class inline token would be a big UX win:

- An inline spec rendered as a styled chip (e.g. subtle pill `{{ firstName }}`).
- A slash item **"Variable"** and/or an autocomplete trigger on typing `{{` that
  suggests from a host-supplied list:
  ```ts
  variableSuggestions?: string[];   // ["firstName","amount","orderId", …]
  ```
- **HTML export must round-trip to literal `{{name}}` text** (so our existing
  `substituteVariables()` keeps working). The chip is purely an editing
  affordance; `getHTML()` emits `{{name}}`.

If a full inline spec is too much for 2.7.0, even just exposing the `{{` →
autocomplete over `variableSuggestions` (emitting plain `{{name}}`) is enough.

### 4. `editable` / `readOnly` prop

```ts
editable?: boolean;   // default true; false → render-only (we want this for previews)
```
We currently use `LixPreview` for read-only; a single editor with `editable=false`
would simplify and guarantee identical rendering.

### 5. Generic file uploads (attachments)

Same `uploadFile` hook, but allow non-image files for a future attachment/file
block (`acceptTypes`, returns a hosted URL + filename). Not needed for 2.7.0 if
it complicates things — flag the seam so it's reusable.

---

## P2 — polish / DX

6. **Ship TypeScript types.** The package ships **no `.d.ts`** (v2.6.9), so we
   hand-maintain ambient declarations in `types/lixeditor.d.ts`. Please publish
   real types — start from the interface below (it's what we already consume plus
   the new props). This alone removes a whole class of dogfooding friction.

7. **`linkPreviewEndpoint` as a prop** (in addition to `setLinkPreviewEndpoint`)
   — consistency with `uploadFile`.

8. **Image block fields for email:** `alt` (accessibility/clients with images
   off), `width`, `align`, and optional `link` (wrap the `<img>` in an `<a>`).
   `getHTML()` should already give images `max-width:100%`.

9. **`sanitize` / email-safe export mode** on `getHTML()` — strip scripts, inline
   everything, no `class`/external CSS dependency. (We post-wrap, but a built-in
   email mode would be ideal.)

---

## TypeScript surface to publish (target 2.7.0)

```ts
export interface LixFeatures {
  equations?: boolean; mermaid?: boolean; codeHighlighting?: boolean;
  tableOfContents?: boolean; images?: boolean; buttons?: boolean;
  pdf?: boolean; dates?: boolean; linkPreview?: boolean; markdownLinks?: boolean;
}

export interface ButtonBlockProps {
  text: string; url: string;
  align?: "left" | "center" | "right";
  variant?: "solid" | "outline";
  color?: string; radius?: number;
}

export interface LixEditorProps {
  initialContent?: LixBlock[] | string | null;
  onChange?: (editor: any) => void;
  onReady?: () => void;
  features?: LixFeatures;
  placeholder?: string;

  // NEW in 2.7.0
  uploadFile?: (file: File) => Promise<string>;
  acceptImageTypes?: string[];
  maxFileSizeBytes?: number;
  onUploadError?: (err: Error, file: File) => void;
  buttonDefaults?: Partial<ButtonBlockProps>;
  variableSuggestions?: string[];
  editable?: boolean;
  linkPreviewEndpoint?: string;

  codeLanguages?: Record<string, any>;
  extraBlockSpecs?: any[]; extraInlineSpecs?: any[]; slashMenuItems?: any[];
  collaboration?: any; children?: ReactNode; ref?: Ref<LixEditorHandle>;
}

// Optional module-level alternative to the prop (mirrors setLinkPreviewEndpoint):
export function setImageUploader(fn: (file: File) => Promise<string>): void;
```

---

## Acceptance criteria

- [ ] Dropping/pasting an image with `uploadFile` set stores the **returned URL**,
      never a `data:` URL; without it, base64 fallback still works.
- [ ] Upload failure toasts and leaves the block editable (no base64 inserted).
- [ ] `/` menu shows **Button** when `features.buttons` is on; inserts an editable
      CTA; `getHTML()` emits a bulletproof table/anchor button with inline styles.
- [ ] `{{variables}}` survive `getHTML()` as literal text (round-trip safe).
- [ ] Package ships `.d.ts`; the new props are typed.
- [ ] No SSR regressions (we import the editor `ssr:false`, but types/exports must
      resolve on the server).

## After publishing
1. Bump the package (suggest `2.7.0`) and publish.
2. Ping back here — mail.elixpo will:
   - `npm i @elixpo/lixeditor@2.7.0`,
   - delete the hand-written `types/lixeditor.d.ts` (or trim to gaps),
   - pass `uploadFile`, `variableSuggestions`, `buttonDefaults`, `editable` from
     the template composer, and ship the Cloudinary upload route.

---

# 2.7.1 follow-ups (after dogfooding 2.7.0)

2.7.0 wired up correctly on our side (types, `uploadFile`, slash button). Two
package-level issues surfaced when actually using it:

### A. Button block inline editor is unstyled / broken (P0 bug)
Inserting a button from `/` renders its inline editor with **no layout**: the
fields (`text`, `url`, align, variant, color, radius) are cramped onto lines and
the **"Cancel" / "Done" buttons run together** ("CancelDone"). Screenshot shows
the controls have effectively no CSS. Likely the button-editor styles aren't in
the shipped `dist/styles/index.css`, or are scoped to a class that isn't emitted.
- Ship the button-editor styles (spacing, control sizing, a real button row with
  a gap, labels). It should look like a small popover/toolbar, not raw inputs.
- Verify against a **dark** `LixThemeProvider` (our embed is dark) — the inputs
  need readable contrast.

### B. Suppress BlockNote's default image placeholder UI (for host-driven insert)
We insert images from our **own** toolbar (file → Cloudinary → insert a ready
image block), and via drag/drop/paste (already routed through `uploadFile`). But
an empty image block still shows BlockNote's default **"Upload / Embed URL"**
card with an Embed-URL tab — which is not our flow and confuses users. Please add
a way to turn that off:
```ts
// on <LixEditor> (or features):
imageInsert?: "default" | "host";   // "host" → no in-block Upload/Embed-URL placeholder;
                                     // images appear only once they have a URL
```
and/or expose a tiny imperative helper on the handle so the host can insert an
image block programmatically with the URL already set (we can do this via
`getEditor()` + BlockNote today, but a first-class helper is cleaner):
```ts
insertImage(url: string, opts?: { alt?: string; align?: "left"|"center"|"right" }): void;
```
With `imageInsert:"host"`, the slash "Image" item should either be hidden or
trigger the host's `uploadFile` directly (file picker → upload → inserted), never
the embed-URL card.

### C. `getHTML()` drops paragraph/heading text alignment (P0 bug — fixing in 2.7.1)
The email export renders text blocks as `<p>${content}</p>` / headings with **no
`text-align`**, so `block.props.textAlignment` ("center"/"right"/"justify") is
lost — centered/right content renders left in the email (and our preview). Only
**images** currently emit alignment (`<figure style="text-align:…">`).
- `renderBlock` should emit `style="text-align:<align>"` (inline, email-safe) for
  `paragraph`/`heading`/`quote`/list items when `props.textAlignment` is set and
  not the default `left`.

### D. `getHTML()` drops the `quote` block (P1 — for 2.7.2)
BlockNote (the peer dep) has a **`quote`** block and the editor creates it fine,
but lixeditor's `getHTML()` has no case for it (zero `quote`/`blockquote` in the
bundle) — so a quote renders in the editor but **vanishes from the email export
+ preview**. `renderBlock` should emit `<blockquote>${content}</blockquote>` for
`type === "quote"` (our email CSS already styles `blockquote`). Pairs with the
alignment fix (C).

> Everything else in 2.7.0 is working. These unblock a clean compose UX on our
> side; once published we'll bump and drop our remaining workarounds.
