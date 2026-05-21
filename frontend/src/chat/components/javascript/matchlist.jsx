import { useEffect, useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { FaChevronDown, FaChevronRight } from 'react-icons/fa';
import { FaHeartBroken } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchInfoMatch, fetchUsers } from '../../../lib/queries';
import UserAvatar from '../../../components/UserAvatar';

const MatchList = ({
  setActiveUser,
  setRoombar,
  setIsGroupChat,
  isOpenMatch,
  setIsOpenMatch,
  searchTerm,
  setSelectedTab,
  setOpenchat,
  selectedTab,
  openMenuFor,
  setUserImage,
  setOpenMenuFor,
}) => {
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail');
  const dropdownRefs = useRef({});
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchedData, setMatchedData] = useState(null);

  // Fetch data using React Query
  const { data: userMatchData = [], isLoading: isLoadingMatches } = useQuery({
    queryKey: ['infoMatch'],
    queryFn: fetchInfoMatch,
  });
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const validMatches = userMatchData.filter((matchData) => {
    const isUserInMatch = matchData.email === userEmail || matchData.usermatch === userEmail;
    const bothJoined =
      (matchData.emailjoined && matchData.usermatchjoined) || matchData.status === 'matched';
    const hasValidId = !!matchData._id;

    return isUserInMatch && bothJoined && hasValidId;
  });

  const filteredMatches = validMatches.filter((matchData) => {
    const partnerEmail = matchData.email === userEmail ? matchData.usermatch : matchData.email;
    const user = users.find((u) => u.email === partnerEmail);
    const name = user && user.displayName ? user.displayName : partnerEmail;
    return (
      name.toLowerCase().includes(searchTerm || '') ||
      (matchData.detail || '').toLowerCase().includes(searchTerm || '')
    );
  });

  // ตรวจสอบการ match ใหม่
  useEffect(() => {
    if (userMatchData && userMatchData.length > 0) {
      const newMatches = userMatchData.filter(
        (match) =>
          match.emailjoined &&
          match.usermatchjoined &&
          (match.email === userEmail || match.usermatch === userEmail)
      );

      if (newMatches.length > 0 && !localStorage.getItem(`match_shown_${newMatches[0]._id}`)) {
        setMatchedData(newMatches[0]);
        setShowMatchModal(true);
        localStorage.setItem(`match_shown_${newMatches[0]._id}`, 'true');
      }
    }
  }, [userMatchData, userEmail]);

  const closeMatchModal = () => {
    setShowMatchModal(false);
    setMatchedData(null);
  };

  // ปิด dropdown เมื่อคลิกนอก dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuFor) {
        const currentDropdown = dropdownRefs.current[openMenuFor];
        if (currentDropdown && !currentDropdown.contains(event.target)) {
          setOpenMenuFor(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openMenuFor, userMatchData, setOpenMenuFor]);

  return (
    <div className="favorite-container">
      <div className="favorite-toggle" onClick={() => setIsOpenMatch((prev) => !prev)}>
        {isOpenMatch ? <FaChevronDown /> : <FaChevronRight />}
        <span>Match</span>
      </div>
      {isOpenMatch && (
        <div className={!isOpenMatch ? 'group-container-open' : 'group-container'}>
          {isLoadingMatches || isLoadingUsers ? (
            <div
              style={{
                padding: '30px 20px',
                textAlign: 'center',
                color: '#999',
                fontSize: '14px',
              }}
            >
              กำลังโหลด...
            </div>
          ) : filteredMatches.length > 0 ? (
            <ul className="friend-list-chat">
              {filteredMatches.map((matchData, index) => {
                const partnerEmail =
                  matchData.email === userEmail ? matchData.usermatch : matchData.email;
                return (
                  <li
                    key={`${matchData._id}-${index}`}
                    className={`chat-match-item ${selectedTab === matchData._id ? 'selected' : ''}`}
                    onClick={() => {
                      if (!matchData._id) {
                        console.error('matchData._id is undefined:', matchData);
                        return;
                      }

                      navigate(`/chat/${matchData._id}`);
                      setOpenchat(true);
                      setUserImage(matchData);
                      setSelectedTab(matchData._id);

                      setActiveUser(partnerEmail);

                      const partnerUser = users.find((u) => u.email === partnerEmail);
                      setRoombar(
                        partnerUser?.photoURL || matchData.image,
                        matchData.title,
                        matchData._id
                      );
                      setIsGroupChat(false);
                    }}
                  >
                    <UserAvatar
                      src={users.find((u) => u.email === partnerEmail)?.photoURL}
                      alt={matchData.detail}
                      className="friend-photo"
                    />

                    <div className="match-detail">
                      <span className="friend-name">
                        {(() => {
                          const user = users.find((u) => u.email === partnerEmail);
                          return user && user.displayName ? user.displayName : partnerEmail;
                        })()}
                      </span>
                      <span className="friend-title">{matchData.detail}</span>

                      {((matchData.emailjoined && matchData.usermatchjoined) ||
                        matchData.status === 'matched') && (
                        <div className="sidebar-match-badge">
                          {/* <FaHeart className="match-icon" /> */}
                          <span className="match-text">It&apos;s a Match!</span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div
              style={{
                padding: '30px 20px',
                textAlign: 'center',
                color: '#999',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <FaHeartBroken size={30} />
              <span style={{ fontSize: '14px' }}>ไม่มีรายการแมตช์</span>
            </div>
          )}
        </div>
      )}

      {showMatchModal && matchedData && (
        <div className="match-modal-overlay">
          <div className="activity-match-modal">
            <div className="activity-match-header">
              <h2>Found a Buddy!</h2>
              <p>You both are interested in the same activity.</p>
            </div>

            <div className="activity-match-users">
              <div className="activity-match-user">
                <UserAvatar
                  src={users.find((u) => u.email === userEmail)?.photoURL}
                  alt="You"
                  highRes={true}
                />

                <span>You</span>
              </div>
              <div className="activity-match-icon">+</div>
              <div className="activity-match-user">
                <UserAvatar
                  src={(() => {
                    const partnerEmail =
                      matchedData.email === userEmail ? matchedData.usermatch : matchedData.email;
                    const partnerUser = users.find((u) => u.email === partnerEmail);
                    return partnerUser?.photoURL;
                  })()}
                  alt="Matched User"
                  highRes={true}
                />

                <span>
                  {(() => {
                    const partnerEmail =
                      matchedData.email === userEmail ? matchedData.usermatch : matchedData.email;
                    const partnerUser = users.find((u) => u.email === partnerEmail);
                    return partnerUser?.displayName || 'Buddy';
                  })()}
                </span>
              </div>
            </div>

            <div className="activity-match-details">
              <h3>{matchedData.title || 'Activity'}</h3>
              <p>Now you can plan this activity together. Let&apos;s start a conversation!</p>
            </div>

            <div className="activity-match-actions">
              <button className="secondary-btn" onClick={closeMatchModal}>
                Find More
              </button>
              <button
                className="primary-btn"
                onClick={() => {
                  navigate(`/chat/${matchedData._id}`);
                  setOpenchat(true);
                  setUserImage(matchedData);
                  closeMatchModal();
                }}
              >
                Plan in Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

MatchList.propTypes = {
  setActiveUser: PropTypes.func.isRequired,
  setRoombar: PropTypes.func.isRequired,
  setIsGroupChat: PropTypes.func.isRequired,
  isOpenMatch: PropTypes.bool.isRequired,
  setIsOpenMatch: PropTypes.func.isRequired,
  searchTerm: PropTypes.string,
  setSelectedTab: PropTypes.func.isRequired,
  setOpenchat: PropTypes.func.isRequired,
  handleProfileClick: PropTypes.func.isRequired,
  selectedTab: PropTypes.string,
  openMenuFor: PropTypes.string,
  setUserImage: PropTypes.func.isRequired,
  setOpenMenuFor: PropTypes.func.isRequired,
};

export default MatchList;
