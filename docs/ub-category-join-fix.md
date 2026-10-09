# D365 hierarchy loading correction — 2026-10-09

The dashboard previously classified articles from the local taxonomy snapshot only. A deployment could therefore show correct article names but leave every category as “Non classé”.

Read ProductCategoryAssignments for the requested articles in batches of 30. Join ProductCategoryName to ProcurementProductCategories.CategoryName within the same hierarchy, then resolve the 18-character CategoryCode. Load reference categories once per warm process with a five-minute cache. These reads never write a database snapshot and never modify D365.

Department, rayon, family, subfamily, subsubfamily and UB identifiers remain the first 3/6/9/12/15/18 characters. ParentCategoryName resolves ancestor labels where department and rayon reference codes are short: for example 2 and 19 correspond to prefixes 002 and 002019 on UB 002019062346001006. Duplicate names are scoped by hierarchy; conflicting UB assignments remain ambiguous.

Business Pulse, stock signals and sell-through use this shared reader. Failed or truncated taxonomy reads retain local fallback and expose an unavailable diagnostic. The dashboard reports failures and permits refreshing classifications without requiring the director-only taxonomy write operation.

Validation: 17 existing targeted tests and the new real-shape join/cache/ambiguity/truncation/read-only test passed. An independent read using the existing D365 connection loaded all 7,187 categories and classified HS-000001 through HS-000010 at all six levels. This sample does not establish coverage of every article in every store.
