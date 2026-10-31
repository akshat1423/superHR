import { BuilderApp } from "@/components/builder/BuilderApp";
import { Guard } from "@/components/auth/Guard";

export default function BuilderPage() {
  return <Guard area="builder"><BuilderApp /></Guard>;
}
