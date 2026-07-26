import "server-only";

import { createHealthRoute } from "@/server/health/health-route";

export const GET = createHealthRoute();
