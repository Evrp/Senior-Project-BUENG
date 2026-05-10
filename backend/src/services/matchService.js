import { getModel } from './gemini.js';
import { Info } from '../model/info.js';
import { InfoMatch } from '../model/infomatch.js';
import { Like } from '../model/like.js';
import { Filter } from '../model/filter.js';
import { Friend } from '../model/Friend.js';
import { Gmail } from '../model/gmail.js';
import { EventEmitter } from 'events';

// Create a singleton emitter for internal matching events
export const internalMatchEmitter = new EventEmitter();

// Throttling: track last run time per user to avoid redundant heavy calculations
const lastMatchExecution = new Map();
const THROTTLE_MS = 10000; // 10 seconds

/**
 * Perform semantic matching between a user and other users based on their "About Me" descriptions.
 * Incorporates a Weighted Multi-signal Score with Mutual Friends and Recency.
 */
export const matchByProfile = async (app, userEmail, profileDescription) => {
  try {
    // 1. Throttle check
    const now = Date.now();
    const lastRun = lastMatchExecution.get(`profile:${userEmail}`) || 0;
    if (now - lastRun < THROTTLE_MS) return;
    lastMatchExecution.set(`profile:${userEmail}`, now);

    // Update active status for current user
    await Gmail.findOneAndUpdate({ email: userEmail }, { lastActiveAt: new Date() });

    if (!profileDescription || profileDescription.trim().length < 5) {
      return;
    }

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
      // Step 2-8: (Aggregation Pipeline logic as before...)
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
              35,
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
              25,
            ],
          },
          recencyScore: { $cond: [{ $lt: ['$daysSinceActive', 7] }, 10, 0] },
          activityScore: { $multiply: [{ $min: [{ $divide: ['$activityCount', 10] }, 1] }, 5] },
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
              { $min: [100, { $add: ['$signalBaseScore', 10] }] },
              '$signalBaseScore',
            ],
          },
        },
      },
      {
        $addFields: {
          skipPenalty: {
            $max: [
              0.1,
              {
                $subtract: [1, { $multiply: [{ $ifNull: ['$existingMatch.skipCount', 0] }, 0.15] }],
              },
            ],
          },
        },
      },
      { $addFields: { finalSignalScore: { $multiply: ['$signalBaseScore', '$skipPenalty'] } } },
      { $sort: { finalSignalScore: -1 } },
      { $limit: 20 },
      { $project: { email: 1, detail: '$userInfo.detail', finalSignalScore: 1 } },
    ]);

    if (otherUsersAggregated.length === 0) return;

    // 2. AI Semantic Matching
    const userListForAI = otherUsersAggregated.map((u) => ({ email: u.email, detail: u.detail }));
    const systemPrompt = `
Role: Senior BUENG AI Matchmaker (Aggregated Context)
Task: วิเคราะห์ความเข้ากันได้เชิงเป้าหมายจากโปรไฟล์นักศึกษา (Semantic Similarity)
Goal: ส่งคืนคะแนน 0-100 สำหรับความเหมือนของเนื้อหาโปรไฟล์

Output Format: JSON
{ 
  "matches": [
    { "email": "xxx@bumail.net", "aiScore": score, "reason": "ไทยสั้นๆ ที่เชื่อมโยงกับโปรไฟล์" }
  ] 
}`;

    const model = getModel('MATCHING', { systemInstruction: systemPrompt });

    const promptText = `User ปัจจุบัน: "${profileDescription}"\nผู้ใช้อื่นๆ (กรองตามสัญญาณความสนใจแล้ว): ${JSON.stringify(userListForAI)}`;
    
    console.log(`\n========== 🔍 [AI Match Data Log] ==========`);
    console.log(`[Input] User: ${userEmail}`);
    console.log(`[Input] Profile: "${profileDescription}"`);
    console.log(`[Input] Comparing with ${userListForAI.length} other users...`);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
    });

    const rawResponse = result.response.text();
    console.log(`[AI Raw Response]:\n`, rawResponse);
    
    let aiResponse = {};
    try {
      aiResponse = JSON.parse(rawResponse);
    } catch (e) {
      console.error(`[AI JSON Parse Error]:`, e.message);
    }
    
    const aiMatches = aiResponse.matches || [];

    // 3. Final Composite Score Calculation
    console.log(`\n[Score Breakdown]`);
    const finalMatches = aiMatches
      .map((match) => {
        const otherAggregated = otherUsersAggregated.find((u) => u.email === match.email);
        if (!otherAggregated) return null;
        
        const aiScore = match.aiScore || 0;
        const aiContribution = aiScore * 0.25;
        const signalContribution = otherAggregated.finalSignalScore * 0.75;
        const finalChance = Math.round(signalContribution + aiContribution);
        
        console.log(`- Match: ${match.email}`);
        console.log(`  > Base Signal Score: ${otherAggregated.finalSignalScore.toFixed(2)} (* 0.75 = ${signalContribution.toFixed(2)})`);
        console.log(`  > AI Similarity Score: ${aiScore} (* 0.25 = ${aiContribution.toFixed(2)})`);
        console.log(`  > Final Composite Score: ${finalChance}%`);
        console.log(`  > Reason: ${match.reason}`);

        return { email: match.email, chance: finalChance, reason: match.reason };
      })
      .filter((m) => m && m.chance > 30);
      
    console.log(`=============================================\n`);

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
 * Refactored from eventmatch.js for better performance and decoupling.
 */
