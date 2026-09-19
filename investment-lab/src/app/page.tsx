import { redirect } from "next/navigation";

/**
 * Entry: send operators to the lab overview.
 * Auth middleware (backend) should gate unauthenticated users to /login.
 */
export default function HomePage() {
  redirect("/overview");
}
