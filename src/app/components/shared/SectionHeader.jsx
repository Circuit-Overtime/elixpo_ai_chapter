import styles from './SectionHeader.module.css';

export default function SectionHeader({ badge, title, subtitle }) {
  return (
    <div className={styles.header}>
      {badge && (
        <div className={styles.badge}>
          <span>{badge}</span>
        </div>
      )}
      <h2 className={styles.title}>{title}</h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}
