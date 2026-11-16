# Frontend design notes

Direction: a registrar's ledger. Warm paper background, deep ink text, one deep green accent (oxblood reserved for revoked and altered states), Fraunces for headings, Public Sans for UI, IBM Plex Mono for hashes and addresses. Tokens live in `src/styles/tokens.css`; dark theme comes from `prefers-color-scheme` using the same token names.

Rules followed: no gradients or glow, no emoji, one icon family (Phosphor), no nested cards, no kickers above headings, hashes always middle-truncated with copy and the full value in `title`, status shown with icon plus color plus text, motion limited to a short entrance and a spinner, both disabled under `prefers-reduced-motion`.

Note: the impeccable launcher was not run; its rules were applied by hand from the skill text.
