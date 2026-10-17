-- Local-only seed data to exercise feed / trending / popular-tags / interests.
-- Idempotent (INSERT OR IGNORE). Apply with:
--   npx wrangler d1 execute lixblogs --local --file scripts/seed-local.sql

-- Authors
INSERT OR IGNORE INTO users (id, email, username, display_name, tier) VALUES
  ('u_seed_ayush', 'seed-ayush@example.com', 'ayushman-dev', 'Ayushman B.', 'member'),
  ('u_seed_nik',   'seed-nik@example.com',   'nikita-writes', 'Nikita R.',  'free');

INSERT OR IGNORE INTO namespaces (name, owner_type, owner_id) VALUES
  ('ayushman-dev', 'user', 'u_seed_ayush'),
  ('nikita-writes', 'user', 'u_seed_nik');

-- Published blogs (recent, varied like_count for trending order). content = empty block array.
INSERT OR IGNORE INTO blogs
  (id, slugid, slug, title, subtitle, page_emoji, content, author_id, published_as, status, read_time_minutes, published_at, like_count, comment_count, view_count)
VALUES
  ('b_seed_1','s1aa1111','designing-resilient-ci-cd','Designing Resilient CI/CD','Pipelines that fail loudly and recover fast','🛠','[]','u_seed_ayush','personal','published',6,unixepoch(),42,3,210),
  ('b_seed_2','s2bb2222','kubernetes-autoscaling-deep-dive','Kubernetes Autoscaling Deep Dive','HPA, VPA, and cluster autoscaler in practice','☸️','[]','u_seed_ayush','personal','published',8,unixepoch(),38,5,180),
  ('b_seed_3','s3cc3333','shipping-ml-models-with-mlflow','Shipping ML Models with MLflow','From notebook to production registry','🤖','[]','u_seed_nik','personal','published',7,unixepoch(),55,8,320),
  ('b_seed_4','s4dd4444','edge-first-web-apps','Edge-First Web Apps','Building on Cloudflare Workers + D1','⚡','[]','u_seed_nik','personal','published',5,unixepoch(),30,2,140),
  ('b_seed_5','s5ee5555','open-source-maintainer-playbook','The Open-Source Maintainer Playbook','Turning first-time contributors into regulars','🌱','[]','u_seed_ayush','personal','published',9,unixepoch(),61,11,400),
  ('b_seed_6','s6ff6666','observability-prometheus-grafana','Observability with Prometheus & Grafana','Dashboards that actually page someone','📈','[]','u_seed_nik','personal','published',6,unixepoch(),27,1,95);

-- Tags
INSERT OR IGNORE INTO blog_tags (blog_id, tag) VALUES
  ('b_seed_1','DevOps'),('b_seed_1','CI/CD'),
  ('b_seed_2','Kubernetes'),('b_seed_2','DevOps'),
  ('b_seed_3','MLOps'),('b_seed_3','Machine Learning'),
  ('b_seed_4','Web Development'),('b_seed_4','Cloudflare'),
  ('b_seed_5','Open Source'),('b_seed_5','Community'),
  ('b_seed_6','DevOps'),('b_seed_6','Observability');

-- Interests for the existing local user (personalizes their feed's interest bucket)
INSERT OR IGNORE INTO user_interests (user_id, tag) VALUES
  ('eabf0dad-69f1-435b-a9c3-7310cbd18029','DevOps'),
  ('eabf0dad-69f1-435b-a9c3-7310cbd18029','MLOps'),
  ('eabf0dad-69f1-435b-a9c3-7310cbd18029','Open Source');
