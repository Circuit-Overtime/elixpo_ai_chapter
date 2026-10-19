import { pageMetadata } from "@/lib/seo";
import Home from "./home-client";

export const metadata = pageMetadata({
    title: "Transactional email infrastructure for developers",
    description:
        "Design transactional email templates, collaborate in workspaces, and send through your own SMTP provider with signed webhooks, delivery logs, and suppression controls.",
    path: "/",
});

export default Home;
