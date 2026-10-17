"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { marked } from "marked";
import CloseButton from "@/components/CloseButton";
import type { StructuredWeather, ForecastDay } from "@/lib/types";

const WEATHER_ICON_MAP: Record<string, string> = {
  clear: "wi-day-sunny",
  sunny: "wi-day-sunny",
  "partly cloudy": "wi-day-cloudy",
  cloudy: "wi-cloudy",
  "mostly cloudy": "wi-cloudy",
  overcast: "wi-cloudy",
  rain: "wi-rain",
  "light rain": "wi-rain",
  "heavy rain": "wi-rain-wind",
  thunderstorm: "wi-thunderstorm",
  snow: "wi-snow",
  fog: "wi-fog",
  mist: "wi-fog",
  drizzle: "wi-sprinkle",
  hail: "wi-hail",
  windy: "wi-strong-wind",
};

function getWeatherIconClass(condition: string): string {
  const key = condition?.toLowerCase() || "";
  return `wi ${WEATHER_ICON_MAP[key] || "wi-day-cloudy"}`;
}

export default function DiscoverPage() {
  const [weather, setWeather] = useState<StructuredWeather | null>(null);
  const [bannerLink, setBannerLink] = useState("");
  const [loading, setLoading] = useState(true);
  const markdownRef = useRef<HTMLDivElement>(null);

  const typeMarkdown = useCallback((markdown: string) => {
    if (!markdownRef.current) return;
    const html = marked.parse(markdown) as string;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    const nodes = Array.from(wrapper.children);

    markdownRef.current.innerHTML = "";
    let idx = 0;
    const timer = setInterval(() => {
      if (idx >= nodes.length || !markdownRef.current) {
        clearInterval(timer);
        return;
      }
      const chunk = document.createElement("div");
      chunk.classList.add("fade-chunk");
      chunk.appendChild(nodes[idx]);
      markdownRef.current.appendChild(chunk);
      void chunk.offsetWidth;
      chunk.classList.add("visible");
      idx++;
    }, 200);
  }, []);

  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((ipData: any) => {
        const loc = [ipData.city, ipData.latitude, ipData.longitude].filter(Boolean).join(", ");
        return fetch(`/api/weather?location=${encodeURIComponent(loc)}`);
      })
      .then((r) => r.json())
      .then((data: any) => {
        setLoading(false);
        if (data.error) return;
        setWeather(data.structuredWeather);
        setBannerLink(data.bannerLink);
        typeMarkdown(data.aiSummary);
      })
      .catch((err) => {
        setLoading(false);
        console.error(err);
      });
  }, [typeMarkdown]);

  const todayDate = weather?.current.datetime.split("T")[0];

  return (
    <section
      className="relative min-h-screen w-screen overflow-hidden flex flex-col items-center font-sans text-white"
      style={{ background: "#1a1a2e" }}
    >
      <CloseButton />

      {/* Weather card */}
      <div
        className="relative w-[700px] max-lg:w-[90%] rounded-[50px] max-lg:rounded-[30px] max-sm:rounded-[30px] p-5 max-lg:p-2.5 overflow-hidden mt-8 max-sm:w-[90%] max-sm:h-[300px] h-[350px] max-lg:h-[450px] max-lg:text-lg"
        style={{
          background: "linear-gradient(to bottom, #3b3b54, #5b5b7d)",
          boxShadow: "0 10px 20px rgba(0,0,0,0.5)",
        }}
      >
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-800"
          style={{
            backgroundImage: bannerLink ? `url('${bannerLink}')` : undefined,
            filter: "blur(3px) brightness(0.4)",
            opacity: bannerLink ? 0.8 : 0,
          }}
        />

        <div className="relative z-[1]">
          {/* Location */}
          <div className="text-[1.1em] mb-1 ml-2.5 mt-5 font-mono font-bold" style={{ color: "#ffc" }}>
            {loading ? <span className="skeleton inline-block w-40 h-6" /> : weather ? `${weather.location} \u2022 (${todayDate})` : ""}
          </div>

          {/* Condition */}
          <div className="text-[1.2em] mb-2.5 ml-2.5 font-mono" style={{ color: "#ffcc00" }}>
            {loading ? <span className="skeleton inline-block w-32 h-6" /> : weather?.current.condition}
          </div>

          {/* Temperature */}
          <div className="text-[2.5em] font-bold mb-2.5 ml-2.5 font-mono" style={{ color: "#ffc" }}>
            {loading ? (
              <span className="skeleton inline-block w-24 h-12" />
            ) : weather ? (
              <>{weather.current.temperature}<span className="text-[0.5em] align-top">°C</span></>
            ) : null}
          </div>

          {/* Temp range + wind */}
          <div className="flex items-center mb-5 ml-2.5 gap-6">
            {weather?.forecast[0] && (
              <p className="text-[1.2em] opacity-80 font-bold font-mono text-[#ccc] m-0">
                ↑ {weather.forecast[0].high}° ↓ {weather.forecast[0].low}°
              </p>
            )}
            <div className="text-sm font-mono text-[#ccc] m-0">
              {weather ? `Wind: ${weather.current.wind_speed} km/h` : ""}
            </div>
          </div>

          {/* Forecast */}
          <div className="flex justify-start gap-[45px] max-lg:gap-[50px] max-sm:gap-5 bg-black/20 rounded-[10px] rounded-b-[30px] px-6 py-2.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton w-12 h-[60px] flex-shrink-0" />
                ))
              : weather?.forecast.map((day: ForecastDay, i: number) => (
                  <div key={i} className="text-center flex-shrink-0 mr-4 last:mr-0">
                    <div className="text-sm opacity-80 mb-1 font-mono" style={{ color: "#ffc" }}>
                      {day.date === todayDate ? "Today" : new Date(day.date).toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                    <i className={`${getWeatherIconClass(day.condition)} text-2xl my-2.5`} />
                    <div className="text-[0.9em] font-bold font-mono" style={{ color: "#ffc" }}>
                      {day.high}°/{day.low}°
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </div>

      {/* AI Summary markdown */}
      <div
        ref={markdownRef}
        className="markdown-render relative top-5 w-[700px] max-lg:w-[90%] max-md:w-[700px] max-sm:w-[300px] h-[250px] max-lg:h-[450px] max-lg:text-xl max-md:h-[150px] max-sm:h-[200px] p-2.5 pr-1 box-border overflow-y-auto overflow-x-hidden text-base"
      />
    </section>
  );
}
