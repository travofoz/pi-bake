/**
 * Client-side image upload processing and GitHub commit.
 *
 * Design choice: The gallery reads images by fetching the /images/ directory listing
 * + each JSON metadata file directly via the GitHub API (option b from the spec).
 * This was chosen over option a (GitHub Action rebuilding index.json on push) because:
 * - Zero CI complexity — works immediately on any repo
 * - No Action workflow to maintain for gallery data
 * - Acceptable for the target scale (single user, moderate traffic)
 * - The per-image JSON pattern already gives git-history rollback per image
 *
 * If rate limits become an issue at scale, a GitHub Action could be added later
 * to rebuild a single index.json — the data model supports either approach.
 */

import { putBinaryFile, putFile, getDefaultBranch, rawFileUrl } from './github.js';

/**
 * Generate a short random suffix (6 alphanumeric chars) for unique IDs.
 * @returns {string}
 */
function randomSuffix() {
	return Math.random().toString(36).substring(2, 8);
}

/**
 * Generate a unique image ID in the format YYYY-MM-DD-xxxxxx.
 * @returns {string}
 */
export function generateImageId() {
	const now = new Date();
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}-${randomSuffix()}`;
}

/**
 * Fallback image decoder using a DOM Image element.
 * More robust for certain JPEG variants than createImageBitmap.
 *
 * @param {Blob|File} blob
 * @returns {Promise<{width: number, height: number}>}
 */
function decodeViaImageElement(blob) {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve({ width: img.naturalWidth, height: img.naturalHeight });
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to decode image'));
		};
		img.src = url;
	});
}

/**
 * Resize an image to fit within maxDimension (longest edge) using Canvas API.
 * Preserves aspect ratio. Returns the processed blob and its dimensions.
 *
 * @param {File} file - The image file
 * @param {number} maxDimension - Max width or height in pixels (default 2000)
 * @param {number} quality - JPEG/WebP quality 0-1 (default 0.85)
 * @returns {Promise<{blob: Blob|File, width: number, height: number}>}
 */
export async function resizeImage(file, maxDimension = 2000, quality = 0.85) {
	// For GIFs, skip resize entirely
	if (file.type === 'image/gif') {
		const dims = await decodeViaImageElement(file);
		return { blob: file, ...dims };
	}

	let img;
	try {
		img = await createImageBitmap(file);
	} catch {
		// Fallback for JPEGs that createImageBitmap can't decode
		const dims = await decodeViaImageElement(file);
		return { blob: file, ...dims };
	}

	let { width, height } = img;

	if (width <= maxDimension && height <= maxDimension) {
		img.close();
		return { blob: file, width, height };
	}

	// Scale down so longest edge = maxDimension
	if (width > height) {
		height = Math.round(height * (maxDimension / width));
		width = maxDimension;
	} else {
		width = Math.round(width * (maxDimension / height));
		height = maxDimension;
	}

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

	ctx.drawImage(img, 0, 0, width, height);
	img.close();

	const blob = await new Promise((resolve, reject) => {
		canvas.toBlob(
			(b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')),
			'image/jpeg',
			quality
		);
	});

	return { blob, width, height };
}

/**
 * Read a blob as base64 string (without data: URL prefix).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = /** @type {string} */ (reader.result);
			// Strip the "data:image/xxx;base64," prefix
			const base64 = result.split(',')[1];
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

/**
 * Build the metadata JSON for an image entry.
 *
 * @param {string} id
 * @param {string} filename
 * @param {'image'|'gif'} type
 * @param {string[]} tags
 * @param {string} caption
 * @param {number} width
 * @param {number} height
 * @param {object|null} annotations
 * @param {string[]|null} sourceSlideIds
 * @returns {string}
 */
export function buildMetadata(id, filename, type, tags, caption, width, height, annotations, sourceSlideIds) {
	return JSON.stringify(
		{
			id,
			filename,
			type,
			createdAt: new Date().toISOString(),
			tags,
			caption,
			width,
			height,
			annotations: annotations || null,
			sourceSlideIds: sourceSlideIds || null
		},
		null,
		2
	);
}

/**
 * Upload an image file to GitHub: commit the image + its JSON metadata together.
 *
 * @param {import('octokit').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {File} file - The image file to upload
 * @param {object} options
 * @param {string[]} [options.tags]
 * @param {string} [options.caption]
 * @returns {Promise<{ id: string, imageUrl: string }>}
 */
export async function uploadImage(octokit, owner, repo, file, options = {}) {
	const { tags = [], caption = '' } = options;
	const id = generateImageId();
	const ext = file.name.split('.').pop() || 'png';
	const filename = `${id}.${ext}`;
	const jsonFilename = `${id}.json`;
	const imagePath = `images/${filename}`;
	const jsonPath = `images/${jsonFilename}`;

	// Resize/compress and get dimensions
	const { blob: processedBlob, width, height } = await resizeImage(file);
	const base64 = await blobToBase64(processedBlob);

	const branch = await getDefaultBranch(octokit, owner, repo);

	// Commit image file first
	const imageResult = await putBinaryFile(
		octokit, owner, repo, imagePath, base64,
		`Upload ${filename}`
	);

	// Build and commit metadata JSON
	const metadata = buildMetadata(id, filename, 'image', tags, caption, width, height, null, null);
	const jsonResult = await putFile(
		octokit, owner, repo, jsonPath, metadata,
		`Add metadata for ${filename}`
	);

	const imageUrl = rawFileUrl(owner, repo, branch, imagePath);

	return { id, imageUrl };
}
