import { useEffect } from "react";
import { useLocation } from "@infinite-canvas/lib/next-router";

import { trackPageview } from "@infinite-canvas/lib/analytics";

// Observe SPA route changes and report page views; trackPageview is a no-op when analytics is not configured.
export function AnalyticsTracker() {
    const location = useLocation();

    useEffect(() => {
        trackPageview(`${location.pathname}${location.search}`);
    }, [location.pathname, location.search]);

    return null;
}
