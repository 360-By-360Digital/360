// 360VPN PAC File

function FindProxyForURL(url, host) {
  if (dnsDomainIs(host, "360-search.com")) return "DIRECT";
  if (isPlainHostName(host) || host === "localhost" || host === "127.0.0.1") return "DIRECT";

  return "HTTPS 360-search.com:443; DIRECT";
}
