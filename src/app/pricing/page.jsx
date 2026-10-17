'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar/Navbar';
import Footer from '../components/Footer/Footer';
import GradientBlobs from '../components/shared/GradientBlobs';
import { motion as motionPresets } from '../lib/theme';
import styles from './Pricing.module.css';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    desc: 'Start creating — no account needed for a taste, or sign up for the full free tier.',
    monthly: 0,
    yearly: 0,
    images: 50,
    videoMins: 2,
    featured: false,
    cta: 'Start Creating',
    ctaStyle: 'ctaDefault',
    features: [
      '50 images per day',
      '2 min video per day',
      'Standard models',
      '1024 x 1024 max resolution',
      'Community support',
      'Public gallery access',
    ],
  },
  {
    id: 'atelier',
    name: 'Atelier',
    desc: 'Your personal studio — more power, all models, and priority access.',
    monthly: 12,
    yearly: 120,
    images: 200,
    videoMins: 5,
    featured: true,
    cta: 'Upgrade to Atelier',
    ctaStyle: 'ctaPrimary',
    features: [
      '200 images per day',
      '5 min video per day',
      'All models',
      '2048 x 2048 max resolution',
      'Priority queue',
      'Early access to new models',
      'Private creations',
    ],
  },
  {
    id: 'masterpiece',
    name: 'Masterpiece',
    desc: 'Full platform access with API, custom models, and dedicated support.',
    monthly: 49,
    yearly: 490,
    images: 500,
    videoMins: 15,
    featured: false,
    cta: 'Go Masterpiece',
    ctaStyle: 'ctaEnterprise',
    features: [
      '500 images per day',
      '15 min video per day',
      'All models',
      '4096 x 4096 max resolution',
      'Priority queue',
      'API access',
      'Dedicated support',
      'Custom model fine-tuning',
    ],
  },
];

const FAQ = [
  {
    q: 'How do daily limits work?',
    a: 'Image and video limits reset every 24 hours at midnight UTC. Each image generation uses 1 image credit. Video generation is tracked by duration in minutes.',
  },
  {
    q: 'Can I upgrade or downgrade anytime?',
    a: 'Yes. Upgrades take effect immediately and you get the difference prorated. Downgrades apply at the end of your current billing cycle.',
  },
  {
    q: 'What happens if I hit my limit?',
    a: 'Your generations pause until the next daily reset. Upgrade your plan for higher limits — we never charge overage fees.',
  },
  {
    q: 'What can guests do without signing up?',
    a: 'Guests can generate up to 10 images and 2 short videos to try the platform. Sign up for free to unlock 50 images and 2 minutes of video daily.',
  },
];

function CheckIcon() {
  return (
    <svg className={styles.checkIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// Animated number that smoothly transitions between values
function AnimatedPrice({ value }) {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        initial={{ y: 20, opacity: 0, filter: 'blur(4px)' }}
        animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
        exit={{ y: -20, opacity: 0, filter: 'blur(4px)' }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={styles.price}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

const stagger = motionPresets.stagger(0.1);

export default function PricingPage() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className={styles.page}>
      <GradientBlobs preset="pricing" />
      <Navbar />
      <motion.main
        className={styles.main}
        initial={motionPresets.page.initial}
        animate={motionPresets.page.animate}
      >
        {/* Header */}
        <motion.div
          className={styles.header}
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          <motion.span className={styles.badge} variants={motionPresets.fadeUp}>Pricing</motion.span>
          <motion.h1 className={styles.title} variants={motionPresets.fadeUp}>
            Create more with the{' '}
            <span className={styles.titleAccent}>right plan</span>
          </motion.h1>
          <motion.p className={styles.subtitle} variants={motionPresets.fadeUp}>
            Start free with 50 daily images. Upgrade when you need more generations, higher resolution, or longer video.
          </motion.p>
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          className={styles.toggleWrap}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <span className={`${styles.toggleLabel} ${!yearly ? styles.toggleLabelActive : ''}`}>Monthly</span>
          <button
            className={`${styles.toggle} ${yearly ? styles.active : ''}`}
            onClick={() => setYearly(!yearly)}
            aria-label="Toggle yearly billing"
          >
            <motion.span
              className={styles.toggleDot}
              layout
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
          <span className={`${styles.toggleLabel} ${yearly ? styles.toggleLabelActive : ''}`}>Yearly</span>
          <AnimatePresence>
            {yearly && (
              <motion.span
                className={styles.saveBadge}
                initial={{ scale: 0.8, opacity: 0, x: -8 }}
                animate={{ scale: 1, opacity: 1, x: 0 }}
                exit={{ scale: 0.8, opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                Save ~17%
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Plan cards */}
        <motion.div
          className={styles.grid}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={motionPresets.stagger(0.12)}
        >
          {PLANS.map((plan) => (
            <motion.div
              key={plan.id}
              className={`${styles.card} ${plan.featured ? styles.cardFeatured : ''}`}
              variants={motionPresets.brushReveal}
              whileHover={motionPresets.hoverLift}
            >
              {plan.featured && <div className={styles.popularTag}>Most Popular</div>}

              <h2 className={styles.planName}>{plan.name}</h2>
              <p className={styles.planDesc}>{plan.desc}</p>

              {plan.monthly === 0 ? (
                <div className={styles.priceFree}>Free</div>
              ) : (
                <div className={styles.priceWrap}>
                  <span className={styles.currency}>$</span>
                  <AnimatedPrice value={yearly ? Math.round(plan.yearly / 12) : plan.monthly} />
                  <span className={styles.period}>/ mo</span>
                </div>
              )}

              {/* Limits */}
              <div className={styles.limitsRow}>
                <div className={styles.limitBadge}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  <span>{plan.images} images/day</span>
                </div>
                <div className={styles.limitBadge}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>{plan.videoMins} min video/day</span>
                </div>
              </div>

              <a href={plan.id === 'free' ? '/generate' : '#'} className={`${styles.cta} ${styles[plan.ctaStyle]}`}>
                {plan.cta}
              </a>

              <div className={styles.divider} />
              <p className={styles.featuresTitle}>What&apos;s included</p>
              <ul className={styles.features}>
                {plan.features.map((f) => (
                  <li key={f} className={styles.feature}>
                    <CheckIcon />
                    {f}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {/* FAQ */}
        <motion.section
          className={styles.faq}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={motionPresets.stagger(0.08)}
        >
          <motion.h2 className={styles.faqTitle} variants={motionPresets.fadeUp}>
            Frequently Asked Questions
          </motion.h2>
          <div className={styles.faqGrid}>
            {FAQ.map((item) => (
              <motion.div key={item.q} className={styles.faqItem} variants={motionPresets.fadeUp}>
                <h3 className={styles.faqQuestion}>{item.q}</h3>
                <p className={styles.faqAnswer}>{item.a}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </motion.main>
      <Footer />
    </div>
  );
}
