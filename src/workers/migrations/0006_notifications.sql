-- Migration 0006: Admin notifications and user notification preferences

CREATE TABLE IF NOT EXISTS admin_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  resource_id TEXT,
  resource_type TEXT,
  is_read BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  email_new_user BOOLEAN DEFAULT 1,
  email_new_oauth_app BOOLEAN DEFAULT 1,
  email_new_api_key BOOLEAN DEFAULT 0,
  email_suspicious_login BOOLEAN DEFAULT 1,
  digest_enabled BOOLEAN DEFAULT 0,
  digest_frequency TEXT DEFAULT 'weekly',
  admin_email TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO admin_notification_settings (id) VALUES ('singleton');

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id TEXT PRIMARY KEY,
  email_login_alerts BOOLEAN DEFAULT 1,
  email_app_activity BOOLEAN DEFAULT 0,
  email_weekly_digest BOOLEAN DEFAULT 0,
  email_security_alerts BOOLEAN DEFAULT 1,
  unsubscribe_token TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_is_read ON admin_notifications(is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_type ON admin_notifications(type, created_at);
