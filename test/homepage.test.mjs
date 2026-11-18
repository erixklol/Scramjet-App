import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { test } from "node:test";
const html = readFileSync("public/index.html", "utf8");
test("homepage preserves IDs, dependencies and attribution", () => {
	for (const id of [
		"sj-form",
		"sj-address",
		"sj-search-engine",
		"sj-error",
		"sj-error-code",
	])
		assert.equal(html.split('id="' + id + '"').length - 1, 1);
	for (const path of [
		"/scram/scramjet.all.js",
		"/baremux/index.js",
		"register-sw.js",
		"search.js",
		"index.js",
		"credits.html",
	])
		assert.ok(html.includes(path));
	assert.ok(
		html.includes(
			"Gurt's Browser — Powered by Scramjet, developed by Mercury Workshop."
		)
	);
});
for (const [input, expected] of [
	["hello world", "https://www.google.com/search?q=hello%20world"],
	["https://www.wikipedia.org/", "https://www.wikipedia.org/"],
])
	test("existing submit pipeline: " + input, async () => {
		let submit,
			registered = false,
			transport,
			destination,
			appended;
		const elements = {
			"sj-form": {
				addEventListener: (name, fn) => {
					assert.equal(name, "submit");
					submit = fn;
				},
			},
			"sj-address": { value: input },
			"sj-search-engine": { value: "https://www.google.com/search?q=%s" },
			"sj-error": {},
			"sj-error-code": {},
		};
		const context = vm.createContext({
			URL,
			document: {
				getElementById: (id) => elements[id],
				body: {
					appendChild: (frame) => {
						appended = frame;
					},
				},
			},
			location: { protocol: "https:", host: "browser.test" },
			registerSW: async () => {
				registered = true;
			},
			$scramjetLoadController: () => ({
				ScramjetController: class {
					init() {}
					createFrame() {
						return {
							frame: {},
							go: (url) => {
								destination = url;
							},
						};
					}
				},
			}),
			BareMux: {
				BareMuxConnection: class {
					async getTransport() {
						return null;
					}
					async setTransport(...args) {
						transport = args;
					}
				},
			},
		});
		vm.runInContext(readFileSync("public/search.js", "utf8"), context);
		vm.runInContext(readFileSync("public/index.js", "utf8"), context);
		let prevented = false;
		await submit({
			preventDefault() {
				prevented = true;
			},
		});
		assert.ok(prevented && registered);
		assert.equal(destination, expected);
		assert.equal(appended.id, "sj-frame");
		assert.equal(transport[0], "/libcurl/index.mjs");
		assert.equal(transport[1][0].websocket, "wss://browser.test/wisp/");
	});
