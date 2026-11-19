export function parseProxy(raw) {
	let url;
	try {
		url = new URL(raw.trim().replace(/^socks5:/i, "socks5h:"));
	} catch {
		throw new Error("Enter a complete HTTP, SOCKS5 or SOCKS4a proxy URL.");
	}
	if (!["http:", "socks5h:", "socks4a:"].includes(url.protocol))
		throw new Error(
			"Supported schemes: http, socks5 and socks4a. HTTPS websites can use an HTTP CONNECT proxy."
		);
	const port = url.port || (url.protocol === "http:" ? "80" : "");
	if (
		!url.hostname ||
		!/^\d+$/.test(port) ||
		Number(port) > 65535 ||
		Number(port) < 1
	)
		throw new Error("Enter a host and a port between 1 and 65535.");
	if ((url.pathname && url.pathname !== "/") || url.search || url.hash)
		throw new Error("Proxy URLs cannot contain a path, query or fragment.");
	if (url.protocol === "socks4a:" && url.password)
		throw new Error(
			"SOCKS4a does not support password authentication. Use SOCKS5 or HTTP."
		);
	try {
		decodeURIComponent(url.username);
		decodeURIComponent(url.password);
	} catch {
		throw new Error("Invalid credential encoding.");
	}
	return url.href.replace(/\/$/, "");
}
export function manualProxy({ protocol, host, port, username, password }) {
	if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
		throw new Error("Enter a port between 1 and 65535.");
	if (/[\s/@?#]/.test(host))
		throw new Error("Enter only the proxy hostname or bracketed IPv6 address.");
	const auth =
		username || password
			? encodeURIComponent(username) + ":" + encodeURIComponent(password) + "@"
			: "";
	return parseProxy(protocol + "://" + auth + host + ":" + port);
}
