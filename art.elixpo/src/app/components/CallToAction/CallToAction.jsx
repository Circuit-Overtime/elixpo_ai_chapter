'use client';

import { motion } from 'framer-motion';
import styles from './CallToAction.module.css';

export default function CallToAction() {
  return (
    <section className={styles.section}>
      <div className={styles.orb1} aria-hidden="true" />
      <div className={styles.orb2} aria-hidden="true" />

      <motion.div
        className={styles.inner}
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <h2 className={styles.title}>
          Ready to{' '}
          <motion.span
            className={styles.accent}
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          >
            Create?
          </motion.span>
        </h2>
        <p className={styles.subtitle}>
          Join thousands of creators using Elixpo Art to bring their ideas to life.
          No sign-up needed — start generating for free, right now.
        </p>
        <div className={styles.buttons}>
          <a href="/generate" className={styles.ctaBtn}>Start Creating Free</a>
          <a href="/learn" className={styles.docBtn}>View Documentation</a>
        </div>
      </motion.div>
    </section>
  );
}
