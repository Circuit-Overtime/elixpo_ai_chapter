'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import Navbar from '../components/Navbar/Navbar';
import GradientBlobs from '../components/shared/GradientBlobs';
import { isSignedIn, getUser, clearAuth, fetchCredits, getUserTier } from '../lib/auth';
import { getDailyCredits } from '../lib/credits';
import styles from './Settings.module.css';

const INTERESTS = [
  'Advertising', 'Architecture', 'Art', 'Board Games', 'Education',
  'Fashion', 'Film / TV', 'Interior Design', 'Marketing',
  'Product Design', 'Stock Images', 'Video Games', 'Other',
];

const PLAN_LABELS = {
  free: 'Free',
  atelier: 'Atelier',
  masterpiece: 'Masterpiece',
};

function UsageBar({ label, used, total, color = 'var(--gradient-primary)', icon }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const isNearLimit = pct >= 80;
  const isAtLimit = pct >= 100;

  return (
    <div className={styles.usageItem}>
      <div className={styles.usageHeader}>
        <span className={styles.usageLabel}>
          {icon}
          {label}
        </span>
        <span className={`${styles.usageCount} ${isAtLimit ? styles.usageAtLimit : isNearLimit ? styles.usageNearLimit : ''}`}>
          {used} / {total}
        </span>
      </div>
      <div className={styles.usageTrack}>
        <motion.div
          className={styles.usageFill}
          style={{ background: isAtLimit ? '#ef4444' : isNearLimit ? '#f59e0b' : color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
        />
      </div>
      <span className={styles.usageHint}>
        {isAtLimit ? 'Limit reached — resets at midnight UTC' : `${Math.round(total - used)} remaining today`}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creditsUsed, setCreditsUsed] = useState(0);

  const userPlan = user?.plan_id || user?.plan || 'free';
  const totalCredits = getDailyCredits(userPlan);

  useEffect(() => {
    if (!isSignedIn()) {
      router.push('/');
      return;
    }
    const u = getUser();
    setUser(u);

    // Load saved interests
    const saved = localStorage.getItem('elixpo_interests');
    if (saved) setSelectedInterests(JSON.parse(saved));

    // Fetch credit usage
    fetchCredits().then((data) => {
      if (data) setCreditsUsed(data.creditsUsed || 0);
    });
  }, [router]);

  // Poll usage every 30s to keep progress bars fresh
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetchCredits().then((data) => {
        if (data) setCreditsUsed(data.creditsUsed || 0);
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const toggleInterest = (interest) => {
    setSelectedInterests((prev) => {
      const next = prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest];
      localStorage.setItem('elixpo_interests', JSON.stringify(next));
      return next;
    });
  };

  const handleDeleteAccount = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    clearAuth();
    localStorage.removeItem('elixpo_interests');
    localStorage.removeItem('elixpo_guest_usage');
    localStorage.removeItem('elixpo_guest_session');
    router.push('/');
  };

  if (!user) return null;

  return (
    <div className={styles.page}>
      <GradientBlobs preset="default" />
      <Navbar />
      <main className={styles.main}>
        <div className={styles.layout}>
          {/* Sidebar */}
          <aside className={styles.sidebar}>
            <div className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Personal Settings</h3>
              <a href="/settings" className={`${styles.sidebarItem} ${styles.sidebarActive}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Your Profile
              </a>
            </div>
          </aside>

          {/* Content */}
          <div className={styles.content}>
            <h1 className={styles.pageTitle}>Your Profile</h1>

            {/* Profile card */}
            <div className={styles.card}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Your Email</label>
                  <div className={styles.fieldValue}>{user.email || '—'}</div>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Your Username</label>
                  <div className={styles.fieldValue}>
                    <span className={styles.atSign}>@</span>
                    {user.displayName || '—'}
                  </div>
                </div>
              </div>
            </div>

            {/* Usage / Rate Limits */}
            <div className={styles.card}>
              <div className={styles.usageTitleRow}>
                <h2 className={styles.cardTitle}>Daily Usage</h2>
                <span className={styles.planBadge}>{PLAN_LABELS[userPlan] || 'Free'}</span>
              </div>

              <UsageBar
                label="Credits"
                used={creditsUsed}
                total={totalCredits}
                color="var(--gradient-primary)"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v12M6 12h12" />
                  </svg>
                }
              />

              <a href="/pricing" className={styles.upgradeLink}>
                {userPlan === 'masterpiece' ? 'You\'re on the top plan' : 'Upgrade for higher limits'}
                {userPlan !== 'masterpiece' && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                )}
              </a>
            </div>

            {/* Interests */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>What are your interests?</h2>
              <div className={styles.chipGrid}>
                {INTERESTS.map((interest) => (
                  <button
                    key={interest}
                    className={`${styles.chip} ${selectedInterests.includes(interest) ? styles.chipActive : ''}`}
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </div>

            {/* Delete account */}
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Delete Account</h2>
              <p className={styles.cardDesc}>
                Deleting your account will remove all of your information from our database. This cannot be undone.
              </p>
              <button
                className={styles.deleteBtn}
                onClick={handleDeleteAccount}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
                {confirmDelete ? 'Confirm Delete' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
