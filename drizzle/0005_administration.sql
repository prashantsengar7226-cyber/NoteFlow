CREATE TABLE IF NOT EXISTS user_access (
 owner TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin','superuser')),
 suspended INTEGER NOT NULL DEFAULT 0 CHECK(suspended IN (0,1)), revision TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_directory (
 owner TEXT PRIMARY KEY, email TEXT NOT NULL, display_name TEXT NOT NULL,
 first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admin_audit (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL,
 before_value TEXT NOT NULL, after_value TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admin_audit_created ON admin_audit(created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS operational_events (
 id TEXT PRIMARY KEY, actor TEXT, event TEXT NOT NULL, code TEXT, status INTEGER, resource TEXT, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS operational_events_created ON operational_events(created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS protect_last_superuser_update BEFORE UPDATE ON user_access
 WHEN OLD.role='superuser' AND OLD.suspended=0 AND (NEW.role!='superuser' OR NEW.suspended!=0)
 AND (SELECT COUNT(*) FROM user_access WHERE role='superuser' AND suspended=0)<=1
 BEGIN SELECT RAISE(ABORT,'Last superuser is protected'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS protect_last_superuser_delete BEFORE DELETE ON user_access
 WHEN OLD.role='superuser' AND OLD.suspended=0
 AND (SELECT COUNT(*) FROM user_access WHERE role='superuser' AND suspended=0)<=1
 BEGIN SELECT RAISE(ABORT,'Last superuser is protected'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS admin_audit_no_update BEFORE UPDATE ON admin_audit
 BEGIN SELECT RAISE(ABORT,'Audit records are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS admin_audit_no_delete BEFORE DELETE ON admin_audit
 BEGIN SELECT RAISE(ABORT,'Audit records are append-only'); END;
