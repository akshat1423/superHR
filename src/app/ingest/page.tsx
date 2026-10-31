import { IngestApp } from "@/components/ingest/IngestApp";
import { Guard } from "@/components/auth/Guard";

export default function IngestPage() {
  return <Guard area="ingest"><IngestApp /></Guard>;
}
