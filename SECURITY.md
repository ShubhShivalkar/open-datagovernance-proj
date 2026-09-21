# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub:
[Report a vulnerability](https://github.com/ShubhShivalkar/open-datagovernance-proj/security/advisories/new)

Include a description, reproduction steps, affected versions/commit, and the impact you foresee.
You can expect an acknowledgement within a few days. We will keep you updated on the fix and
credit you in the advisory unless you prefer otherwise.

## Scope

This project handles database credentials and personal-data workflows, so we take reports about
credential handling, access control, injection, and data exposure especially seriously.

## Supported versions

The project is pre-1.0; only the latest commit on `main` receives security fixes.

## For deployers

- Never commit `.env` files, API keys or database credentials.
- Set a strong, unique `SECRET_KEY` and run with `DEBUG` off in production.
- Follow the production guidance in the README.
