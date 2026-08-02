# Security

## Webhook destination validation (SSRF protection)

Users can register arbitrary webhook URLs. Before storing or delivering to an endpoint, the API validates outbound destinations to reduce server-side request forgery (SSRF) risk.

### Registration-time checks

When creating or updating an endpoint URL, the API validates:

- Scheme must be `https` in production (`http` allowed only in non-production environments)
- Hostnames such as `localhost`, `*.local`, `*.internal`, and cloud metadata hosts are blocked
- Literal private, loopback, link-local, and reserved IP ranges are blocked
  - `127.0.0.0/8`
  - `10.0.0.0/8`
  - `172.16.0.0/12`
  - `192.168.0.0/16`
  - `169.254.0.0/16`
  - IPv6 loopback and ULA/link-local ranges
- URLs with embedded credentials are rejected
- Only standard ports are allowed
  - Production HTTPS: `443`
  - Non-production HTTP: `80`, `8080`, `3000`

### DNS validation

For hostname-based URLs in production-like environments, the API resolves DNS (A/AAAA) and rejects destinations that resolve to private or reserved addresses.

DNS validation is skipped in `test` and `development` environments to keep local workflows practical.

### Delivery-time checks

Every delivery re-validates the endpoint URL before making an outbound request. If validation fails, the delivery attempt is recorded as failed and no request is sent.

### Redirect policy

Outbound webhook requests use `redirect: manual`. Redirect responses (`3xx`) are not followed automatically. This prevents redirect chains from bypassing destination validation.

Treat `3xx` responses as delivery failures unless your receiver returns a final `2xx` without redirects.

### Operational guidance

- Use HTTPS receivers on port `443`
- Avoid internal hostnames or IP literals in webhook URLs
- Rotate endpoint signing secrets if a destination is compromised
- Review failed deliveries for blocked-URL errors before re-enabling endpoints

## Reporting vulnerabilities

If you discover a security issue, please report it privately to the repository owner rather than opening a public issue.
