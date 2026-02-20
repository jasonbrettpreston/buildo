// ---------------------------------------------------------------------------
// Cloud Functions configuration constants
// ---------------------------------------------------------------------------

/** GCP project ID, read from the standard environment variable. */
export const PROJECT_ID = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || '';

// ---------------------------------------------------------------------------
// Pub/Sub topic names
// ---------------------------------------------------------------------------

/** Published by syncTrigger after the snapshot is saved to Cloud Storage. */
export const TOPIC_SYNC_START = 'buildo-sync-start';

/** Published by syncProcess for each permit that was inserted or updated. */
export const TOPIC_PERMIT_CHANGED = 'buildo-permit-changed';

/** Published by classifyTrades after a permit has been classified. */
export const TOPIC_PERMIT_CLASSIFIED = 'buildo-permit-classified';

/** Published when a new builder name is encountered during sync. */
export const TOPIC_BUILDER_NEW = 'buildo-builder-new';

// ---------------------------------------------------------------------------
// Cloud Storage
// ---------------------------------------------------------------------------

/** Bucket used to store raw Open Data snapshots and intermediate artefacts. */
export const SNAPSHOT_BUCKET = process.env.SNAPSHOT_BUCKET || 'buildo-open-data-snapshots';

/** Prefix inside the bucket where daily snapshots are stored. */
export const SNAPSHOT_PREFIX = 'daily-snapshots';

// ---------------------------------------------------------------------------
// Toronto Open Data source
// ---------------------------------------------------------------------------

/**
 * CKAN datastore_search endpoint for the Active Building Permits resource.
 *
 * The dataset page is:
 *   https://open.toronto.ca/dataset/building-permits-active-permits/
 *
 * We hit the datastore dump URL directly which returns the full JSON array.
 * The resource ID may change if the City of Toronto republishes; update here.
 */
export const OPEN_DATA_RESOURCE_ID = '5e92f9fa-62a5-4a52-b218-a1ed656e0036';

export const OPEN_DATA_BASE_URL =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search';

/**
 * Build the full URL for fetching all records from the Open Data resource.
 * Uses a large limit to pull the entire dataset in one request.
 */
export function buildOpenDataUrl(limit: number = 300_000): string {
  return `${OPEN_DATA_BASE_URL}?resource_id=${OPEN_DATA_RESOURCE_ID}&limit=${limit}`;
}

// ---------------------------------------------------------------------------
// Processing constants
// ---------------------------------------------------------------------------

/** Number of records per batch when processing the streamed JSON file. */
export const BATCH_SIZE = 5_000;

/** Maximum number of builders to enrich in a single function invocation. */
export const BUILDER_ENRICHMENT_LIMIT = 50;

/** Maximum number of permits to geocode in a single function invocation. */
export const GEOCODE_BATCH_LIMIT = 500;

// ---------------------------------------------------------------------------
// Function timeout / memory hints (for documentation; actual values are set
// in the deployment descriptor or via gcloud CLI flags).
// ---------------------------------------------------------------------------

export const FUNCTION_TIMEOUT_SECONDS = {
  syncTrigger: 120,
  syncProcess: 540,
  classifyTrades: 60,
  matchNotifications: 60,
  enrichBuilder: 300,
} as const;
