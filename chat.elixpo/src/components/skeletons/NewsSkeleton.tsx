export default function NewsSkeleton() {
  return (
    <section className="relative h-screen w-screen overflow-hidden bg-neutral-900 flex flex-col items-center justify-center">
      {/* Back button skeleton */}
      <div className="fixed top-4 left-4 z-50 w-9 h-9 rounded-full bg-neutral-800 animate-pulse" />

      {/* Main content area */}
      <div className="flex flex-col items-center justify-center gap-6 max-w-2xl px-6">
        {/* Headline skeleton */}
        <div className="w-3/4 h-8 bg-neutral-800 rounded-lg animate-pulse" />

        {/* Description lines */}
        <div className="w-full space-y-3">
          <div className="h-4 bg-neutral-800 rounded-md w-full animate-pulse" />
          <div className="h-4 bg-neutral-800 rounded-md w-5/6 animate-pulse" />
          <div className="h-4 bg-neutral-800 rounded-md w-4/5 animate-pulse" />
        </div>

        {/* Image thumbnail skeleton */}
        <div className="w-full h-48 bg-neutral-800 rounded-2xl animate-pulse" />

        {/* Navigation/playlist skeleton */}
        <div className="flex gap-2 mt-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-2.5 bg-neutral-700 rounded-full animate-pulse" style={{ width: Math.random() * 30 + 20 + "px" }} />
          ))}
        </div>
      </div>

      {/* Bottom player controls skeleton */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
        <div className="w-full max-w-sm h-32 bg-neutral-800/50 backdrop-blur-md rounded-3xl p-6 animate-pulse border border-neutral-700/50">
          {/* Title row skeleton */}
          <div className="flex gap-4 mb-4">
            <div className="w-14 h-14 bg-neutral-700 rounded-xl animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-neutral-700 rounded-md w-4/5 animate-pulse" />
              <div className="h-3 bg-neutral-700 rounded-md w-1/2 animate-pulse" />
            </div>
          </div>

          {/* Controls row skeleton */}
          <div className="flex justify-center gap-4">
            <div className="w-10 h-10 bg-neutral-700 rounded-full animate-pulse" />
            <div className="w-16 h-16 bg-neutral-600 rounded-full animate-pulse" />
            <div className="w-10 h-10 bg-neutral-700 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </section>
  );
}
