/* Disposable worker: terminating it clears credentials and closes old connections.
 * Upstream BareMux 2.1.9 worker protocol is retained; suppress its object/error logging.
 */
for (const method of ["log", "info", "debug", "warn", "error"])
	console[method] = () => {};
importScripts("/baremux/worker.js");
const connect = self.onconnect;
const upstream = {};
connect({ ports: [upstream] });
let configured = false;
let failed = false;
const queued = [];
function handle({ data }) {
	if (data.shutdown) {
		self.close();
		return;
	}
	if (data.configure) {
		const channel = new MessageChannel();
		upstream.onmessage({
			data: {
				message: {
					type: "set",
					client: {
						function:
							'const {default:T}=await import("/personal-curl/index.mjs");return [T,"/libcurl/index.mjs"];',
						args: [data.configure],
					},
				},
				port: channel.port2,
			},
		});
		channel.port1.onmessage = ({ data: result }) => {
			configured = result.type === "set";
			failed = !configured;
			channel.port1.close();
			for (const item of queued.splice(0)) {
				if (configured) upstream.onmessage({ data: item });
				else
					item.port.postMessage({
						type: "error",
						error: new Error("Transport configuration failed."),
					});
			}
		};
	} else {
		if (failed) {
			data.port.postMessage({
				type: "error",
				error: new Error("Transport configuration failed."),
			});
			return;
		}
		if (!configured) {
			queued.push(data);
			return;
		}
		upstream.onmessage({ data });
	}
}
self.onconnect = ({ ports: [port] }) => {
	port.onmessage = handle;
	port.start();
};
