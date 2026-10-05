/** GitHub project sites use /repository/; user sites and custom domains use /. */
export function resolvePagesBase(
  env: Record<string, string | undefined>,
): string {
  const override = env.PAGES_BASE_PATH?.trim();
  if (override !== undefined) {
    if (override === "" || override === "/") return "/";
    if (!/^\/[A-Za-z0-9._-]+\/?$/.test(override)) {
      throw new Error("PAGES_BASE_PATH must be / or /repository-name/.");
    }
    return `${override.replace(/\/$/, "")}/`;
  }
  const repo = env.GITHUB_REPOSITORY?.split("/")[1] ?? "Acapella-maker";
  return repo.toLowerCase().endsWith(".github.io") ? "/" : `/${repo}/`;
}
