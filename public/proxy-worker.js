/* Profile-scoped BareMux relay. Credentials exist only in a disposable worker. */
let transport = null;
let mode = "default";
let generation = 0;
let engineName;
// SharedWorker scopes cannot construct dedicated Workers in Chromium.
// Ask a connected homepage to create a disposable SharedWorker, then transfer its port.
class TransportWorker {
	constructor() {
		this.queue = [];
		this.port = null;
	}
	postMessage(data, transfers = []) {
		if (this.port) this.port.postMessage(data, transfers);
		else this.queue.push([data, transfers]);
	}
	attach(port) {
		this.port = port;
		for (const [data, transfers] of this.queue)
			port.postMessage(data, transfers);
		this.queue = [];
	}
	terminate() {
		this.queue = [];
		this.port?.postMessage({ shutdown: true });
		this.port?.close();
		this.port = null;
	}
}
const owners = new Map();
const pending = new Map();
const safeError =
	"Connection failed. Check proxy address, credentials, provider access rules and availability.";
function transfer(message) {
	const list = [message.port];
	if (message.message.fetch?.body) list.push(message.message.fetch.body);
	if (message.message.websocket?.channel)
		list.push(message.message.websocket.channel);
	return list;
}
function publish() {
	for (const port of owners.keys()) port.postMessage({ mode, generation });
}
function destroy() {
	transport?.terminate();
	transport = null;
	for (const [port, cleanup] of pending) {
		cleanup();
		try {
			port.postMessage({
				type: "error",
				error: new Error("Connection changed. Reload the destination."),
			});
		} catch {}
	}
	pending.clear();
}
function start(args, owner = owners.keys().next().value) {
	destroy();
	generation++;
	transport = new TransportWorker();
	transport.postMessage({ configure: args });
	mode = args.proxy ? "custom" : "default";
	engineName =
		"gurt-transport-" + Date.now() + "-" + Math.random().toString(36).slice(2);
	// Every homepage owns a handle, so closing the creator tab cannot kill a shared session.
	for (const page of owners.keys())
		page.postMessage({ spawn: generation, engineName, attach: page === owner });
	publish();
}
function reset() {
	if (!owners.size) {
		destroy();
		mode = "default";
		generation++;
		return;
	}
	start({
		websocket:
			(location.protocol === "https:" ? "wss://" : "ws://") +
			location.host +
			"/wisp/",
	});
}
self.onconnect = ({ ports: [port] }) => {
	port.onmessage = ({ data }) => {
		if (data.engine) {
			if (
				owners.has(port) &&
				data.generation === generation &&
				transport &&
				!transport.port
			)
				transport.attach(data.engine);
			else {
				data.engine.postMessage({ shutdown: true });
				data.engine.close();
			}
			return;
		}
		if (data.control === "join") {
			const joined = owners.has(port);
			owners.set(port, Date.now());
			if (!transport) reset();
			else if (!joined)
				port.postMessage({ spawn: generation, engineName, attach: false });
			port.postMessage({ mode, generation });
			return;
		}
		if (data.control === "heartbeat") {
			if (owners.has(port)) owners.set(port, Date.now());
			return;
		}
		if (data.control === "leave") {
			owners.delete(port);
			if (!owners.size) reset();
			return;
		}
		const { message, port: reply } = data;
		if (!message || !reply) return;
		if (message.type === "ping") {
			reply.postMessage({ type: "pong" });
			return;
		}
		if (message.type === "get") {
			reply.postMessage({ type: "get", name: "/libcurl/index.mjs" });
			return;
		}
		if (message.type === "set") {
			// BareMux setTransport uses a dynamic import string. Never evaluate supplied code here.
			const args = message.client?.args?.[0];
			const expected =
				(location.protocol === "https:" ? "wss://" : "ws://") +
				location.host +
				"/wisp/";
			if (
				!owners.size ||
				args?.websocket !== expected ||
				(args.proxy && !/^(http|socks5h|socks4a):\/\//.test(args.proxy))
			) {
				reply.postMessage({
					type: "error",
					error: new Error("Invalid connection settings."),
				});
				return;
			}
			start({
				websocket: expected,
				...(args.proxy ? { proxy: args.proxy } : {}),
			});
			reply.postMessage({ type: "set" });
			return;
		}
		if (!owners.size) {
			reply.postMessage({
				type: "error",
				error: new Error("Session ended. Reopen Gurt's Browser."),
			});
			return;
		}
		if (!transport) reset();
		// A relay port lets us abort outstanding requests when the mode changes.
		const channel = new MessageChannel();
		const captured = generation;
		const timeout = setTimeout(() => {
			pending.delete(reply);
			channel.port1.close();
			reply.postMessage({ type: "error", error: new Error(safeError) });
		}, 30000);
		const cleanup = () => {
			clearTimeout(timeout);
			channel.port1.close();
		};
		pending.set(reply, cleanup);
		channel.port1.onmessage = ({ data: result }) => {
			clearTimeout(timeout);
			pending.delete(reply);
			if (captured !== generation) return;
			if (result.type === "error") {
				const code = /error code (\d{1,3})\b/.exec(
					String(result.error?.message || "")
				)?.[1];
				result = {
					type: "error",
					error: new Error(
						safeError + (code ? " Transport code " + code + "." : "")
					),
				};
			}
			const transfers = [];
			if (
				result.fetch?.body instanceof ArrayBuffer ||
				result.fetch?.body instanceof ReadableStream
			)
				transfers.push(result.fetch.body);
			reply.postMessage(result, transfers);
			channel.port1.close();
		};
		const request = { message, port: channel.port2 };
		transport.postMessage(request, transfer(request));
	};
	port.start();
};
// Crashed/abandoned pages cannot leave a credential-bearing worker alive indefinitely.
// Sleeping/background-throttled pages may expire: fail closed by removing their frames on resume.
setInterval(() => {
	const now = Date.now();
	for (const [port, last] of owners)
		if (now - last > 120000) owners.delete(port);
	if (!owners.size && mode === "custom") reset();
}, 15000);
