import fs from "fs";
import { Voy } from "voy-search/voy_search.js";

export interface VoyPersistencePaths {
    storageDir: string;
    indexFile: string;
    metadataFile: string;
}

export interface PersistedMetadataRecord {
    id: string;
    author?: string;
    content?: string;
    score?: number;
    date?: string;
    review_created_at?: string;
}

export function loadVoyIndex(indexFile: string): Voy | null {
    if (!fs.existsSync(indexFile)) {
        return null;
    }
    const serialized = fs.readFileSync(indexFile, "utf8");
    return Voy.deserialize(serialized);
}

export function loadPersistedMetadata(metadataFile: string): Map<string, PersistedMetadataRecord> {
    if (!fs.existsSync(metadataFile)) {
        return new Map();
    }
    const parsed = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
    if (parsed.reviews && typeof parsed.reviews === "object") {
        return new Map(Object.entries(parsed.reviews)) as Map<string, PersistedMetadataRecord>;
    }
    if (Array.isArray(parsed.indexed_ids)) {
        return new Map(parsed.indexed_ids.map((id: string) => [id, { id }]));
    }
    return new Map();
}

export function saveVoyState(paths: VoyPersistencePaths, voy: Voy, metadata: Map<string, unknown>): void {
    if (!fs.existsSync(paths.storageDir)) {
        fs.mkdirSync(paths.storageDir, { recursive: true });
    }

    fs.writeFileSync(paths.indexFile, voy.serialize(), "utf8");
    fs.writeFileSync(
        paths.metadataFile,
        JSON.stringify(
            {
                reviews: Object.fromEntries(metadata),
                updated_at: new Date().toISOString()
            },
            null,
            2
        ),
        "utf8"
    );
}
