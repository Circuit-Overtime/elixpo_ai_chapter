'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './InfoSections.module.css';

const sections = [
  {
    tag: 'Image Generation',
    title: 'From text to masterpiece in seconds',
    description: 'Type a prompt. Pick a style. Get stunning generated art instantly — powered by Flux, Turbo, Kontext and more. No sign-up required.',
    image: '/images/styles/cyberpunk-art.jpg',
  },
  {
    tag: 'Creative Styles',
    title: '15+ artistic themes at your fingertips',
    description: 'Cyberpunk, Ghibli, Baroque, Synthwave, Impressionism — choose from a curated library of art styles or let the system surprise you.',
    image: '/images/styles/baroque-art.jpg',
  },
  {
    tag: 'Prompt Enhancement',
    title: 'Model-powered prompt engineering',
    description: 'Our prompt enhancer refines your rough ideas into detailed, optimized prompts — getting better results without the guesswork.',
    image: '/images/styles/digital-painting.jpg',
  },
  {
    tag: 'Privacy First',
    title: 'Your creations, your rules',
    description: 'Private mode generates without storing data. Guest access gives you 10 free images per day. Sign in for 50. No strings attached.',
    image: '/images/styles/surrealism-art.jpg',
  },
];

export default function InfoSections() {
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRefs = useRef([]);

  useEffect(() => {
    const observerOptions = {
      root: null,
      rootMargin: '-30% 0px -40% 0px',
      threshold: 0.1,
    };

    const handleIntersection = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = Number(entry.target.getAttribute('data-index'));
          setActiveIndex(index);
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, observerOptions);
    const currentRefs = sectionRefs.current;
    
    currentRefs.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      currentRefs.forEach((ref) => {
        if (ref) observer.unobserve(ref);
      });
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.scrollGrid}>
        <div className={styles.textColumn}>
          {sections.map((s, i) => (
            <div
              key={i}
              className={`${styles.textSection} ${activeIndex === i ? styles.textActive : ''}`}
              ref={(el) => (sectionRefs.current[i] = el)}
              data-index={i}
            >
              <span className={styles.tag}>{s.tag}</span>
              <h2 className={styles.title}>{s.title}</h2>
              <p className={styles.desc}>{s.description}</p>
              
              <div className={styles.mobileImageFrame}>
                <img src={s.image} alt={s.tag} className={styles.image} />
                <div className={styles.imageGlow} />
              </div>
            </div>
          ))}
        </div>

        <div className={styles.stickyColumn}>
          <div className={styles.imageWrapper}>
            {sections.map((s, i) => (
              <div
                key={i}
                className={`${styles.imageFrame} ${activeIndex === i ? styles.frameActive : ''}`}
                style={{ opacity: activeIndex === i ? 1 : 0 }}
              >
                <img src={s.image} alt={s.tag} className={styles.image} />
                <div className={styles.imageGlow} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
