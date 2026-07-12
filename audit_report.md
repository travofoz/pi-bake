Critic found issues in one or more sub-audits:

## BASELINE_REVIEW

### BASELINE_REVIEW — sample 1/2

Here is my code review of the current codebase. I've read every source file in the project.

---

## Code Review Results

### Environment/Platform Correctness

**No issues.** The project correctly targets a client-side SPA (`ssr: false`, `@sveltejs/adapter-static`). No Node.js-only globals (`Buffer`, `process`, `require`, `fs`, `__dirname`) are used anywhere in `src/`. `localStorage` is properly guarded with `typeof localStorage !== 'undefined'`. The only `process.env` reference is in `svelte.config.js` (build-time only, never shipped).

---

### Hardcoded Values

**No issues.** All previous hardcoded values have been resolved:
- `gifTags` is user-editable (was `tags: ['gif']` forced), via a bound input with `'gif'` as a sensible default
- Branch names resolved dynamically via `getDefaultBranch()` API call
- `raw.githubusercontent.com` URL construction centralized in `rawFileUrl()` with proper `encodeURIComponent` on all segments
- The connect modal wraps in a `<form>` so keyboard submission works

---

### Security

**No exploitable issues.** Key observations:

- **SVG `{@html}` injection is properly guarded.** All shape attribute values pass through `escapeAttr()` (XML-escapes `& " ' < >`), and text content goes through `escapeXML()`. This prevents XSS via annotation metadata.
- **PAT in localStorage is a documented tradeoff**, not a bug. The UI itself warns about the XSS exposure and explains why it's accepted for a single-user tool.
- **No `innerHTML`, `document.write`, or unbounded string interpolation** anywhere in `src/`.
- **The PAT is only sent to `api.github.com`** via Octokit's authenticated requests, never to third parties.

---

### Framework Footguns & Other Issues

**Three issues found:**

#### Issue 1—Dead/no-op ternary in GIF encoder (`src/lib/gif-export.js`, line ~244)

```js
encoder.writeFrame(indexData, width, height, {
    palette: isFirst ? palette : palette,  // both branches identical
    ...
});
```

`isFirst ? palette : palette` always evaluates to `palette`. The `isFirst` variable and the conditional are dead. The comment says "Always provide palette for local color table" — if that's the intent, just write `palette`. If the intent was to pass palette only on the first frame (global color table) and omit it for subsequent frames, that's a real functional issue. Either way, the current ternary is dead code.

#### Issue 2—Blob URL revoked before download can start (`src/routes/slideshow/+page.svelte`, lines 177–179)

```js
a.href = URL.createObjectURL(result.blob);
a.download = `${result.id}.gif`;
a.click();
URL.revokeObjectURL(a.href);  // revoked immediately — browser may not have started the download
```

`URL.revokeObjectURL()` is called synchronously right after `a.click()`. The browser's download pipeline may not have initiated yet, meaning the blob (and its backing memory) could be freed before the browser reads it. The download will appear to succeed but produce a zero-byte or failed file. Fix: either don't revoke (the blob will be garbage-collected when the document unloads), or defer revocation (e.g., `setTimeout(() => URL.revokeObjectURL(a.href), 5000)`).

#### Issue 3—Svelte 5 async `$effect` without lifecycle tracking (3 files)

All three of these components fire an async function from `$effect` without any lifecycle guard:

| File | Line | Pattern |
|------|------|---------|
| `src/routes/+page.svelte` | ~55 | `$effect(() => { if ($githubRepo) loadGallery(); })` |
| `src/routes/annotate/[id]/+page.svelte` | ~25 | `$effect(() => { if (id && $githubToken && $githubRepo) loadImage(); })` |
| `src/routes/slideshow/+page.svelte` | ~96 | `$effect(() => { if ($githubRepo) loadEntries(); })` |

In Svelte 5, mutating `$state` variables after a component has been destroyed throws a runtime error. If the user navigates away before the async call completes (e.g., rapid back/forth between pages), the `loading = false`, `entries = ...`, `error = ...` assignments inside the callback will fire on a destroyed component. The fix is either:
- Track a `destroyed` flag and check it before state mutations, or
- Use an `AbortController`/`.finally` guard, or
- Move the async call to a rune-based pattern that cancels on re-run.

In practice, this is unlikely to hit in normal use (async calls complete quickly, navigation is rare during loading), but it's a real Svelte 5 footgun that will cause hard-to-diagnose errors if it does.

