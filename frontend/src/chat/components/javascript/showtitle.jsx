import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllEvents, fetchUsers } from '../../../lib/queries';
import PropTypes from 'prop-types'; // Import PropTypes
import api from '../../../server/api';
import { MdAutoAwesome, MdPeople } from 'react-icons/md';
import '../css/showtitle.css';
import UserAvatar from '../../../components/UserAvatar';
import { toast } from 'react-toastify';

const ShowTitle = ({ userimage, openchat, isFullHeight }) => {
  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ['allEvents'],
    queryFn: fetchAllEvents,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const { data: allInfos = [] } = useQuery({
    queryKey: ['allInfos'],
    queryFn: async () => {
      const { data } = await api.get('/api/infos');
      return data;
    },
  });

  const partnerInfo = useMemo(() => {
    if (!userimage || !allInfos.length) return null;
    const userEmail = localStorage.getItem('userEmail');
    const partnerEmail = userimage.email === userEmail ? userimage.usermatch : userimage.email;
    return allInfos.find((info) => info.email?.toLowerCase() === partnerEmail?.toLowerCase());
  }, [allInfos, userimage]);

  const partnerUser = useMemo(() => {
    if (!userimage || !users.length) return null;
    const userEmail = localStorage.getItem('userEmail');
    const partnerEmail = userimage.email === userEmail ? userimage.usermatch : userimage.email;
    return users.find((u) => u.email?.toLowerCase() === partnerEmail?.toLowerCase());
  }, [users, userimage]);

  const matchedEvent = useMemo(() => {
    if (!userimage || !allEvents) return null;

    // 1. Try matching by ID directly (Community/Event object)
    let event = allEvents.find((event) => event._id === userimage._id);
    if (event) return event;

    // 2. Try matching by eventId (Match object from InfoMatch)
    if (userimage.eventId) {
      const targetId =
        typeof userimage.eventId === 'object' ? userimage.eventId._id : userimage.eventId;
      event = allEvents.find((event) => event._id === targetId);
      if (event) return event;
    }

    // 3. Robust Fallback: If it's a Match object (has detail), construct a fallback event object
    if (userimage.detail) {
      return {
        _id: userimage.eventId || userimage._id,
        title: userimage.detail,
        image: userimage.image,
        description:
          'งานกิจกรรมที่คุณจับคู่ด้วยความสนใจตรงกัน เริ่มต้นพูดคุยและวางแผนเข้าร่วมงานร่วมกันได้เลย!',
      };
    }

    return null;
  }, [allEvents, userimage]);

  // Logic to detect community room (when not an event match)
  const isCommunity =
    !matchedEvent && userimage && (userimage.name || userimage.roomName) && !userimage.eventId;

  const queryClient = useQueryClient();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [invitedEmails, setInvitedEmails] = useState(new Set());

  const handleKickMember = async (targetEmail) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการเตะผู้ใช้ ${targetEmail} ออกจากห้องนี้?`)) {
      return;
    }
    try {
      const res = await api.post('/api/kick-member', {
        roomId: userimage._id,
        targetEmail,
      });
      if (res.data && res.data.success) {
        toast.success('เตะสมาชิกออกจากห้องเรียบร้อยแล้ว');
        queryClient.invalidateQueries({ queryKey: ['roomDetails', userimage?._id] });
      }
    } catch (err) {
      console.error('Error kicking member:', err);
      toast.error(err.response?.data?.error || 'ไม่สามารถเตะสมาชิกได้');
    }
  };

  const handleSendInvite = async (targetEmail) => {
    try {
      const res = await api.post('/api/invite-to-room', {
        roomId: userimage._id,
        roomName: userimage.name || userimage.roomName,
        targetEmail,
      });
      if (res.data && res.data.success) {
        toast.success(res.data.message);
        setInvitedEmails((prev) => {
          const newSet = new Set(prev);
          newSet.add(targetEmail.toLowerCase());
          return newSet;
        });
      }
    } catch (err) {
      console.error('Error sending invite:', err);
      toast.error(err.response?.data?.error || 'เกิดข้อผิดพลาดในการส่งคำเชิญ');
    }
  };

  // Debounced search for invite users
  useEffect(() => {
    if (!isInviteModalOpen) {
      setInviteSearchQuery('');
      setSearchResults([]);
      return;
    }
    if (!inviteSearchQuery || inviteSearchQuery.trim() === '') {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.get('/api/search-users', {
          params: {
            query: inviteSearchQuery,
            roomId: userimage._id,
          },
        });
        setSearchResults(res.data || []);
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [inviteSearchQuery, userimage?._id, isInviteModalOpen]);

  // Fetch room details (members, photos) if it is a community
  const { data: roomDetails } = useQuery({
    queryKey: ['roomDetails', userimage?._id],
    queryFn: async () => {
      if (!userimage?._id) return null;
      const { data } = await api.get(`/api/room/${userimage._id}`);
      return data;
    },
    enabled: !!isCommunity && !!userimage?._id,
  });

  const userEmail = localStorage.getItem('userEmail');
  const isOwner = roomDetails?.createdBy?.toLowerCase() === userEmail?.toLowerCase();

  const communityMembers = useMemo(() => {
    if (!isCommunity || !users.length) return [];

    const memberEmails = roomDetails?.members || userimage?.members || [];

    return users
      .filter((u) => memberEmails.includes(u.email))
      .map((u) => {
        const detail = roomDetails?.memberDetails?.find((d) => d.email === u.email);
        return detail
          ? {
              ...u,
              photoURL: detail.photoURL || u.photoURL,
              nickname: detail.nickname,
            }
          : u;
      });
  }, [isCommunity, userimage, users, roomDetails]);

  // Fetch AI Insight only if it's a Match (has usermatch)
  const isMatch = !!userimage?.usermatch;
  const { data: aiInsight } = useQuery({
    queryKey: ['aiInsight', userimage?._id],
    queryFn: async () => {
      if (!isMatch || !userimage?._id) return null;
      const { data } = await api.get(`/api/aichat/${userimage._id}/insight`);
      return data.data;
    },
    enabled: isMatch && !!userimage?._id,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });

  const isEmptyOrDefault =
    !userimage ||
    Object.keys(userimage).length === 0 ||
    userimage.roomId === 'some-default-room' ||
    userimage._id === 'some-default-room';

  if (isEmptyOrDefault) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={`bg-title ${isFullHeight ? 'full-height' : ''} ${openchat ? 'mobile-layout-mode' : ''}`}>
        <div className="user-image">
          <h2 className="usertitle">Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-title ${isFullHeight ? 'full-height' : ''} ${openchat ? 'mobile-layout-mode' : ''}`}>
        {matchedEvent ? (
          <div className="user-image event-info-wrapper">
            <style>{`
              .event-info-wrapper {
                color: #1f2937;
                padding: 15px;
              }
              .dark-mode .event-info-wrapper {
                color: #f3f4f6;
              }
              .title-header {
                display: flex !important;
                flex-direction: column !important;
                align-items: stretch !important;
                gap: 8px !important;
              }
              .event-title-image {
                width: 100% !important;
                height: 160px !important;
                object-fit: cover !important;
                border-radius: 12px !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
                margin-bottom: 0 !important;
              }
              .dark-mode .event-title-image {
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
              }
              .usertitle {
                font-size: 1.25rem;
                font-weight: 700;
                margin: 0 0 8px 0;
                color: #1f2937;
              }
              .dark-mode .usertitle {
                color: #f3f4f6;
              }
              .event-details {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 12px;
                background: rgba(0, 0, 0, 0.02);
                padding: 12px;
                border-radius: 10px;
                border: 1px solid rgba(0, 0, 0, 0.05);
                font-size: 0.9rem;
                text-align: left;
              }
              .dark-mode .event-details {
                background: rgba(255, 255, 255, 0.03);
                border-color: rgba(255, 255, 255, 0.05);
              }
              .event-genre, .event-location, .event-date {
                font-weight: 500;
                color: #4b5563;
              }
              .dark-mode .event-genre, .dark-mode .event-location, .dark-mode .event-date {
                color: #94a3b8;
              }
              .event-description {
                font-size: 0.85rem;
                color: #6b7280;
                line-height: 1.4;
                margin-top: 6px;
                border-top: 1px solid rgba(0,0,0,0.05);
                padding-top: 8px;
              }
              .dark-mode .event-description {
                color: #cbd5e1;
                border-top-color: rgba(255,255,255,0.05);
              }
              .event-link-wrapper {
                margin-top: 10px;
                text-align: center;
              }
              .event-link {
                display: inline-block;
                padding: 6px 16px;
                background-color: #6366f1;
                color: #fff !important;
                border-radius: 20px;
                text-decoration: none;
                font-size: 0.8rem;
                font-weight: 600;
                transition: background-color 0.2s;
              }
              .event-link:hover {
                background-color: #4f46e5;
              }
            `}</style>
            <div className="title-header">
              {(matchedEvent.image || matchedEvent.thumbnail) && (
                <img
                  src={matchedEvent.image || matchedEvent.thumbnail}
                  alt={matchedEvent.title}
                  className="event-title-image"
                />
              )}
              <div className="title-wrapper">
                <h2 className="usertitle">{matchedEvent.title}</h2>
                {aiInsight && (
                  <div className="ai-insight-badge">
                    <MdAutoAwesome /> {aiInsight}
                  </div>
                )}
              </div>
            </div>
            <div className="event-details">
              {matchedEvent.genre && (
                <div className="event-genre">
                  หมวดหมู่:{' '}
                  {Array.isArray(matchedEvent.genre)
                    ? matchedEvent.genre.join(', ')
                    : typeof matchedEvent.genre === 'object'
                      ? Object.values(matchedEvent.genre).flat().join(', ')
                      : matchedEvent.genre}
                </div>
              )}
              {matchedEvent.location && (
                <div className="event-location">สถานที่: {matchedEvent.location}</div>
              )}
              {matchedEvent.date && (
                <div className="event-date">
                  วันที่:{' '}
                  {typeof matchedEvent.date === 'object' && matchedEvent.date.when
                    ? matchedEvent.date.when
                    : matchedEvent.date}
                </div>
              )}
              {matchedEvent.description && (
                <div className="event-description">
                  <p>{matchedEvent.description}</p>
                </div>
              )}
              {matchedEvent.link && (
                <div className="event-link-wrapper">
                  <a
                    href={matchedEvent.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="event-link"
                  >
                    Info more
                  </a>
                </div>
              )}
            </div>

            {/* PARTNER ABOUT ME SECTION */}
            {userimage && userimage.usermatch && (
              <div className="partner-about-wrapper">
                <style>{`
                  .partner-about-wrapper {
                    margin-top: 20px;
                    border-top: 1px dashed rgba(0, 0, 0, 0.1);
                    padding-top: 15px;
                  }
                  .dark-mode .partner-about-wrapper {
                    border-top-color: rgba(255, 255, 255, 0.1);
                  }
                  .partner-profile-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 12px;
                  }
                  .partner-avatar {
                    width: 45px;
                    height: 45px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 2px solid #6366f1;
                  }
                  .dark-mode .partner-avatar {
                    border-color: #818cf8;
                  }
                  .partner-meta {
                    text-align: left;
                  }
                  .partner-name {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: #1f2937;
                  }
                  .dark-mode .partner-name {
                    color: #f3f4f6;
                  }
                  .partner-email {
                    font-size: 0.75rem;
                    color: #6b7280;
                  }
                  .dark-mode .partner-email {
                    color: #94a3b8;
                  }
                  .partner-bio-card {
                    background: rgba(99, 102, 241, 0.05);
                    border: 1px solid rgba(99, 102, 241, 0.1);
                    border-radius: 12px;
                    padding: 12px;
                    text-align: left;
                  }
                  .dark-mode .partner-bio-card {
                    background: rgba(129, 140, 248, 0.05);
                    border-color: rgba(129, 140, 248, 0.15);
                  }
                  .partner-bio-title {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: #4f46e5;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 6px;
                  }
                  .dark-mode .partner-bio-title {
                    color: #818cf8;
                  }
                  .partner-bio-text {
                    font-size: 0.85rem;
                    color: #4b5563;
                    line-height: 1.4;
                    font-style: italic;
                  }
                  .dark-mode .partner-bio-text {
                    color: #cbd5e1;
                  }
                  .partner-interest-tag {
                    display: inline-block;
                    margin-top: 8px;
                    font-size: 0.75rem;
                    background: rgba(0, 0, 0, 0.04);
                    color: #4b5563;
                    padding: 3px 8px;
                    border-radius: 6px;
                  }
                  .dark-mode .partner-interest-tag {
                    background: rgba(255, 255, 255, 0.05);
                    color: #cbd5e1;
                  }
                `}</style>

                <div className="partner-profile-header">
                  <img
                    src={
                      partnerUser?.photoURL ||
                      userimage.image ||
                      'https://www.w3schools.com/howto/img_avatar.png'
                    }
                    alt="Partner Avatar"
                    className="partner-avatar"
                  />
                  <div className="partner-meta">
                    <div className="partner-name">
                      {partnerInfo?.nickname || partnerUser?.displayName || 'เพื่อนร่วมทาง'}
                    </div>
                    <div className="partner-email">{partnerInfo?.email || 'ไม่มีอีเมล'}</div>
                  </div>
                </div>

                <div className="partner-bio-card">
                  <div className="partner-bio-title">About Me ที่ไปแมตช์มา</div>
                  <div className="partner-bio-text">
                    {partnerInfo?.userInfo?.description
                      ? `"${partnerInfo.userInfo.description}"`
                      : partnerInfo?.userInfo?.detail
                        ? `"${partnerInfo.userInfo.detail}"`
                        : '"สวัสดี! มาวางแผนไปร่วมกิจกรรมและสนุกไปด้วยกันนะ"'}
                  </div>
                  {partnerInfo?.userInfo?.extra && (
                    <div className="partner-interest-tag">💡 {partnerInfo.userInfo.extra}</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : isCommunity ? (
          <div className="community-info-container">
            <style>{`
              .community-info-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                color: var(--text-primary, #fff);
              }
              .community-header {
                padding: 20px;
                text-align: center;
                border-bottom: 1px solid rgba(255,255,255,0.1);
              }
              .community-image {
                width: 80px;
                height: 80px;
                border-radius: 20px;
                object-fit: cover;
                margin-bottom: 10px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.2);
              }
              .community-title {
                font-size: 1.2rem;
                font-weight: 600;
                margin-bottom: 5px;
              }
              .community-stats {
                font-size: 0.9rem;
                color: var(--text-secondary, #aaa);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
              }
              .members-section {
                padding: 15px;
                flex: 1;
                overflow-y: auto;
                max-height: 400px;
              }
              .members-header {
                font-size: 0.8rem;
                color: var(--text-secondary, #aaa);
                margin-bottom: 10px;
                text-transform: uppercase;
                letter-spacing: 1px;
              }
              .member-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 0;
                border-bottom: 1px solid rgba(255,255,255,0.05);
              }
              .member-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                object-fit: cover;
              }
              .member-name {
                font-size: 0.9rem;
                font-weight: 500;
               color: var(--text-secondary, #aaa);
              }
            `}</style>
            <div className="community-header">
              <UserAvatar src={userimage.image} alt={userimage.name} className="community-image" />

              <h2 className="community-title">{userimage.name}</h2>
              <div className="community-stats">
                <MdPeople /> {communityMembers.length} Members
              </div>
            </div>
            <div className="members-section">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <h3 className="members-header" style={{ margin: 0 }}>
                  Members ({communityMembers.length})
                </h3>
                {isOwner && (
                  <button
                    onClick={() => setIsInviteModalOpen(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6366f1',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(99, 102, 241, 0.1)',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) =>
                      (e.target.style.backgroundColor = 'rgba(99, 102, 241, 0.2)')
                    }
                    onMouseLeave={(e) =>
                      (e.target.style.backgroundColor = 'rgba(99, 102, 241, 0.1)')
                    }
                  >
                    + เชิญเพื่อน
                  </button>
                )}
              </div>
              <div className="member-list">
                {communityMembers.map((member) => (
                  <div
                    key={member._id || member.email}
                    className="member-item"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <UserAvatar
                        src={member.photoURL}
                        alt={member.displayName}
                        className="member-avatar"
                      />
                      <span className="member-name">
                        {member.nickname
                          ? `${member.nickname} (${member.displayName || member.email})`
                          : member.displayName || member.email}
                      </span>
                    </div>

                    {isOwner && member.email.toLowerCase() !== userEmail.toLowerCase() && (
                      <button
                        onClick={() => handleKickMember(member.email)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          transition: 'all 0.2s',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          fontWeight: '500',
                        }}
                        onMouseEnter={(e) =>
                          (e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.2)')
                        }
                        onMouseLeave={(e) =>
                          (e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.1)')
                        }
                      >
                        เตะออก
                      </button>
                    )}
                  </div>
                ))}
                {communityMembers.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#888', padding: '10px' }}>
                    No members found
                  </div>
                )}
              </div>
            </div>

            {/* Invite Modal Overlay */}
            {isInviteModalOpen && (
              <div
                className="invite-modal-overlay"
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  backdropFilter: 'blur(4px)',
                  zIndex: 9999,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '20px',
                }}
                onClick={() => setIsInviteModalOpen(false)}
              >
                <div
                  className="invite-modal-container"
                  style={{
                    backgroundColor: '#1e293b',
                    color: '#fff',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '420px',
                    maxHeight: '85vh',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow:
                      '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 20px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
                      เชิญเพื่อนเข้าร่วมกลุ่ม
                    </h3>
                    <button
                      onClick={() => setIsInviteModalOpen(false)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '1.4rem',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      &times;
                    </button>
                  </div>

                  <div
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      flex: 1,
                      overflowY: 'auto',
                    }}
                  >
                    <div>
                      <input
                        type="text"
                        placeholder="พิมพ์ชื่อ นามแฝง หรืออีเมลผู้ใช้..."
                        value={inviteSearchQuery}
                        onChange={(e) => setInviteSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: '#0f172a',
                          color: '#fff',
                          outline: 'none',
                          fontSize: '0.9rem',
                        }}
                        autoFocus
                      />
                    </div>

                    <div
                      className="invite-results-list"
                      style={{
                        minHeight: '180px',
                        maxHeight: '320px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {isSearching ? (
                        <div
                          style={{
                            textAlign: 'center',
                            color: '#94a3b8',
                            padding: '40px 20px',
                            fontSize: '0.85rem',
                          }}
                        >
                          กำลังค้นหา...
                        </div>
                      ) : searchResults.length > 0 ? (
                        searchResults.map((user) => {
                          const isInvited = invitedEmails.has(user.email.toLowerCase());
                          return (
                            <div
                              key={user.email}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                              }}
                            >
                              <UserAvatar
                                src={user.photoURL}
                                alt={user.displayName}
                                style={{ width: '36px', height: '36px', borderRadius: '50%' }}
                              />
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  flex: 1,
                                  overflow: 'hidden',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '0.85rem',
                                    fontWeight: '500',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {user.nickname
                                    ? `${user.nickname} (${user.displayName})`
                                    : user.displayName}
                                </span>
                                <span
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#94a3b8',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {user.email}
                                </span>
                              </div>
                              <button
                                disabled={isInvited}
                                onClick={() => handleSendInvite(user.email)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: isInvited
                                    ? 'rgba(255, 255, 255, 0.08)'
                                    : '#6366f1',
                                  color: isInvited ? '#94a3b8' : '#fff',
                                  cursor: isInvited ? 'default' : 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: '600',
                                  transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isInvited) e.target.style.backgroundColor = '#4f46e5';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isInvited) e.target.style.backgroundColor = '#6366f1';
                                }}
                              >
                                {isInvited ? 'ส่งแล้ว' : 'เชิญ'}
                              </button>
                            </div>
                          );
                        })
                      ) : inviteSearchQuery.trim() !== '' ? (
                        <div
                          style={{
                            textAlign: 'center',
                            color: '#94a3b8',
                            padding: '40px 20px',
                            fontSize: '0.85rem',
                          }}
                        >
                          ไม่พบผู้ใช้ในระบบ
                        </div>
                      ) : (
                        <div
                          style={{
                            textAlign: 'center',
                            color: '#94a3b8',
                            padding: '40px 20px',
                            fontSize: '0.85rem',
                          }}
                        >
                          พิมพ์ชื่อหรืออีเมลเพื่อเชิญเข้าห้อง
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : userimage && (userimage._id || userimage.email || userimage.name || userimage.roomName) ? (
          <div className="profile-info-container">
            <style>{`
              .profile-info-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 30px 20px;
                color: #1f2937;
                text-align: center;
              }
              .profile-card-header {
                position: relative;
                margin-bottom: 20px;
              }
              .profile-avatar-large {
                width: 110px;
                height: 110px;
                border-radius: 50%;
                object-fit: cover;
                border: 4px solid #6366f1;
                box-shadow: 0 8px 25px rgba(99, 102, 241, 0.2);
                transition: all 0.3s ease;
              }
              .dark-mode .profile-avatar-large {
                border-color: #818cf8;
                box-shadow: 0 8px 25px rgba(129, 140, 248, 0.3);
              }
              .profile-status-badge {
                position: absolute;
                bottom: 5px;
                right: 5px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                border: 3px solid #ffffff;
                background-color: #ef4444;
              }
              .profile-status-badge.online {
                background-color: #10b981;
                box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
              }
              .profile-name-title {
                font-size: 1.3rem;
                font-weight: 700;
                margin: 10px 0 5px 0;
                color: #1f2937;
              }
              .profile-nickname-sub {
                font-size: 0.95rem;
                color: #6366f1;
                font-weight: 600;
                margin-bottom: 12px;
              }
              .dark-mode .profile-nickname-sub {
                color: #818cf8;
              }
              .profile-details-list {
                width: 100%;
                margin-top: 20px;
                background: rgba(0, 0, 0, 0.02);
                border-radius: 12px;
                padding: 15px;
                border: 1px solid rgba(0, 0, 0, 0.05);
                text-align: left;
              }
              .profile-detail-item {
                display: flex;
                flex-direction: column;
                gap: 4px;
                margin-bottom: 12px;
              }
              .profile-detail-item:last-child {
                margin-bottom: 0;
              }
              .profile-detail-label {
                font-size: 0.75rem;
                color: #6b7280;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }
              .profile-detail-value {
                font-size: 0.9rem;
                color: #374151;
                font-weight: 500;
                word-break: break-all;
              }
              .profile-favorite-badge {
                margin-top: 25px;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 16px;
                background: rgba(236, 72, 153, 0.1);
                color: #ec4899;
                border-radius: 20px;
                font-size: 0.8rem;
                font-weight: 600;
                border: 1px solid rgba(236, 72, 153, 0.2);
              }
              
              /* Dark Mode Overrides */
              .dark-mode .profile-info-container {
                color: #f3f4f6;
              }
              .dark-mode .profile-name-title {
                color: #f3f4f6;
              }
              .dark-mode .profile-details-list {
                background: rgba(255, 255, 255, 0.03);
                border-color: rgba(255, 255, 255, 0.05);
              }
              .dark-mode .profile-detail-value {
                color: #e2e8f0;
              }
              .dark-mode .profile-status-badge {
                border-color: #1e293b;
              }
              .dark-mode .profile-detail-label {
                color: #94a3b8;
              }
            `}</style>
            <div className="profile-card-header">
              <UserAvatar
                src={userimage.photoURL || userimage.image}
                alt={userimage.displayName}
                className="profile-avatar-large"
              />
              <div className={`profile-status-badge ${userimage.isOnline ? 'online' : ''}`} />
            </div>

            <h2 className="profile-name-title">{userimage.displayName || 'เพื่อนของคุณ'}</h2>
            {userimage.nickname && (
              <div className="profile-nickname-sub">({userimage.nickname})</div>
            )}

            <div className="profile-details-list">
              <div className="profile-detail-item">
                <span className="profile-detail-label">อีเมลติดต่อ</span>
                <span className="profile-detail-value">{userimage.email || 'ไม่มีอีเมล'}</span>
              </div>
              <div className="profile-detail-item">
                <span className="profile-detail-label">สถานะออนไลน์</span>
                <span
                  className="profile-detail-value"
                  style={{ color: userimage.isOnline ? '#10b981' : '#6b7280' }}
                >
                  {userimage.isOnline ? 'ออนไลน์ขณะนี้' : 'ออฟไลน์'}
                </span>
              </div>
            </div>

            <div className="profile-favorite-badge">⭐ เพื่อนคนโปรด (Favorite)</div>
          </div>
        ) : (
          <div className="bg-no-title">{/* No user or event context for this chat */}</div>
        )}
    </div>
  );
};

export default ShowTitle;

ShowTitle.propTypes = {
  userimage: PropTypes.object,
  openchat: PropTypes.bool,
  isFullHeight: PropTypes.bool,
};
