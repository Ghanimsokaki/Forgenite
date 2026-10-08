/* Forgenite GitHub Integration
 *
 * Client-side GitHub API wrapper for repository browsing, file reading,
 * branch creation, commits, and pull requests.
 */

const LS_GITHUB_TOKEN = "forgenite.github.token.v1";

/**
 * Get saved GitHub personal access token.
 */
export function getSavedGitHubToken() {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LS_GITHUB_TOKEN) || null;
  } catch {
    return null;
  }
}

/**
 * Save GitHub personal access token.
 */
export function saveGitHubToken(token) {
  if (typeof window === "undefined") return;
  try {
    if (token && token.trim()) {
      localStorage.setItem(LS_GITHUB_TOKEN, token.trim());
    } else {
      localStorage.removeItem(LS_GITHUB_TOKEN);
    }
  } catch {
    console.error("[GitHub] Failed to save token to localStorage.");
  }
}

/**
 * Clear saved GitHub token (sign out).
 */
export function clearGitHubToken() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LS_GITHUB_TOKEN);
  } catch {
    // Ignore errors
  }
}

/**
 * Make a GitHub API request.
 */
async function githubRequest(path, options = {}) {
  const token = getSavedGitHubToken();
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = path.startsWith("https://")
    ? path
    : `https://api.github.com${path}`;

  const res = await fetch(url, {
    ...options,
    headers,
    signal: options.signal || AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    let errorMsg = `GitHub API error: ${res.status}`;
    try {
      const json = await res.json();
      errorMsg = json.message || errorMsg;
    } catch {
      // Keep default message
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

/**
 * Get authenticated user info.
 */
export async function getUser() {
  return githubRequest("/user");
}

/**
 * List repositories for authenticated user.
 */
export async function listRepos(perPage = 30, page = 1) {
  return githubRequest(`/user/repos?per_page=${perPage}&page=${page}&sort=updated`);
}

/**
 * Get repository details.
 */
export async function getRepo(owner, repo) {
  return githubRequest(`/repos/${owner}/${repo}`);
}

/**
 * List branches in a repository.
 */
export async function listBranches(owner, repo) {
  return githubRequest(`/repos/${owner}/${repo}/branches`);
}

/**
 * Get contents of a file or directory.
 */
export async function getContents(owner, repo, path = "", ref = null) {
  let url = `/repos/${owner}/${repo}/contents/${path}`;
  if (ref) url += `?ref=${encodeURIComponent(ref)}`;
  return githubRequest(url);
}

/**
 * Create or update a file in a repository.
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path
 * @param {string} content - File content (will be base64 encoded)
 * @param {string} message - Commit message
 * @param {string} branch - Target branch
 * @param {string} [sha] - Existing file SHA (for updates)
 */
export async function createOrUpdateFile(owner, repo, path, content, message, branch, sha = null) {
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  };
  
  if (sha) {
    body.sha = sha;
  }

  return githubRequest(`/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Create a new branch.
 */
export async function createBranch(owner, repo, branchName, fromSha) {
  return githubRequest(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: fromSha,
    }),
  });
}

/**
 * Create a pull request.
 */
export async function createPullRequest(owner, repo, title, head, base, body = "") {
  return githubRequest(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      head,
      base,
      body,
    }),
  });
}

/**
 * Test if GitHub token is valid.
 */
export async function testGitHubConnection() {
  try {
    await getUser();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