---

**RESULT: ISSUES**


### BASELINE_REVIEW — sample 2/2

Now I have all the information needed for a comprehensive review. Here is my analysis:

---

## Code Review Findings

### CRITICAL: `rawFileUrl` breaks all URLs with `encodeURIComponent` on the full path

**File:** `src/lib/github.js`, line 186

```js
export function rawFileUrl(owner, repo, branch, path) {
    return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodeURIComponent(path)}`;
}
```

`encodeURIComponent` encodes `/` as `%2F`. Every call site passes a path like `images/2026-07-11-a1b2c3.png`, producing:

```
https://raw.githubusercontent.com/owner/repo/branch/images%2F2026-07-11-a1b2c3.png
```

GitHub's raw content server treats `%2F` as a literal path segment character, not a separator. The server looks for a file literally named `images%2F2026-07-11-a1b2c3.png` inside the branch root, which doesn't exist → **every image, GIF, and metadata URL returns 404**. All four callers (gallery.js, upload.js, gif-export.js, annotate/\[id]/+page.svelte) are affected.

**Fix:** Split path segments, encode individually, then rejoin:

```js
export function rawFileUrl(owner, repo, branch, path) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`;
}
```

---

### BUG: Upload success message is set then immediately cleared, never visible

**File:** `src/routes/+page.svelte`, lines 298–300

```js
uploadSuccess = `Uploaded: ${result.id}`;
clearUpload();
await loadGallery();
```

`clearUpload()` (line 89–97) sets `uploadSuccess = ''`. Because both assignments happen in the same synchronous block before any `await`, Svelte batches the state update and only the final value (`''`) reaches the DOM. The `<div class="alert alert-success">` block is never rendered.

The upload UX provides no visible feedback — the gallery just re-renders, which the user may not notice.

**Fix:** Save the message before clearing:

```js
const successMsg = `Uploaded: ${result.id}`;
clearUpload();
uploadSuccess = successMsg;
await loadGallery();
```

---

### MINOR: Blob URL revoked before download can start

**File:** `src/routes/slideshow/+page.svelte`, lines 177–180

```js
a.href = URL.createObjectURL(result.blob);
a.download = `${result.id}.gif`;
a.click();
URL.revokeObjectURL(a.href);
```

`URL.revokeObjectURL` immediately invalidates the blob URL. The browser's download mechanism is asynchronous — it must create a reference to the blob data after `click()` returns. On slower devices or under load, the download can fail silently (empty file or network error). The standard pattern is to delay revocation:

```js
const url = URL.createObjectURL(result.blob);
a.href = url;
a.download = `${result.id}.gif`;
a.click();
setTimeout(() => URL.revokeObjectURL(url), 10000);
```

---

### MINOR: Blob URL leak on component unmount

**File:** `src/routes/+page.svelte`

The `uploadPreview` variable holds a blob URL created via `URL.createObjectURL`. While it is correctly revoked before being overwritten (in `handleFileSelect`, `ondrop`, and `clearUpload`), there is no cleanup on component destroy. If the user navigates away from the gallery page while a preview is displayed, the blob URL leaks until the tab is closed.

Not impactful for a single-user tool but breaks the revocation contract for `URL.createObjectURL`.

---

### Summary

| Severity | Issue | File | Status |
|----------|-------|------|--------|
| **CRITICAL** | `rawFileUrl` encodes `/` in path breaks all URLs | `src/lib/github.js:186` | Unfixed |
| **BUG** | Upload success message cleared before rendering | `src/routes/+page.svelte:298-300` | Unfixed |
| **MINOR** | Blob URL revoked before download starts | `src/routes/slideshow/+page.svelte:180` | Unfixed |
| **MINOR** | Blob URL leak on component destroy | `src/routes/+page.svelte` | Unfixed |

The remaining remediation items (Pointer Events unification, `$effect` guard on slideshow, arrow head deduplication, `estimateGifSize` duplication, `deleteFile` removal, dynamic import reduction, `onDestroy` cleanup, form wrapping) have all been correctly addressed in the current codebase.

**Note on passing build:** The `rawFileUrl` encoding bug would not be caught by Vite/SvelteKit build or `svelte-check` — URL string construction has no type errors. It only manifests at runtime when the browser tries to load images and gets 404s.

RESULT: ISSUES
