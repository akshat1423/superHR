import { MyOnboarding } from "@/components/me/MyOnboarding";
import { Guard } from "@/components/auth/Guard";

export default function MePage() {
  return <Guard area="me"><MyOnboarding /></Guard>;
}
