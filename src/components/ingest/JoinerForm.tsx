"use client";
import { useState } from "react";
import { CANON } from "@/lib/ats/providers";
import { KNOWN_LOCATIONS } from "@/lib/geo";
import type { Loaded } from "@/lib/onboarding/datasets";
import { LEVELS, TYPES } from "@/lib/workflow";
import { useOnboarding } from "@/store/onboarding";
import { Button } from "@/components/ui/Button";

const LABEL = "block font-mono text-[10.5px] text-mute";
const INPUT = "mt-1 block w-full rounded-lg border border-line bg-[#fffdf7] px-3 py-2 text-[13px] text-ink outline-none focus:border-ink";

/**
 * Add one new joiner by hand. Departments and managers come from the directory, so the usual typos can't happen;
 * the record then goes through the same validation as any import before it is added.
 */
export function JoinerForm({ onLoaded, busy }: { onLoaded: (loaded: Loaded, label: string) => unknown; busy: boolean }) {
  const dir = useOnboarding((s) => s.directory);
  const [f, setF] = useState<Record<string, string>>({ emp_type: "Full-time", level: "Mid", department: dir.departments[0] ?? "", manager: "" });
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const managers = dir.managers.filter((m) => !f.department || m.department === f.department);
  const missing = ["full_name", "email", "role", "department", "location", "grade", "start_date", "manager"].filter((k) => !f[k]?.trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (missing.length) return;
    const row = Object.fromEntries(CANON.map((k) => [k, (f[k] ?? "").trim()]));
    onLoaded({ name: "Added by hand", format: "json", tabular: { headers: [...CANON], rows: [row] } }, "Added by hand");
  };

  return (
    <form onSubmit={submit} className="paper-card mx-auto max-w-[820px] rounded-[22px] bg-paper2 p-6">
      <div className="eyebrow !text-[10px]">new joiner</div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
        <label className={LABEL}>Full name *<input value={f.full_name ?? ""} onChange={set("full_name")} className={INPUT} /></label>
        <label className={LABEL}>Personal email *<input type="email" value={f.email ?? ""} onChange={set("email")} className={INPUT} /></label>
        <label className={LABEL}>Job title *<input value={f.role ?? ""} onChange={set("role")} placeholder="e.g. Backend Engineer" className={INPUT} /></label>
        <label className={LABEL}>Phone<input value={f.phone ?? ""} onChange={set("phone")} className={INPUT} /></label>
        <label className={LABEL}>Department *
          <select value={f.department} onChange={(e) => setF((s) => ({ ...s, department: e.target.value, manager: "" }))} className={INPUT}>{dir.departments.map((d) => <option key={d}>{d}</option>)}</select>
        </label>
        <label className={LABEL}>Reporting manager *
          <select value={f.manager} onChange={set("manager")} className={INPUT}><option value="">Choose…</option>{managers.map((m) => <option key={m.email} value={m.name}>{m.name}</option>)}</select>
        </label>
        <label className={LABEL}>Employment type *<select value={f.emp_type} onChange={set("emp_type")} className={INPUT}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className={LABEL}>Level *<select value={f.level} onChange={set("level")} className={INPUT}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></label>
        <label className={LABEL}>Grade *<input value={f.grade ?? ""} onChange={set("grade")} placeholder="e.g. L4" className={INPUT} /></label>
        <label className={LABEL}>Location *<input list="sj-locations" value={f.location ?? ""} onChange={set("location")} className={INPUT} /><datalist id="sj-locations">{KNOWN_LOCATIONS.map((l) => <option key={l} value={l} />)}</datalist></label>
        <label className={LABEL}>Joining date *<input type="date" value={f.start_date ?? ""} onChange={set("start_date")} className={INPUT} /></label>
        <label className={LABEL}>Date of birth<input type="date" value={f.dob ?? ""} onChange={set("dob")} className={INPUT} /></label>
        <label className={`${LABEL} col-span-2`}>Current address<input value={f.address ?? ""} onChange={set("address")} className={INPUT} /></label>
        <label className={LABEL}>Highest education<input value={f.education ?? ""} onChange={set("education")} className={INPUT} /></label>
        <label className={LABEL}>Previous employer<input value={f.prev_employer ?? ""} onChange={set("prev_employer")} className={INPUT} /></label>
      </div>
      <p className="mt-3 text-[11.5px] text-[#6b6252]">Anything you leave blank (address, ID numbers, …) is shown as missing on their checklist and requested from them. * required.</p>
      <div className="mt-4 flex items-center gap-3">
        <Button accent disabled={busy || missing.length > 0} className="!px-5 !py-3">Check & review →</Button>
        {missing.length > 0 && <span className="font-mono text-[10.5px] text-mute">still needed: {missing.map((m) => m.replace("_", " ")).join(", ")}</span>}
      </div>
    </form>
  );
}
