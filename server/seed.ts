import type { IStorage } from "./storage";

type RosterEntry = {
  lastName: string;
  credentials?: string;
  kind?: "physician" | "pa";
  primaryPool: string;
  eligiblePools?: string[];
  notes?: string;
};

const ROSTER: RosterEntry[] = [
  // Lakeshore
  { lastName: "Orton", primaryPool: "lakeshore", eligiblePools: ["weekend"] },
  { lastName: "Palmer", primaryPool: "lakeshore", eligiblePools: ["weekend"] },
  { lastName: "Strabbing", primaryPool: "lakeshore", eligiblePools: ["weekend"] },
  { lastName: "Kennan", primaryPool: "lakeshore", eligiblePools: ["weekend"] },
  // MIENT GR
  { lastName: "Foster", primaryPool: "mientgr", eligiblePools: ["weekend"] },
  { lastName: "Howard", primaryPool: "mientgr", eligiblePools: ["weekend"] },
  { lastName: "Riley", primaryPool: "mientgr", eligiblePools: ["weekend"] },
  { lastName: "Cameron", primaryPool: "mientgr", eligiblePools: ["weekend"] },
  {
    lastName: "Shah-Becker",
    primaryPool: "mientgr",
    eligiblePools: ["weekend", "corewell", "peds_backup"],
    notes: "Peds ENT. Covers Corewell Butterworth/Blodgett (adult + peds). Peds ENT backup.",
  },
  // GRENT
  { lastName: "Artz", primaryPool: "grent", eligiblePools: ["weekend"] },
  { lastName: "Taylor", primaryPool: "grent", eligiblePools: ["weekend"] },
  { lastName: "Cox", primaryPool: "grent", eligiblePools: ["weekend"] },
  { lastName: "Mistry", primaryPool: "grent", eligiblePools: ["weekend"] },
  { lastName: "Bueller", primaryPool: "grent", eligiblePools: ["weekend"] },
  // PAs (Lakeshore + MIENT shared PA call pool)
  { lastName: "Ophoff", credentials: "PA-C", kind: "pa", primaryPool: "pa" },
  { lastName: "Kuipers", credentials: "PA-C", kind: "pa", primaryPool: "pa" },
  { lastName: "Rogie", credentials: "PA-C", kind: "pa", primaryPool: "pa" },
  { lastName: "Wight", credentials: "PA-C", kind: "pa", primaryPool: "pa" },
  { lastName: "King", credentials: "PA-C", kind: "pa", primaryPool: "pa" },
  { lastName: "Luddington", credentials: "PA-C", kind: "pa", primaryPool: "pa" },
];

export async function seedRoster(storage: IStorage) {
  const existing = await storage.listProviders();
  if (existing.length === 0) {
    for (const r of ROSTER) {
      await storage.createProvider({
        lastName: r.lastName,
        firstName: null,
        credentials: r.credentials ?? "MD",
        kind: r.kind ?? "physician",
        primaryPool: r.primaryPool,
        eligiblePools: JSON.stringify(r.eligiblePools ?? []),
        notes: r.notes ?? null,
        active: true,
        color: null,
      } as any);
    }
  }

  // Seed a default admin user if none exist
  const users = await storage.listUsers();
  if (users.length === 0) {
    await storage.createUser({
      username: "admin",
      password: "admin", // change on first login in a real deployment
      name: "Practice Admin",
      role: "admin",
      providerId: null,
    } as any);
  }
}
