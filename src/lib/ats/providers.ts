/**
 * Applicant-tracking systems the ingest screen can sync new joiners from. Each provider knows the shape of its own
 * API (how a hired candidate looks, how pages are requested) and how to turn that into the columns superjoin reads.
 * The sandbox side (`toPage`) renders our sample joiners the way the vendor's API would; `fromPage` is the real
 * mapper and works on any payload of that shape, including one fetched from a live tenant.
 */
export type AtsId = "greenhouse" | "lever" | "workday";
type Row = Record<string, string>;

/** The columns every provider maps to (the same ones a CSV upload uses). */
export const CANON = ["full_name", "email", "phone", "role", "department", "emp_type", "level", "grade", "location", "start_date", "manager", "dob", "address", "pan", "aadhaar", "bank_account", "photo_url", "emergency_contact", "education", "prev_employer", "school"] as const;

export interface AtsProvider {
  id: AtsId;
  name: string;
  /** what the product calls the thing we read */
  noun: string;
  tenantLabel: string;
  tenantPlaceholder: string;
  tokenLabel: string;
  /** shown in the log: the request for one page */
  endpoint: (tenant: string, page: number) => string;
  /** env var names for a live connection */
  env: { url: string; token: string };
  pageSize: number;
  /** sandbox: render a page of sample rows as this vendor's API would return it */
  toPage: (rows: Row[], page: number, size: number, tenant: string) => unknown;
  /** how many candidate records a page holds, and whether another follows */
  describe: (payload: unknown) => { records: number; hasNext: boolean };
  /** the real mapper: a vendor payload → canonical rows */
  fromPage: (payload: unknown) => Row[];
}

const g = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const first = (v: unknown) => g(obj(arr(v)[0]).value);
const split = (name: string) => { const [a, ...b] = name.trim().split(/\s+/); return [a ?? "", b.join(" ")] as const; };
const slice = (rows: Row[], page: number, size: number) => rows.slice((page - 1) * size, page * size);
const uid = (n: string, i: number) => Math.abs([...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7 + i)) % 90000000 + 10000000;

const greenhouse: AtsProvider = {
  id: "greenhouse", name: "Greenhouse", noun: "hired applications", tenantLabel: "Harvest API host", tenantPlaceholder: "harvest.greenhouse.io", tokenLabel: "Harvest API key",
  endpoint: (t, p) => `GET https://${t || "harvest.greenhouse.io"}/v1/applications?status=hired&per_page=10&page=${p}`,
  env: { url: "ATS_GREENHOUSE_URL", token: "ATS_GREENHOUSE_TOKEN" }, pageSize: 10,
  toPage: (rows, page, size) => slice(rows, page, size).map((r, i) => {
    const [fn, ln] = split(r.full_name);
    const id = uid(r.full_name, i);
    return {
      id, status: "hired", applied_at: "2026-09-02T09:14:00.000Z", last_activity_at: "2026-10-12T16:40:00.000Z",
      candidate: {
        id: id + 1, first_name: fn, last_name: ln, company: r.prev_employer || null,
        phone_numbers: r.phone ? [{ value: r.phone, type: "mobile" }] : [], email_addresses: r.email ? [{ value: r.email, type: "personal" }] : [], addresses: r.address ? [{ value: r.address, type: "home" }] : [],
        educations: [{ school_name: r.school || null, degree: r.education || null }],
        employments: r.prev_employer ? [{ company_name: r.prev_employer }] : [],
        photo_url: r.photo_url || null,
        custom_fields: { date_of_birth: r.dob || null, pan: r.pan || null, national_id: r.aadhaar || null, bank_account: r.bank_account || null, emergency_contact: r.emergency_contact || null },
      },
      jobs: [{ id: id + 2, name: r.role, departments: [{ name: r.department }], offices: [{ name: r.location }] }],
      offer: { status: "accepted", starts_at: r.start_date, custom_fields: { employment_type: r.emp_type, level: r.level, grade: r.grade, hiring_manager: r.manager } },
    };
  }),
  describe: (p) => ({ records: arr(p).length, hasNext: arr(p).length >= 10 }),
  fromPage: (p) => arr(p).map((a) => {
    const app = obj(a), c = obj(app.candidate), job = obj(arr(app.jobs)[0]), offer = obj(app.offer), of = obj(offer.custom_fields), cf = obj(c.custom_fields), ed = obj(arr(c.educations)[0]);
    return {
      full_name: `${g(c.first_name)} ${g(c.last_name)}`.trim(), email: first(c.email_addresses), phone: first(c.phone_numbers), role: g(job.name), department: g(obj(arr(job.departments)[0]).name), emp_type: g(of.employment_type), level: g(of.level), grade: g(of.grade),
      location: g(obj(arr(job.offices)[0]).name), start_date: g(offer.starts_at), manager: g(of.hiring_manager), dob: g(cf.date_of_birth), address: first(c.addresses), pan: g(cf.pan), aadhaar: g(cf.national_id), bank_account: g(cf.bank_account),
      photo_url: g(c.photo_url), emergency_contact: g(cf.emergency_contact), education: g(ed.degree), prev_employer: g(obj(arr(c.employments)[0]).company_name), school: g(ed.school_name),
    };
  }),
};

