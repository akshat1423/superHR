import { LibraryApp } from "@/components/library/LibraryApp";
import { Guard } from "@/components/auth/Guard";

export default function LibraryPage() {
  return <Guard area="library"><LibraryApp /></Guard>;
}
