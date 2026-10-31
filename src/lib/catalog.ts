export type Owner = "HR" | "Dept Head" | "Manager" | "IT" | "Finance" | "Security" | "Facilities" | "Candidate" | "Auto";
export type Perm = "Read" | "Member" | "Admin";

export const OWNERS: Owner[] = ["HR", "Dept Head", "Manager", "IT", "Finance", "Security", "Facilities", "Candidate", "Auto"];
export const VERIFIERS: Owner[] = ["HR", "Dept Head", "Manager", "IT", "Finance", "Security"];
export const PERMS: Perm[] = ["Read", "Member", "Admin"];

export type CatId = "packs" | "trigger" | "identity" | "eng" | "biz" | "pay" | "comp" | "phys" | "people" | "logic";

export interface BlockDef {
  key: string;
  name: string;
  mono: string;
  owner: Owner;
  /** default day offset relative to joining day (negative = before) */
  day: number;
  /** true when the block grants access to an app and therefore carries a permission level */
  perm: boolean;
  cat: CatId;
}

export const CATEGORIES: { id: CatId; name: string }[] = [
  { id: "packs", name: "Block packs" },
  { id: "trigger", name: "Triggers" },
  { id: "identity", name: "Identity & comms" },
  { id: "eng", name: "Engineering & product tools" },
  { id: "biz", name: "Business apps" },
  { id: "pay", name: "Payroll, benefits & finance" },
  { id: "comp", name: "Compliance & documents" },
  { id: "phys", name: "Physical & facilities" },
  { id: "people", name: "People & culture" },
  { id: "logic", name: "Logic & control" },
];

