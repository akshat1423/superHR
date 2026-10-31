export type Owner = "HR" | "Dept Head" | "Manager" | "IT" | "Finance" | "Security" | "Facilities" | "Candidate" | "Auto";
export type Perm = "Read" | "Member" | "Admin";

export const OWNERS: Owner[] = ["HR", "Dept Head", "Manager", "IT", "Finance", "Security", "Facilities", "Candidate", "Auto"];
export const VERIFIERS: Owner[] = ["HR", "Dept Head", "Manager", "IT", "Finance", "Security"];
export const PERMS: Perm[] = ["Read", "Member", "Admin"];

export type CatId =
  | "packs" | "trigger" | "identity" | "ai" | "dev" | "data" | "product" | "biz"
  | "pay" | "comp" | "phys" | "people" | "logic";

/**
 * How a block is drawn. `brand` is a logo id from the generated brand set (real company logos, see
 * scripts/gen-brand-icons.ts); `lucide` is a generic icon name for steps that aren't a specific app.
 */
export type IconSpec = { brand: string; lucide?: undefined } | { lucide: string; brand?: undefined };

export interface BlockDef {
  key: string;
  name: string;
  owner: Owner;
  /** default day offset relative to joining day (negative = before) */
  day: number;
  /** true when the block grants access to an app and therefore carries a permission level */
  perm: boolean;
  cat: CatId;
  icon: IconSpec;
}

export const CATEGORIES: { id: CatId; name: string }[] = [
  { id: "packs", name: "Block packs" },
  { id: "trigger", name: "Triggers" },
  { id: "identity", name: "Identity, email & comms" },
  { id: "ai", name: "AI tools" },
  { id: "dev", name: "Engineering & cloud" },
  { id: "data", name: "Data & observability" },
  { id: "product", name: "Product & collaboration" },
  { id: "biz", name: "Sales, support & finance apps" },
  { id: "pay", name: "Payroll, benefits & spend" },
  { id: "comp", name: "Compliance & documents" },
  { id: "phys", name: "Physical & facilities" },
  { id: "people", name: "People & learning" },
  { id: "logic", name: "Logic & control" },
];

type Def = Omit<BlockDef, "cat">;
const brand = (id: string): IconSpec => ({ brand: id });
const glyph = (name: string): IconSpec => ({ lucide: name });

/** An app the new joiner gets access to (carries a permission level). */
const app = (key: string, name: string, logo: IconSpec, owner: Owner = "IT", day = -1): Def => ({ key, name, owner, day, perm: true, icon: logo });
/** A task or step (no app permission). */
const step = (key: string, name: string, icon: string, owner: Owner, day: number): Def => ({ key, name, owner, day, perm: false, icon: glyph(icon) });

