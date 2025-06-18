// ==UserScript==
// @name         APEX Documentation Spotlight Search
// @namespace    https://github.com/tcaruth
// @version      1.0
// @description  Intercept and modify spotlight search results in APEX to include PL/SQL documentation
// @downloadURL  https://raw.githubusercontent.com/tcaruth/apex-documentation-userscript/refs/heads/main/script.js
// @match        *://*/ords/r/*
// @run-at       document-end
// @author       Travis Caruth
// @grant        none
// @require      https://raw.githubusercontent.com/uzairfarooq/arrive/refs/heads/master/minified/arrive.min.js
// ==/UserScript==

(async function () {
	'use strict';

	const tocUrl = `https://raw.githubusercontent.com/tcaruth/apex-documentation-userscript/refs/heads/main/toc/${apex.env.APEX_BASE_VERSION}.js`
	const toc = await fetch(tocUrl)
	const tocText = await toc.text();
	// need to remove the `define()` wrapper. first 7 characters, and last 2 from the string
	const tocJson = JSON.parse(tocText.slice(7, -2));

	console.log(tocJson);

	/**
	 * Process the TOC and build an array of documentation objects
	 * @param {Array} topics - Array of topic objects from the TOC
	 * @param {string} [parentPath=''] - Path of parent topics
	 * @returns {Array} Array of documentation objects
	 */
	function processTocTopics(topics, parentPath = '') {
		if (!topics || !Array.isArray(topics)) {
			return [];
		}

		const results = [];

		topics.forEach(topic => {
			// Skip the index entry
			if (topic.title === 'Index') {
				return;
			}

			// Clean the title by removing HTML tags
			const cleanTitle = topic.title.replace(/<[^>]*>/g, '');

			// Build the path
			const currentPath = parentPath ? `${parentPath} / ${cleanTitle}` : cleanTitle;

			// Build the URL - make it absolute
			const baseUrl = 'https://docs.oracle.com/en/database/oracle/apex/' + apex.env.APEX_BASE_VERSION + '/aeapi/';
			const url = topic.href ? baseUrl + topic.href : '';

			// Create the doc object
			const docObject = {
				name: cleanTitle,
				icon: '<span class="a-Spotlight-icon" aria-hidden="true"><span class="a-Icon icon-help" aria-hidden="true"></span></span>',
				url: url,
				path: `PL/SQL Documentation / ${currentPath}`,
				category: 'APEX Documentation',
				context: 'app'
			};

			// Add to results
			results.push(docObject);

			// Process nested topics recursively
			if (topic.topics && Array.isArray(topic.topics)) {
				const nestedResults = processTocTopics(topic.topics, currentPath);
				results.push(...nestedResults);
			}
		});

		return results;
	}

	// Process the TOC and build the documentation objects
	const docObjects = [];

	// Check if tocJson has the expected structure
	if (tocJson && tocJson.toc && Array.isArray(tocJson.toc)) {
		tocJson.toc.forEach(section => {
			if (section.topics && Array.isArray(section.topics)) {
				const sectionResults = processTocTopics(section.topics);
				docObjects.push(...sectionResults);
			}
		});
	}

	/**
	 * Intercepts fetch requests to the target URL and allows modification of the JSON response.
	 * @param {RequestInfo} input
	 * @param {RequestInit} [init]
	 * @returns {Promise<Response>}
	 */
	const originalFetch = window.fetch;
	// Note that APEX uses XMLHttpRequest, not fetch as of 24.2, but this should future-proof in case they decide to switch in a minor patch
	window.fetch = async function (input, init) {
		console.log('fetch initiated')
		const url = typeof input === 'string' ? input : input.url;
		if (url.includes('wwv_flow.ajax') && init && init.body && init.body.toString().includes('p_request=APPLICATION_PROCESS%3DspotlightIndex')) {
			const response = await originalFetch(input, init);
			const cloned = response.clone();
			const json = await cloned.json();

			let newJson = json;
			// Add documentation objects to the global spotlight search results
			if (docObjects && docObjects.length > 0) {
				if (!newJson.global) {
					newJson.global = [];
				}
				newJson.global.push(...docObjects);
			}

			return new Response(JSON.stringify(newJson), {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers
			});
		}
		return originalFetch(input, init);
	};

	/**
	 * Intercepts XMLHttpRequest POSTs to the target URL and allows modification of the JSON response.
	 * @typedef {XMLHttpRequest & {
	 *   _intercept: boolean,
	 *   _isTargetUrl: boolean,
	 *   _interceptUrl: string
	 * }} InterceptXHR
	 */
	const originalOpen = window.XMLHttpRequest.prototype.open;
	const originalSend = window.XMLHttpRequest.prototype.send;

	/**
	 * @this {InterceptXHR}
	 */
	window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
		console.log('xhr open')
		this._intercept = false; // Will be set to true in send if it matches our criteria
		this._isTargetUrl = (method.toUpperCase() === 'POST' && url.includes('wwv_flow.ajax'));
		this._interceptUrl = url;
		return originalOpen.call(this, method, url, ...rest);
	};

	/**
	 * @this {InterceptXHR}
	 */
	window.XMLHttpRequest.prototype.send = function (body) {
		console.log('xhr send')
		// Only intercept if it's our target URL and contains the specific request parameter
		if (this._isTargetUrl && body && body.toString().includes('p_request=APPLICATION_PROCESS%3DspotlightIndex')) {
			this._intercept = true;
			this.addEventListener('readystatechange', function () {
				if (this.readyState === 4 && this.status === 200) {
					try {
						/** @type {any} */
						let json = JSON.parse(this.responseText);

						// Add documentation objects to the global spotlight search results
						if (docObjects && docObjects.length > 0) {
							if (!json.global) {
								json.global = [];
							}
							json.global.push(...docObjects);
						}

						const newResponse = JSON.stringify(json);

						// Redefine responseText and response (read-only, so use Object.defineProperty)
						Object.defineProperty(this, 'responseText', { value: newResponse });
						Object.defineProperty(this, 'response', { value: newResponse });
					} catch (e) {
						// If not JSON, do nothing
						console.error('not json' + e);
					}
				}
			});
		}
		return originalSend.call(this, body);
	};


	// Listen for search results to appear in the spotlight
	document.arrive('.ui-dialog--apexspotlight', { existing: true, onceOnly: true }, (el) => {
		console.log('search results appear')
		el.arrive('.a-Spotlight-result[data-category=apex_documentation]', { fireOnAttributesModification: true}, (result) => {
			/*
			<li id="sp-result-0" aria-selected="false" role="option" class="a-Spotlight-result a-Spotlight-result--page" data-category="apex_documentation" aria-label="Go to 43.4  GET_URL Function, Documentation / 43  APEX_PAGE / 43.4  GET_URL Function, Without alias, Without shortcut" data-index="0" is-visible="true">
				<span class="a-Spotlight-link" data-url="https://docs.oracle.com/en/database/oracle/apex/24.2/aeapi/GET_URL-Function.html#GUID-83A2A2A0-5B43-4A3E-BBD3-2FBD3B7B01CE">
					<span class="a-Spotlight-icon" aria-hidden="true"><span class="fa fa-question-circle-o" aria-hidden="true"></span></span>
					<span class="a-Spotlight-info">
					<span class="a-Spotlight-label" aria-hidden="true">43.4  <span class="a-Spotlight-highlight">GET_URL</span> Function</span>
					<span class="a-Spotlight-desc" aria-hidden="true">Documentation / 43  APEX_PAGE / 43.4  GET_URL Function</span>
					</span>
				</span>
			</li>
			*/
			console.log('spotlight result found. replacing with link')
			const url = result.querySelector('span.a-Spotlight-link').dataset.url
			const link = document.createElement('a')
			link.href = url
			link.target = '_blank'
			link.classList.add('a-Spotlight-link')
			link.innerHTML = result.querySelector('span.a-Spotlight-link').innerHTML
			result.querySelector('span.a-Spotlight-link').replaceWith(link)
		})
		document.querySelector('.a-Spotlight-input')?.addEventListener('keydown', (e) => {
			console.log('keydown on spotlight input', e.key)
			if (e.key === 'Enter') {
				e.preventDefault()
				const activeLink = document.querySelector('.a-Spotlight-result[data-category=apex_documentation].is-active:has(a.a-Spotlight-link)')
				if (activeLink) {
					activeLink.querySelector('a.a-Spotlight-link')?.click()
				}
			}
		})
	})
})();