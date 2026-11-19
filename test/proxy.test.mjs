import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parseProxy, manualProxy } from "../public/proxy-config.js";
test("proxy parsing and credential encoding", () => {
	assert.equal(parseProxy("http://proxy.test:80"), "http://proxy.test");
	assert.equal(
		parseProxy("socks5://user:pass@proxy.test:1080"),
		"socks5h://user:pass@proxy.test:1080"
	);
	assert.equal(
		manualProxy({
			protocol: "http",
			host: "proxy.test",
			port: "8080",
			username: "a@b",
			password: "p:#",
		}),
		"http://a%40b:p%3A%23@proxy.test:8080"
	);
	for (const input of [
		"https://proxy.test:8080",
		"socks4a://u:p@proxy.test:1080",
		"http://proxy.test:99999",
		"http://proxy.test:8080/path",
		"not a proxy",
	])
		assert.throws(() => parseProxy(input));
});
function profile() {
	const workers = [];
	let expiry;
	let now = Date.now();
	class FakeWorker {
		constructor() {
			this.messages = [];
			workers.push(this);
		}
		postMessage(m) {
			this.messages.push(m);
		}
		terminate() {
			this.terminated = true;
			this.messages = [];
		}
	}
	const context = vm.createContext({
		self: {},
		Worker: FakeWorker,
		MessageChannel,
		ReadableStream,
		ArrayBuffer,
		Error,
		Date: { now: () => now },
		setTimeout,
		clearTimeout,
		location: { protocol: "https:", host: "browser.test" },
		setInterval: (fn) => {
			expiry = fn;
		},
	});
	vm.runInContext(readFileSync("public/proxy-worker.js", "utf8"), context);
	function port() {
		const p = {
			messages: [],
			start() {},
			postMessage(m) {
				this.messages.push(m);
				if (m.spawn && m.attach) {
					const engine = {
						messages: [],
						postMessage(data) {
							if (data.shutdown) {
								this.terminated = true;
								this.messages = [];
							} else this.messages.push(data);
						},
						close() {},
					};
					workers.push(engine);
					p.onmessage({ data: { engine, generation: m.spawn } });
				}
			},
		};
		context.self.onconnect({ ports: [p] });
		return p;
	}
	const send = (p, data) => p.onmessage({ data });
	return {
		workers,
		port,
		send,
		expiry,
		advance: (ms) => {
			now += ms;
			expiry();
		},
	};
}
test("profile shares changes; separate profile stays default; reset terminates credential worker", () => {
	const a = profile(),
		b = profile();
	const one = a.port(),
		two = a.port(),
		other = b.port();
	a.send(one, { control: "join" });
	a.send(two, { control: "join" });
	b.send(other, { control: "join" });
	const reply = { postMessage() {} };
	a.send(one, {
		message: {
			type: "set",
			client: {
				args: [
					{
						websocket: "wss://browser.test/wisp/",
						proxy: "socks5h://fixture:secret@proxy.test:1080",
					},
				],
			},
		},
		port: reply,
	});
	assert.equal(one.messages.at(-1).mode, "custom");
	assert.equal(two.messages.at(-1).mode, "custom");
	assert.equal(other.messages.at(-1).mode, "default");
	assert.ok(a.workers[0].terminated);
	assert.ok(!JSON.stringify(two.messages).includes("secret"));
	const custom = a.workers.at(-1);
	a.send(one, { control: "leave" });
	assert.ok(!custom.terminated);
	a.send(two, { control: "leave" });
	assert.ok(custom.terminated);
	assert.equal(custom.messages.length, 0);
});
test("mode replacement happens even for the same transport path", () => {
	const a = profile(),
		p = a.port();
	a.send(p, { control: "join" });
	const reply = { postMessage() {} };
	for (let i = 0; i < 2; i++)
		a.send(p, {
			message: {
				type: "set",
				client: {
					args: [
						{
							websocket: "wss://browser.test/wisp/",
							proxy: "http://proxy.test:8080",
						},
					],
				},
			},
			port: reply,
		});
	assert.equal(a.workers.length, 3);
	assert.ok(a.workers[1].terminated);
});
test("adapter patches upstream WebSocket options without removing original license", () => {
	const source = readFileSync(
		"node_modules/@mercuryworkshop/libcurl-transport/dist/index.mjs",
		"utf8"
	);
	assert.equal(source.split("headers: requestHeaders\n    });").length, 2);
	assert.ok(source.includes("proxy: this.proxy"));
});

