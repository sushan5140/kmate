/**
 * Idempotent re-runnable seed for universities + eligibility rows.
 *
 * Usage: npm run seed:universities
 */
import { syncUniversityCatalog } from "../../lib/gks/university-sync";

syncUniversityCatalog().then(
  (result) => {
    console.log(
      `Seeded ${result.universitiesUpserted} universities, ${result.eligibilityRowsUpserted} eligibility rows; removed ${result.staleGksURowsRemoved} stale GKS-U eligibility rows.`
    );
    process.exit(0);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
