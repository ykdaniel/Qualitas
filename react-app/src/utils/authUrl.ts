import { getAuthenticatedFileUrl } from '../services/api';

/**
 * Inject auth tokens into image src attributes within HTML content.
 * Matches src URLs that point to the authenticated file download endpoint
 * or legacy /uploads/ paths.
 */
export function injectAuthTokenIntoHtml(html: string): string {
    return html.replace(
        /(<img\s[^>]*src=["'])([^"']+)(["'])/gi,
        (_match, prefix, url, suffix) => {
            if (url.includes('/api/files/download/') || url.includes('/uploads/')) {
                return `${prefix}${getAuthenticatedFileUrl(url)}${suffix}`;
            }
            return _match;
        }
    );
}

/**
 * Strip auth token query parameters from URLs in HTML content.
 * Use before persisting HTML to the database to avoid storing
 * short-lived tokens in content.
 */
export function stripAuthTokenFromHtml(html: string): string {
    return html.replace(
        /(<img\s[^>]*src=["'])([^"']+)(["'])/gi,
        (_match, prefix, url, suffix) => {
            // Remove ?token=... or &token=... from the URL
            const cleaned = url
                .replace(/[?&]token=[^&"']*/g, '')
                .replace(/\?$/, '');  // clean trailing ? if token was the only param
            return `${prefix}${cleaned}${suffix}`;
        }
    );
}
