/**
 * How an agent made with Pokter says so, wherever it is hired.
 *
 * `built_with` is the field agents use to name the tool they were made
 * with, in their registration and in every delivery. Pokter Studio does not
 * host agents, so without a tag of its own an agent built here would show
 * only its builder's domain. The value carries the product and the link, so
 * it is unmistakable and leads somewhere.
 *
 * Written into the registration of agents created in Studio (not agents
 * imported from elsewhere), asked for in the AI build prompt, and carried
 * by the agents Pokter runs itself.
 */
/*
 * Published inside agents' registrations, so it stays byte for byte as it
 * shipped. The /studio address redirects to /build.
 */
export const BUILT_WITH_KEY = 'built_with';
export const BUILT_WITH_POKTER = 'Pokter Studio · https://pokter.xyz/studio';

export const builtWithPokter = { [BUILT_WITH_KEY]: BUILT_WITH_POKTER } as const;
