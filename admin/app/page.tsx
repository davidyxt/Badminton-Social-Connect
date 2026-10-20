import { redirect } from "next/navigation";

export default function Home() {
  // The (admin) layout sends signed-out visitors on to /sign-in.
  redirect("/overview");
}
