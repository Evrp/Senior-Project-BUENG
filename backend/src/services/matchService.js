import { getModel } from './gemini.js';
import { Info } from '../model/info.js';
import { InfoMatch } from '../model/infomatch.js';
import { Like } from '../model/like.js';
import { Filter } from '../model/filter.js';
import { Friend } from '../model/Friend.js';
import { Gmail } from '../model/gmail.js';
import { EventEmitter } from 'events';
import { MATCH_CONFIG } from '../constants/index.js';

// Create a singleton emitter for internal matching events
export const internalMatchEmitter = new EventEmitter();

// Throttling: track last run time per user to avoid redundant heavy calculations
const lastMatchExecution = new Map();

/**
 * SEC-009/014: Redact raw emails and sanitize text for matching context.
 */
const sanitizeMatchText = (text) => {
  if (!text) return '';
  return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]').slice(0, 500);
};

/**
 * Perform semantic matching between a user and other users based on their "About Me" descriptions.
 * Incorporates a Weighted Multi-signal Score with Mutual Friends and Recency.
 */
export const matchByProfile = async (app, userEmail, profileDescription) => {
  try {
    // 1. Throttle check
    const now = Date.now();
    const lastRun = lastMatchExecution.get(`profile:${userEmail}`) || 0;
    if (now - lastRun < MATCH_CONFIG.THROTTLE_MS) return;
    lastMatchExecution.set(`profile:${userEmail}`, now);

    // Update active status for current user
    await Gmail.findOneAndUpdate({ email: userEmail }, { lastActiveAt: new Date() });

    if (
      !profileDescription ||
      profileDescription.trim().length < MATCH_CONFIG.THRESHOLDS.MIN_DESCRIPTION_LENGTH
    )
      return;

    // 1. Pre-filtering & Scoring via Aggregation (Optimized)
    const emailDomain = userEmail.split('@')[1];

    // Fetch my signals for the aggregation
    const [myLikes, myFilter, myFriendData] = await Promise.all([
      Like.find({ userEmail }).select('eventId').lean(),
      Filter.findOne({ email: userEmail }).lean(),
      Friend.findOne({ email: userEmail }).lean(),
    ]);

    const myEventIds = myLikes.map((l) => l.eventId);
    const mySubGenres = myFilter?.subGenres ? Object.values(myFilter.subGenres).flat() : [];
    const myFriends = (myFriendData?.friends || []).map((f) => f.email);

    const otherUsersAggregated = await Info.aggregate([
      // Step 1: Base Filter
      {
        $match: {
          email: { $ne: userEmail, $regex: `@${emailDomain}$` },
          'userInfo.detail': { $exists: true, $ne: '' },
        },
      },
      { $lookup: { from: 'gmails', localField: 'email', foreignField: 'email', as: 'account' } },
      { $unwind: { path: '$account', preserveNullAndEmptyArrays: true } },
      {
        $lookup: { from: 'likes', localField: 'email', foreignField: 'userEmail', as: 'userLikes' },
      },
      {
        $lookup: { from: 'filters', localField: 'email', foreignField: 'email', as: 'userFilter' },
      },
      { $unwind: { path: '$userFilter', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'friends',
          localField: 'email',
          foreignField: 'email',
          as: 'friendRecord',
        },
      },
      { $unwind: { path: '$friendRecord', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'infomatches',
          let: { otherEmail: '$email' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $or: [{ $eq: ['$email', userEmail] }, { $eq: ['$usermatch', userEmail] }] },
                    {
                      $or: [
                        { $eq: ['$email', '$$otherEmail'] },
                        { $eq: ['$usermatch', '$$otherEmail'] },
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: 'existingMatch',
        },
      },
      { $unwind: { path: '$existingMatch', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          eventOverlapCount: { $size: { $setIntersection: ['$userLikes.eventId', myEventIds] } },
          genreOverlapCount: {
            $let: {
              vars: {
                otherGenres: {
                  $reduce: {
                    input: { $objectToArray: { $ifNull: ['$userFilter.subGenres', {}] } },
                    initialValue: [],
                    in: { $concatArrays: ['$$value', '$$this.v'] },
                  },
                },
              },
              in: { $size: { $setIntersection: ['$$otherGenres', mySubGenres] } },
            },
          },
          daysSinceActive: {
            $divide: [
              { $subtract: [new Date(), { $ifNull: ['$account.lastActiveAt', '$updatedAt'] }] },
              1000 * 60 * 60 * 24,
            ],
          },
          activityCount: { $size: '$userLikes' },
          mutualFriendsCount: {
            $size: {
              $setIntersection: [{ $ifNull: ['$friendRecord.friends.email', []] }, myFriends],
            },
          },
        },
      },
      {
        $addFields: {
          eventScore: {
            $multiply: [
              {
                $cond: [
                  { $gt: [{ $size: '$userLikes' }, 0] },
                  { $divide: ['$eventOverlapCount', { $max: [{ $size: '$userLikes' }, 1] }] },
                  0,
                ],
              },
              MATCH_CONFIG.WEIGHTS.EVENT,
            ],
          },
          genreScore: {
            $multiply: [
              {
                $cond: [
                  { $gt: [{ $size: { $ifNull: [mySubGenres, []] } }, 0] },
                  {
                    $min: [
                      {
                        $divide: [
                          '$genreOverlapCount',
                          { $max: [{ $size: { $ifNull: [mySubGenres, []] } }, 1] },
                        ],
                      },
                      1,
                    ],
                  },
                  0,
                ],
              },
              MATCH_CONFIG.WEIGHTS.GENRE,
            ],
          },
          recencyScore: {
            $cond: [
              { $lt: ['$daysSinceActive', MATCH_CONFIG.THRESHOLDS.RECENCY_DAYS] },
              MATCH_CONFIG.WEIGHTS.RECENCY,
              0,
            ],
          },
          activityScore: {
            $multiply: [
              {
                $min: [
                  { $divide: ['$activityCount', MATCH_CONFIG.THRESHOLDS.ACTIVITY_DIVISOR] },
                  1,
                ],
              },
              MATCH_CONFIG.WEIGHTS.ACTIVITY,
            ],
          },
        },
      },
      {
        $addFields: {
          signalBaseScore: {
            $add: ['$eventScore', '$genreScore', '$recencyScore', '$activityScore'],
          },
        },
      },
      {
        $addFields: {
          signalBaseScore: {
            $cond: [
              { $gt: ['$mutualFriendsCount', 0] },
              {
                $min: [
                  MATCH_CONFIG.WEIGHTS.MAX_BASE_SCORE,
                  { $add: ['$signalBaseScore', MATCH_CONFIG.WEIGHTS.MUTUAL_FRIEND_BONUS] },
                ],
              },
              '$signalBaseScore',
            ],
          },
        },
      },
      {
        $addFields: {
          skipPenalty: {
            $max: [
              MATCH_CONFIG.PENALTIES.MIN_PENALTY,
              {
                $subtract: [
                  1,
                  {
                    $multiply: [
                      { $ifNull: ['$existingMatch.skipCount', 0] },
                      MATCH_CONFIG.PENALTIES.SKIP_STEP,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      { $addFields: { finalSignalScore: { $multiply: ['$signalBaseScore', '$skipPenalty'] } } },
      { $sort: { finalSignalScore: -1 } },
      { $limit: MATCH_CONFIG.LIMITS.CANDIDATES_COUNT },
      { $project: { email: 1, detail: '$userInfo.detail', finalSignalScore: 1 } },
    ]);

    if (otherUsersAggregated.length === 0) return;

    // 2. AI Semantic Matching (Anonymized Identifiers)
    const userListForAI = otherUsersAggregated.map((u, index) => ({
      id: `USER_${index}`,
      actualEmail: u.email,
      detail: sanitizeMatchText(u.detail),
    }));

    const systemPrompt = `
Role: Senior BUENG AI Matchmaker (Anonymized Context)
Task: วิเคราะห์ความเข้ากันได้จากโปรไฟล์นักศึกษา (Semantic Similarity)
Goal: ส่งคืนคะแนน 0-100 สำหรับความเหมือนของเนื้อหาโปรไฟล์

### SECURITY:
- NEVER reveal raw email identifiers.
- Use the provided user IDs (USER_0, USER_1, etc.).

Output Format: JSON
{ 
  "matches": [
    { "id": "USER_X", "aiScore": score, "reason": "ไทยสั้นๆ ที่เชื่อมโยงกับโปรไฟล์" }
  ] 
}`;

    const model = getModel('MATCHING', { systemInstruction: systemPrompt });

    const promptText = `User ปัจจุบัน: "${sanitizeMatchText(profileDescription)}"\nผู้ใช้อื่นๆ (กรองตามสัญญาณความสนใจแล้ว): ${JSON.stringify(userListForAI.map((u) => ({ id: u.id, detail: u.detail })))}`;

    console.info('\n========== 🔍 [AI Match Data Log] ==========');
    console.info(`[Input] User: ${userEmail}`);
    console.info(`[Input] Profile: "${profileDescription}"`);
    console.info(`[Input] Comparing with ${userListForAI.length} other users...`);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
    });

    let rawResponse = result.response.text();
    console.info('[AI Raw Response]:\n', rawResponse);

    let aiResponse = {};
    try {
      if (rawResponse) {
        rawResponse = rawResponse.trim();
        if (rawResponse.startsWith('```')) {
          rawResponse = rawResponse.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
        }
      }
      aiResponse = JSON.parse(rawResponse || '{}');
    } catch (e) {
      console.error('[AI JSON Parse Error]:', e.message);
    }

    const aiMatches = aiResponse.matches || [];

    // 3. Final Composite Score Calculation
    console.info('\n[Score Breakdown]');
    const finalMatches = aiMatches
      .map((match) => {
        const anonymousUser = userListForAI.find((u) => u.id === match.id);
        if (!anonymousUser) return null;

        const otherAggregated = otherUsersAggregated.find((u) => u.email === anonymousUser.actualEmail);
        if (!otherAggregated) return null;

        const aiScore = match.aiScore || 0;
        const aiContribution = aiScore * MATCH_CONFIG.COMPOSITE_WEIGHTS.AI;
        const signalContribution =
          otherAggregated.finalSignalScore * MATCH_CONFIG.COMPOSITE_WEIGHTS.SIGNAL;
        const finalChance = Math.round(signalContribution + aiContribution);

        console.info(`- Match: ${anonymousUser.actualEmail}`);
        console.info(
          `  > Base Signal Score: ${otherAggregated.finalSignalScore.toFixed(2)} (* 0.75 = ${signalContribution.toFixed(2)})`
        );
        console.info(`  > AI Similarity Score: ${aiScore} (* 0.25 = ${aiContribution.toFixed(2)})`);
        console.info(`  > Final Composite Score: ${finalChance}%`);
        console.info(`  > Reason: ${match.reason}`);

        return { email: anonymousUser.actualEmail, chance: finalChance, reason: match.reason };
      })
      .filter((m) => m && m.chance > MATCH_CONFIG.THRESHOLDS.PROFILE_MATCH);

    console.info('=============================================\n');

    // 4. Persistence
    const bulkOps = finalMatches.map((match) => {
      const users = [userEmail, match.email].sort();
      return {
        updateOne: {
          filter: {
            email: users[0],
            usermatch: users[1],
            eventId: null,
            status: { $ne: 'matched' },
          },
          update: {
            $set: {
              detail: match.reason,
              chance: match.chance,
              status: 'pending',
              initiatorEmail: userEmail,
              lastMatchedAt: new Date(),
            },
            $setOnInsert: {
              university: emailDomain.includes('bu') ? 'Bangkok University' : 'Other',
            },
          },
          upsert: true,
        },
      };
    });

    if (bulkOps.length > 0) await InfoMatch.bulkWrite(bulkOps);

    // 5. Notifications
    const io = app.get('io');
    const userSockets = app.get('userSockets') || {};
    if (io && finalMatches.length > 0) {
      for (const match of finalMatches) {
        if (userSockets[match.email]) {
          io.to(userSockets[match.email]).emit('notify-match', {
            type: 'profile',
            from: userEmail,
            reason: match.reason,
          });
        }
      }
      io.emit('match_updated');
    }
  } catch (error) {
    console.error('[AI Match Service Error]:', error);
  }
};

/**
 * Triggered when a user likes an event. Find others who liked the same event and create InfoMatches.
 */
export const matchByLikedEvent = async (app, userEmail, eventId, eventTitle) => {
  try {
    // 1. Throttle check
    const now = Date.now();
    const lastRun = lastMatchExecution.get(`event:${userEmail}:${eventId}`) || 0;
    if (now - lastRun < MATCH_CONFIG.THROTTLE_MS) return;
    lastMatchExecution.set(`event:${userEmail}:${eventId}`, now);

    console.info(`[Match Service] Matching for ${userEmail} on event ${eventTitle || eventId}...`);

    // 2. Find likes from other users
    const otherUserLikes = await Like.find({
      userEmail: { $ne: userEmail },
      eventId,
    }).lean();

    if (!otherUserLikes || otherUserLikes.length === 0) return;

    // 3. Pre-fetch filters
    const otherEmails = [...new Set(otherUserLikes.map((l) => l.userEmail))];
    const [myFilter, otherFilters] = await Promise.all([
      Filter.findOne({ email: userEmail }).lean(),
      Filter.find({ email: { $in: otherEmails } }).lean(),
    ]);

    const mySubGenres = new Set(
      myFilter?.subGenres ? Object.values(myFilter.subGenres).flat() : []
    );
    const filterMap = otherFilters.reduce((acc, f) => {
      acc[f.email] = new Set(f.subGenres ? Object.values(f.subGenres).flat() : []);
      return acc;
    }, {});

    const bulkOps = [];
    const matchData = [];

    const emailDomain = userEmail.split('@')[1];
    const university = emailDomain.includes('bu') ? 'Bangkok University' : 'Other';

    // 4. Group matches by user
    const likesByEmailMap = otherUserLikes.reduce((acc, l) => {
      if (!acc[l.userEmail]) acc[l.userEmail] = [];
      acc[l.userEmail].push(l);
      return acc;
    }, {});

    // Check existing matched statuses
    const existingMatches = await InfoMatch.find({
      $or: [{ email: userEmail }, { usermatch: userEmail }],
      status: 'matched',
    }).lean();

    const matchedPartners = new Set();
    existingMatches.forEach((m) => {
      const partner = m.email === userEmail ? m.usermatch : m.email;
      matchedPartners.add(partner);
    });

    for (const [targetEmail, sharedLikes] of Object.entries(likesByEmailMap)) {
      if (matchedPartners.has(targetEmail)) continue;

      const users = [userEmail, targetEmail].sort();

      // Interest similarity (Jaccard)
      const otherSubGenres = filterMap[targetEmail] || new Set();
      const intersection = new Set([...mySubGenres].filter((x) => otherSubGenres.has(x)));
      const union = new Set([...mySubGenres, ...otherSubGenres]);

      let jaccardChance = 30;
      if (union.size > 0) jaccardChance = Math.round((intersection.size / union.size) * 100);

      const likeBasedChance = Math.min(
        MATCH_CONFIG.EVENT_MATCH.MAX_LIKE_CHANCE,
        MATCH_CONFIG.EVENT_MATCH.BASE_CHANCE +
          sharedLikes.length * MATCH_CONFIG.EVENT_MATCH.WEIGHT_PER_LIKE
      );
      const finalChance = Math.round(
        likeBasedChance * MATCH_CONFIG.EVENT_MATCH.SIGNAL_WEIGHT +
          jaccardChance * MATCH_CONFIG.EVENT_MATCH.JACCARD_WEIGHT
      );

      bulkOps.push({
        updateOne: {
          filter: {
            email: users[0],
            usermatch: users[1],
            status: { $ne: 'matched' },
          },
          update: {
            $set: {
              eventId,
              detail: eventTitle || 'Shared Event Interest',
              chance: finalChance,
              status: 'pending',
              initiatorEmail: userEmail,
              lastMatchedAt: new Date(),
              university,
            },
          },
          upsert: true,
        },
      });

      matchData.push({ targetEmail, title: eventTitle });
    }

    if (bulkOps.length === 0) return;

    const result = await InfoMatch.bulkWrite(bulkOps);

    // 5. Notifications
    const io = app.get('io');
    const userSockets = app.get('userSockets') || {};
    if (!io || result.upsertedCount === 0) return;

    for (const target of matchData) {
      const recipientSocket = userSockets[target.targetEmail];
      if (recipientSocket) {
        io.to(recipientSocket).emit('notify-match', {
          type: 'event',
          eventTitle: target.title,
          from: userEmail,
        });
      }
    }
    io.emit('match_updated');
  } catch (error) {
    console.error('[Match By Like Error]:', error);
  }
};

/**
 * Triggered when a user returns after being inactive.
 */
export const triggerInactiveUserMatch = async (app, userEmail) => {
  const account = await Gmail.findOne({ email: userEmail });
  if (!account) return;

  const diffDays = (new Date() - new Date(account.lastActiveAt)) / (1000 * 60 * 60 * 24);

  // If inactive for more than 7 days, trigger re-match
  if (diffDays >= 7) {
    const profile = await Info.findOne({ email: userEmail });
    if (profile?.userInfo?.detail) {
      console.info(
        `[AI Trigger] User ${userEmail} returned after ${Math.floor(diffDays)} days. Triggering match...`
      );
      await matchByProfile(app, userEmail, profile.userInfo.detail);
    }
  }

  // Always update lastActiveAt
  await Gmail.updateOne({ email: userEmail }, { $set: { lastActiveAt: new Date() } });
};