export const matchByLikedEvent = async (app, userEmail, eventId, eventTitle) => {
  try {
    // 1. Throttle check
    const now = Date.now();
    const lastRun = lastMatchExecution.get(`event:${userEmail}:${eventId}`) || 0;
    if (now - lastRun < THROTTLE_MS) return;
    lastMatchExecution.set(`event:${userEmail}:${eventId}`, now);

    console.info(`[Match Service] Matching for ${userEmail} on event ${eventTitle || eventId}...`);

    // 2. Find likes from other users that match the specific eventId passed here for immediate feedback
    const otherUserLikes = await Like.find({
      userEmail: { $ne: userEmail },
      eventId: eventId,
    }).lean();

    if (!otherUserLikes || otherUserLikes.length === 0) return;

    // 3. Pre-fetch filters for overlapping interest calculation
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
      const sharedLikeCount = sharedLikes.length;

      // Interest similarity (Jaccard)
      const otherSubGenres = filterMap[targetEmail] || new Set();
      const intersection = new Set([...mySubGenres].filter((x) => otherSubGenres.has(x)));
      const union = new Set([...mySubGenres, ...otherSubGenres]);

      let jaccardChance = 30;
      if (union.size > 0) {
        jaccardChance = Math.round((intersection.size / union.size) * 100);
      }

      const likeBasedChance = Math.min(95, 30 + sharedLikeCount * 13);
      const finalChance = Math.round(likeBasedChance * 0.7 + jaccardChance * 0.3);

      bulkOps.push({
        updateOne: {
          filter: {
            email: users[0],
            usermatch: users[1],
            status: { $ne: 'matched' }, // Don't overwrite established matches
          },
          update: {
            $set: {
              eventId: eventId,
              detail: eventTitle || 'Shared Event Interest',
              chance: finalChance,
              status: 'pending',
              initiatorEmail: userEmail,
              lastMatchedAt: new Date(),
              university: university,
            },
          },
          upsert: true,
        },
      });

      matchData.push({ targetEmail, title: eventTitle });
    }

    if (bulkOps.length > 0) {
      const result = await InfoMatch.bulkWrite(bulkOps);

      // 5. Notifications
      const io = app.get('io');
      const userSockets = app.get('userSockets') || {};
      if (io && result.upsertedCount > 0) {
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
      }
    }
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
