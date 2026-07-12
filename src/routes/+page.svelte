<script>
	import { githubToken, githubRepo } from '$lib/stores.js';
	import { fetchGallery, filterGallery } from '$lib/gallery.js';
	import { uploadImage } from '$lib/upload.js';
	import { createClient, parseRepo } from '$lib/github.js';

	/** @type {import('$lib/gallery.js').GalleryEntry[]} */
	let entries = $state([]);
	let loading = $state(false);
	let error = $state('');

	// Upload state
	let uploadFile = $state(null);
	let uploadPreview = $state('');
	let uploadTags = $state('');
	let uploadCaption = $state('');
	let uploading = $state(false);
	let uploadError = $state('');
	let uploadSuccess = $state('');

	// Filter state
	let tagFilter = $state('');
	let searchQuery = $state('');

	// Copy feedback
	let copiedId = $state('');

	// Load gallery when connected
	$effect(() => {
		if ($githubToken && $githubRepo) {
			loadGallery();
		}
	});

	async function loadGallery() {
		loading = true;
		error = '';
		try {
			entries = await fetchGallery($githubToken, $githubRepo);
		} catch (err) {
			error = err.message || 'Failed to load gallery';
		} finally {
			loading = false;
		}
	}

	function handleFileSelect(e) {
		const file = e.target.files?.[0];
		if (file) {
			uploadFile = file;
			uploadPreview = URL.createObjectURL(file);
			uploadError = '';
			uploadSuccess = '';
		}
	}

	function clearUpload() {
		uploadFile = null;
		uploadPreview = '';
		uploadTags = '';
		uploadCaption = '';
		uploadError = '';
		uploadSuccess = '';
	}

	async function handleUpload() {
		if (!uploadFile) return;
		uploading = true;
		uploadError = '';
		uploadSuccess = '';

		try {
			const tags = uploadTags
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
			const octokit = createClient($githubToken);
			const parsed = parseRepo($githubRepo);
			if (!octokit || !parsed) {
				uploadError = 'GitHub not connected.';
				return;
			}

			const result = await uploadImage(octokit, parsed.owner, parsed.repo, uploadFile, { tags, caption: uploadCaption.trim() });
			uploadSuccess = `Uploaded! Link: ${result.imageUrl}`;
			clearUpload();
			// Reload gallery
			await loadGallery();
		} catch (err) {
			uploadError = err.message || 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	async function copyUrl(url) {
		try {
			await navigator.clipboard.writeText(url);
			copiedId = url;
			setTimeout(() => (copiedId = ''), 2000);
		} catch {
			// Fallback: select and copy from a temporary input
			const input = document.createElement('input');
			input.value = url;
			document.body.appendChild(input);
			input.select();
			document.execCommand('copy');
			document.body.removeChild(input);
		}
	}

	// Derive unique tags from all entries
	let allTags = $derived([...new Set(entries.flatMap((e) => e.tags))].sort());

	// Filtered entries
	let filteredEntries = $derived(filterGallery(entries, { tagFilter: tagFilter || undefined, searchQuery: searchQuery || undefined }));

	function formatDate(iso) {
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
		<h2 class="text-2xl font-bold">Gallery</h2>
		<div class="flex gap-2">
			<button class="btn btn-ghost btn-sm" onclick={loadGallery}>
				Refresh
			</button>
		</div>
	</div>

	<!-- Upload Section -->
	<div class="collapse collapse-arrow bg-base-100 border border-base-300">
		<input type="checkbox" />
		<div class="collapse-title font-medium">Upload Image</div>
		<div class="collapse-content">
			{#if !uploadFile}
				<div class="flex items-center justify-center w-full">
					<label
						for="file-upload"
						class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-base-200"
					>
						<div class="flex flex-col items-center justify-center pt-5 pb-6">
							<svg class="w-8 h-8 mb-2 text-base-content/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
							</svg>
							<p class="mb-2 text-sm text-base-content/50">
								<span class="font-semibold">Click to select</span> or drag and drop
							</p>
							<p class="text-xs text-base-content/40">PNG, JPG, JPEG, GIF, WebP</p>
						</div>
						<input id="file-upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden" onchange={handleFileSelect} />
					</label>
				</div>
			{:else}
				<div class="flex flex-col sm:flex-row gap-4">
					<div class="w-full sm:w-48">
						<img src={uploadPreview} alt="Preview" class="w-full rounded border" />
					</div>
					<div class="flex-1 space-y-3">
						<p class="text-sm truncate">{uploadFile.name} ({(uploadFile.size / 1024).toFixed(0)} KB)</p>
						<input
							type="text"
							bind:value={uploadTags}
							placeholder="Tags (comma-separated)"
							class="input input-bordered input-sm w-full"
						/>
						<input
							type="text"
							bind:value={uploadCaption}
							placeholder="Caption (optional)"
							class="input input-bordered input-sm w-full"
						/>
						{#if uploadError}
							<div class="alert alert-error text-sm p-2">{uploadError}</div>
						{/if}
						<div class="flex gap-2">
							<button class="btn btn-primary btn-sm" onclick={handleUpload} disabled={uploading}>
								{#if uploading}
									<span class="loading loading-spinner loading-xs"></span>
								{/if}
								Upload
							</button>
							<button class="btn btn-ghost btn-sm" onclick={clearUpload}>Cancel</button>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Upload Success Toast -->
	{#if uploadSuccess}
		<div class="alert alert-success text-sm">{uploadSuccess}</div>
	{/if}

	<!-- Filters -->
	<div class="flex flex-col sm:flex-row gap-3">
		<div class="flex-1">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search by caption, id, or tag..."
				class="input input-bordered input-sm w-full"
			/>
		</div>
		<div class="w-full sm:w-48">
			<select
				bind:value={tagFilter}
				class="select select-bordered select-sm w-full"
			>
				<option value="">All tags</option>
				{#each allTags as tag}
					<option value={tag}>{tag}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- Gallery Grid -->
	{#if loading}
		<div class="flex justify-center py-12">
			<span class="loading loading-spinner loading-lg"></span>
		</div>
	{:else if error}
		<div class="alert alert-error">{error}</div>
	{:else if filteredEntries.length === 0}
		<div class="text-center py-12 text-base-content/50">
			<p class="text-lg">
				{#if searchQuery || tagFilter}
					No images match your filters.
				{:else}
					No images yet. Upload one above!
				{/if}
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{#each filteredEntries as entry (entry.id)}
				<div class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow">
					<figure class="px-3 pt-3">
						<img
							src={entry.rawUrl}
							alt={entry.caption || entry.id}
							class="rounded object-cover w-full h-40"
							loading="lazy"
						/>
					</figure>
					<div class="card-body p-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="card-title text-sm truncate" title={entry.id}>
									{entry.caption || entry.id}
								</p>
								<p class="text-xs text-base-content/50">
									{entry.type} &middot; {entry.width}&times;{entry.height}
								</p>
								<p class="text-xs text-base-content/40">{formatDate(entry.createdAt)}</p>
							</div>
						</div>

						<!-- Tags -->
						{#if entry.tags.length > 0}
							<div class="flex flex-wrap gap-1 mt-1">
								{#each entry.tags as tag}
									<span class="badge badge-sm badge-ghost">{tag}</span>
								{/each}
							</div>
						{/if}

						<!-- Actions -->
						<div class="flex gap-1 mt-2">
							<button
								class="btn btn-ghost btn-xs"
								onclick={() => copyUrl(entry.rawUrl)}
								title="Copy raw URL"
							>
								{copiedId === entry.rawUrl ? 'Copied!' : 'Copy Link'}
							</button>
							<a
								href={entry.rawUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="btn btn-ghost btn-xs"
							>
								Open
							</a>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
