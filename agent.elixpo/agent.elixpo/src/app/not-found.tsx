import Link from "next/link";
import { ArrowLeft, Github } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found">
      <span>404 / OUTSIDE THE CONTRACT</span>
      <h1>This route is not part of Elixpoo v2.</h1>
      <p>The public surface contains the directive and its technical documentation. Return home or inspect the source contract.</p>
      <div><Link className="button button-primary" href="/"><ArrowLeft size={15} /> Home</Link><a className="button button-secondary" href="https://github.com/elixpo/agent.elixpo"><Github size={15} /> Source</a></div>
    </main>
  );
}
