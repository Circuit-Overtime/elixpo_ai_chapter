/**
 * Cron Worker — triggers scheduled tasks on the main LixBlogs app.
 * Deployed as a separate Cloudflare Worker with cron triggers.
 *
 * Cron schedule: every Sunday at 9:00 AM UTC
 */

export default {
  async scheduled(event, env) {
    const baseUrl = env.APP_URL || 'https://blogs.elixpo.com';
    const secret = env.CRON_SECRET || '';

    // Weekly digest — every Sunday
    if (event.cron === '0 9 * * SUN') {
      try {
        const res = await fetch(`${baseUrl}/api/cron/weekly-digest`, {
          headers: { 'Authorization': `Bearer ${secret}` },
        });
        const data = await res.json();
        console.log('Weekly digest result:', JSON.stringify(data));
      } catch (e) {
        console.error('Weekly digest cron failed:', e.message);
      }
    }
  },
};
