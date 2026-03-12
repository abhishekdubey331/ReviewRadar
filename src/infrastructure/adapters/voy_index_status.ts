import fs from "fs";
import { IndexStatus } from "../../domain/ports/vector_store.js";

export function clearVoyArtifacts(indexFile: string, metadataFile: string, clearIndex: () => void) {
    clearIndex();
    if (fs.existsSync(indexFile)) {
        fs.unlinkSync(indexFile);
    }
    if (fs.existsSync(metadataFile)) {
        fs.unlinkSync(metadataFile);
    }
}

export function buildVoyIndexStatus(
    metadata: Map<string, Record<string, unknown>>,
    indexFile: string,
    metadataFile: string
): IndexStatus {
    const total = metadata.size;
    let withScore = 0;
    let withDate = 0;

    metadata.forEach((meta) => {
        if (meta.score !== undefined) withScore++;
        if (meta.date || meta.review_created_at) withDate++;
    });

    return {
        total_indexed: total,
        metadata_health: {
            has_score: total > 0 ? (withScore / total) : 0,
            has_date: total > 0 ? (withDate / total) : 0,
            score_count: withScore,
            date_count: withDate
        },
        is_ready: total > 0 && withScore > 0,
        storage_paths: {
            index: indexFile,
            metadata: metadataFile
        }
    };
}
