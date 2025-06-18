// ==UserScript==
// @name         Intercept APEX AJAX
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Intercept and modify AJAX responses for a specific APEX endpoint
// @downloadURL  https://raw.githubusercontent.com/tcaruth/apex-documentation-userscript/refs/heads/main/script.js
// @match        *://*/ords*
// @author       Travis Caruth
// @grant        none
// ==/UserScript==

(async function() {
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
				initials: getInitials(cleanTitle),
				icon: '<span class="a-Spotlight-icon" aria-hidden="true"><span class="fa fa-question-circle-o" aria-hidden="true"></span></span>',
				url: url,
				path: `Documentation / ${currentPath}`,
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

	/**
	 * Get initials from a string (up to 2 characters)
	 * @param {string} str - Input string
	 * @returns {string} Initials (up to 2 characters)
	 */
	function getInitials(str) {
		if (!str) return '';
		
		// Remove any numbers and special characters
		const cleanStr = str.replace(/[0-9.()\[\]{}]/g, '').trim();
		
		// Split by spaces
		const words = cleanStr.split(' ').filter(word => word.length > 0);
		
		if (words.length === 0) return '';
		
		if (words.length === 1) {
			// For single words, take first two characters if possible
			return words[0].substring(0, 2).toUpperCase();
		}
		
		// For multiple words, take first character of first two words
		return (words[0][0] + words[1][0]).toUpperCase();
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
	
	console.log('Generated documentation objects:', docObjects);
	
	// Example object structure:
	// {
	// 	"name": "Travis Test",
	// 	"initials": "TC",
	// 	"icon": "<span class=\"a-Spotlight-icon\" aria-hidden=\"true\"><span class=\"a-Icon icon-shared-components\"></span></span>",
	// 	"url": "https://docs.oracle.com/en/database/oracle/apex/24.2/aeapi/toc.htm",
	// 	"path": "Documentation / Table of Contents",
	// 	"category": "APEX.SEARCH.DOC.TABLE_OF_CONTENTS",
	// 	"context": "app"
	// }

    const TARGET_URL = 'wwv_flow.ajax';
    const TARGET_REQUEST = 'APPLICATION_PROCESS%3DspotlightIndex';

    /**
     * Intercepts fetch requests to the target URL and allows modification of the JSON response.
     * @param {RequestInfo} input
     * @param {RequestInit} [init]
     * @returns {Promise<Response>}
     */
    const originalFetch = window.fetch;
    window.fetch = async function (input, init) {
		console.log('fetch initiated')
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes(TARGET_URL) && init && init.body && init.body.toString().includes('p_request=' + TARGET_REQUEST)) {
            const response = await originalFetch(input, init);
            const cloned = response.clone();
            const json = await cloned.json();

                        // --- MODIFY JSON RESPONSE HERE IF NEEDED ---
            /** @type {any} */
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
        this._isTargetUrl = (method.toUpperCase() === 'POST' && url.includes(TARGET_URL));
        this._interceptUrl = url;
        return originalOpen.call(this, method, url, ...rest);
    };

    /**
     * @this {InterceptXHR}
     */
    window.XMLHttpRequest.prototype.send = function (body) {
		console.log('xhr send')
        // Only intercept if it's our target URL and contains the specific request parameter
        if (this._isTargetUrl && body && body.toString().includes('p_request=' + TARGET_REQUEST)) {
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
						console.log({global:json.global})

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

})();