const lever: AtsProvider = {
  id: "lever", name: "Lever", noun: "hired opportunities", tenantLabel: "Lever API host", tenantPlaceholder: "api.lever.co", tokenLabel: "API key",
  endpoint: (t, p) => `GET https://${t || "api.lever.co"}/v1/opportunities?stage=hired&limit=10${p > 1 ? `&offset=page${p}` : ""}`,
  env: { url: "ATS_LEVER_URL", token: "ATS_LEVER_TOKEN" }, pageSize: 10,
  toPage: (rows, page, size) => {
    const part = slice(rows, page, size);
    return {
      data: part.map((r, i) => ({
        id: `${uid(r.full_name, i).toString(16)}-4b1e-9c2d`, name: r.full_name, headline: r.role, contact: `c-${uid(r.full_name, i + 9)}`, emails: r.email ? [r.email] : [], phones: r.phone ? [{ value: r.phone }] : [],
        location: r.location, stage: { text: "Hired" }, owner: { name: r.manager }, createdAt: 1756800000000, hiredOn: 1760000000000,
        applications: [{ posting: { text: r.role, categories: { team: r.department, location: r.location, commitment: r.emp_type, level: r.level } } }],
        fields: { startDate: r.start_date, grade: r.grade, dateOfBirth: r.dob, address: r.address, pan: r.pan, nationalId: r.aadhaar, bankAccount: r.bank_account, photo: r.photo_url, emergencyContact: r.emergency_contact, education: r.education, previousEmployer: r.prev_employer, school: r.school },
      })),
      hasNext: page * size < rows.length, next: page * size < rows.length ? `page${page + 1}` : undefined,
    };
  },
  describe: (p) => ({ records: arr(obj(p).data).length, hasNext: obj(p).hasNext === true }),
  fromPage: (p) => arr(obj(p).data).map((o) => {
    const x = obj(o), cat = obj(obj(obj(arr(x.applications)[0]).posting).categories), f = obj(x.fields);
    return {
      full_name: g(x.name), email: g(arr(x.emails)[0]), phone: first(x.phones), role: g(x.headline) || g(obj(obj(arr(x.applications)[0]).posting).text), department: g(cat.team), emp_type: g(cat.commitment), level: g(cat.level), grade: g(f.grade),
      location: g(cat.location) || g(x.location), start_date: g(f.startDate), manager: g(obj(x.owner).name), dob: g(f.dateOfBirth), address: g(f.address), pan: g(f.pan), aadhaar: g(f.nationalId), bank_account: g(f.bankAccount),
      photo_url: g(f.photo), emergency_contact: g(f.emergencyContact), education: g(f.education), prev_employer: g(f.previousEmployer), school: g(f.school),
    };
  }),
};

const workday: AtsProvider = {
  id: "workday", name: "Workday", noun: "pre-hire report rows", tenantLabel: "Tenant", tenantPlaceholder: "acme", tokenLabel: "Integration system user token",
  endpoint: (t, p) => `GET https://services1.wd3.myworkday.com/ccx/service/customreport2/${t || "acme"}/ISU_Onboarding/New_Hires?format=json&offset=${(p - 1) * 10}&limit=10`,
  env: { url: "ATS_WORKDAY_URL", token: "ATS_WORKDAY_TOKEN" }, pageSize: 10,
  toPage: (rows, page, size) => ({
    Report_Entry: slice(rows, page, size).map((r) => ({
      Worker: r.full_name, Primary_Work_Email: r.email, Primary_Phone: r.phone, Business_Title: r.role, Supervisory_Organization: `${r.department} (${r.manager})`, Department: r.department, Worker_Type: r.emp_type, Job_Level: r.level, Job_Grade: r.grade,
      Work_Location: r.location, Hire_Date: r.start_date, Manager: r.manager, Date_of_Birth: r.dob, Home_Address: r.address, PAN: r.pan, National_ID: r.aadhaar, Bank_Account: r.bank_account, Photo: r.photo_url, Emergency_Contact: r.emergency_contact, Highest_Education: r.education, Previous_Employer: r.prev_employer, School: r.school,
    })),
    Total: rows.length,
  }),
  describe: (p) => ({ records: arr(obj(p).Report_Entry).length, hasNext: arr(obj(p).Report_Entry).length >= 10 }),
  fromPage: (p) => arr(obj(p).Report_Entry).map((o) => {
    const x = obj(o);
    return {
      full_name: g(x.Worker), email: g(x.Primary_Work_Email), phone: g(x.Primary_Phone), role: g(x.Business_Title), department: g(x.Department), emp_type: g(x.Worker_Type), level: g(x.Job_Level), grade: g(x.Job_Grade), location: g(x.Work_Location), start_date: g(x.Hire_Date),
      manager: g(x.Manager), dob: g(x.Date_of_Birth), address: g(x.Home_Address), pan: g(x.PAN), aadhaar: g(x.National_ID), bank_account: g(x.Bank_Account), photo_url: g(x.Photo), emergency_contact: g(x.Emergency_Contact),
      education: g(x.Highest_Education), prev_employer: g(x.Previous_Employer), school: g(x.School),
    };
  }),
};

export const ATS_PROVIDERS: Record<AtsId, AtsProvider> = { greenhouse, lever, workday };
export const ATS_LIST = [greenhouse, lever, workday];
export const isAtsId = (s: string): s is AtsId => s in ATS_PROVIDERS;
