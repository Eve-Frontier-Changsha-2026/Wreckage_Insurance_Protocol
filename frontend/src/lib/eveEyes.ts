const EVE_EYES_BASE = 'https://eve-eyes.d0v.xyz';
const EVE_EYES_API_KEY = 'eve_ak_OGg2rSPof-S_13eN_kpDeIw4-rG5_q8leYZhdL2IV5w';

const headers = {
  Authorization: `ApiKey ${EVE_EYES_API_KEY}`,
};

// --- Types ---

export interface EveEyesKillmail {
  killmailItemId: string;       // Game-internal sequence ID (NOT Sui object ID)
  killTimestamp: string;         // ISO 8601 string, e.g. "2026-03-30T21:17:32.000Z"
  lossType: string;              // "SHIP", etc.
  solarSystemId: string;         // Numeric string, e.g. "30013131"
  resolutionStatus: string;      // "resolved" | "pending"
  killer: {
    label: string;
    username: string;
    walletAddress: string;
    characterItemId: string;
  };
  victim: {
    label: string;
    username: string;
    walletAddress: string;
    characterItemId: string;
  };
}

export interface SolarSystem {
  id: number;
  name: string;
  constellationId: number;
  regionId: number;
}

// --- API Functions ---

/** Fetch killmails from Eve Eyes indexer. Public endpoint, no auth needed. */
export async function fetchKillmails(
  limit = 50,
  status?: 'resolved' | 'pending',
): Promise<EveEyesKillmail[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  const res = await fetch(`${EVE_EYES_BASE}/api/indexer/killmails?${params}`);
  if (!res.ok) throw new Error(`Eve Eyes killmails error: ${res.status}`);
  const json = await res.json();
  return json.items as EveEyesKillmail[];
}

/** Fetch solar system detail by numeric ID. Public endpoint. */
export async function fetchSolarSystem(systemId: string | number): Promise<SolarSystem> {
  const res = await fetch(`${EVE_EYES_BASE}/api/world/systems/${systemId}`);
  if (!res.ok) throw new Error(`Eve Eyes system error: ${res.status}`);
  return res.json();
}
