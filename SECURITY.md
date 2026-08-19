# Security Policy

## Supported Versions

360 is currently on version **3.6.0**.

All released versions of 360 are currently supported and are intended to continue receiving security updates and hotfixes alongside future releases.

| Version | Supported          |
| ------- | ------------------ |
| 3.6.0   | :white_check_mark: |
| 3.x     | :white_check_mark: |
| 2.x     | :white_check_mark: |
| 1.x     | :white_check_mark: |

Security fixes and hotfixes may be provided for older releases when an issue affects them. Users are encouraged to update to the newest release when possible, but older supported versions are not automatically considered unsupported when a newer version is released.

## Reporting a Vulnerability

If you believe you have discovered a security vulnerability in 360, please report it privately rather than opening a public GitHub issue.

### Security vulnerabilities

For security vulnerabilities, contact:

**[admin@360-search.com](mailto:admin@360-search.com)**

Please include:

* A clear description of the vulnerability
* The affected version, page, component, or endpoint
* Steps required to reproduce the issue
* The potential security impact
* A proof of concept, if applicable
* Any suggested mitigation or fix, if known

Please do not include passwords, API keys, authentication tokens, personal information, or other sensitive information unless it is necessary to demonstrate the vulnerability.

### General help and support

For general questions, assistance, bug reports that do not involve security, or other help with 360, contact:

**[help@360-search.com](mailto:help@360-search.com)**

Do not send sensitive security vulnerabilities to the general help address when they can be reported directly to the security contact.

## Response Process

After receiving a security report, the maintainers will:

1. Review the report.
2. Determine whether the issue is reproducible.
3. Assess its severity and potential impact.
4. Identify affected versions.
5. Develop and test an appropriate fix or mitigation.
6. Release a hotfix or security update when appropriate.
7. Notify the reporter when the issue has been addressed, when possible.

Response times may vary depending on the severity, complexity, and information provided with the report.

## Security Updates and Hotfixes

360 is intended to receive continuous security maintenance.

When a security issue affects multiple supported versions, fixes may be released for multiple versions rather than requiring users to immediately move to the newest release.

Security fixes may be distributed through:

* Regular releases
* Hotfix releases
* Security patches
* Emergency updates when necessary

The project may publish additional information about a vulnerability after a fix or mitigation is available.

## Disclosure

Please allow the maintainers reasonable time to investigate and address a reported vulnerability before publicly disclosing technical details.

When appropriate, security advisories may identify:

* The affected versions
* The nature and severity of the vulnerability
* The fixed versions
* Available mitigations
* Recommended actions for users

## Scope

Security reports may include, but are not limited to:

* Authentication or authorization vulnerabilities
* Cross-site scripting (XSS)
* Injection vulnerabilities
* Sensitive information exposure
* Server-side vulnerabilities
* Unsafe API behavior
* Security-header or CSP weaknesses
* Dependency vulnerabilities affecting 360
* Vulnerabilities that could compromise users, accounts, data, or project infrastructure

## Out of Scope

The following are generally not security vulnerabilities by themselves:

* UI bugs without a security impact
* Feature requests
* Broken links
* Performance issues without a security impact
* General usability problems
* Issues that cannot be reproduced
* Social engineering attempts
* Denial-of-service testing against infrastructure without prior authorization

If you are unsure whether an issue is security-related, contact **[admin@360-search.com](mailto:admin@360-search.com)**.

## Safe Harbor

Security researchers acting in good faith and following this policy are encouraged to report vulnerabilities responsibly.

Please do not:

* Intentionally access, modify, delete, or exfiltrate another user's data
* Disrupt services or infrastructure
* Perform destructive testing
* Obtain credentials or secrets belonging to other users
* Continue testing after being asked to stop

Good-faith security research that follows this policy is welcomed. The maintainers will work with researchers to understand and resolve responsibly reported issues.

## Contact

**Security and administration:** [admin@360-search.com](mailto:admin@360-search.com)

**General help and support:** [help@360-search.com](mailto:help@360-search.com)
