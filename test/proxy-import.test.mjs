import { test } from "node:test";
import assert from "node:assert/strict";
import { importProxy } from "../public/proxy-config.js";
for (const input of [
	"user:pass@proxy.test:1080",
	"proxy.test:1080:user:pass",
	"socks5://user:pass@proxy.test:1080",
	"socks5h://user:pass@proxy.test:1080",
	"http://user:pass@proxy.test:1080",
	"proxy.test:1080",
])
	test("import " + input, () => {
		const d = importProxy(input, "http");
		assert.equal(d.host, "proxy.test");
		assert.equal(d.port, "1080");
		assert.equal(d.protocol, input.startsWith("socks") ? "socks5h" : "http");
		assert.equal(d.password, input === "proxy.test:1080" ? "" : "pass");
	});
test("encoded and special credentials", () => {
	assert.equal(importProxy("u%40x:p%3A%23%25@host.test:80").username, "u@x");
	assert.equal(importProxy("u%40x:p%3A%23%25@host.test:80").password, "p:#%");
	assert.equal(importProxy("user:p:a#ss@host.test:1080").password, "p:a#ss");
});
test("invalid input is rejected without exposing credentials", () => {
	for (const s of [
		"u:secret@host:0",
		"host:65536",
		"host:no",
		"u:%ZZ@host:1080",
		"https://host:80",
		"host:80/path",
	])
		assert.throws(
			() => importProxy(s),
			(e) => !e.message.includes("secret")
		);
});
