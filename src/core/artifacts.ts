import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { countTextChars, stripAnsi } from "./text.js";

import type { ArtifactMetadataRef, StoredArtifact, StoredArtifactInput, StoredArtifactMetadata, StoredArtifactRef } from "../types.js";

const ARTIFACT_ID_PATTERN = /^tj_[0-9a-f-]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredArtifactMetadata(value: unknown): value is StoredArtifactMetadata {
  if (!isRecord(value) || typeof value.createdAt !== "string" || typeof value.rawChars !== "number") {
    return false;
  }

  if (!isRecord(value.classification) || typeof value.classification.family !== "string" || typeof value.classification.confidence !== "number") {
    return false;
  }

  if ("matchedReducer" in value.classification && value.classification.matchedReducer !== undefined && typeof value.classification.matchedReducer !== "string") {
    return false;
  }

  if ("toolName" in value && value.toolName !== undefined && typeof value.toolName !== "string") {
    return false;
  }
  if ("command" in value && value.command !== undefined && typeof value.command !== "string") {
    return false;
  }
  if ("exitCode" in value && value.exitCode !== undefined && typeof value.exitCode !== "number") {
    return false;
  }
  if ("reducedChars" in value && value.reducedChars !== undefined && typeof value.reducedChars !== "number") {
    return false;
  }
  if ("ratio" in value && value.ratio !== undefined && typeof value.ratio !== "number") {
    return false;
  }

  return true;
}

function artifactBaseDir(storeDir?: string): string {
  return storeDir ?? join(homedir(), ".tokenjuice", "artifacts");
}

export function isValidArtifactId(id: string): boolean {
  return ARTIFACT_ID_PATTERN.test(id);
}

function buildArtifactPaths(id: string, storeDir?: string): StoredArtifactRef {
  if (!isValidArtifactId(id)) {
    throw new Error(`invalid artifact id: ${id}`);
  }

  const base = artifactBaseDir(storeDir);
  return {
    id,
    storage: "file",
    path: join(base, `${id}.txt`),
    metadataPath: join(base, `${id}.json`),
  };
}

export async function storeArtifact(input: StoredArtifactInput, storeDir?: string): Promise<StoredArtifactRef> {
  const id = `tj_${randomUUID().slice(0, 12)}`;
  const ref = buildArtifactPaths(id, storeDir);
  await mkdir(artifactBaseDir(storeDir), { recursive: true, mode: 0o700 });

  const artifact: StoredArtifact = {
    id,
    rawText: input.rawText,
    metadata: {
      createdAt: new Date().toISOString(),
      classification: input.classification,
      rawChars: input.stats?.rawChars ?? countTextChars(stripAnsi(input.rawText)),
      ...(input.input.toolName ? { toolName: input.input.toolName } : {}),
      ...(input.input.command ? { command: input.input.command } : {}),
      ...(typeof input.input.exitCode === "number" ? { exitCode: input.input.exitCode } : {}),
      ...(input.stats ? { reducedChars: input.stats.reducedChars, ratio: input.stats.ratio } : {}),
    },
  };

  await Promise.all([
    writeFile(ref.path, input.rawText, { encoding: "utf8", mode: 0o600 }),
    writeFile(ref.metadataPath, JSON.stringify(artifact.metadata, null, 2), { encoding: "utf8", mode: 0o600 }),
  ]);

  return ref;
}

export async function getArtifact(id: string, storeDir?: string): Promise<StoredArtifact | null> {
  if (!isValidArtifactId(id)) {
    return null;
  }

  const ref = buildArtifactPaths(id, storeDir);
  try {
    const [rawText, metadataRaw] = await Promise.all([
      readFile(ref.path, "utf8"),
      readFile(ref.metadataPath, "utf8"),
    ]);
    return {
      id,
      rawText,
      metadata: (() => {
        const parsed = JSON.parse(metadataRaw) as unknown;
        if (!isStoredArtifactMetadata(parsed)) {
          throw new Error("invalid artifact metadata");
        }
        return parsed;
      })(),
    };
  } catch {
    return null;
  }
}

export async function listArtifacts(storeDir?: string): Promise<StoredArtifactRef[]> {
  const base = artifactBaseDir(storeDir);
  try {
    const files = await readdir(base);
    return files
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/u, ""))
      .filter((id) => isValidArtifactId(id))
      .sort()
      .reverse()
      .map((id) => buildArtifactPaths(id, storeDir));
  } catch {
    return [];
  }
}

export async function listArtifactMetadata(storeDir?: string): Promise<ArtifactMetadataRef[]> {
  const refs = await listArtifacts(storeDir);
  const metadata = await Promise.all(
    refs.map(async (ref) => {
      try {
        const raw = await readFile(ref.metadataPath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        if (!isStoredArtifactMetadata(parsed)) {
          return null;
        }
        return {
          ...ref,
          metadata: parsed,
        };
      } catch {
        return null;
      }
    }),
  );

  return metadata.filter((entry): entry is ArtifactMetadataRef => entry !== null);
}
