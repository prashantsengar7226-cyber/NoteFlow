CREATE TABLE vertex_usage (
 id TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 owner_label TEXT NOT NULL,
 project TEXT NOT NULL,
 model TEXT NOT NULL,
 location TEXT NOT NULL,
 feature TEXT NOT NULL,
 operation_id TEXT,
 state TEXT NOT NULL DEFAULT 'pending',
 input_tokens INTEGER,
 cached_tokens INTEGER,
 output_tokens INTEGER,
 thinking_tokens INTEGER,
 estimated_usd REAL,
 pricing_version TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX vertex_usage_owner_created ON vertex_usage(owner,created_at);
--> statement-breakpoint
CREATE INDEX vertex_usage_created ON vertex_usage(created_at);
--> statement-breakpoint
CREATE TABLE cloud_cost_snapshots (
 project TEXT NOT NULL,
 month TEXT NOT NULL,
 synced_at INTEGER NOT NULL,
 export_through TEXT,
 PRIMARY KEY(project,month)
);
--> statement-breakpoint
CREATE TABLE cloud_cost_rows (
 project TEXT NOT NULL,
 month TEXT NOT NULL,
 day TEXT NOT NULL,
 owner_label TEXT NOT NULL,
 currency TEXT NOT NULL,
 cost REAL NOT NULL,
 credits REAL NOT NULL,
 PRIMARY KEY(project,month,day,owner_label,currency)
);
