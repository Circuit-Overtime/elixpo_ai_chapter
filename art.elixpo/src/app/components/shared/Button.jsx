import styles from './Button.module.css';

export default function Button({ children, variant = 'primary', href, onClick, icon, className = '' }) {
  const cls = `${styles.btn} ${styles[variant]} ${className}`;

  if (href) {
    return (
      <a href={href} className={cls}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <span>{children}</span>
      </a>
    );
  }

  return (
    <button className={cls} onClick={onClick}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
