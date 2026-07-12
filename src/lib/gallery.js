import { createClient, parseRepo, listDir, getFile } from './github.js';

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
					jsonPath: jsonItem.path,
					imagePath: `images/${metadata.filename}`,
					rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/main/images/${metadata.filename}`
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
