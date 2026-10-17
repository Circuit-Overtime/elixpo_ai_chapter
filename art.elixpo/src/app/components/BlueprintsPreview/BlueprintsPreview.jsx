import styles from './BlueprintsPreview.module.css';
import SectionHeader from '../shared/SectionHeader';

const categories = ['All', 'Illustration', 'Photography', 'Design', 'Marketing'];

const blueprints = [
  { name: 'Cyberpunk', image: '/images/styles/cyberpunk-art.jpg', category: 'Illustration' },
  { name: 'Baroque', image: '/images/styles/baroque-art.jpg', category: 'Illustration' },
  { name: 'Digital Painting', image: '/images/styles/digital-painting.jpg', category: 'Design' },
  { name: 'Synthwave', image: '/images/styles/synthwave-art.jpg', category: 'Design' },
  { name: 'Impressionism', image: '/images/styles/impressionism-art.jpg', category: 'Illustration' },
  { name: 'Pop Art', image: '/images/styles/pop-art.jpeg', category: 'Marketing' },
  { name: 'Surrealism', image: '/images/styles/surrealism-art.jpg', category: 'Illustration' },
  { name: 'Renaissance', image: '/images/styles/renaissance-art.jpg', category: 'Photography' },
  { name: 'Art Nouveau', image: '/images/styles/art-nouveau.jpeg', category: 'Design' },
  { name: 'Vaporwave', image: '/images/styles/vaporwave-art.jpg', category: 'Design' },
  { name: 'Minimalism', image: '/images/styles/minimalism-art.jpg', category: 'Photography' },
  { name: 'Abstract', image: '/images/styles/abstract.jpeg', category: 'Marketing' },
];

export default function BlueprintsPreview() {
  return (
    <section className={styles.section}>
      <SectionHeader
        badge="Blueprints"
        title="Ready-Made AI Templates"
        subtitle="Jump-start your creativity with preset styles and themes"
      />

      {/* Category tabs */}
      <div className={styles.tabs}>
        {categories.map((cat, i) => (
          <button
            key={cat}
            className={`${styles.tab} ${i === 0 ? styles.tabActive : ''}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className={styles.searchWrap}>
        <div className={styles.searchBar}>
          <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <span className={styles.searchPlaceholder}>Search Blueprints</span>
        </div>
      </div>

      {/* Blueprint grid */}
      <div className={styles.grid}>
        {blueprints.map((bp) => (
          <a key={bp.name} href="/blueprints" className={styles.card}>
            <div className={styles.imageWrap}>
              <img src={bp.image} alt={bp.name} className={styles.image} />
              <div className={styles.overlay}>
                <span className={styles.useBtn}>Use Template</span>
              </div>
            </div>
            <div className={styles.cardInfo}>
              <span className={styles.cardName}>{bp.name}</span>
              <span className={styles.cardCat}>{bp.category}</span>
            </div>
          </a>
        ))}
      </div>

      <div className={styles.viewAll}>
        <a href="/blueprints" className={styles.viewAllLink}>
          View All Blueprints →
        </a>
      </div>
    </section>
  );
}
