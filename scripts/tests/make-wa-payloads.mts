// Writes request bodies for the WhatsApp end-to-end checks into the directory given as argv[2] (used by e2e-whatsapp.sh).
import { writeFileSync } from "node:fs";
import { usePeople } from "../../src/store/people";
import { useOnboarding } from "../../src/store/onboarding";
import { buildSnapshot } from "../../src/lib/whatsapp/snapshot";
import { todayISO } from "../../src/lib/dates";

const dir = process.argv[2];
const o = useOnboarding.getState();
const yash = usePeople.getState().people.find((p) => p.name.startsWith("Yash"))!;
const snapshot = buildSnapshot(yash, { items: o.items[yash.id], docs: o.docs, policies: o.policies, directory: o.directory }, todayISO());
const meera = usePeople.getState().people.find((p) => p.name.startsWith("Meera"))!;
const other = buildSnapshot(meera, { items: o.items[meera.id], docs: o.docs, policies: o.policies, directory: o.directory }, todayISO());
const files: Record<string, unknown> = {
  "wa-invite-yash": { kind: "joiner", name: yash.name, email: yash.email, personId: yash.id, dept: yash.persona.dept, manager: yash.manager, snapshot },
  "wa-connect-yash": { personId: yash.id, snapshot },
  "wa-connect-other": { personId: meera.id, snapshot: other },
  "wa-person": { personId: yash.id, itemId: "item-1", dept: yash.persona.dept, manager: yash.manager },
};
for (const [k, v] of Object.entries(files)) writeFileSync(`${dir}/${k}.json`, JSON.stringify(v));
