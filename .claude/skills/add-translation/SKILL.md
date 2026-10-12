---
name: add-translation
description: Add or change user-visible text in French, Arabic and English (i18n), including RTL layout rules. Use whenever a page, toast, error message or email gets new text.
---

# Add user-visible text

- Add the key to `src/lib/i18n/fr.ts` first (it defines the `Dict` type), then
  the same key to `ar.ts` and `en.ts`. TypeScript refuses a missing key.
- Use it in components with `const { t } = useI18n()`; never hard-code text.
- Counts are functions: `(n: number) => string`. Arabic needs its plural
  forms: 0, 1, 2, 3–10 (plural noun), 11+ (singular accusative noun).
- New error codes: throw `new AppError("CODE", "message en français")` on the
  server and add `CODE` to `t.errors` in all three files.
- Emails: `src/server/email-texts.ts`, same three languages.
- Layout must work right-to-left: logical classes (`ms-`, `me-`, `ps-`, `pe-`,
  `start-`, `end-`, `text-start`), `dir="auto"` on user-entered text, icons
  that point a direction get `rtl:rotate-180`.
- Check the page in Arabic (language button in the header) before finishing.
