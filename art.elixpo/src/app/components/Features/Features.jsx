'use client';

import { motion } from 'framer-motion';
import styles from './Features.module.css';

const features = [
  {
    icon: '🖼️',
    title: 'Text to Image',
    description: 'Type a prompt, get stunning art. Powered by multiple generative models.',
    color: '#8d49fd',
    layoutClass: styles.span2,
  },
  {
    icon: '🎬',
    title: 'Text to Video',
    description: 'Generate short cinematic videos from text descriptions.',
    color: '#ec4899',
    layoutClass: styles.span1,
  },
  {
    icon: '🎨',
    title: '15+ Art Styles',
    description: 'Cyberpunk, Ghibli, Synthwave, Baroque, Impressionism and more.',
    color: '#06d6a0',
    layoutClass: `${styles.span1} ${styles.row2}`,
  },
  {
    icon: '🧠',
    title: 'Smart Prompts',
    description: 'Prompt optimizer refines your ideas into detailed, optimized prompts.',
    color: '#22d3ee',
    layoutClass: styles.span2,
  },
  {
    icon: '⚡',
    title: '8 Engines',
    description: 'Flux, Turbo, Kontext, NanoBanana — pick the right generation speed.',
    color: '#5691f3',
    layoutClass: styles.span1,
  },
  {
    icon: '🔒',
    title: 'Private Mode',
    description: 'Generate without storing data. Your creations, your rules.',
    color: '#a968ff',
    layoutClass: styles.span1,
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function Features() {
  return (
    <section className={styles.section}>
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
      >
        {/* Section header */}
        <motion.div className={styles.header} variants={cardVariants}>
          <span className={styles.badge}>Features</span>
          <h2 className={styles.title}>Everything you need to create</h2>
          <p className={styles.subtitle}>Free, open source, and built for artists</p>
        </motion.div>

        <motion.div className={styles.grid} variants={containerVariants}>
          {features.map((f) => (
            <motion.div
              key={f.title}
              className={`${styles.card} ${f.layoutClass}`}
              variants={cardVariants}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
            >
              <div
                className={styles.cardGlow}
                style={{
                  background: `radial-gradient(circle at 80% 20%, ${f.color}15 0%, transparent 50%)`,
                }}
                aria-hidden="true"
              />

              <div
                className={styles.iconWrap}
                style={{
                  background: `${f.color}12`,
                  borderColor: `${f.color}25`,
                }}
              >
                <span className={styles.icon}>{f.icon}</span>
              </div>
              <h3 className={styles.cardTitle}>{f.title}</h3>
              <p className={styles.cardDesc}>{f.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}
