/**
 * Configuration for Matchmaking Scoring Algorithm
 */

export const MATCH_CONFIG = {
  // Weights for base signal scoring (Total should ideally align with 100 base)
  WEIGHTS: {
    EVENT: 35,
    GENRE: 25,
    RECENCY: 10,
    ACTIVITY: 5,
    MUTUAL_FRIEND_BONUS: 10,
    MAX_BASE_SCORE: 100,
  },

  // Final Composite Score Weights (AI vs Behavioral Signal)
  COMPOSITE_WEIGHTS: {
    AI: 0.25,
    SIGNAL: 0.75,
  },

  // Thresholds
  THRESHOLDS: {
    PROFILE_MATCH: 20, // Minimum chance to be considered a match
    MIN_DESCRIPTION_LENGTH: 5,
    RECENCY_DAYS: 7,
    ACTIVITY_DIVISOR: 10, // Used to normalize activity count
  },

  // Penalty logic
  PENALTIES: {
    SKIP_STEP: 0.15,
    MIN_PENALTY: 0.1,
  },

  // Event-based matching specific constants
  EVENT_MATCH: {
    BASE_CHANCE: 30,
    WEIGHT_PER_LIKE: 13,
    MAX_LIKE_CHANCE: 95,
    SIGNAL_WEIGHT: 0.7,
    JACCARD_WEIGHT: 0.3,
  },

  // Limits
  LIMITS: {
    CANDIDATES_COUNT: 20,
  },

  // Throttling
  THROTTLE_MS: 10000,
};
