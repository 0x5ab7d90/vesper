/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as comet from "../comet.js";
import type * as crons from "../crons.js";
import type * as devSeed from "../devSeed.js";
import type * as fanart from "../fanart.js";
import type * as feedback from "../feedback.js";
import type * as friendships from "../friendships.js";
import type * as http from "../http.js";
import type * as imdb from "../imdb.js";
import type * as imdbImport from "../imdbImport.js";
import type * as lists from "../lists.js";
import type * as omdb from "../omdb.js";
import type * as playback from "../playback.js";
import type * as presence from "../presence.js";
import type * as presenceMonitor from "../presenceMonitor.js";
import type * as profiles from "../profiles.js";
import type * as ratings from "../ratings.js";
import type * as search from "../search.js";
import type * as seriesgraph from "../seriesgraph.js";
import type * as stats from "../stats.js";
import type * as statsCompute from "../statsCompute.js";
import type * as tasteMatch from "../tasteMatch.js";
import type * as tmdb from "../tmdb.js";
import type * as trakt from "../trakt.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  comet: typeof comet;
  crons: typeof crons;
  devSeed: typeof devSeed;
  fanart: typeof fanart;
  feedback: typeof feedback;
  friendships: typeof friendships;
  http: typeof http;
  imdb: typeof imdb;
  imdbImport: typeof imdbImport;
  lists: typeof lists;
  omdb: typeof omdb;
  playback: typeof playback;
  presence: typeof presence;
  presenceMonitor: typeof presenceMonitor;
  profiles: typeof profiles;
  ratings: typeof ratings;
  search: typeof search;
  seriesgraph: typeof seriesgraph;
  stats: typeof stats;
  statsCompute: typeof statsCompute;
  tasteMatch: typeof tasteMatch;
  tmdb: typeof tmdb;
  trakt: typeof trakt;
  uploads: typeof uploads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
