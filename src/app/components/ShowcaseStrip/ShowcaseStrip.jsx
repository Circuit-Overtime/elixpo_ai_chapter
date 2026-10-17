'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import styles from './ShowcaseStrip.module.css';

const MOCK_PROMPTS = [
  "a celestial dragon coiled around a dying star, cyberpunk style, vibrant neon hues, hyper-detailed, 8k resolution, cinematic lighting",
  "an ancient library floating in a nebula, mystical glowing books, watercolor aesthetic, dreamlike atmosphere",
  "a futuristic cyberpunk street in Tokyo, heavy rain, reflections of neon signs, volumetric fog, Unreal Engine 5 render",
  "a surreal painting of a clock melting into a field of glowing lavender, Salvador Dali style, warm sunset light",
  "portrait of an astronaut explorer on a crystal planet, reflection of alien landscape on visor, cinematic, 8k",
  "a hidden glowing waterfall in a bioluminescent forest, magical creatures, fantasy art, photorealistic"
];

export default function ShowcaseStrip() {
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer;
    const fullText = MOCK_PROMPTS[currentPromptIndex];
    const speed = isDeleting ? 15 : Math.random() * 40 + 30;

    const handleType = () => {
      if (!isDeleting) {
        setDisplayText(fullText.substring(0, displayText.length + 1));
        if (displayText === fullText) {
          timer = setTimeout(() => setIsDeleting(true), 3500);
          return;
        }
      } else {
        setDisplayText(fullText.substring(0, displayText.length - 1));
        if (displayText === '') {
          setIsDeleting(false);
          setCurrentPromptIndex((prev) => {
            let nextIndex = prev;
            while (nextIndex === prev) {
              nextIndex = Math.floor(Math.random() * MOCK_PROMPTS.length);
            }
            return nextIndex;
          });
          return;
        }
      }
      timer = setTimeout(handleType, speed);
    };

    timer = setTimeout(handleType, speed);
    return () => clearTimeout(timer);
  }, [displayText, isDeleting, currentPromptIndex]);

  return (
    <section className={styles.showcase}>
      <div className={styles.blobPurple} aria-hidden="true" />
      <div className={styles.blobCyan} aria-hidden="true" />

      <motion.div 
        className={styles.dashboardContainer}
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div 
          className={styles.glassDashboard}
          animate={{ y: [0, -12, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className={styles.dashHeader}>
            <div className={styles.windowDots}>
              <span className={styles.dotRed} />
              <span className={styles.dotYellow} />
              <span className={styles.dotGreen} />
            </div>
            <div className={styles.dashTitle}>workspace / elixpo-generate</div>
          </div>

          <div className={styles.referenceRow}>
            <div className={styles.refCard}>
              <img src="/images/styles/cyberpunk-art.jpg" alt="Ref" className={styles.refImg} />
              <span className={styles.refBadge}>Ref 1</span>
            </div>
            <div className={styles.refCard}>
              <img src="/images/styles/synthwave-art.jpg" alt="Ref" className={styles.refImg} />
              <span className={styles.refBadge}>Style Ref</span>
            </div>
          </div>

          <Link href="/generate" className={styles.promptLink}>
            <div className={styles.promptArea}>
              <div className={styles.promptText}>
                {displayText}
                <span className={styles.cursor}>|</span>
              </div>
              <div className={styles.promptTools}>
                <div className={styles.toolBtn}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
                <div className={styles.toolBtn}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                  </svg>
                </div>
                <div className={styles.generateBtnMock}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          <div className={styles.optionsBar}>
            <div className={styles.optionsLeft}>
              <div className={styles.modeToggle}>
                <span className={`${styles.modeBtn} ${styles.modeActive}`}>Image</span>
                <span className={styles.modeBtn}>Video</span>
              </div>
            </div>
            
            <div className={styles.optionsRight}>
              <div className={styles.aspects}>
                <span className={styles.aspectBtn}>1:1</span>
                <span className={`${styles.aspectBtn} ${styles.aspectActive}`}>16:9</span>
                <span className={styles.aspectBtn}>9:16</span>
              </div>
              <div className={styles.selectors}>
                <div className={styles.selectorBtn}>
                  <span>Cinematic</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                <div className={styles.selectorBtn}>
                  <span>Flux-Engine</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
