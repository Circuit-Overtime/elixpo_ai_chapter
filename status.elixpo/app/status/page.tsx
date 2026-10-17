import { redirect } from "next/navigation";

// The status page now lives at the site root (/). Keep /status working for any
// old links and bookmarks by redirecting to the canonical location.
export default function StatusRedirect() {
    redirect("/");
}
