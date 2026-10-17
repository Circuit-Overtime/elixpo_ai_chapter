import { redirect } from "next/navigation";

export const runtime = "edge";

export default function DashboardPage() {
    redirect("/dashboard/oauth-apps");
}
