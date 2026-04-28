import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Users, Building2, Phone } from "lucide-react";
import logoUrl from "/logo.svg?url";

type OfficeGroup = "lakeshore" | "mientgr" | "grent";
type Office = {
  name: string;
  address: string;
  city: string;
  zip: string;
  kind?: "main" | "satellite";
  group: OfficeGroup;
  groupNote?: string;
};

const MAIN_PHONE = "(616) 994-2770";

// Group-to-office mapping based on practice assignments.
// - Lakeshore: Grandville, Holland, Allegan, Grand Haven, Norton Shores
// - MIENT-GR: Grand Rapids — East Beltline + Caledonia
// - GRENT: Grand Rapids — Michigan St., Wyoming (SW), Allendale, Big Rapids
const OFFICES: Office[] = [
  { name: "Grand Rapids — East Beltline", address: "739 E Beltline Ave NE", city: "Grand Rapids, MI", zip: "49525", group: "mientgr" },
  { name: "Grand Rapids — Michigan St.", address: "1425 Michigan St. NE, Suite A", city: "Grand Rapids, MI", zip: "49503", group: "grent" },
  { name: "Caledonia", address: "6470 Cherry Meadow Dr. SE", city: "Caledonia, MI", zip: "49316", group: "mientgr" },
  { name: "Wyoming", address: "1555 44th St. SW", city: "Wyoming, MI", zip: "49509", group: "grent" },
  { name: "Allendale", address: "11160 WJ Presley Parkway, Suite 102", city: "Allendale, MI", zip: "49401", group: "grent" },
  { name: "Big Rapids", address: "705 Oak St.", city: "Big Rapids, MI", zip: "49307", kind: "satellite", group: "grent" },
  { name: "Grandville", address: "3501 Rivertown Point Ct. SW", city: "Grandville, MI", zip: "49418", group: "lakeshore" },
  { name: "Holland", address: "3100 N Wellness Dr.", city: "Holland, MI", zip: "49424", group: "lakeshore" },
  { name: "Allegan", address: "516 Linn St.", city: "Allegan, MI", zip: "49010", group: "lakeshore" },
  { name: "Grand Haven", address: "17168 Timberview Dr.", city: "Grand Haven, MI", zip: "49417", group: "lakeshore" },
  { name: "Norton Shores", address: "557 Seminole Rd.", city: "Norton Shores, MI", zip: "49441", group: "lakeshore" },
];

const GROUP_META: Record<OfficeGroup, { label: string; short: string; description: string }> = {
  lakeshore: {
    label: "MIENT-Lakeshore",
    short: "LAKE",
    description: "Lakeshore practice offices",
  },
  mientgr: {
    label: "MIENT-GR",
    short: "MIENT-GR",
    description: "MIENT Grand Rapids offices",
  },
  grent: {
    label: "GRENT",
    short: "GRENT",
    description: "GRENT practice offices",
  },
};
const GROUP_ORDER: OfficeGroup[] = ["lakeshore", "mientgr", "grent"];

type PracticeEntry = {
  poolKey: string;
  label: string;
  short: string;
  description: string;
  providers: string[];
};

const PRACTICE_POOLS: PracticeEntry[] = [
  {
    poolKey: "pa",
    label: "PA",
    short: "PA",
    description: "Single PA on call covering all MIENT Lakeshore and GR established patients.",
    providers: ["Ophoff", "Kuipers", "Rogghe", "Wight", "King", "Ludington"],
  },
  {
    poolKey: "lakeshore",
    label: "MIENT-Lakeshore",
    short: "LAKE",
    description: "Lakeshore physician weekday call — established Lakeshore patients only (not hospitals).",
    providers: ["Orton", "Palmer", "Strabbing", "Keenan"],
  },
  {
    poolKey: "mientgr",
    label: "MIENT-GR",
    short: "MIENT-GR",
    description: "MIENT Grand Rapids physician weekday call (Mon 8a – Fri 5p).",
    providers: ["Foster", "Howard", "Riley", "Cameron", "Shah-Becker"],
  },
  {
    poolKey: "grent",
    label: "GRENT",
    short: "GRENT",
    description: "GRENT weekday call (Mon 8a – Fri 5p).",
    providers: ["Artz", "Taylor", "Cox", "Mistry", "Behler"],
  },
];

type HospitalEntry = {
  poolKey: string;
  label: string;
  short: string;
  description: string;
};

const HOSPITAL_POOLS: HospitalEntry[] = [
  {
    poolKey: "zch",
    label: "ZCH",
    short: "ZCH",
    description: "Zeeland Community Hospital — ENT inpatient/ER coverage.",
  },
  {
    poolKey: "noch",
    label: "NOCH / Trinity Health Grand Haven",
    short: "NOCH",
    description: "Trinity Health Grand Haven (historically North Ottawa Community Hospital) — ENT coverage.",
  },
  {
    poolKey: "thgr",
    label: "THGR / Trinity Health St. Mary's",
    short: "THGR",
    description: "Trinity Health Grand Rapids (St. Mary's) ER — ENT on call, 7 days per week.",
  },
  {
    poolKey: "corewell",
    label: "Corewell",
    short: "CORE",
    description: "Corewell Butterworth / Blodgett / Helen DeVos Children's Hospital — adult + pediatric ENT call.",
  },
  {
    poolKey: "uofm_west",
    label: "UofM Health West Facial Trauma",
    short: "UofM West",
    description: "Facial trauma call coverage at University of Michigan Health West.",
  },
];

