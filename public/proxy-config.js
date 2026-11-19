export function importProxy(raw, selectedProtocol = "socks5h") {
	try {
		let text = raw.trim();
		let protocol = selectedProtocol;
		const scheme = /^([a-z0-9]+):\/\//i.exec(text);
		if (scheme) {
			protocol = scheme[1].toLowerCase();
			text = text.slice(scheme[0].length);
		}
		if (protocol === "socks5") protocol = "socks5h";
		let host,
			port,
			username = "",
			password = "";
		const at = text.lastIndexOf("@");
		if (at >= 0) {
			const auth = text.slice(0, at),
				colon = auth.indexOf(":");
			username = colon < 0 ? auth : auth.slice(0, colon);
			password = colon < 0 ? "" : auth.slice(colon + 1);
			text = text.slice(at + 1);
		}
		const parts = /^(\[[^\]]+\]|[^:\s]+):(\d+)(?::([^:]*):(.*))?$/.exec(text);
		if (
			!parts ||
			(at >= 0 && parts[3] !== undefined) ||
			(scheme && parts[3] !== undefined)
		)
			throw new Error();
		[, host, port] = parts;
		if (parts[3] !== undefined) {
			username = parts[3];
			password = parts[4];
		}
		const details = {
			protocol,
			host,
			port,
			username: decodeURIComponent(username),
			password: decodeURIComponent(password),
		};
		manualProxy(details);
		return details;
	} catch {
		throw new Error(
			"Invalid proxy details. Check the format, credentials encoding and port (1–65535)."
		);
	}
}

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
