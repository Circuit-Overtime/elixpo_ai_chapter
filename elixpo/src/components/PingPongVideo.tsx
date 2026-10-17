import { SmartVideo } from "./SmartVideo";

interface PingPongVideoProps {
  src: string;
  className?: string;
}

/**
 * Plays a muted clip on a seamless boomerang loop.
 *
 * The forward + reverse passes are baked into the source file itself (an ffmpeg
 * palindrome: `[0]split[a][b];[b]reverse[rb];[a][rb]concat`), so a plain native
 * `loop` gives a smooth back-and-forth with no JS seeking - reliable across
 * browsers and cheap to run.
 */
export function PingPongVideo({ src, className }: PingPongVideoProps) {
  return <SmartVideo src={src} className={className} />;
}
