import { importProxy, manualProxy } from "./proxy-config.js";
export function initProxySettings(connection) {
	const $ = (id) => document.getElementById(id);
	const control = new SharedWorker("/proxy-worker.js?v=1", "bare-mux-worker");
	let resolveReady;
	const ready = new Promise((resolve) => {
		resolveReady = resolve;
	});
	let generation = null,
		mode = "default",
		busy = false;
	let engine;
	let testWorker;
	const stopTest = () => {
		testWorker?.port.postMessage({ shutdown: true });
		testWorker?.port.close();
		testWorker = null;
	};
	const status = (text) => ($("proxy-status").textContent = text);
	const clear = () => {
		for (const id of [
			"proxy-url",
			"proxy-host",
			"proxy-port",
			"proxy-user",
			"proxy-password",
		])
			$(id).value = "";
	};
	const fields = {
		protocol: "proxy-protocol",
		host: "proxy-host",
		port: "proxy-port",
		username: "proxy-user",
		password: "proxy-password",
	};
	const configuredProxy = () =>
		manualProxy(
			Object.fromEntries(
				Object.entries(fields).map(([key, id]) => [key, $(id).value])
			)
		);
	const importDetails = () => {
		if (!$("proxy-url").value.trim()) return;
		try {
			const details = importProxy(
				$("proxy-url").value,
				$("proxy-protocol").value
			);
			for (const [key, id] of Object.entries(fields))
				$(id).value = details[key];
			status("Proxy details imported");
		} catch (error) {
			status(error.message);
		}
	};
	$("proxy-url").addEventListener("input", importDetails);
	$("proxy-url").addEventListener("paste", () => setTimeout(importDetails, 0));
	const heartbeat = () => control.port.postMessage({ control: "heartbeat" });
	control.port.onmessage = ({ data }) => {
		if (data.spawn) {
			engine?.port.close();
			engine = new SharedWorker("/proxy-transport-worker.js", data.engineName);
			if (data.attach)
				control.port.postMessage(
					{ engine: engine.port, generation: data.spawn },
					[engine.port]
				);
			return;
		}
		mode = data.mode;
		$("proxy-mode").textContent = mode === "custom" ? "Custom" : "Default";
		if (generation !== data.generation) {
			document.getElementById("sj-frame")?.remove();
			status(
				mode === "custom"
					? "Custom transport selected. Test the connection before browsing."
					: "Default restored. Existing browsing frames were closed."
			);
			clear();
		}
		generation = data.generation;
		resolveReady();
	};
	control.port.start();
	control.port.postMessage({ control: "join" });
	const timer = setInterval(heartbeat, 15000);
	window.addEventListener("pagehide", () => {
		clear();
		clearInterval(timer);
		stopTest();
		control.port.postMessage({ control: "leave" });
		control.port.close();
		engine?.port.close();
	});
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) location.reload();
	});
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) control.port.postMessage({ control: "join" });
	});
	$("proxy-choice").onchange = () => {
		$("proxy-fields").disabled = $("proxy-choice").value !== "custom";
		clear();
	};
	const setBusy = (value) => {
		busy = value;
		for (const button of $("proxy-form").querySelectorAll("button"))
			button.disabled =
				value && !["proxy-reset", "proxy-disconnect"].includes(button.id);
	};
	async function apply(proxy) {
		setBusy(true);
		try {
			await connection.setTransport("/libcurl/index.mjs", [
				{
					websocket:
						(location.protocol === "https:" ? "wss://" : "ws://") +
						location.host +
						"/wisp/",
					...(proxy ? { proxy } : {}),
				},
			]);
			clear();
		} catch {
			status(
				"Could not change connection. Close all Gurt's Browser tabs and reopen before continuing."
			);
		} finally {
			setBusy(false);
		}
	}
	$("proxy-form").onsubmit = (event) => {
		event.preventDefault();
		if (busy) return;
		try {
			const proxy =
				$("proxy-choice").value === "default" ? null : configuredProxy();
			void apply(proxy);
		} catch (error) {
			status(error.message);
		}
	};
	const reset = () => {
		stopTest();
		clear();
		$("proxy-choice").value = "default";
		$("proxy-fields").disabled = true;
		void apply(null);
	};
	$("proxy-disconnect").onclick = reset;
	$("proxy-reset").onclick = reset;
	$("proxy-test").onclick = async () => {
		if (busy) return;
		setBusy(true);
		status("Testing entered settings…");
		const testedGeneration = generation;
		let timeout;
		try {
			const custom = $("proxy-choice").value === "custom";
			const proxy = custom ? configuredProxy() : null;
			testWorker = new SharedWorker(
				"/proxy-transport-worker.js",
				"gurt-test-" + crypto.randomUUID()
			);
			testWorker.port.postMessage({
				configure: {
					websocket:
						(location.protocol === "https:" ? "wss://" : "ws://") +
						location.host +
						"/wisp/",
					...(proxy ? { proxy } : {}),
				},
			});
			const client = new BareMux.BareClient(testWorker.port);
			const response = await Promise.race([
				client.fetch("https://api.ipify.org?format=json", {
					cache: "no-store",
				}),
				new Promise(
					(_, reject) =>
						(timeout = setTimeout(() => reject(new Error()), 15000))
				),
			]);
			if (!response.ok) throw new Error();
			const body = await response.json();
			if (generation !== testedGeneration) return;
			if (typeof body.ip !== "string" || !/^[0-9a-fA-F:.]+$/.test(body.ip))
				throw new Error();
			status(
				(custom ? "Entered proxy" : "Default") +
					" exit IP: " +
					body.ip +
					". Test succeeded. Click Connect to activate these settings."
			);
		} catch (error) {
			if (generation !== testedGeneration) return;
			const code = /Transport code (\d{1,3})\b/.exec(
				String(error?.message || "")
			)?.[1];
			status(
				"Connection test failed or timed out. Check host, port, credentials, provider IP allowlist and availability. No automatic fallback to Default was used." +
					(code ? " Transport code " + code + "." : "")
			);
		} finally {
			clearTimeout(timeout);
			stopTest();
			setBusy(false);
		}
	};
	return { ready, control };
}
