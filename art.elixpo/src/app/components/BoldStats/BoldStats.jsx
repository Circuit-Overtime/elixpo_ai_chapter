'use client';

import styles from './BoldStats.module.css';

const stats = [
  { number: '6', label: 'INDUSTRIES' },
  { number: '235', label: 'COUNTRIES AND TERRITORIES' },
  { number: '80+', label: 'GEN AI MODELS INTEGRATED' },
  { number: '4K', label: 'MEDIA ASSETS GENERATED' },
];

export default function BoldStats() {
  return (
    <section className={styles.section}>
      <div className={styles.marqueeWrap}>
        <div className={styles.marquee}>
          {[...stats, ...stats, ...stats].map((s, i) => (
            <div key={i} className={styles.statBlock}>
              <span className={styles.number}>
                {s.number}
              </span>
              <span className={styles.label}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
