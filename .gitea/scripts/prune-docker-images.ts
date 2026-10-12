const manifestAccept = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

interface TagList {
  tags: string[] | null;
}

interface Manifest {
  config?: { digest: string };
  manifests?: Array<{
    digest: string;
    platform?: { os: string; architecture: string };
  }>;
}

interface ImageConfig {
  created?: string;
}

interface Image {
  digest: string;
  tags: string[];
  createdAt: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

const registry = required("DOCKER_REGISTRY");
const imageName = required("DOCKER_IMAGE");
const publishedVersion = required("PUBLISHED_VERSION");
const retentionText = required("DOCKER_RETENTION_COUNT");
if (!/^[1-9]\d*$/.test(retentionText))
  throw new Error("DOCKER_RETENTION_COUNT must be a positive integer.");
const retentionCount = Number(retentionText);
if (!Number.isSafeInteger(retentionCount))
  throw new Error("DOCKER_RETENTION_COUNT is too large.");

const username = process.env.DOCKER_REGISTRY_USERNAME?.trim() ?? "";
const password = process.env.DOCKER_REGISTRY_PASSWORD ?? "";
if (Boolean(username) !== Boolean(password))
  throw new Error("Set both Docker registry credentials or neither.");

const root = new URL(`https://${registry}/v2/${imageName}/`);
const authorization = username
  ? `Basic ${btoa(`${username}:${password}`)}`
  : undefined;

async function request(url: URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authorization) headers.set("Authorization", authorization);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok)
    throw new Error(
      `${init.method ?? "GET"} ${url.pathname} failed: ${response.status}`,
    );
  return response;
}

async function json<T>(url: URL, init?: RequestInit): Promise<T> {
  return (await (await request(url, init)).json()) as T;
}

function url(path: string): URL {
  return new URL(path, root);
}

async function listTags(): Promise<string[]> {
  const tags = new Set<string>();
  const pages = new Set<string>();
  let next: URL | null = url("tags/list");
  while (next) {
    if (pages.has(next.href))
      throw new Error("Registry tag pagination looped.");
    pages.add(next.href);
    const response = await request(next);
    const body = (await response.json()) as TagList;
    if (body.tags !== null && !Array.isArray(body.tags))
      throw new Error("Registry returned an invalid tag list.");
    for (const tag of body.tags ?? []) tags.add(tag);

    const link = response.headers
      .get("Link")
      ?.match(/<([^>]+)>;\s*rel="?next"?/i);
    if (!link) {
      next = null;
      continue;
    }
    const page: URL = new URL(link[1], next);
    if (
      page.origin !== root.origin ||
      page.pathname !== url("tags/list").pathname
    )
      throw new Error("Registry returned an unexpected tag page URL.");
    next = page;
  }
  return [...tags];
}

async function imageCreatedAt(digest: string): Promise<number> {
  const headers = { Accept: manifestAccept };
  let manifest = await json<Manifest>(url(`manifests/${digest}`), { headers });
  if (manifest.manifests) {
    const platform = manifest.manifests.find(
      (item) =>
        item.platform?.os === "linux" && item.platform.architecture === "amd64",
    );
    if (!platform) throw new Error(`No linux/amd64 image in ${digest}.`);
    manifest = await json<Manifest>(url(`manifests/${platform.digest}`), {
      headers,
    });
  }
  if (!manifest.config?.digest)
    throw new Error(`Image ${digest} has no configuration blob.`);
  const config = await json<ImageConfig>(
    url(`blobs/${manifest.config.digest}`),
  );
  const createdAt = Date.parse(config.created ?? "");
  if (!Number.isFinite(createdAt))
    throw new Error(`Image ${digest} has no valid creation time.`);
  return createdAt;
}

async function main(): Promise<void> {
  const tags = await listTags();
  const groups = new Map<string, string[]>();
  const tagDigests = new Map<string, string>();
  for (const tag of tags) {
    const response = await request(
      url(`manifests/${encodeURIComponent(tag)}`),
      {
        method: "HEAD",
        headers: { Accept: manifestAccept },
      },
    );
    const digest = response.headers.get("Docker-Content-Digest");
    if (!digest)
      throw new Error(`Registry did not return a digest for ${tag}.`);
    tagDigests.set(tag, digest);
    groups.set(digest, [...(groups.get(digest) ?? []), tag]);
  }

  const publishedDigest = tagDigests.get(publishedVersion);
  const latestDigest = tagDigests.get("latest");
  if (!publishedDigest || !latestDigest)
    throw new Error(
      "Published version and latest tags must exist before cleanup.",
    );
  const excess = groups.size - retentionCount;
  if (excess <= 0) {
    console.log(`Keeping ${groups.size} images (limit ${retentionCount}).`);
    return;
  }

  const protectedDigests = new Set([publishedDigest, latestDigest]);
  const images: Image[] = await Promise.all(
    [...groups].map(async ([digest, imageTags]) => ({
      digest,
      tags: imageTags,
      createdAt: await imageCreatedAt(digest),
    })),
  );
  const oldest = images
    .filter((image) => !protectedDigests.has(image.digest))
    .sort(
      (a, b) => a.createdAt - b.createdAt || a.digest.localeCompare(b.digest),
    );
  if (oldest.length < excess)
    throw new Error(
      "Retention is smaller than the number of protected images.",
    );

  for (const image of oldest.slice(0, excess)) {
    await request(url(`manifests/${image.digest}`), { method: "DELETE" });
    console.log(`Deleted ${image.tags.join(", ")} (${image.digest}).`);
  }
  console.log(`Kept ${retentionCount} newest images.`);
}

await main();
