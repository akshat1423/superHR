import { countryOf } from "../geo";
import { emailOf } from "../email";
import type { Contact, Directory, OwnerFn } from "./types";

/** Synthetic org directory: who owns HR / IT / facilities / compliance work, per department and location. */
export const SAMPLE_DIRECTORY: Directory = {
  departments: ["Engineering", "Finance", "Product", "Business", "People"],
  owners: [
    { fn: "HR", department: "*", location: "IN", name: "Priya Nair", email: "priya.nair@acme.com" },
    { fn: "HR", department: "*", location: "US", name: "Jordan Blake", email: "jordan.blake@acme.com" },
    { fn: "IT", department: "*", location: "IN", name: "Karan Shah", email: "karan.shah@acme.com" },
    { fn: "IT", department: "*", location: "US", name: "Taylor Nguyen", email: "taylor.nguyen@acme.com" },
    { fn: "Compliance", department: "*", location: "IN", name: "Anita Desai", email: "anita.desai@acme.com" },
    { fn: "Compliance", department: "*", location: "US", name: "Chris Walker", email: "chris.walker@acme.com" },
    { fn: "Facilities", department: "*", location: "Bengaluru", name: "Meena Pillai", email: "meena.pillai@acme.com" },
    { fn: "Facilities", department: "*", location: "Hyderabad", name: "Suresh Reddy", email: "suresh.reddy@acme.com" },
    { fn: "Facilities", department: "*", location: "Pune", name: "Nisha Kulkarni", email: "nisha.kulkarni@acme.com" },
    { fn: "Facilities", department: "*", location: "Mumbai", name: "Farhan Ali", email: "farhan.ali@acme.com" },
    { fn: "Facilities", department: "*", location: "IN", name: "Anil Das", email: "anil.das@acme.com" },
    { fn: "Facilities", department: "*", location: "US", name: "Sam Rivera", email: "sam.rivera@acme.com" },
    { fn: "Dept Head", department: "Engineering", location: "*", name: "Vikram Singh", email: "vikram.singh@acme.com" },
    { fn: "Dept Head", department: "Finance", location: "*", name: "Neha Kapoor", email: "neha.kapoor@acme.com" },
    { fn: "Dept Head", department: "Product", location: "*", name: "Isha Menon", email: "isha.menon@acme.com" },
    { fn: "Dept Head", department: "Business", location: "*", name: "Rahul Jain", email: "rahul.jain@acme.com" },
    { fn: "Dept Head", department: "People", location: "*", name: "Priya Nair", email: "priya.nair@acme.com" },
  ],
  managers: [
    { name: "Arjun Rao", email: "arjun.rao@acme.com", department: "Engineering" },
    { name: "Dev Patel", email: "dev.patel@acme.com", department: "Engineering" },
    { name: "Vikram Singh", email: "vikram.singh@acme.com", department: "Engineering" },
    { name: "Neha Kapoor", email: "neha.kapoor@acme.com", department: "Finance" },
    { name: "Isha Menon", email: "isha.menon@acme.com", department: "Product" },
    { name: "Rahul Jain", email: "rahul.jain@acme.com", department: "Business" },
    { name: "Priya Nair", email: "priya.nair@acme.com", department: "People" },
  ],
};

interface Who { name: string; email: string; department: string; location: string; manager: string }

/**
 * Turn a responsibility ("IT", "Manager"…) into a named person for this employee.
 * Directory rows match most-specific first: the city, then the country, then "*".
 */
export function resolveOwner(fn: OwnerFn, emp: Who, dir: Directory): Contact {
  if (fn === "Employee") return { name: emp.name, email: emp.email };
  if (fn === "Manager") {
    const m = dir.managers.find((x) => x.name.toLowerCase() === emp.manager.toLowerCase());
    return m ? { name: m.name, email: m.email } : { name: emp.manager, email: emailOf(emp.manager) };
  }
  const rows = dir.owners.filter((o) => o.fn === fn);
  const country = countryOf(emp.location);
  const byDept = (o: { department: string }) => o.department === "*" || o.department.toLowerCase() === emp.department.toLowerCase();
  const pick =
    rows.find((o) => byDept(o) && o.location.toLowerCase() === emp.location.toLowerCase()) ??
    rows.find((o) => byDept(o) && o.location === country) ??
    rows.find((o) => byDept(o) && o.location === "*") ??
    rows.find((o) => byDept(o));
  return pick ? { name: pick.name, email: pick.email } : { name: `${fn} team`, email: `${fn.toLowerCase().replace(" ", "-")}@acme.com` };
}

export interface Rung { level: 1 | 2; role: string; contact: Contact }

/**
 * Who a stuck item escalates to, by who owns it:
 *  - a new joiner's document:  1 → the HR owner (chase them), 2 → their manager
 *  - a department head's approval: 1 → the HR owner, 2 → the head of People
 *  - anyone else's task:       1 → the head of the employee's department, 2 → the HR owner
 */
export function escalationChain(fn: OwnerFn, emp: Who, dir: Directory): Rung[] {
  const hr = resolveOwner("HR", emp, dir);
  const head = resolveOwner("Dept Head", emp, dir);
  const people = resolveOwner("Dept Head", { ...emp, department: "People" }, dir);
  const mgr = resolveOwner("Manager", emp, dir);
  if (fn === "Employee") return [{ level: 1, role: "HR owner", contact: hr }, { level: 2, role: "Manager", contact: mgr }];
  if (fn === "Dept Head") return [{ level: 1, role: "HR owner", contact: hr }, { level: 2, role: "Head of People", contact: people }];
  return [{ level: 1, role: `Head of ${emp.department}`, contact: head }, { level: 2, role: "HR owner", contact: hr }];
}
