# StoreOps public backend

V1.63 introduces the pilot public API on Netlify Functions while preserving the existing Node/SQLite business engine.

- `/api/*` is handled by the public Function.
- SQLite state is checkpointed into Netlify Database and protected by a PostgreSQL advisory lock.
- Microsoft Entra authentication is backend-enforced.
- Pilot identities and secrets stay in deployment environment variables, never in GitHub.
- Dynamics remains simulated until live D365 backend credentials and write mappings are explicitly validated.

## Production activation

The production frontend is configured to use `https://franprix-storeops.netlify.app` as its StoreOps API base. This switches the built runtime from Showcase mode to API mode and enables the Microsoft Entra login flow. Role and store access remain enforced by the backend after token validation.

This commit intentionally triggers the production build that incorporates the API-mode environment configuration.
