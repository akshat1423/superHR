import { TrackerApp } from "@/components/tracker/TrackerApp";
import { Guard } from "@/components/auth/Guard";

export default function TrackerPage() {
  return <Guard area="tracker"><TrackerApp /></Guard>;
}
