import { jest } from '@jest/globals';

// Mock dependencies before importing the service
jest.unstable_mockModule('../model/info.js', () => ({
  Info: {
    aggregate: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.unstable_mockModule('../model/infomatch.js', () => ({
  InfoMatch: {
    bulkWrite: jest.fn(),
    find: jest.fn(),
  },
}));

jest.unstable_mockModule('../model/like.js', () => ({
  Like: {
    find: jest.fn(),
  },
}));

jest.unstable_mockModule('../model/filter.js', () => ({
  Filter: {
    findOne: jest.fn(),
    find: jest.fn(),
  },
}));

jest.unstable_mockModule('../model/Friend.js', () => ({
  Friend: {
    findOne: jest.fn(),
  },
}));

jest.unstable_mockModule('../model/gmail.js', () => ({
  Gmail: {
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  },
}));

jest.unstable_mockModule('./gemini.js', () => ({
  getModel: jest.fn(),
}));

// Import the mocked dependencies and the service
const { Info } = await import('../model/info.js');
const { InfoMatch } = await import('../model/infomatch.js');
const { Like } = await import('../model/like.js');
const { Filter } = await import('../model/filter.js');
const { Friend } = await import('../model/Friend.js');
const { Gmail } = await import('../model/gmail.js');
const { getModel } = await import('./gemini.js');
const { matchByProfile, matchByLikedEvent, triggerInactiveUserMatch } = await import('./matchService.js');

describe('matchService', () => {
  let mockApp;
  let mockIo;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Mock Express app and Socket.io
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    mockApp = {
      get: jest.fn((key) => {
        if (key === 'io') return mockIo;
        if (key === 'userSockets') return { 'test@bu.ac.th': 'socket_123' };
        return null;
      }),
    };
  });

  describe('triggerInactiveUserMatch', () => {
    it('should trigger match if user is inactive for 7 or more days', async () => {
      const userEmail = 'test@bu.ac.th';
      const lastActiveAt = new Date();
      lastActiveAt.setDate(lastActiveAt.getDate() - 8); // 8 days ago

      Gmail.findOne.mockResolvedValue({ email: userEmail, lastActiveAt });
      Info.findOne.mockResolvedValue({ email: userEmail, userInfo: { detail: 'My bio' } });
      Gmail.updateOne.mockResolvedValue({});
      
      // Since matchByProfile is in the same module, it's harder to mock directly if it's called internally.
      // But we can check if it tries to do the logic. Wait, matchByProfile is exported.
      // The easiest check is to see if Info.aggregate is called, which happens inside matchByProfile.
      Info.aggregate.mockResolvedValue([]);

      await triggerInactiveUserMatch(mockApp, userEmail);

      expect(Gmail.findOne).toHaveBeenCalledWith({ email: userEmail });
      expect(Info.findOne).toHaveBeenCalledWith({ email: userEmail });
      // Updates last active
      expect(Gmail.updateOne).toHaveBeenCalledWith({ email: userEmail }, expect.any(Object));
      // Triggers matchByProfile, which updates lastActiveAt again and calls find methods
      expect(Gmail.findOneAndUpdate).toHaveBeenCalledWith({ email: userEmail }, expect.any(Object));
    });

    it('should not trigger match if user is inactive for less than 7 days', async () => {
      const userEmail = 'test@bu.ac.th';
      const lastActiveAt = new Date();
      lastActiveAt.setDate(lastActiveAt.getDate() - 3); // 3 days ago

      Gmail.findOne.mockResolvedValue({ email: userEmail, lastActiveAt });
      Gmail.updateOne.mockResolvedValue({});

      await triggerInactiveUserMatch(mockApp, userEmail);

      expect(Info.findOne).not.toHaveBeenCalled();
      expect(Gmail.updateOne).toHaveBeenCalledWith({ email: userEmail }, expect.any(Object));
    });

    it('should do nothing if account is not found', async () => {
      Gmail.findOne.mockResolvedValue(null);

      await triggerInactiveUserMatch(mockApp, 'notfound@bu.ac.th');

      expect(Gmail.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('matchByProfile', () => {
    const userEmail = 'user@bu.ac.th';
    const profileDescription = 'I love coding and music';

    it('should return early if profile description is too short', async () => {
      await matchByProfile(mockApp, userEmail, 'hi');
      
      expect(Gmail.findOneAndUpdate).toHaveBeenCalled();
      expect(Info.aggregate).not.toHaveBeenCalled();
    });

    it('should process match successfully when other users are found', async () => {
      // Mock pre-requisites
      Like.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
      Filter.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
      Friend.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
      
      // Mock other users aggregation
      Info.aggregate.mockResolvedValue([
        { email: 'other@bu.ac.th', detail: 'Coding enthusiast', finalSignalScore: 80 }
      ]);

      // Mock Gemini AI response
      const mockGenerateContent = jest.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            matches: [
              { email: 'other@bu.ac.th', aiScore: 90, reason: 'Both love coding' }
            ]
          })
        }
      });
      getModel.mockReturnValue({ generateContent: mockGenerateContent });

      // Mock bulkwrite
      InfoMatch.bulkWrite.mockResolvedValue({});

      // Run match
      await matchByProfile(mockApp, userEmail, profileDescription);

      expect(Info.aggregate).toHaveBeenCalled();
      expect(getModel).toHaveBeenCalledWith('MATCHING', expect.any(Object));
      expect(mockGenerateContent).toHaveBeenCalled();
      
      // Check if bulkWrite was called with correct data
      expect(InfoMatch.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: expect.objectContaining({ status: { $ne: 'matched' } })
            })
          })
        ])
      );

      // Check notifications
      expect(mockIo.emit).toHaveBeenCalledWith('match_updated');
    });

    it('should handle AI model failure gracefully', async () => {
      Like.find.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
      Filter.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
      Friend.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
      
      Info.aggregate.mockResolvedValue([{ email: 'other@bu.ac.th', detail: 'test', finalSignalScore: 50 }]);
      
      // Model throws an error
      getModel.mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(new Error('AI failed'))
      });

      // Should not throw, should handle internally
      await expect(matchByProfile(mockApp, userEmail, profileDescription)).resolves.not.toThrow();
      
      // Should not call bulkWrite since it failed before that
      expect(InfoMatch.bulkWrite).not.toHaveBeenCalled();
    });
  });

  describe('matchByLikedEvent', () => {
    const userEmail = 'user@bu.ac.th';
    const eventId = 'event_123';
    const eventTitle = 'Tech Meetup';

    it('should return early if no other users liked the event', async () => {
      Like.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      await matchByLikedEvent(mockApp, userEmail, eventId, eventTitle);

      expect(Filter.findOne).not.toHaveBeenCalled();
    });

    it('should create matches based on shared likes and filters', async () => {
      // Mock other users who liked the event
      Like.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
        { userEmail: 'other1@bu.ac.th', eventId }
      ]) });

      // Mock filters
      Filter.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({
        subGenres: { music: ['rock'] }
      }) });
      Filter.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
        { email: 'other1@bu.ac.th', subGenres: { music: ['rock', 'pop'] } }
      ]) });

      // Mock existing matches (none)
      InfoMatch.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      // Mock bulkWrite
      InfoMatch.bulkWrite.mockResolvedValue({ upsertedCount: 1 });

      await matchByLikedEvent(mockApp, userEmail, eventId, eventTitle);

      expect(Filter.findOne).toHaveBeenCalled();
      expect(Filter.find).toHaveBeenCalled();
      
      // Check if bulkWrite generated the right updates
      expect(InfoMatch.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            updateOne: expect.objectContaining({
              filter: expect.objectContaining({ email: 'other1@bu.ac.th', usermatch: 'user@bu.ac.th' }),
              update: expect.objectContaining({
                $set: expect.objectContaining({
                  eventId: eventId,
                  status: 'pending'
                })
              })
            })
          })
        ])
      );

      // Check socket events
      expect(mockIo.emit).toHaveBeenCalledWith('match_updated');
    });

    it('should ignore already matched partners', async () => {
      Like.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
        { userEmail: 'already.matched@bu.ac.th', eventId }
      ]) });

      Filter.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
      Filter.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });

      // Mock existing matched partner
      InfoMatch.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([
        { email: userEmail, usermatch: 'already.matched@bu.ac.th', status: 'matched' }
      ]) });

      await matchByLikedEvent(mockApp, userEmail, eventId, eventTitle);

      // bulkWrite should not be called since there are no valid targets
      expect(InfoMatch.bulkWrite).not.toHaveBeenCalled();
    });
  });
});
