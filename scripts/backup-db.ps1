New-Item -ItemType Directory -Force backups | Out-Null
npx wrangler d1 export prode_mundial_2026 --remote --output backups/prode_mundial_2026_backup.sql --config apps/api/wrangler.toml
