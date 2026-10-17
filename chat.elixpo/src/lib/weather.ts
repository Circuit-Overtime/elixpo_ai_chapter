import type { StructuredWeather } from "./types";

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export async function getStructuredWeather(
  lat: number,
  lon: number,
  city: string
): Promise<StructuredWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min,weathercode&current_weather=true&timezone=auto`;
    const res = await fetch(url);
    const data = await res.json() as {
      current_weather: any;
      daily: any;
    };

    const current = data.current_weather;
    const daily = data.daily;

    const structured: StructuredWeather = {
      location: city,
      current: {
        datetime: new Date().toISOString(),
        temperature: Math.round(current.temperature),
        condition: WEATHER_CODES[current.weathercode] || "Unknown",
        wind_speed: current.windspeed,
      },
      forecast: [],
    };

    for (let i = 0; i < 7; i++) {
      structured.forecast.push({
        day: new Date(daily.time[i]).toLocaleDateString("en-US", { weekday: "long" }),
        date: daily.time[i],
        high: Math.round(daily.temperature_2m_max[i]),
        low: Math.round(daily.temperature_2m_min[i]),
        condition: WEATHER_CODES[daily.weathercode[i]] || "Unknown",
      });
    }

    return structured;
  } catch (err) {
    console.error("Error fetching weather data:", err);
    return null;
  }
}

export async function generateAISummary(
  structuredWeather: StructuredWeather,
  token: string
): Promise<string> {
  if (!structuredWeather) return "Weather data is unavailable.";

  const { current, location, forecast } = structuredWeather;
  const forecastLines = forecast
    .map((f) => `${f.day} (${f.date}): ${f.condition}, High: ${f.high}°C, Low: ${f.low}°C`)
    .join("\n");

  const prompt = `The current weather in ${location} is ${current.condition} at ${current.temperature}°C with wind speed ${current.wind_speed} km/h.\n\nHere's the 7-day forecast:\n${forecastLines}\n\nWrite a short, friendly summary.`;

  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai",
      messages: [
        {
          role: "system",
          content:
            "You're a weather reporter. Respond in proper markdown formatting with the weather summary, and a fun fact about the weather and the day!",
        },
        { role: "user", content: prompt },
      ],
      token,
      referrer: "elixpoart",
      seed: 42,
    }),
  });

  const result = await res.json() as {
    choices?: {
      message?: {
        content?: string;
      };
    }[];
  };

return result.choices?.[0]?.message?.content ?? "No summary available.";
}

export function generateAIImage(condition: string, token: string): string {
  const prompt = `A watercolor illustration of ${condition} weather, 16:9 aspect ratio, max 512x512 pixels`;
  const params = new URLSearchParams({
    width: "512",
    height: "288",
    nologo: "true",
    private: "true",
    seed: "42",
    token,
    referrer: "elixpoart",
    model: "turbo",
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}
