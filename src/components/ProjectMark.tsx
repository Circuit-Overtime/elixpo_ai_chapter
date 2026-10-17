import type { CSSProperties } from "react";

export function ProjectMark({ seed, icon, size = "medium" }: { seed: string; icon?: string; size?: "small" | "medium" | "large" }) {
  if (icon) return <span className={`project-mark project-mark-${size} project-mark-image`} aria-hidden="true" style={{ backgroundImage: `url("${icon}")` }} />;
  const value = [...seed].reduce((total, character) => total + character.charCodeAt(0), 0);
  const style = { "--mark-hue": `${(value * 47) % 260 + 80}`, "--mark-turn": `${(value * 13) % 60 - 30}deg` } as CSSProperties;
  return <span className={`project-mark project-mark-${size} project-mark-geometry mark-variant-${value % 4}`} style={style} aria-hidden="true"><i/><i/><i/></span>;
}
