# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: **Security → Report a vulnerability** on this
repository, or write to contact@devleck.com. Include what you found, how to reproduce it
and the impact you think it has. You can expect an acknowledgement within a few days.

## Scope

- Handling of the Meta Graph API token, the Gemini key and the Telegram bot token.
- The Telegram command interface and who is allowed to use it.
- The validators that gate what the agent may publish.

## How secrets are handled

No secret is stored in this repository. Keys and tokens live only in the hosting platform's
environment variables, and environment files (`.env`, `.env.*`) are git-ignored. The
variables the project reads are documented in the README. Secret scanning and push
protection are enabled on this repository.
