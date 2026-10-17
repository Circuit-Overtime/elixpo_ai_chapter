#!/usr/bin/env node
/**
 * Single entrypoint for the Elixpo content generation pipeline.
 * Runs news and podcast generation sequentially with full state management.
 *
 * Usage:
 *   node src/lib/pipeline/run.js              # Run both news + podcast
 *   node src/lib/pipeline/run.js --news       # Run news only
 *   node src/lib/pipeline/run.js --podcast    # Run podcast only
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { runNewsPipeline, fixNewsItem } from "./news/index.js";
import { runPodcastPipeline } from "./podcast/index.js";

const STATE_FILE = path.resolve("tmp/pipeline_state.json");

function ensureTmp() {
  const dir = path.resolve("tmp");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { news: "pending", podcast: "pending" };
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
}

function saveState(state) {
  ensureTmp();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

async function main() {
  const args = process.argv.slice(2);
  const runNews = args.length === 0 || args.includes("--news");
  const runPodcast = args.length === 0 || args.includes("--podcast");

  // Step targeting: --step=upload, --step=thumbnail, etc.
  const stepArg = args.find((a) => a.startsWith("--step="));
  const step = stepArg ? stepArg.split("=")[1] : "all";

  // Fix targeting: --fix=0, --fix=2 etc.
  const fixArg = args.find((a) => a.startsWith("--fix="));
  const fixIndex = fixArg ? parseInt(fixArg.split("=")[1], 10) : -1;

  ensureTmp();
  const state = loadState();

  console.log("═══════════════════════════════════════");
  console.log("  Elixpo Content Pipeline");
  console.log(`  ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════\n");

  // Note: In production, `db` comes from Cloudflare D1 binding.
  // For local testing without D1, we create a mock that logs operations.
  const db = createDbProxy();

  // === NEWS FIX MODE ===
  if (runNews && fixIndex >= 0) {
    console.log(`━━━ NEWS FIX: item ${fixIndex} ━━━\n`);
    try {
      await fixNewsItem(db, fixIndex);
      console.log("\n✅ Fix complete.\n");
    } catch (err) {
      console.error(`\n❌ Fix failed: ${err.message}\n`);
    }
    return;
  }

  // === NEWS ===
  if (runNews && state.news !== "complete") {
    console.log("━━━ NEWS PIPELINE ━━━\n");
    state.news = "running";
    saveState(state);
    try {
      await runNewsPipeline(db);
      state.news = "complete";
      state.news_completed_at = new Date().toISOString();
      saveState(state);
      console.log("\n✅ News pipeline finished.\n");
    } catch (err) {
      state.news = "failed";
      state.news_error = err.message;
      saveState(state);
      console.error(`\n❌ News pipeline failed: ${err.message}\n`);
      console.log("Re-run this script to resume from the last checkpoint.\n");
    }
  } else if (runNews) {
    console.log("✅ News already complete for this run. Skipping.\n");
  }

  // === PODCAST ===
  if (runPodcast && state.podcast !== "complete") {
    console.log("━━━ PODCAST PIPELINE ━━━\n");
    state.podcast = "running";
    saveState(state);
    try {
      await runPodcastPipeline(db, { step });
      state.podcast = "complete";
      state.podcast_completed_at = new Date().toISOString();
      saveState(state);
      console.log("\n✅ Podcast pipeline finished.\n");
    } catch (err) {
      state.podcast = "failed";
      state.podcast_error = err.message;
      saveState(state);
      console.error(`\n❌ Podcast pipeline failed: ${err.message}\n`);
      console.log("Re-run this script to resume from the last checkpoint.\n");
    }
  } else if (runPodcast) {
    console.log("✅ Podcast already complete for this run. Skipping.\n");
  }

  // Clean up state file if both are complete
  if (state.news === "complete" && state.podcast === "complete") {
    fs.unlinkSync(STATE_FILE);
    console.log("═══════════════════════════════════════");
    console.log("  All pipelines complete! State cleaned.");
    console.log("═══════════════════════════════════════");
  }
}

/**
 * Creates a D1-compatible wrapper that executes SQL against the real local D1
 * via `wrangler d1 execute`. Works for both reads and writes.
 */
function createDbProxy() {
  function exec(sql) {
    const escaped = sql.replace(/'/g, "'\\''");
    const raw = execSync(
      `npx wrangler d1 execute elixpochat --local --command='${escaped}' --json 2>/dev/null`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
    try {
      const parsed = JSON.parse(raw);
      return parsed[0] || { results: [], success: true };
    } catch {
      return { results: [], success: true };
    }
  }

  return {
    prepare(sql) {
      return {
        bind(...params) {
          // Replace ? placeholders with escaped values
          let i = 0;
          const bound = sql.replace(/\?/g, () => {
            const val = params[i++];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "number") return String(val);
            return "'" + String(val).replace(/'/g, "''") + "'";
          });
          return {
            async run() {
              exec(bound);
              return { success: true };
            },
            async first() {
              const result = exec(bound);
              return result.results?.[0] || null;
            },
          };
        },
      };
    },
  };
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});
