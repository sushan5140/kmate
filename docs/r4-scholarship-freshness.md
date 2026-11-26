# R4 — Scholarship freshness

Audit on 26 November 2026: 20 indexed awards, zero fixed deadlines on or after today, zero source checks recorded in the previous 14 days. Three active sources (KAIST undergraduate: 1; Korea University: 7; SNU: 12) report successful checks today; KAIST graduate is disabled. The unchanged-content branch failed to renew row verification timestamps.

Shared availability policy distinguishes indexed records from confirmed application windows. Freshness threshold is 14 days, stale threshold 30 days. Stale records remain research leads but are excluded from Home spotlight. Expired and inactive rows are archived. A published closing date does not establish opening or intake. Successful unchanged-content fetches renew verification timestamps; partial failures propagate to automation health. Archived records require explicit review before reactivation.

Release gate: CI, browser verification, live source crawl and timestamp verification after deployment. No production records changed and no scholarship is claimed open. This repair does not expand the catalog or re-enable KAIST graduate.