test("abandoned profile expires credentials and rejoins using default", () => {
	const a = profile(),
		p = a.port();
	a.send(p, { control: "join" });
	a.send(p, {
		message: {
			type: "set",
			client: {
				args: [
					{
						websocket: "wss://browser.test/wisp/",
						proxy: "http://fixture:secret@proxy.test:8080",
					},
				],
			},
		},
		port: { postMessage() {} },
	});
	const custom = a.workers.at(-1);
	a.advance(120001);
	assert.ok(custom.terminated);
	a.send(p, { control: "join" });
	assert.equal(p.messages.at(-1).mode, "default");
	assert.equal(a.workers.at(-1).messages[0].configure.proxy, undefined);
});

test("errors redact credentials, retain custom mode and cancel outstanding requests on reset", async () => {
	const a = profile(),
		p = a.port();
	a.send(p, { control: "join" });
	const set = (proxy) =>
		a.send(p, {
			message: {
				type: "set",
				client: {
					args: [
						{
							websocket: "wss://browser.test/wisp/",
							...(proxy ? { proxy } : {}),
						},
					],
				},
			},
			port: { postMessage() {} },
		});
	set("http://fixture:secret@proxy.test:8080");
	const replies = [];
	const request = () =>
		a.send(p, {
			message: {
				type: "fetch",
				fetch: {
					remote: "https://destination.test/",
					method: "GET",
					headers: {},
				},
			},
			port: { postMessage: (m) => replies.push(m) },
		});
	request();
	a.workers
		.at(-1)
		.messages.at(-1)
		.port.postMessage({
			type: "error",
			error: new Error("http://fixture:secret@proxy.test:8080 error code 67"),
		});
	await new Promise((resolve) => setTimeout(resolve, 20));
	assert.equal(replies.length, 1);
	assert.ok(!replies[0].error.message.includes("secret"));
	assert.ok(replies[0].error.message.includes("Transport code 67"));
	assert.equal(p.messages.at(-1).mode, "custom");
	request();
	set(null);
	assert.equal(replies.length, 2);
	assert.match(replies[1].error.message, /Connection changed/);
	assert.equal(p.messages.at(-1).mode, "default");
});

test("installed CurlTransport sends the same proxy to HTTPS and WebSocket connections", async () => {
	const source = readFileSync(
		"node_modules/@mercuryworkshop/libcurl-transport/dist/index.mjs",
		"utf8"
	);
	const patched = source.replace(
		"headers: requestHeaders\n    });",
		"headers: requestHeaders, proxy: this.proxy\n    });"
	);
	let httpOptions, socketOptions;
	const context = vm.createContext({
		URL,
		console: { log() {} },
		libcurl: {
			ready: true,
			version: { lib: "fixture" },
			set_websocket() {},
			HTTPSession: class {
				constructor(options) {
					httpOptions = options;
				}
			},
			WebSocket: class {
				constructor(_url, _protocols, options) {
					socketOptions = options;
				}
			},
		},
	});
	vm.runInContext(
		patched
			.slice(patched.lastIndexOf("var LibcurlClient = class"))
			.replace(/export \{[\s\S]*$/, "globalThis.Client = LibcurlClient;"),
		context
	);
	const proxy = "socks5h://fixture:secret@proxy.test:1080";
	const client = new context.Client({
		websocket: "wss://browser.test/wisp/",
		proxy,
	});
	await client.init();
	client.connect(new URL("wss://destination.test/"), [], {
		Origin: "https://destination.test",
	});
	assert.equal(httpOptions.proxy, proxy);
	assert.equal(socketOptions.proxy, proxy);
	assert.equal(socketOptions.headers.Origin, "https://destination.test");
});
