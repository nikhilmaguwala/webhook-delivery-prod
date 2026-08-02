export type WebhookUrlValidationOptions = {
  environment?: string;
};

export type WebhookUrlValidationResult =
  | { ok: true; normalizedUrl: string }
  | { ok: false; error: string };

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.google",
  "kubernetes.default.svc",
  "kubernetes.default",
  "instance-data",
]);

const ALLOWED_SCHEMES = new Set(["https:", "http:"]);

function isProduction(environment?: string): boolean {
  return environment === "production";
}

function isRelaxedEnvironment(environment?: string): boolean {
  return environment === "test" || environment === "development" || environment === "dev";
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  if (lower.startsWith("[") && lower.endsWith("]")) {
    return lower.slice(1, -1);
  }
  return lower;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets;
}

function isPrivateOrReservedIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateOrReservedIpv6(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    const ipv4 = parseIpv4(mapped);
    return ipv4 ? isPrivateOrReservedIpv4(ipv4) : true;
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (normalized.endsWith(".localhost")) return true;
  if (normalized.endsWith(".local")) return true;
  if (normalized.endsWith(".internal")) return true;
  if (normalized.endsWith(".svc")) return true;
  return false;
}

function isAllowedPort(
  protocol: string,
  port: string,
  environment?: string
): boolean {
  if (!port) {
    return protocol === "https:" || (protocol === "http:" && !isProduction(environment));
  }

  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
    return false;
  }

  if (protocol === "https:") {
    return numericPort === 443;
  }

  if (protocol === "http:") {
    if (isProduction(environment)) return false;
    return numericPort === 80 || numericPort === 8080 || numericPort === 3000;
  }

  return false;
}

export function validateWebhookUrlSync(
  urlString: string,
  options: WebhookUrlValidationOptions = {}
): WebhookUrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(urlString.trim());
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return { ok: false, error: "Only HTTP(S) webhook URLs are allowed" };
  }

  if (isProduction(options.environment) && parsed.protocol !== "https:") {
    return { ok: false, error: "HTTPS is required for webhook URLs in production" };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "Webhook URLs must not include credentials" };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    return { ok: false, error: "Webhook URL must include a hostname" };
  }

  if (isBlockedHostname(hostname)) {
    return { ok: false, error: "Webhook URL hostname is not allowed" };
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 && isPrivateOrReservedIpv4(ipv4)) {
    return { ok: false, error: "Webhook URL must not target private or reserved IP addresses" };
  }

  if (hostname.includes(":") && isPrivateOrReservedIpv6(hostname)) {
    return { ok: false, error: "Webhook URL must not target private or reserved IP addresses" };
  }

  if (!isAllowedPort(parsed.protocol, parsed.port, options.environment)) {
    return { ok: false, error: "Webhook URL uses a disallowed port" };
  }

  return { ok: true, normalizedUrl: parsed.toString() };
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const response = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`,
    { headers: { Accept: "application/dns-json" } }
  );

  if (!response.ok) {
    throw new Error(`DNS lookup failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    Answer?: Array<{ type: number; data: string }>;
  };

  const addresses = (payload.Answer ?? [])
    .filter((record) => record.type === 1)
    .map((record) => record.data);

  if (addresses.length > 0) {
    return addresses;
  }

  const aaaaResponse = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=AAAA`,
    { headers: { Accept: "application/dns-json" } }
  );

  if (!aaaaResponse.ok) {
    throw new Error(`DNS lookup failed with status ${aaaaResponse.status}`);
  }

  const aaaaPayload = (await aaaaResponse.json()) as {
    Answer?: Array<{ type: number; data: string }>;
  };

  return (aaaaPayload.Answer ?? [])
    .filter((record) => record.type === 28)
    .map((record) => record.data);
}

function shouldResolveDns(hostname: string, environment?: string): boolean {
  if (isRelaxedEnvironment(environment)) return false;
  if (parseIpv4(hostname)) return false;
  if (hostname.includes(":")) return false;
  return true;
}

export async function validateWebhookUrl(
  urlString: string,
  options: WebhookUrlValidationOptions = {}
): Promise<WebhookUrlValidationResult> {
  const syncResult = validateWebhookUrlSync(urlString, options);
  if (!syncResult.ok) {
    return syncResult;
  }

  const parsed = new URL(syncResult.normalizedUrl);
  const hostname = normalizeHostname(parsed.hostname);

  if (!shouldResolveDns(hostname, options.environment)) {
    return syncResult;
  }

  try {
    const addresses = await resolveHostAddresses(hostname);
    if (addresses.length === 0) {
      return { ok: false, error: "Webhook URL hostname does not resolve" };
    }

    for (const address of addresses) {
      const ipv4 = parseIpv4(address);
      if (ipv4 && isPrivateOrReservedIpv4(ipv4)) {
        return {
          ok: false,
          error: "Webhook URL resolves to a private or reserved IP address",
        };
      }
      if (address.includes(":") && isPrivateOrReservedIpv6(address)) {
        return {
          ok: false,
          error: "Webhook URL resolves to a private or reserved IP address",
        };
      }
    }
  } catch {
    return { ok: false, error: "Unable to validate webhook URL DNS records" };
  }

  return syncResult;
}

export function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}
