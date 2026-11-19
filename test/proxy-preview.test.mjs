import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { manualProxy, importProxy } from "../public/proxy-config.js";
for (const fail of [false, true])
	test(
		"isolated entered-proxy test " + (fail ? "failure" : "success"),
		async () => {
			const elements = new Map();
			const $ = (id) => {
				if (!elements.has(id))
					elements.set(id, {
						value: "",
						textContent: "",
						addEventListener() {},
						querySelectorAll() {
							return [];
						},
					});
				return elements.get(id);
			};
			const workers = [];
			let changes = 0;
			class SharedWorker {
				constructor(path) {
					this.path = path;
					this.messages = [];
					this.port = {
						start() {},
						close() {},
						postMessage: (data) => {
							this.messages.push(data);
							if (data.message?.type === "fetch") {
								setTimeout(
									() =>
										data.port.postMessage(
											fail
												? {
														type: "error",
														error: new Error("secret password error code 67"),
													}
												: {
														type: "fetch",
														fetch: {
															status: 200,
															body: new TextEncoder().encode(
																'{"ip":"203.0.113.5"}'
															).buffer,
														},
													}
										),
									5
								);
							}
						},
					};
					workers.push(this);
				}
			}
			const context = vm.createContext({
				document: { getElementById: $, addEventListener() {} },
				window: { addEventListener() {} },
				SharedWorker,
				MessageChannel,
				Response,
				crypto: { randomUUID: () => "fixture" },
				location: { protocol: "https:", host: "browser.test" },
				setInterval: () => 0,
				clearInterval() {},
				setTimeout,
				clearTimeout,
				importProxy,
				manualProxy,
			});
			vm.runInContext(
				readFileSync("public/proxy-settings.js", "utf8")
					.replace(/^import.*\n/, "")
					.replace("export function", "function") +
					"\nglobalThis.init=initProxySettings;",
				context
			);
			context.init({
				setTransport() {
					changes++;
				},
			});
			$("proxy-choice").value = "custom";
			$("proxy-protocol").value = "socks5h";
			$("proxy-host").value = "proxy.test";
			$("proxy-port").value = "1080";
			$("proxy-user").value = "fixture";
			$("proxy-password").value = "secret";
			await $("proxy-test").onclick();
			assert.equal(changes, 0);
			assert.equal(workers.length, 2);
			assert.equal(
				workers[1].messages[0].configure.proxy,
				"socks5h://fixture:secret@proxy.test:1080"
			);
			assert.equal(workers[1].messages.at(-1).shutdown, true);
			assert.ok(!$("proxy-status").textContent.includes("secret"));
			assert.match(
				$("proxy-status").textContent,
				fail ? /Transport code 67/ : /203\.0\.113\.5/
			);
		}
	);
