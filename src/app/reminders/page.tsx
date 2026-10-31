import { RemindersApp } from "@/components/reminders/RemindersApp";
import { Guard } from "@/components/auth/Guard";

export default function RemindersPage() {
  return <Guard area="reminders"><RemindersApp /></Guard>;
}
