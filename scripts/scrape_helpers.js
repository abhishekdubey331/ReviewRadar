export function normalizeReviewDate(review) {
    const raw = review?.date ?? review?.updated ?? review?.updatedAt ?? review?.created ?? review?.createdAt;
    const parsed = raw ? new Date(raw) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function detectStoreProvider(appLink) {
    if (appLink.includes('play.google.com')) return 'play_store';
    if (appLink.includes('apps.apple.com')) return 'app_store';
    throw new Error("Unsupported APP_LINK format. Must contain 'play.google.com' or 'apps.apple.com'.");
}

export function extractStoreAppId(appLink, provider) {
    if (provider === 'play_store') {
        const parsedUrl = new URL(appLink);
        const appId = parsedUrl.searchParams.get('id');
        if (!appId) throw new Error("Could not extract 'id' from Play Store URL.");
        return appId;
    }

    const match = appLink.match(/\/id(\d+)/);
    if (!match || !match[1]) throw new Error('Could not extract numeric ID from App Store URL.');
    return match[1];
}

export function mapScrapedReview(review) {
    return {
        id: review.id,
        userName: review.userName,
        text: review.text,
        score: review.score,
        version: review.version,
        date: review.date ?? review.updated ?? review.updatedAt ?? review.createdAt
    };
}

export function toCsvRows(reviewsData, platformName) {
    const csvRows = ['review_id,platform,user_name,content,score,app_version,device,os_version,review_created_at'];

    for (const review of reviewsData) {
        const user_name = `"${(review.userName || 'Anonymous').replace(/"/g, '""')}"`;
        const content = `"${(review.text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
        const version = review.version || 'Unknown';
        const createdAt = normalizeReviewDate(review);
        csvRows.push(`${review.id},${platformName},${user_name},${content},${review.score},${version},Unknown,Unknown,${createdAt}`);
    }

    return csvRows;
}
