'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './Hero.module.css';

const HERO_IMAGES = [
  { src: '/images/styles/cyberpunk-art.jpg', alt: 'Cyberpunk Art' },
  { src: '/images/styles/synthwave-art.jpg', alt: 'Synthwave Art' },
  { src: '/images/styles/vaporwave-art.jpg', alt: 'Vaporwave Art' },
  { src: '/images/styles/surrealism-art.jpg', alt: 'Surrealism Art' },
  { src: '/images/styles/baroque-art.jpg', alt: 'Baroque Art' },
  { src: '/images/styles/impressionism-art.jpg', alt: 'Impressionism Art' },
  { src: '/images/styles/digital-painting.jpg', alt: 'Digital Painting' },
  { src: '/images/styles/minimalism-art.jpg', alt: 'Minimalism' },
  { src: '/images/styles/art-nouveau.jpg', alt: 'Art Nouveau' },
  { src: '/images/styles/pop-art.jpeg', alt: 'Pop Art' },
  { src: '/images/styles/renaissance-art.jpg', alt: 'Renaissance Art' },
  { src: '/images/styles/abstract.jpeg', alt: 'Abstract Art' }
];

export default function Hero() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const trackHeight = rect.height;
      const windowHeight = window.innerHeight;
      const scrollableRange = trackHeight - windowHeight;
      
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(scrolled / scrollableRange, 1));
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const col1 = HERO_IMAGES.slice(0, 4);
  const col2 = HERO_IMAGES.slice(4, 8);
  const col3 = HERO_IMAGES.slice(8, 12);

  const gridTransform = `rotate(${-15 * scrollProgress}deg) skewX(${-5 * scrollProgress}deg) scale(${1 + 0.3 * scrollProgress})`;

  const titleScale = 1 + 1.8 * (1 - scrollProgress);
  const badgeY = 28 * (1 - scrollProgress);
  const secondaryOpacity = scrollProgress;
  const borderOpacity = scrollProgress * 0.09;
  const bgOpacity = scrollProgress * 0.03;

  const contentY = 40 * (1 - scrollProgress);

  return (
    <div className={styles.scrollTrack} ref={trackRef}>
      <section className={styles.hero}>
        <div 
          className={styles.slideshowContainer} 
          style={{ opacity: 1 - scrollProgress }}
          aria-hidden="true"
        >
          {HERO_IMAGES.map((img, i) => (
            <div
              key={`slide-${i}`}
              className={`${styles.slide} ${activeSlide === i ? styles.slideActive : ''}`}
              style={{ backgroundImage: `url(${img.src})` }}
            />
          ))}
        </div>

        <div 
          className={styles.gridContainer} 
          style={{ opacity: scrollProgress * 0.45 }}
          aria-hidden="true"
        >
          <div className={styles.gridSkew} style={{ transform: gridTransform }}>
            <div className={`${styles.gridCol} ${styles.colUp}`}>
              {[...col1, ...col1].map((img, i) => (
                <div key={`col1-${i}`} className={styles.gridCard}>
                  <img src={img.src} alt={img.alt} className={styles.gridImg} />
                </div>
              ))}
            </div>
            <div className={`${styles.gridCol} ${styles.colDown}`}>
              {[...col2, ...col2].map((img, i) => (
                <div key={`col2-${i}`} className={styles.gridCard}>
                  <img src={img.src} alt={img.alt} className={styles.gridImg} />
                </div>
              ))}
            </div>
            <div className={`${styles.gridCol} ${styles.colUp}`}>
              {[...col3, ...col3].map((img, i) => (
                <div key={`col3-${i}`} className={styles.gridCard}>
                  <img src={img.src} alt={img.alt} className={styles.gridImg} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.vignette} aria-hidden="true" />
        <div className={styles.glowBlob} aria-hidden="true" />

        <div className={styles.content}>
          <div 
            className={styles.badge}
            style={{ 
              transform: `translateY(${badgeY}vh)`,
              borderColor: `rgba(255, 255, 255, ${borderOpacity})`,
              backgroundColor: `rgba(255, 255, 255, ${bgOpacity})`,
              padding: scrollProgress > 0.1 ? '0.5rem 1.4rem' : '0.5rem 0'
            }}
          >
            <span 
              className={styles.badgeTitle}
              style={{ 
                transform: `scale(${titleScale})`,
              }}
            >
              Intr<span className={styles.tiltedO}>o</span>ducing ELIXP<span className={styles.tiltedO}>O</span> ART
            </span>
          </div>

          <div 
            className={styles.scrollContent}
            style={{ 
              opacity: scrollProgress,
              transform: `translateY(${contentY}px)`,
              pointerEvents: scrollProgress > 0.1 ? 'auto' : 'none'
            }}
          >
            <h1 className={styles.headline}>
              THE CREATOR-FIRST<br />
              <span className={styles.gradientText}>GENERATIVE PLATFORM</span>
            </h1>

            <p className={styles.subtitle}>
              Transform text into stunning images and video. 15+ styles. 8+ models. Completely free.
            </p>

            <div className={styles.ctas}>
              <a href="/generate" className={styles.heroBtn}>
                <span>Start now</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
