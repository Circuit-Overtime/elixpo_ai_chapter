"use client";

import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import FeatureCards from "@/components/landing/FeatureCards";
import ShowcaseBlock from "@/components/landing/ShowcaseBlock";
import ChatShowcase from "@/components/landing/ChatShowcase";
import FeaturedContent from "@/components/landing/FeaturedContent";
import Footer from "@/components/landing/Footer";

const DAILY_SNIPPET = `import { ElixpoDaily } from "@elixpo/components";

// Drop-in news player for your app
<ElixpoDaily
  theme="light"
  maxStories={5}
  autoPlay
  voices={["shimmer", "ash"]}
/>`;

const PODCAST_SNIPPET = `import { ElixpoPodcast } from "@elixpo/components";

// Full podcast experience in one component
<ElixpoPodcast
  topic="auto"
  duration={300}
  voice="shimmer"
  showTranscript
/>`;

const DISCOVER_SNIPPET = `import { ElixpoWeather } from "@elixpo/components";

// AI-powered weather card with forecast
<ElixpoWeather
  location="auto"
  showForecast
  showSummary
  theme="light"
/>`;

export default function LandingPage() {
  return (
    <main className="bg-transparent overflow-x-hidden">
      <Navbar />
      <Hero />
      <FeatureCards />

      <ShowcaseBlock
        id="daily"
        label="Elixpo Daily"
        title="News that sounds human"
        description="Every morning, 5 trending stories are researched with AI, scripted for clarity, and narrated with alternating male and female voices. Each story flows into the next with natural transitions — like a real news show, not a text-to-speech demo."
        gradient="from-amber-400 to-orange-500"
        codeSnippet={DAILY_SNIPPET}
      />

      <ShowcaseBlock
        id="podcast"
        label="Elixpo Podcast"
        title="Deep dives, AI-powered"
        description="A trending topic is picked, researched in depth, scripted into a 5-minute narrative, and performed with breathing, pauses, and real emotion. Oil-painting thumbnails and cinematic banners are generated to match."
        gradient="from-violet-400 to-purple-500"
        codeSnippet={PODCAST_SNIPPET}
        reversed
      />

      <ShowcaseBlock
        id="discover"
        label="Discover"
        title="Weather, reimagined"
        description="Real-time weather data meets AI storytelling. Your local forecast is summarized in markdown, paired with a watercolor illustration, and displayed with a 7-day outlook. It's weather that's actually fun to check."
        gradient="from-cyan-400 to-blue-500"
        codeSnippet={DISCOVER_SNIPPET}
      />

      <FeaturedContent />
      <ChatShowcase />
      <Footer />
    </main>
  );
}
