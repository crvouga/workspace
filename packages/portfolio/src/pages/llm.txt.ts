import { infraGuideResponse } from '../lib/infra-guide';

// Keep the singular spelling requested by consumers while also serving the
// conventional /llms.txt path from the same generated source.
export const GET = (): Response => infraGuideResponse();
