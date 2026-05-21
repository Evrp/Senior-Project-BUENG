import { useMemo, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAllEvents, fetchUsers } from '../../../lib/queries';
import PropTypes from 'prop-types'; // Import PropTypes
import api from '../../../server/api';
import { MdAutoAwesome, MdPeople } from 'react-icons/md';
import '../css/showtitle.css';
import UserAvatar from '../../../components/UserAvatar';
import { toast } from 'react-toastify';

const ShowTitle = ({ userimage, openchat }) => {
  const { data: allEvents = [], isLoading } = useQuery({
    queryKey: ['allEvents'],
    queryFn: fetchAllEvents,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const matchedEvent = useMemo(() => {
    if (!userimage || !allEvents) return null;

    // 1. Try matching by ID directly (Community/Event object)
    let event = allEvents.find((event) => event._id === userimage._id);
    if (event) return event;

    // 2. Try matching by eventId (Match object from InfoMatch)
    if (userimage.eventId) {
      event = allEvents.find((event) => event._id === userimage.eventId);
      if (event) return event;
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

  if (isLoading) {
    return (
      <div className={`bg-title ${openchat ? 'mobile-layout-mode' : ''}`}>
        <div className="user-image">
          <h2 className="usertitle">Loading...</h2>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={`bg-title ${openchat ? 'mobile-layout-mode' : ''}`}>
        {matchedEvent ? (
          <div className="user-image">
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 className="members-header" style={{ margin: 0 }}>Members ({communityMembers.length})</h3>
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
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(99, 102, 241, 0.2)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(99, 102, 241, 0.1)'}
                  >
                    + เชิญเพื่อน
                  </button>
                )}
              </div>
              <div className="member-list">
                {communityMembers.map((member) => (
                  <div key={member._id || member.email} className="member-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                          fontWeight: '500'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.2)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
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
                  padding: '20px'
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
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>เชิญเพื่อนเข้าร่วมกลุ่ม</h3>
                    <button 
                      onClick={() => setIsInviteModalOpen(false)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.4rem', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      &times;
                    </button>
                  </div>
                  
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto' }}>
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
                          fontSize: '0.9rem'
                        }}
                        autoFocus
                      />
                    </div>
                    
                    <div className="invite-results-list" style={{ minHeight: '180px', maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {isSearching ? (
                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 20px', fontSize: '0.85rem' }}>กำลังค้นหา...</div>
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
                                border: '1px solid rgba(255, 255, 255, 0.05)'
                              }}
                            >
                              <UserAvatar src={user.photoURL} alt={user.displayName} style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: '500', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                  {user.nickname ? `${user.nickname} (${user.displayName})` : user.displayName}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user.email}</span>
                              </div>
                              <button
                                disabled={isInvited}
                                onClick={() => handleSendInvite(user.email)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  backgroundColor: isInvited ? 'rgba(255, 255, 255, 0.08)' : '#6366f1',
                                  color: isInvited ? '#94a3b8' : '#fff',
                                  cursor: isInvited ? 'default' : 'pointer',
                                  fontSize: '0.8rem',
                                  fontWeight: '600',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => { if (!isInvited) e.target.style.backgroundColor = '#4f46e5'; }}
                                onMouseLeave={(e) => { if (!isInvited) e.target.style.backgroundColor = '#6366f1'; }}
                              >
                                {isInvited ? 'ส่งแล้ว' : 'เชิญ'}
                              </button>
                            </div>
                          );
                        })
                      ) : inviteSearchQuery.trim() !== '' ? (
                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 20px', fontSize: '0.85rem' }}>ไม่พบผู้ใช้ในระบบ</div>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 20px', fontSize: '0.85rem' }}>พิมพ์ชื่อหรืออีเมลเพื่อเชิญเข้าห้อง</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-no-title">{/* No event context for this chat */}</div>
        )}
      </div>
    </div>
  );
};

export default ShowTitle;

ShowTitle.propTypes = {
  userimage: PropTypes.object,
  openchat: PropTypes.bool,
};