// [key, name, monogram, default owner, default day, grants app access?]
type Row = [string, string, string, Owner, number] | [string, string, string, Owner, number, 1];
const RAW: Record<Exclude<CatId, "packs">, Row[]> = {
  trigger: [
    ["offer_accept", "Offer accepted", "OA", "HR", -10],
    ["csv", "CSV ingested", "CSV", "HR", -10],
    ["doj", "Joining day · T0", "T0", "Auto", 0],
    ["manual", "Manual start", "GO", "HR", 0],
  ],
  identity: [
    ["gws", "Google Workspace email", "Gm", "IT", -3, 1],
    ["m365", "Microsoft 365 / Outlook", "M3", "IT", -3, 1],
    ["okta", "Okta SSO + MFA", "Ok", "IT", -3, 1],
    ["slack", "Slack", "Sl", "IT", -1, 1],
    ["teams", "Microsoft Teams", "Tm", "IT", -1, 1],
    ["zoom", "Zoom", "Zm", "IT", -1, 1],
    ["1pw", "1Password vault", "1P", "IT", -1, 1],
    ["vpn", "VPN / ZTNA", "VP", "IT", -1, 1],
  ],
  eng: [
    ["github", "GitHub", "GH", "IT", -1, 1],
    ["gitlab", "GitLab", "GL", "IT", -1, 1],
    ["jira", "Jira", "Ji", "IT", -1, 1],
    ["linear", "Linear", "Ln", "IT", -1, 1],
    ["aws", "AWS IAM", "AW", "IT", -1, 1],
    ["gcp", "Google Cloud", "GC", "IT", -1, 1],
    ["azure", "Azure", "Az", "IT", -1, 1],
    ["datadog", "Datadog", "DD", "IT", -1, 1],
    ["sentry", "Sentry", "Se", "IT", -1, 1],
    ["figma", "Figma", "Fi", "IT", -1, 1],
    ["notion", "Notion", "No", "IT", -1, 1],
    ["claude", "Claude", "Cl", "IT", -1, 1],
    ["chatgpt", "ChatGPT Team", "GP", "IT", -1, 1],
    ["cursor", "Cursor", "Cu", "IT", -1, 1],
  ],
  biz: [
    ["salesforce", "Salesforce", "Sf", "IT", -1, 1],
    ["hubspot", "HubSpot", "Hs", "IT", -1, 1],
    ["sap", "SAP / Tally", "SP", "Finance", -1, 1],
    ["zoho", "Zoho Books", "Zb", "Finance", -1, 1],
    ["looker", "Looker / BI", "Lk", "IT", -1, 1],
    ["canva", "Canva", "Cv", "IT", -1, 1],
    ["mixpanel", "Mixpanel", "Mp", "IT", -1, 1],
  ],
  pay: [
    ["payroll", "Payroll setup", "PR", "Finance", 2],
    ["uan", "PF / UAN / ESI", "PF", "Finance", 2],
    ["bank", "Bank details", "Bk", "Candidate", 2],
    ["tax", "Tax declaration", "Tx", "Candidate", 7],
    ["health", "Health insurance", "Hi", "HR", 2],
    ["life", "Group term life", "Li", "HR", 30],
    ["nps", "NPS / 401k", "NP", "HR", 30],
    ["expense", "Expense tool", "Ex", "Finance", 5, 1],
    ["card", "Corporate card", "Cc", "Finance", 5],
    ["travel", "Travel desk", "Tr", "Finance", 5, 1],
    ["stipend", "Stipend setup", "St", "Finance", 2],
  ],
  comp: [
    ["offer", "Offer letter generated", "OL", "HR", -9],
    ["esign", "E-sign contract", "Es", "Candidate", -9],
    ["nda", "NDA & IP assignment", "ND", "Candidate", -7],
    ["docs", "Document upload", "Dc", "Candidate", -7],
    ["bgv", "Background check", "BG", "HR", -7],
    ["edu", "Education verify", "Ed", "HR", -7],
    ["emp", "Employment verify", "Em", "HR", -7],
    ["crim", "Address & criminal", "Cr", "HR", -7],
    ["policy", "Policy acknowledgements", "Po", "Candidate", 0],
    ["posh", "POSH / Code of conduct", "PS", "Candidate", 3],
    ["sec", "Security awareness", "Sx", "Security", 3],
  ],
  phys: [
    ["idcard", "ID card printed", "ID", "Facilities", -3],
    ["access", "Premises access", "Ac", "Facilities", 0],
    ["laptop", "Laptop dispatch", "Lp", "IT", -3],
    ["desk", "Desk / seat", "Dk", "Facilities", 0],
    ["parking", "Parking pass", "Pk", "Facilities", 0],
    ["kit", "Welcome kit", "Wk", "Facilities", -2],
  ],
  people: [
    ["agenda", "Day-1 agenda", "D1", "Manager", 0],
    ["buddy", "Assign buddy", "Bd", "Manager", -2],
    ["intro", "Intro post", "In", "Manager", 0],
    ["oneone", "1:1 with manager", "11", "Manager", 7],
    ["lunch", "Team lunch", "Tl", "Manager", 1],
    ["courses", "Training path", "Tp", "Manager", 7],
    ["review", "30-day check-in", "30", "Manager", 30],
    ["confirm", "Probation confirmation", "PC", "HR", 90],
  ],
  logic: [
    ["approve", "Approval gate", "OK", "Dept Head", 0],
    ["wait", "Wait N days", "Wt", "Auto", 0],
    ["cond", "Condition (if/else)", "If", "Auto", 0],
    ["par", "Parallel split", "||", "Auto", 0],
    ["remind", "Reminder", "Rm", "Auto", 0],
    ["webhook", "Webhook / API call", "{}", "Auto", 0],
  ],
};

export const BLOCKS: Record<string, BlockDef> = {};
export const BLOCKS_BY_CAT: Record<string, BlockDef[]> = {};
for (const cat of CATEGORIES) {
  if (cat.id === "packs") continue;
  BLOCKS_BY_CAT[cat.id] = RAW[cat.id].map(([key, name, mono, owner, day, perm]) => {
    const b: BlockDef = { key, name, mono, owner, day, perm: !!perm, cat: cat.id };
    BLOCKS[key] = b;
    return b;
  });
}

export interface Pack { name: string; keys: string[] }
export const PACKS: Pack[] = [
  { name: "IT baseline", keys: ["gws", "slack", "laptop", "idcard", "vpn"] },
  { name: "India statutory", keys: ["uan", "bank", "payroll", "health"] },
  { name: "Compliance pack", keys: ["nda", "policy", "posh", "sec"] },
  { name: "Dev starter", keys: ["github", "jira", "aws", "claude"] },
  { name: "Day-1 experience", keys: ["agenda", "buddy", "intro", "lunch"] },
];

export const ALL_BLOCKS = Object.values(BLOCKS);
