import { NextResponse } from 'next/server';
import {
  OUTCOME_MEASURE_CATALOG_VERSION,
  OUTCOME_MEASURE_CATEGORIES,
  OUTCOME_MEASURES,
} from '@/lib/outcomeMeasures';

/**
 * Public catalog of outcome measure codes + labels for clinician portal and patient app.
 * GET /api/outcome-measures
 */
export async function GET() {
  const catalog = {
    version: OUTCOME_MEASURE_CATALOG_VERSION,
    categories: OUTCOME_MEASURE_CATEGORIES,
    measures: OUTCOME_MEASURES,
  };
  return NextResponse.json(catalog, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
