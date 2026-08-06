# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| latest  | :white_check_mark: |

## Educational Project Disclaimer

This is an **educational high-frequency trading simulator**. It does **not** connect to any real exchange, does **not** handle real money, and does **not** execute real trades. All market data is simulated.

## Reporting a Vulnerability

If you discover a security vulnerability in this project:

1. **Do NOT open a public GitHub issue.**
2. Email the maintainer at: **security@ezpectus.dev**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

You will receive a response within 48 hours. If the vulnerability is confirmed, a fix will be released as soon as possible.

## Security Measures

This project includes the following security measures:

- **Bandit** — Python static security analysis (CI/CD integrated)
- **CodeQL** — GitHub code scanning for C++, Python, JavaScript
- **No real API keys** — All exchange connections are simulated
- **No real funds** — Paper trading only, zero financial risk
- **Input validation** — WebSocket messages validated before processing
- **Rate limiting** — Exchange simulator enforces order rate limits

## Scope

**In scope:**
- Code vulnerabilities (injection, buffer overflow, XSS, etc.)
- Logic bugs that could cause incorrect trading behavior in simulation
- Dependency vulnerabilities

**Out of scope:**
- Issues in third-party dependencies (report upstream)
- Social engineering attacks
- Physical security
- DoS against the educational demo
