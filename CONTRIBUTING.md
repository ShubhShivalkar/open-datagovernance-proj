# Contributing

Thanks for your interest in the Data Governance Project! Contributions of all kinds are welcome.

## Ground rules

- Be kind — see the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security issues privately, per [SECURITY.md](SECURITY.md).
- Never commit secrets or real personal data.

## Getting set up

See the README for full instructions. In short:

```bash
# Backend (Django)
cd "Data Governance Project/backend"
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend (React + Vite)
cd "Data Governance Project/frontend"
npm ci
npm run dev
```

## Workflow

1. Open an issue (or comment on an existing one) for anything non-trivial.
2. Fork the repo and create a branch: `git checkout -b feat/short-description`.
3. Make focused changes; include migrations for model changes.
4. Make sure the checks CI runs pass locally:
   - Backend: `python manage.py check`, `python manage.py makemigrations --check --dry-run`, `python manage.py test`
   - Frontend: `npm run build`
5. Open a pull request against `main` and fill in the template.

`main` is protected: changes land through pull requests that need an approving review and passing CI.

## Commit messages

Short imperative subject line (e.g. `Add MySQL connector timeout`), with details in the body if needed.

## License

By contributing you agree your contributions are licensed under the Apache License 2.0.
