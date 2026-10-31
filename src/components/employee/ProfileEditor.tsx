"use client";
import { useMemo, useState } from "react";
import { useUser } from "@/components/shell/AuthProvider";
import { canEditEmployee } from "@/lib/auth/policy";
import { addDays, fmtHuman } from "@/lib/dates";
import { KNOWN_LOCATIONS } from "@/lib/geo";
import { DEPTS, LEVELS, TYPES, type Dept, type EmpType, type Level } from "@/lib/workflow";
import type { EmployeeView } from "@/hooks/useEmployeeView";
import { ACTION_ORDER, patched, provisioningImpact, serviceName } from "@/lib/provisioning/impact";
import { runProvActions } from "@/lib/provisioning/orchestrate";
import type { ProvAction } from "@/lib/provision";
import { serviceIndex } from "@/lib/services";
import { useOnboarding } from "@/store/onboarding";
import { useProvisioning } from "@/store/provisioning";
import type { PersonPatch } from "@/store/people";
import { toast } from "@/store/toast";

const field = "sj-input !py-2";
const Label = ({ children }: { children: React.ReactNode }) => <label className="eyebrow mb-1 block !text-[10px]">{children}</label>;

/**
 * Scenario 4: change the joining date, role, grade, department, location or manager. The checklist is re-evaluated
 * rather than rebuilt — progress is kept, due dates and owners move, items appear or go, and a summary says what changed.
 * What the services already created follows: applications the new role no longer has are revoked, new ones granted, and
 * the calendar, desk, payroll and offer are moved or reissued. The editor shows exactly that before you apply it.
 */
