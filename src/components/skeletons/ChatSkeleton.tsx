export default function ChatSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* User message skeleton */}
      <div className="flex justify-end">
        <div className="max-w-xs bg-neutral-100 rounded-2xl rounded-br-md h-12 w-40 animate-pulse" />
      </div>

      {/* AI response skeleton */}
      <div className="max-w-2xl space-y-3">
        <div className="space-y-2">
          <div className="h-4 bg-neutral-100 rounded-md w-3/4 animate-pulse" />
          <div className="h-4 bg-neutral-100 rounded-md w-full animate-pulse" />
          <div className="h-4 bg-neutral-100 rounded-md w-5/6 animate-pulse" />
        </div>

        {/* Fake source cards skeleton */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-20 bg-neutral-50 border border-neutral-100 rounded-lg animate-pulse"
            />
          ))}
        </div>

        {/* Action buttons skeleton */}
        <div className="flex gap-1 mt-3 pt-2 border-t border-neutral-100">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-lg bg-neutral-100 animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* User message 2 */}
      <div className="flex justify-end">
        <div className="max-w-xs bg-neutral-100 rounded-2xl rounded-br-md h-16 w-56 animate-pulse" />
      </div>

      {/* AI response skeleton 2 */}
      <div className="max-w-2xl space-y-3">
        <div className="space-y-2">
          <div className="h-4 bg-neutral-100 rounded-md w-full animate-pulse" />
          <div className="h-4 bg-neutral-100 rounded-md w-4/5 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
