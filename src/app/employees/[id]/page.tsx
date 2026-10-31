import { EmployeeRecord } from "@/components/employee/EmployeeRecord";
import { Guard } from "@/components/auth/Guard";

export default async function EmployeePage({ params }: PageProps<"/employees/[id]">) {
  const { id } = await params;
  return <Guard area="employees"><EmployeeRecord personId={id} mode="staff" /></Guard>;
}
