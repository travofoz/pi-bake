import { a as unsubscribe_stores, n as ensure_array_like, t as derived, v as attr, y as escape_html } from "../../chunks/server.js";
import "../../chunks/stores.js";
//#region src/lib/gallery.js
/**
* Filter gallery entries by tag (case-insensitive) and/or search text (in caption/id/tags).
*
* @param {GalleryEntry[]} entries
* @param {object} filters
* @param {string} [filters.tagFilter]
* @param {string} [filters.searchQuery]
* @returns {GalleryEntry[]}
*/
function filterGallery(entries, filters = {}) {
	let result = [...entries];
	if (filters.tagFilter) {
		const tag = filters.tagFilter.toLowerCase();
		result = result.filter((e) => e.tags.some((t) => t.toLowerCase() === tag));
	}
	if (filters.searchQuery) {
		const q = filters.searchQuery.toLowerCase();
		result = result.filter((e) => e.id.toLowerCase().includes(q) || e.caption.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q)));
	}
	return result;
}
//#endregion
//#region src/routes/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		var $$store_subs;
		/** @type {import('$lib/gallery.js').GalleryEntry[]} */
		let entries = [];
		let tagFilter = "";
		let searchQuery = "";
		let copiedId = "";
		let allTags = derived(() => [...new Set(entries.flatMap((e) => e.tags))].sort());
		let filteredEntries = derived(() => filterGallery(entries, {
			tagFilter: void 0,
			searchQuery: void 0
		}));
		function formatDate(iso) {
			try {
				return new Date(iso).toLocaleDateString(void 0, {
					year: "numeric",
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit"
				});
			} catch {
				return iso;
			}
		}
		$$renderer.push(`<div class="space-y-6"><div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"><h2 class="text-2xl font-bold">Gallery</h2> <div class="flex gap-2"><button class="btn btn-ghost btn-sm">Refresh</button></div></div> <div class="collapse collapse-arrow bg-base-100 border border-base-300"><input type="checkbox"/> <div class="collapse-title font-medium">Upload Image</div> <div class="collapse-content">`);
		$$renderer.push("<!--[0-->");
		$$renderer.push(`<div class="flex items-center justify-center w-full"><label for="file-upload" class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-base-200"><div class="flex flex-col items-center justify-center pt-5 pb-6"><svg class="w-8 h-8 mb-2 text-base-content/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg> <p class="mb-2 text-sm text-base-content/50"><span class="font-semibold">Click to select</span> or drag and drop</p> <p class="text-xs text-base-content/40">PNG, JPG, JPEG, GIF, WebP</p></div> <input id="file-upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="hidden"/></label></div>`);
		$$renderer.push(`<!--]--></div></div> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <div class="flex flex-col sm:flex-row gap-3"><div class="flex-1"><input type="text"${attr("value", searchQuery)} placeholder="Search by caption, id, or tag..." class="input input-bordered input-sm w-full"/></div> <div class="w-full sm:w-48">`);
		$$renderer.select({
			value: tagFilter,
			class: "select select-bordered select-sm w-full"
		}, ($$renderer) => {
			$$renderer.option({ value: "" }, ($$renderer) => {
				$$renderer.push(`All tags`);
			});
			$$renderer.push(`<!--[-->`);
			const each_array = ensure_array_like(allTags());
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let tag = each_array[$$index];
				$$renderer.option({ value: tag }, ($$renderer) => {
					$$renderer.push(`${escape_html(tag)}`);
				});
			}
			$$renderer.push(`<!--]-->`);
		});
		$$renderer.push(`</div></div> `);
		if (filteredEntries().length === 0) {
			$$renderer.push("<!--[2-->");
			$$renderer.push(`<div class="text-center py-12 text-base-content/50"><p class="text-lg">`);
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`No images yet. Upload one above!`);
			$$renderer.push(`<!--]--></p></div>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"><!--[-->`);
			const each_array_1 = ensure_array_like(filteredEntries());
			for (let $$index_2 = 0, $$length = each_array_1.length; $$index_2 < $$length; $$index_2++) {
				let entry = each_array_1[$$index_2];
				$$renderer.push(`<div class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow"><figure class="px-3 pt-3"><img${attr("src", entry.rawUrl)}${attr("alt", entry.caption || entry.id)} class="rounded object-cover w-full h-40" loading="lazy"/></figure> <div class="card-body p-3"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><p class="card-title text-sm truncate"${attr("title", entry.id)}>${escape_html(entry.caption || entry.id)}</p> <p class="text-xs text-base-content/50">${escape_html(entry.type)} · ${escape_html(entry.width)}×${escape_html(entry.height)}</p> <p class="text-xs text-base-content/40">${escape_html(formatDate(entry.createdAt))}</p></div></div> `);
				if (entry.tags.length > 0) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<div class="flex flex-wrap gap-1 mt-1"><!--[-->`);
					const each_array_2 = ensure_array_like(entry.tags);
					for (let $$index_1 = 0, $$length = each_array_2.length; $$index_1 < $$length; $$index_1++) {
						let tag = each_array_2[$$index_1];
						$$renderer.push(`<span class="badge badge-sm badge-ghost">${escape_html(tag)}</span>`);
					}
					$$renderer.push(`<!--]--></div>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--> <div class="flex gap-1 mt-2"><button class="btn btn-ghost btn-xs" title="Copy raw URL">${escape_html(copiedId === entry.rawUrl ? "Copied!" : "Copy Link")}</button> <a${attr("href", entry.rawUrl)} target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-xs">Open</a></div></div></div>`);
			}
			$$renderer.push(`<!--]--></div>`);
		}
		$$renderer.push(`<!--]--></div>`);
		if ($$store_subs) unsubscribe_stores($$store_subs);
	});
}
//#endregion
export { _page as default };
