import { WhatsAppApp } from "@/components/whatsapp/WhatsAppApp";
import { Guard } from "@/components/auth/Guard";

export default function WhatsAppPage() {
  return <Guard area="whatsapp"><WhatsAppApp /></Guard>;
}
