# Entra production activation

The StoreOps production frontend is now built in API mode against its same-origin public API.

Launch contract:

- Microsoft Entra is the primary authentication mode.
- The frontend receives only the public tenant ID, client ID and delegated API scope at build time.
- No client secret is exposed to the browser.
- `/api/*` is served by the StoreOps public backend.
- The backend validates the Microsoft token, tenant, audience and `StoreOps.Access` scope before resolving the StoreOps user.
- Store Manager and Operations Director roles are provisioned server-side and cannot be selected by the user.
- Dynamics remains simulated during this authentication activation; D365 live mode is enabled separately after secure backend credentials and mappings are validated.

This change triggers a fresh production build after `STOREOPS_API_BASE` was configured so the generated runtime switches from Showcase mode to API mode.