const RAW: Record<Exclude<CatId, "packs">, Def[]> = {
  trigger: [
    step("offer_accept", "Offer accepted", "FileCheck", "HR", -10),
    step("csv", "CSV ingested", "FileSpreadsheet", "HR", -10),
    { key: "ats_greenhouse", name: "Greenhouse hire", owner: "HR", day: -10, perm: false, icon: brand("si:greenhouse") },
    step("doj", "Joining day · T0", "Sunrise", "Auto", 0),
    step("manual", "Manual start", "Play", "HR", 0),
  ],
  identity: [
    app("gws", "Google Workspace", brand("logos:google-workspace"), "IT", -3),
    app("m365", "Microsoft 365", brand("mdi:microsoft-office"), "IT", -3),
    app("outlook", "Outlook", brand("mdi:microsoft-outlook"), "IT", -3),
    app("okta", "Okta SSO + MFA", brand("logos:okta"), "IT", -3),
    app("slack", "Slack", brand("logos:slack-icon")),
    app("teams", "Microsoft Teams", brand("logos:microsoft-teams")),
    app("zoom", "Zoom", brand("logos:zoom-icon")),
    app("meet", "Google Meet", brand("logos:google-meet")),
    app("gdrive", "Google Drive", brand("logos:google-drive")),
    app("onedrive", "OneDrive", brand("logos:microsoft-onedrive")),
    app("sharepoint", "SharePoint", brand("mdi:microsoft-sharepoint")),
    app("1pw", "1Password", brand("si:1password")),
    app("lastpass", "LastPass", brand("si:lastpass")),
    app("whatsapp", "WhatsApp Business", brand("logos:whatsapp-icon")),
    app("vpn", "VPN / ZTNA", glyph("Network")),
  ],
  ai: [
    app("claude", "Claude", brand("logos:claude-icon")),
    app("chatgpt", "ChatGPT", brand("logos:openai-icon")),
    app("gemini", "Gemini", brand("logos:google-gemini")),
    app("cursor", "Cursor", brand("logos:cursor")),
    app("copilot", "GitHub Copilot", brand("logos:github-copilot")),
    app("perplexity", "Perplexity", brand("logos:perplexity")),
  ],
  dev: [
    app("github", "GitHub", brand("logos:github-icon")),
    app("gitlab", "GitLab", brand("logos:gitlab-icon")),
    app("bitbucket", "Bitbucket", brand("logos:bitbucket")),
    app("jira", "Jira", brand("logos:jira")),
    app("confluence", "Confluence", brand("logos:confluence")),
    app("aws", "AWS IAM", brand("logos:aws")),
    app("gcp", "Google Cloud", brand("logos:google-cloud")),
    app("azure", "Microsoft Azure", brand("logos:microsoft-azure")),
    app("docker", "Docker", brand("logos:docker")),
    app("kubernetes", "Kubernetes", brand("logos:kubernetes")),
    app("terraform", "Terraform", brand("logos:terraform")),
    app("vercel", "Vercel", brand("logos:vercel-icon")),
    app("cloudflare", "Cloudflare", brand("logos:cloudflare")),
  ],
  data: [
    app("datadog", "Datadog", brand("logos:datadog")),
    app("sentry", "Sentry", brand("logos:sentry")),
    app("pagerduty", "PagerDuty", brand("logos:pagerduty-icon")),
    app("grafana", "Grafana", brand("logos:grafana")),
    app("snowflake", "Snowflake", brand("logos:snowflake")),
    app("databricks", "Databricks", brand("logos:databricks")),
    app("mongodb", "MongoDB", brand("logos:mongodb")),
    app("postgres", "PostgreSQL", brand("logos:postgresql")),
    app("looker", "Looker", brand("logos:looker")),
    app("tableau", "Tableau", brand("logos:tableau")),
    app("powerbi", "Power BI", brand("logos:microsoft-power-bi")),
    app("mixpanel", "Mixpanel", brand("logos:mixpanel")),
    app("amplitude", "Amplitude", brand("logos:amplitude")),
  ],
  product: [
    app("figma", "Figma", brand("logos:figma")),
    app("miro", "Miro", brand("logos:miro-icon")),
    app("notion", "Notion", brand("logos:notion-icon")),
    app("linear", "Linear", brand("logos:linear-icon")),
    app("asana", "Asana", brand("logos:asana")),
    app("trello", "Trello", brand("logos:trello")),
    app("clickup", "ClickUp", brand("logos:clickup")),
    app("monday", "monday.com", brand("logos:monday")),
    app("loom", "Loom", brand("logos:loom")),
    app("airtable", "Airtable", brand("logos:airtable")),
    app("zapier", "Zapier", brand("logos:zapier")),
    app("postman", "Postman", brand("logos:postman")),
    app("calendly", "Calendly", brand("si:calendly")),
  ],
  biz: [
    app("salesforce", "Salesforce", brand("logos:salesforce")),
    app("hubspot", "HubSpot", brand("logos:hubspot")),
    app("zendesk", "Zendesk", brand("logos:zendesk")),
    app("intercom", "Intercom", brand("logos:intercom")),
    app("stripe", "Stripe", brand("logos:stripe"), "Finance"),
    app("sap", "SAP", brand("logos:sap"), "Finance"),
    app("zoho", "Zoho One", brand("logos:zoho"), "Finance"),
    app("xero", "Xero", brand("logos:xero"), "Finance"),
    app("quickbooks", "QuickBooks", brand("si:quickbooks"), "Finance"),
    app("mailchimp", "Mailchimp", brand("logos:mailchimp")),
    app("twilio", "Twilio", brand("logos:twilio")),
  ],
  pay: [
    step("payroll", "Payroll setup", "CreditCard", "Finance", 2),
    app("razorpayx", "RazorpayX Payroll", brand("si:razorpay"), "Finance", 2),
    app("gusto", "Gusto", brand("logos:gusto"), "Finance", 2),
    step("uan", "PF / UAN / ESI", "Landmark", "Finance", 2),
    step("bank", "Bank details", "Banknote", "Candidate", 2),
    step("tax", "Tax declaration", "Receipt", "Candidate", 7),
    step("health", "Health insurance", "HeartPulse", "HR", 2),
    step("life", "Group term life", "Heart", "HR", 30),
    step("nps", "NPS / 401k", "PiggyBank", "HR", 30),
    step("stipend", "Stipend setup", "Wallet", "Finance", 2),
    app("expense", "Expensify", brand("si:expensify"), "Finance", 5),
    app("card", "Brex corporate card", brand("si:brex"), "Finance", 5),
    step("travel", "Travel desk", "Plane", "Finance", 5),
  ],
  comp: [
    step("offer", "Offer letter generated", "FileText", "HR", -9),
    step("esign", "E-sign contract", "PenLine", "Candidate", -9),
    step("nda", "NDA & IP assignment", "ScrollText", "Candidate", -7),
    step("docs", "Document upload", "Upload", "Candidate", -7),
    step("bgv", "Background check", "SearchCheck", "HR", -7),
    step("edu", "Education verify", "GraduationCap", "HR", -7),
    step("emp", "Employment verify", "Briefcase", "HR", -7),
    step("crim", "Address & criminal", "MapPin", "HR", -7),
    step("policy", "Policy acknowledgements", "ClipboardCheck", "Candidate", 0),
    step("posh", "POSH / Code of conduct", "Scale", "Candidate", 3),
    step("sec", "Security awareness", "Lock", "Security", 3),
  ],
  phys: [
    step("idcard", "ID card printed", "IdCard", "Facilities", -3),
    step("access", "Premises access", "DoorOpen", "Facilities", 0),
    step("laptop", "Laptop dispatch", "Laptop", "IT", -3),
    step("desk", "Desk / seat", "Armchair", "Facilities", 0),
    step("parking", "Parking pass", "Car", "Facilities", 0),
    step("kit", "Welcome kit", "Gift", "Facilities", -2),
  ],
  people: [
    step("agenda", "Day-1 agenda", "CalendarDays", "Manager", 0),
    step("buddy", "Assign buddy", "Users", "Manager", -2),
    step("intro", "Intro post", "Megaphone", "Manager", 0),
    step("oneone", "1:1 with manager", "MessageSquare", "Manager", 7),
    step("lunch", "Team lunch", "Utensils", "Manager", 1),
    step("courses", "Training path", "BookOpen", "Manager", 7),
    app("coursera", "Coursera", brand("logos:coursera"), "Manager", 7),
    app("udemy", "Udemy Business", brand("logos:udemy"), "Manager", 7),
    app("linkedin", "LinkedIn Learning", brand("logos:linkedin"), "Manager", 7),
    step("review", "30-day check-in", "CalendarCheck", "Manager", 30),
    step("confirm", "Probation confirmation", "BadgeCheck", "HR", 90),
  ],
  logic: [
    step("approve", "Approval gate", "Stamp", "Dept Head", 0),
    step("wait", "Wait N days", "Clock", "Auto", 0),
    step("cond", "Condition (if/else)", "Split", "Auto", 0),
    step("par", "Parallel split", "GitBranch", "Auto", 0),
    step("remind", "Reminder", "Bell", "Auto", 0),
    step("webhook", "Webhook / API call", "Webhook", "Auto", 0),
  ],
};

export const BLOCKS: Record<string, BlockDef> = {};
export const BLOCKS_BY_CAT: Record<string, BlockDef[]> = {};
for (const cat of CATEGORIES) {
  if (cat.id === "packs") continue;
  BLOCKS_BY_CAT[cat.id] = RAW[cat.id].map((d) => {
    const b: BlockDef = { ...d, cat: cat.id };
    BLOCKS[b.key] = b;
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