export default function KeyPage() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Brand masthead — logo only */}
      <div
        className="rounded-lg overflow-hidden border shadow-sm"
        style={{ background: "linear-gradient(135deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-navy-deep)) 100%)" }}
      >
        <div className="px-6 py-5 flex items-center justify-center">
          <div className="bg-white rounded-md px-5 py-3 flex items-center justify-center" style={{ maxWidth: 480 }}>
            <img src={logoUrl} alt="Michigan ENT & Allergy Specialists · GrandRapidsENT" className="h-12 w-auto" />
          </div>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-semibold" data-testid="text-key-title">
          Key — Call Pools
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Practice call pools (weekday) and hospital coverage pools.
        </p>
      </div>

      {/* Practice Call Pools */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Practice Call Pools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PRACTICE_POOLS.map((p) => (
            <Card key={p.poolKey} data-testid={`card-key-${p.poolKey}`} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`pool-${p.poolKey} inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold text-white`}
                    style={{ background: `hsl(var(--pool-${p.poolKey}))`, color: "white" }}
                    data-testid={`badge-key-${p.poolKey}`}
                  >
                    {p.short}
                  </span>
                  <CardTitle className="text-base">{p.label}</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{p.description}</p>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1.5">
                  {p.providers.map((name) => (
                    <li
                      key={name}
                      className="flex items-center gap-2 text-sm"
                      data-testid={`text-provider-${p.poolKey}-${name.toLowerCase().replace(/[\s-]+/g, "-")}`}
                    >
                      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span>{p.poolKey === "pa" ? name : `Dr. ${name}`}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Hospital Coverage Pools */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Hospital Coverage
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {HOSPITAL_POOLS.map((h) => (
            <Card key={h.poolKey} data-testid={`card-key-${h.poolKey}`} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`pool-${h.poolKey} inline-flex items-center justify-center rounded-md px-2 py-1 text-xs font-semibold`}
                    style={{ background: `hsl(var(--pool-${h.poolKey}))`, color: "white" }}
                    data-testid={`badge-key-${h.poolKey}`}
                  >
                    {h.short}
                  </span>
                  <CardTitle className="text-base">{h.label}</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{h.description}</p>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Call window rules */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Call window rules</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">MIENT-GR &amp; GRENT:</span> Mon–Wed run 8a → 8a next day. Thursday runs 8a → Fri 5p (weekday practice call ends at Fri 5p).
          </p>
          <p>
            <span className="font-medium text-foreground">MIENT-Lakeshore:</span> Mon–Thu run 8a → 8a next day (standard 24h shifts).
          </p>
          <p>
            <span className="font-medium text-foreground">PA pool:</span> Covers all MIENT Lakeshore + GR established patients — daily 8a → 8a.
          </p>
          <p>
            <span className="font-medium text-foreground">Hospital pools (ZCH, NOCH, THGR, Corewell, UofM West):</span> Daily 8a → 8a assignments. THGR runs 7 days/week.
          </p>
          <p>
            <span className="font-medium text-foreground">Friday handoff:</span> When the outgoing Thu/Fri MIENT-GR or GRENT doc is from a different practice than the Friday doc, the Friday row shows "Outgoing / Incoming @5p". Same-practice rolls show just the Friday doc.
          </p>
        </CardContent>
      </Card>

      {/* Office locations — grouped by practice */}
      <section data-testid="section-offices">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Offices by Practice Group · {OFFICES.length}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Each office belongs to one practice group. Use this as the source of truth when patients or staff ask which group covers which location.
        </p>

        <div className="space-y-5">
          {GROUP_ORDER.map((group) => {
            const offices = OFFICES.filter((o) => o.group === group);
            if (offices.length === 0) return null;
            const meta = GROUP_META[group];
            return (
              <div key={group} data-testid={`group-offices-${group}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`pool-${group} inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold text-white`}
                    style={{ background: `hsl(var(--pool-${group}))`, color: "white" }}
                  >
                    {meta.short}
                  </span>
                  <h3 className="text-sm font-semibold">{meta.label}</h3>
                  <span className="text-xs text-muted-foreground">· {offices.length} {offices.length === 1 ? "office" : "offices"}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {offices.map((o) => (
                    <div
                      key={o.name}
                      className="rounded-md border bg-card px-3 py-2.5 hover-elevate"
                      data-testid={`card-office-${o.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium leading-tight">{o.name}</div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {o.kind === "satellite" && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                              Satellite
                            </span>
                          )}
                          {o.groupNote && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {o.groupNote}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 leading-snug">
                        {o.address}
                        <br />
                        {o.city} {o.zip}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
          <Phone className="h-3 w-3" />
          All offices share the main line: <span className="font-medium text-foreground">{MAIN_PHONE}</span>
        </p>
      </section>
    </div>
  );
}
