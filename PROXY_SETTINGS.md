## Import and test before connecting

Import accepts protocol URLs, username:password@host:port, host:port:username:password and host:port. Without a scheme, the selected protocol is used. Paste and typing populate fields immediately; invalid input leaves existing fields intact. Percent-encoded credentials are decoded once. Edit the populated fields as needed. Test Connection uses a disposable worker with these fields and shuts it down afterward; it does not change the profile connection. Connect activates the fields.

# Personal proxy settings

Open **Advanced → Proxy Settings**. Default uses this deployment's existing same-origin `/wisp/` connection. Custom sends Scramjet HTTP requests and destination WebSockets through the configured proxy, using that Wisp connection as the network carrier. It changes neither the operating system proxy nor Chrome/Brave settings.

This setting is shared by Gurt's Browser pages on the **same origin in the same browser profile**. Different profiles, devices, private-browsing partitions and origins have independent workers and start in Default. A home link to another origin does not join this session.

## Using a proxy

- Import `http://user:password@host:8080`, `socks5://user:password@host:1080`, or `socks4a://user@host:1080`; or enter the equivalent fields. Percent-encode reserved characters when importing credentials. Manual fields handle that encoding automatically.
- The installed CurlTransport supports `http:`, `socks5h:` and `socks4a:`. SOCKS5 is normalized to remote-DNS SOCKS5h. SOCKS4a has a user ID but no password authentication. HTTPS destinations work through HTTP CONNECT; `https://` TLS-to-proxy URLs are not supported by this version.
- Connect selects a fresh transport. It does not claim the proxy has authenticated until a request succeeds. **Test Connection** requests `https://api.ipify.org?format=json` through a temporary transport using the entered settings and shows the observed exit IP. Rotating providers may use a different IP for each request. This test cannot certify that an address is residential.
- A failed Custom connection never silently falls back to Default. Check the endpoint, credentials, provider allowlist and availability. Provider errors are deliberately sanitized; a safe numeric transport code may be shown.
- Disconnect and Reset both discard the custom worker and select Default. Switching modes closes the browsing frame in every connected homepage and terminates the old transport, including its WebSockets. Enter the destination again to open a fresh browsing frame.

## Lifetime and privacy

Credentials are passed in memory to a disposable SharedWorker. They are never put in URLs visited by the browser, localStorage, sessionStorage, IndexedDB, cookies, server configuration or application logs. Forms are cleared after selection, reset, mode changes and page exit. BareMux stores only its worker script path in localStorage. Test fixtures use fake credentials.

Every connected homepage owns a handle to the disposable worker. Closing its original creator page therefore does not intentionally end the session for other open pages. Closing the last homepage requests shutdown. A heartbeat lease also discards an abandoned Custom session after 120 seconds without a live homepage heartbeat (checked every 15 seconds); suspended/background-throttled sessions may expire. Reopening or resuming after expiry starts Default. Browsers do not provide a guarantee of immediate RAM erasure on crash or suspension, and JavaScript strings cannot be securely zeroed.

This is session convenience, not a security boundary between people sharing one profile. Other tabs on this origin intentionally share the route. Extensions, developer tools, password managers, compromised same-origin scripts and another person with access to the profile may observe or change the session. Use your own profile on shared computers, decline password-manager saving, reset before handing the computer over, and close all Gurt's Browser tabs afterward.

The Wisp server remains a network intermediary. HTTP/SOCKS authentication is transmitted to the proxy via Wisp; this is not end-to-end secrecy from the Wisp operator, and these proxy protocols do not themselves encrypt the hop from Wisp to the proxy. Use a trusted provider and network path. Destination HTTPS still provides its usual TLS protection. This feature does not change Scramjet's existing sandbox or security model.

## A proxy on your home internet

A home public IP alone is insufficient. You need an actual, reachable proxy service and a secure network path from the deployment's Wisp server to it. CGNAT, router firewall rules and a changing home address can prevent reachability.

Prefer a private authenticated tunnel/VPN between a server you administer and home, with the proxy bound to that private interface. That requires separately configuring the server network; entering a private home address in this UI does not create the tunnel. If you operate a public endpoint, require strong authentication and firewall restrictions to known server egress addresses, keep the software updated, and monitor access. Never expose an unauthenticated home proxy. No home service, router port or firewall rule is opened by this change.

## Implementation and review

`proxy-worker.js` implements the existing BareMux message protocol as a profile-scoped coordinator. It replaces the disposable transport for every selection, even if the module path is unchanged. In-flight replies are canceled on replacement; raw transport errors and credentials never reach page status messages. `proxy-transport-worker.js` loads the installed BareMux worker and suppresses its upstream object/error logging, which would otherwise include the transport's proxy credentials.

BareMux 2.1.9 and libcurl-transport 1.5.2 are pinned because the adapter depends on their inspected protocol. CurlTransport 1.5.2 already accepts the documented `proxy` constructor option for HTTPSession, but omits it when constructing destination WebSockets. The server serves a narrowly patched copy at `/personal-curl/index.mjs` that forwards this same option to WebSockets. The original module is untouched and its notices are preserved. Startup fails if the expected patch location changes; review this adapter before upgrading dependencies. Original copyright, license and homepage source links remain intact. Keep the corresponding deployed modified source publicly available as required by the AGPL.

Run `node --test test/*.test.mjs`, `npm run lint`, and the formatter check on the changed files. Automated checks cover parsing, synthetic auth failures, redaction, isolated profile state, same-path transport replacement, abandoned-session expiry, pending-request cancellation, search submission, and proxy forwarding to both HTTPSession and WebSockets.

Live smoke tests during development confirmed Default's direct exit IP, Custom SOCKS5 and HTTP CONNECT exit IPs, cleared form fields and Custom mode visible in a second homepage. Scramjet navigation also returned a proxy exit IP. The final overlay layering correction and multi-owner lifetime refinement still need a fresh live browser pass: browser automation stopped because it could not reliably determine the current URL. Before merging, verify Default and Custom navigation, Reset while a frame is open in two tabs, closing the creator then the final tab, invalid credentials/unreachable endpoints, and an actual destination WebSocket in two separate profiles. No deployment or merge was performed.
