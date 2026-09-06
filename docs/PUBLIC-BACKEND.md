# StoreOps public backend

V1.63 introduces the pilot public API on Netlify Functions while preserving the existing Node/SQLite business engine.

- `/api/*` is handled by the public Function.
- SQLite state is checkpointed into Netlify Database and protected by a PostgreSQL advisory lock.
- Microsoft Entra authentication is backend-enforced.
- Pilot identities and secrets stay in deployment environment variables, never in GitHub.
- Dynamics remains simulated until live D365 backend credentials and write mappings are explicitly validated.

This document also provides a deterministic `main` push so Netlify publishes the V1.63 production backend after the merge.
