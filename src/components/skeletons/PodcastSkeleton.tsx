export default function PodcastSkeleton() {
  return (
    <section className="relative h-screen w-screen overflow-hidden bg-black flex flex-col items-center justify-center">
      {/* Back button skeleton */}
      <div className="fixed top-4 left-4 z-50 w-9 h-9 rounded-full bg-neutral-800 animate-pulse" />

      {/* Main content area */}
      <div className="flex flex-col items-center justify-center gap-8 max-w-2xl px-6">
        {/* Podcast title skeleton */}
        <div className="w-2/3 h-10 bg-neutral-800 rounded-lg animate-pulse" />

        {/* Description lines */}
        <div className="w-full space-y-3">
          <div className="h-4 bg-neutral-800 rounded-md w-full animate-pulse" />
          <div className="h-4 bg-neutral-800 rounded-md w-5/6 animate-pulse" />
        </div>

        {/* Waveform visualization skeleton */}
        <div className="w-full flex items-end justify-center gap-1 h-32">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="bg-neutral-600 rounded-full animate-pulse"
              style={{
                width: "3px",
                height: Math.random() * 80 + 20 + "px",
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom player skeleton */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4">
        <div className="w-full max-w-md bg-neutral-900/50 backdrop-blur-md rounded-3xl p-6 animate-pulse border border-neutral-800/50">
          {/* Title & metadata row */}
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-neutral-700 rounded-xl animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-neutral-700 rounded-md w-full animate-pulse" />
              <div className="h-3 bg-neutral-700 rounded-md w-2/3 animate-pulse" />
            </div>
            <div className="w-12 h-8 bg-neutral-700 rounded-lg animate-pulse flex-shrink-0" />
          </div>

          {/* Timeline skeleton */}
          <div className="mb-4 space-y-2">
            <div className="h-1 bg-neutral-700 rounded-full animate-pulse" />
            <div className="flex justify-between">
              <div className="h-3 bg-neutral-700 rounded-md w-8 animate-pulse" />
              <div className="h-3 bg-neutral-700 rounded-md w-8 animate-pulse" />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-center gap-6">
            <div className="w-10 h-8 bg-neutral-700 rounded-full animate-pulse" />
            <div className="w-10 h-10 bg-neutral-700 rounded-full animate-pulse" />
            <div className="w-14 h-14 bg-neutral-600 rounded-full animate-pulse" />
            <div className="w-10 h-10 bg-neutral-700 rounded-full animate-pulse" />
            <div className="w-10 h-8 bg-neutral-700 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
    </section>
  );
}
