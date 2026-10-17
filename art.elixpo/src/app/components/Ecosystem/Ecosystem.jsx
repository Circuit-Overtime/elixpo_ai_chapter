import styles from './Ecosystem.module.css';
import SectionHeader from '../shared/SectionHeader';

const items = [
  {
    icon: '🤖',
    title: 'Jackey — Discord Bot',
    badge: '83 Servers',
    description: 'Generate AI art directly in your Discord server with simple slash commands.',
    color: '#5865F2',
    href: 'https://discord.com',
  },
  {
    icon: '🌐',
    title: 'Chrome Extension',
    badge: '39 Users',
    description: 'Right-click any image to transform it, or generate art from any webpage.',
    color: '#f4c801',
    href: '#',
  },
  {
    icon: '🎮',
    title: 'Minecraft Bot',
    badge: 'Under Development',
    description: 'Generate and display AI art within Minecraft worlds — coming soon.',
    color: '#10b981',
    href: '#',
  },
];

export default function Ecosystem() {
  return (
    <section className={styles.section}>
      <SectionHeader
        badge="Ecosystem"
        title="Beyond the Web"
        subtitle="Elixpo Art extends into the platforms you already use"
      />

      <div className={styles.grid}>
        {items.map((item) => (
          <a key={item.title} href={item.href} className={styles.card}>
            <div className={styles.iconWrap} style={{ background: `${item.color}18` }}>
              <span className={styles.icon}>{item.icon}</span>
            </div>
            <h3 className={styles.cardTitle}>{item.title}</h3>
            <span className={styles.badge} style={{ color: item.color, borderColor: `${item.color}40` }}>
              {item.badge}
            </span>
            <p className={styles.cardDesc}>{item.description}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
