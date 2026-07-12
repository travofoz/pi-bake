import { createClient, parseRepo, listDir, getFile, deleteFile, getDefaultBranch, rawFileUrl } from './github.js';

/**
 * @typedef {import('./github.js').OctokitInstance} OctokitInstance
 */

/**
 * @typedef {object} GalleryEntry
 * @property {string} id
 * @property {string} filename
 * @property {'image'|'gif'} type
 * @property {string} createdAt
 * @property {string[]} tags
 * @property {string} caption
 * @property {number} width
 * @property {number} height
 * @property {object|null} annotations
 * @property {string[]|null} sourceSlideIds
 * @property {string} jsonPath - path in repo
 * @property {string} imagePath - path in repo
 * @property {string} rawUrl - raw.githubusercontent.com URL
 */

/**
 * Fetch all gallery entries from the /images/ directory.
 * Lists directory contents, fetches each .json metadata file,
 * and returns structured GalleryEntry objects.
 *
 * @param {string} token
 * @param {string} repoString - "owner/repo"
 * @returns {Promise<GalleryEntry[]>}
 */
export async function fetchGallery(token, repoString) {
	const octokit = createClient(token);
	const parsed = parseRepo(repoString);
	if (!octokit || !parsed) return [];

	const { owner, repo } = parsed;

	const branch = await getDefaultBranch(octokit, owner, repo);

	let items;
	try {
		items = await listDir(octokit, owner, repo, 'images');
	} catch (err) {
		if (err.status === 404) return []; // /images/ doesn't exist yet
		throw err;
	}

	// Filter to JSON metadata files only
	const jsonFiles = items.filter((item) => item.name.endsWith('.json'));

	// Fetch each JSON file's content in parallel
	const entries = await Promise.all(
		jsonFiles.map(async (jsonItem) => {
			try {
				const result = await getFile(octokit, owner, repo, jsonItem.path);
				if (!result) return null;
				const metadata = JSON.parse(result.content);

				/** @type {GalleryEntry} */
				const entry = {
					...metadata,
					branch,
					jsonPath: jsonItem.path,
					imagePath: `images/${metadata.filename}`,
					rawUrl: rawFileUrl(owner, repo, branch, `images/${metadata.filename}`)
				};
				return entry;
			} catch {
				// Skip files that can't be parsed
				return null;
			}
		})
	);

	return entries.filter((e) => e !== null)
		.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Delete a gallery entry: removes both the JSON metadata and the image file.
 * Returns the entry id on success.
 *
 * @param {string} token
 * @param {string} repoString - "owner/repo"
 * @param {string} id - entry id (e.g. "2026-07-12-xxxxxx")
 * @param {string} ext - file extension (e.g. "jpg")
 * @returns {Promise<string>}
 */
export async function deleteEntry(token, repoString, id, ext) {
	const octokit = createClient(token);
	const parsed = parseRepo(repoString);
	if (!octokit || !parsed) throw new Error('GitHub not connected');

	const { owner, repo } = parsed;

	const jsonPath = `images/${id}.json`;
	const imagePath = `images/${id}.${ext}`;

	// Get SHAs for both files
	const [jsonSha, imageSha] = await Promise.all([
		getFileSha(octokit, owner, repo, jsonPath),
		getFileSha(octokit, owner, repo, imagePath)
	]);

	if (!jsonSha && !imageSha) throw new Error(`Entry ${id} not found`);

	// Delete both files
	const deletions = [];
	if (jsonSha) {
		deletions.push(
			deleteFile(octokit, owner, repo, jsonPath, jsonSha, `Delete metadata for ${id}`)
		);
	}
	if (imageSha) {
		deletions.push(
			deleteFile(octokit, owner, repo, imagePath, imageSha, `Delete image ${id}.${ext}`)
		);
	}
	await Promise.all(deletions);

	return id;
}

/**
 * Get the SHA of a file in the repo (needed for deletion).
 * Returns null if the file doesn't exist.
 */
async function getFileSha(octokit, owner, repo, path) {
	try {
		const resp = await octokit.rest.repos.getContent({ owner, repo, path });
		const data = resp.data;
		if ('sha' in data) return data.sha;
		return null;
	} catch (err) {
		if (err.status === 404) return null;
		throw err;
	}
}

/**
 * Filter gallery entries by tag (case-insensitive) and/or search text (in caption/id/tags).
 *
 * @param {GalleryEntry[]} entries
 * @param {object} filters
 * @param {string} [filters.tagFilter]
 * @param {string} [filters.searchQuery]
 * @returns {GalleryEntry[]}
 */
export function filterGallery(entries, filters = {}) {
	let result = [...entries];

	if (filters.tagFilter) {
		const tag = filters.tagFilter.toLowerCase();
		result = result.filter((e) => e.tags.some((t) => t.toLowerCase() === tag));
	}

	if (filters.searchQuery) {
		const q = filters.searchQuery.toLowerCase();
		result = result.filter(
			(e) =>
				e.id.toLowerCase().includes(q) ||
				e.caption.toLowerCase().includes(q) ||
				e.tags.some((t) => t.toLowerCase().includes(q))
		);
	}

	return result;
}
