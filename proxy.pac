// 360VPN — Proxy Auto-Config
// 360Digital Co. — https://360-search.com/vpn
// This file is also served dynamically by the Cloudflare Worker at /vpn/proxy.pac

function FindProxyForURL(url, host) {
  // Always go direct for 360-search.com itself
  if (dnsDomainIs(host, "360-search.com")) {
    return "DIRECT";
  }

  // Always go direct for local addresses
  if (isPlainHostName(host) || host === "localhost" || host === "127.0.0.1") {
    return "DIRECT";
  }

  // Route everything else through 360VPN via Cloudflare edge
  // Falls back to DIRECT if the proxy is unreachable
  return "HTTPS 360-search.com:443; DIRECT";
}
