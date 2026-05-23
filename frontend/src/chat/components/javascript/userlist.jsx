import PropTypes from 'prop-types';
import { FaChevronDown, FaChevronRight, FaUserFriends } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import UserAvatar from '../../../components/UserAvatar';

import '../../chat.css';

const ListUser = ({
  sortedFriends,
  searchTerm,
  lastMessages,
  setActiveUser,
  setIsGroupChat,
  selectedTab,
  setSelectedTab,
  setIsOpen,
  setOpenchat,
  isOpen,
  setUserImage,
  setActiveRoomId, // เพิ่ม prop
  formatOnlineStatus, // เพิ่ม prop สำหรับแสดงสถานะออนไลน์
}) => {
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail');

  const formatRelativeTime = (timestamp) => {
    const now = new Date();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'เมื่อสักครู่';
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    if (diffHour < 24) return `${diffHour} ชม.ที่แล้ว`;

    return timestamp.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  // ฟังก์ชันสร้าง roomId สำหรับ one-to-one chat (เรียง email เพื่อ unique)
  const getRoomIdForFriend = (friendEmail) => {
    const emails = [userEmail, friendEmail].sort();
    return `room__${emails[0]}__${emails[1]}`;
  };
  const handleEnterRoom = (roomId) => {
    navigate(`/chat/${roomId}`);
  };

  const filteredFriends = sortedFriends.filter((friend) =>
    (friend.displayName || '').toLowerCase().includes(searchTerm || '')
  );

  return (
    <div className="favorite-container">
      <div className="favorite-toggle" onClick={handleToggle}>
        {isOpen ? <FaChevronDown /> : <FaChevronRight />}
        <span>Favorite</span>
      </div>
      {isOpen && (
        <div className="favorite-container-open">
          <ul className="friend-list-chat">
            {filteredFriends.length > 0 ? (
              filteredFriends.map((friend, index) => (
                <li
                  key={index}
                  className={`chat-friend-item ${selectedTab === friend.email ? 'selected' : ''}`}
                  onClick={() => {
                    setUserImage(friend);
                    handleEnterRoom(friend.roomId);
                    setActiveUser(friend.email);
                    setOpenchat(true);
                    setIsGroupChat(false);
                    setSelectedTab(friend.email);
                    if (setActiveRoomId) setActiveRoomId(getRoomIdForFriend(friend.email));
                  }}
                >
                  <div className="mobilelarge">
                    <UserAvatar
                      src={friend.photoURL}
                      alt={friend.displayName}
                      className="friend-photo"
                    />

                    <div className="friend-details">
                      <span className="friend-name">
                        {friend.nickname ? friend.nickname : friend.displayName}
                      </span>
                      <div className="row-last-time">
                        <span className="last-message">
                          {lastMessages[friend.roomId]?.content || 'ยังไม่มีข้อความ'}
                        </span>
                        <span className="message-time">
                          {lastMessages[friend.roomId]?.timestamp &&
                            formatRelativeTime(lastMessages[friend.roomId].timestamp.toDate())}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="con-right">
                    <div
                      className={`online-status ${
                        friend.isOnline ? 'status-online' : 'status-offline'
                      }`}
                    >
                      <span className="online-indicator"></span>
                      {formatOnlineStatus
                        ? formatOnlineStatus(friend)
                        : friend.isOnline
                          ? 'ออนไลน์'
                          : 'ออฟไลน์'}
                    </div>
                  </div>
                </li>
              ))
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
                <FaUserFriends size={30} />
                <span style={{ fontSize: '14px' }}>ไม่พบเพื่อน</span>
              </div>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

ListUser.propTypes = {
  sortedFriends: PropTypes.array.isRequired,
  searchTerm: PropTypes.string,
  lastMessages: PropTypes.object.isRequired,
  setActiveUser: PropTypes.func.isRequired,
  setIsGroupChat: PropTypes.func.isRequired,
  selectedTab: PropTypes.string,
  setSelectedTab: PropTypes.func.isRequired,
  setIsOpen: PropTypes.func.isRequired,
  setOpenchat: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  setUserImage: PropTypes.func.isRequired,
  setActiveRoomId: PropTypes.func,
  formatOnlineStatus: PropTypes.func,
};

export default ListUser;
