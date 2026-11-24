# Hospitality article staging

The source draft is preserved in `docs/cms/hospitality-articles-source.md`.

From the backend repository:

```powershell
npm run cms:import:hospitality
npm run cms:import:hospitality -- --apply
```

The first command is a database-free parse check. The second command creates
the six articles as `DRAFT` records through `CmsContentService`, writes the
normal CMS revision and audit records, and never publishes. It requires the
backend database configuration and at least one `ADMIN` user. Existing
same-slug articles are skipped. Use `--update-existing` only after editorial
review when replacing a matching draft is intended.

The Website preview route is `/preview/[token]`; create a preview link from
the authenticated CMS workflow after staging. The six public paths are not
live until the normal CMS publish transition is completed and the Website's
approved public-resource inventory is updated to include them.

The importer preserves the source headings, lists, tables and FAQs as the
existing `contentJson` string-line format. The Website article renderer now
renders markdown-style tables with accessible column headers, keyboard-focusable
horizontal scrolling, lists, headings and FAQ question lines.

The importer also records material editorial edits in its CMS revision note:

- unsupported Atithi feature claims are scoped to current evidence or marked for walkthrough verification;
- labour scheduling, automated upsells, live prime-cost reporting, direct guest QR ordering, room-folio posting and similar claims are not presented as released features;
- numerical benchmarks and delivery-fee figures are presented as worked assumptions or variable market figures rather than universal standards;
- CTAs use `/products/atithi`, `/contact?enquiry=atithi-demo`, and `/savings-calculator`.
