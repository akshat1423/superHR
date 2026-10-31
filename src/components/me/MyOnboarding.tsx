"use client";
import { EmployeeRecord } from "@/components/employee/EmployeeRecord";
import { useScopedPeople } from "@/components/shell/AuthProvider";

/** The new joiner's page: their own record only — checklist, documents, and the assistant. */
export function MyOnboarding() {
  const person = useScopedPeople()[0];
  if (!person) {
    return (
      <div className="grid h-full place-items-center px-8">
        <div className="paper-card max-w-[480px] rounded-[22px] bg-paper2 p-8 text-center">
          <b className="text-[20px]">We couldn’t find your onboarding record</b>
          <p className="mt-2 text-[13px] text-mute">Your email isn’t in the latest HR upload. Please contact your HR partner.</p>
        </div>
      </div>
    );
  }
  return <EmployeeRecord personId={person.id} mode="self" />;
}
