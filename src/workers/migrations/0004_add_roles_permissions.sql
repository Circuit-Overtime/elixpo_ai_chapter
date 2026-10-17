-- Migration 0004: Add Roles and Permissions RBAC System

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  system_role BOOLEAN DEFAULT 0, -- System roles cannot be deleted
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  resource TEXT NOT NULL, -- users, apps, admin, settings, webhooks, api_keys
  action TEXT NOT NULL, -- read, write, delete, manage
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Role-Permission mapping table
CREATE TABLE IF NOT EXISTS role_permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

-- User-Role mapping table
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  assigned_by TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, role_id)
);

-- Insert default system roles
INSERT OR IGNORE INTO roles (id, name, description, system_role)
VALUES 
  ('role-super-admin', 'Super Admin', 'Full system access', 1),
  ('role-admin', 'Admin', 'Administrative access to most features', 1),
  ('role-moderator', 'Moderator', 'Moderate users and content', 1),
  ('role-user', 'User', 'Standard user role', 1);

-- Insert default permissions
INSERT OR IGNORE INTO permissions (id, name, description, resource, action)
VALUES
  -- Users permissions
  ('perm-users-read', 'Read Users', 'View user information', 'users', 'read'),
  ('perm-users-write', 'Write Users', 'Create and update users', 'users', 'write'),
  ('perm-users-delete', 'Delete Users', 'Delete user accounts', 'users', 'delete'),
  ('perm-users-manage', 'Manage Users', 'Full user management', 'users', 'manage'),
  
  -- Applications permissions
  ('perm-apps-read', 'Read Apps', 'View OAuth applications', 'apps', 'read'),
  ('perm-apps-write', 'Write Apps', 'Create and update OAuth apps', 'apps', 'write'),
  ('perm-apps-delete', 'Delete Apps', 'Delete OAuth applications', 'apps', 'delete'),
  ('perm-apps-manage', 'Manage Apps', 'Full OAuth application management', 'apps', 'manage'),
  
  -- Admin permissions
  ('perm-admin-read', 'Read Admin Panel', 'Access admin dashboard', 'admin', 'read'),
  ('perm-admin-write', 'Write Admin', 'Modify admin settings', 'admin', 'write'),
  ('perm-admin-manage', 'Manage Admin', 'Full admin management', 'admin', 'manage'),
  
  -- Settings permissions
  ('perm-settings-read', 'Read Settings', 'View system settings', 'settings', 'read'),
  ('perm-settings-write', 'Write Settings', 'Modify system settings', 'settings', 'write'),
  
  -- Webhooks permissions
  ('perm-webhooks-read', 'Read Webhooks', 'View webhooks', 'webhooks', 'read'),
  ('perm-webhooks-write', 'Write Webhooks', 'Create and update webhooks', 'webhooks', 'write'),
  ('perm-webhooks-delete', 'Delete Webhooks', 'Delete webhooks', 'webhooks', 'delete'),
  
  -- API Keys permissions
  ('perm-api-keys-read', 'Read API Keys', 'View API keys', 'api_keys', 'read'),
  ('perm-api-keys-write', 'Write API Keys', 'Create and update API keys', 'api_keys', 'write'),
  ('perm-api-keys-delete', 'Delete API Keys', 'Delete API keys', 'api_keys', 'delete'),
  
  -- Roles & Permissions
  ('perm-roles-read', 'Read Roles', 'View roles and permissions', 'roles', 'read'),
  ('perm-roles-write', 'Write Roles', 'Create and update roles', 'roles', 'write'),
  ('perm-roles-manage', 'Manage Roles', 'Full roles management', 'roles', 'manage');

-- Assign permissions to Super Admin role (all permissions)
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 
  'rp-sa-' || p.id,
  'role-super-admin',
  p.id
FROM permissions p;

-- Assign permissions to Admin role
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 
  'rp-admin-' || p.id,
  'role-admin',
  p.id
FROM permissions p
WHERE p.name NOT IN ('Delete Users', 'Delete Apps', 'Manage Admin', 'Manage Roles');

-- Assign permissions to Moderator role
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 
  'rp-mod-' || p.id,
  'role-moderator',
  p.id
FROM permissions p
WHERE p.action IN ('read', 'write') AND p.resource IN ('users', 'apps');

-- Assign permissions to User role
INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id)
SELECT 
  'rp-user-' || p.id,
  'role-user',
  p.id
FROM permissions p
WHERE p.action = 'read' AND p.resource IN ('apps', 'webhooks');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_system_role ON roles(system_role);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_at ON user_roles(assigned_at);