export function ProfileEditor({ view }: { view: EmployeeView }) {
  const user = useUser();
  const directory = useOnboarding((s) => s.directory);
  const updateEmployee = useOnboarding((s) => s.updateEmployee);
  const p = view.person;
  const editable = canEditEmployee(user, p) && !p.terminated;
  const run = useProvisioning((s) => s.run.people.find((r) => r.personId === p.id));
  const [prov, setProv] = useState<{ actions: ProvAction[]; ok: number; failed: number } | null>(null);
  const [provBusy, setProvBusy] = useState(false);
  const [f, setF] = useState({ role: p.role, grade: p.grade, level: p.persona.level as Level, department: p.persona.dept as Dept, location: p.location, type: p.persona.type as EmpType, startDate: p.startDate, manager: p.manager });
  const [summary, setSummary] = useState<string[] | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const statusOf = (svc: string) => run?.tasks[serviceIndex(svc)]?.status;
  const apply = async (patch: PersonPatch) => {
    // work out the provisioning consequences against the person as they are now, before the change is stored
    const actions = provisioningImpact(p, patched(p, patch), statusOf);
    const r = updateEmployee(p.id, patch, user.name);
    if (!r) { toast("Nothing changed"); return; }
    setSummary(r.lines);
    setProv(null);
    setF((s) => ({ ...s, ...(patch.startDate ? { startDate: patch.startDate } : {}) }));
    if (!actions.length) { toast("Checklist recalculated"); return; }
    setProvBusy(true);
    const res = await runProvActions(actions, p.id, user.name);
    setProvBusy(false);
    setProv({ actions, ...res });
    toast(res.failed ? `Checklist recalculated; ${res.failed} provisioning change${res.failed > 1 ? "s" : ""} failed` : `Checklist recalculated · ${res.ok} provisioning change${res.ok === 1 ? "" : "s"} applied`);
  };
  const changed = f.role !== p.role || f.grade !== p.grade || f.level !== p.persona.level || f.department !== p.persona.dept || f.location !== p.location || f.type !== p.persona.type || f.startDate !== p.startDate || f.manager !== p.manager;
  const draft: PersonPatch = { role: f.role, grade: f.grade, level: f.level, department: f.department, location: f.location, type: f.type, startDate: f.startDate, manager: f.manager };
  const impact = useMemo(() => (changed && run ? provisioningImpact(p, patched(p, draft), statusOf).sort((x, y) => ACTION_ORDER[x.kind] - ACTION_ORDER[y.kind]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [changed, run, p, f]);
  const managers = [...new Set([...directory.managers.map((m) => m.name), p.manager])];
  const locations = [...new Set([...KNOWN_LOCATIONS, p.location])];

  return (
    <div className="grid grid-cols-[1fr_380px] gap-5">
      <div className="paper-card rounded-2xl bg-paper2 p-5">
        <h3 className="text-[17px] font-extrabold tracking-[-.02em]">Profile</h3>
        <p className="mb-4 text-[12.5px] text-mute">{editable ? "Change anything below and the checklist recalculates: progress is kept, dates and owners move." : "Only HR or the head of this person’s department can change these."}</p>
        <fieldset disabled={!editable} className="grid grid-cols-2 gap-3 border-0 p-0">
          <div><Label>Role</Label><input className={field} value={f.role} onChange={(e) => set("role", e.target.value)} /></div>
          <div><Label>Grade (HR label)</Label><input className={field} value={f.grade} onChange={(e) => set("grade", e.target.value)} /></div>
          <div><Label>Grade band</Label><select className={field} value={f.level} onChange={(e) => set("level", e.target.value as Level)}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><Label>Employment type</Label><select className={field} value={f.type} onChange={(e) => set("type", e.target.value as EmpType)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><Label>Department</Label><select className={field} value={f.department} onChange={(e) => set("department", e.target.value as Dept)}>{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></div>
          <div><Label>Location</Label><select className={field} value={f.location} onChange={(e) => set("location", e.target.value)}>{locations.map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><Label>Manager</Label><select className={field} value={f.manager} onChange={(e) => set("manager", e.target.value)}>{managers.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><Label>Joining date</Label><input type="date" className={field} value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
        </fieldset>
        {editable && changed && (
          <div className="mt-4 rounded-xl border border-line bg-[#fffdf7] p-3.5">
            <div className="eyebrow !text-[10px]">what this does to provisioning</div>
            {impact.length === 0
              ? <p className="mt-1 text-[12.5px] text-[#4b4338]">{run ? "Nothing the services already created needs to change." : "Provisioning hasn’t started for this person, so there is nothing to change yet."}</p>
              : <ul className="mt-1.5 space-y-1.5">{impact.map((a, i) => (
                <li key={i} className="flex gap-2 text-[12.5px]">
                  <span className={a.kind === "deprovision" ? "text-bad" : a.kind === "provision" ? "text-ok" : "text-acc"}>{a.kind === "deprovision" ? "✕" : a.kind === "provision" ? "＋" : "↻"}</span>
                  <span><b>{a.kind === "deprovision" ? "Revoke" : a.kind === "provision" ? "Grant" : "Update"} {a.object ?? serviceName(a.service)}</b>{a.object ? <span className="text-mute"> · {serviceName(a.service)}</span> : null} <span className="text-[#4b4338]">— {a.reason}</span></span>
                </li>))}</ul>}
          </div>
        )}
        {editable && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-4">
            <button disabled={!changed || provBusy} onClick={() => void apply(draft)} className="rounded-xl border border-[#e58a62] bg-gradient-to-b from-[#d4673c] to-[#bd5028] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[.1em] text-white shadow-[0_3px_0_#8d3a1b] disabled:opacity-40">{provBusy ? "Updating services…" : `Apply & recalculate${impact.length ? ` · ${impact.length} service change${impact.length > 1 ? "s" : ""}` : ""}`}</button>
            <span className="eyebrow !text-[10px]">Quick:</span>
            <button disabled={provBusy} onClick={() => void apply({ startDate: addDays(p.startDate, 7) })} className="rounded-lg border border-line px-3 py-2 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0]">Postpone 1 week</button>
            <button disabled={provBusy} onClick={() => void apply({ startDate: addDays(p.startDate, -7) })} className="rounded-lg border border-line px-3 py-2 font-mono text-[10.5px] uppercase tracking-[.08em] hover:bg-[#ece4d0]">Bring forward 1 week</button>
          </div>
        )}
      </div>

      <div className="paper-card h-fit rounded-2xl bg-paper2 p-5">
        <h3 className="text-[17px] font-extrabold tracking-[-.02em]">What changed</h3>
        {!summary ? (
          <p className="mt-2 text-[12.5px] text-mute">Joining {fmtHuman(p.startDate, true)}. When you apply a change, this lists every date, owner and item it affected.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {summary.map((l, i) => <li key={i} className="flex gap-2 text-[12.5px]"><span className={i === summary.length - 1 ? "text-ok" : "text-acc"}>●</span><span>{l}</span></li>)}
          </ul>
        )}
        {prov && (
          <div className="mt-4 border-t border-dashed border-line pt-3">
            <div className="eyebrow !text-[10px]">provisioning · {prov.ok} applied{prov.failed ? `, ${prov.failed} failed` : ""}</div>
            <ul className="mt-1.5 space-y-1">{prov.actions.map((a, i) => <li key={i} className="flex gap-2 text-[12px]"><span className="text-mute">{a.kind === "deprovision" ? "✕" : a.kind === "provision" ? "＋" : "↻"}</span><span>{a.kind === "deprovision" ? "Revoked" : a.kind === "provision" ? "Granted" : "Updated"} {a.object ?? serviceName(a.service)}</span></li>)}</ul>
            {prov.failed > 0 && <p className="mt-2 text-[12px] text-bad">Anything that failed is shown on its service under the Services tab, with a retry.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
