// Git hooks export GIT_DIR, GIT_INDEX_FILE and similar variables. Tests that create temporary
// repositories must not inherit them, or their commands act on the repository being committed.
for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];
