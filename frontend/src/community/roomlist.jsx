import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../server/api';
import { useNavigate } from 'react-router-dom';
import './css/roomlist.css';
import { toast } from 'react-toastify';
import { useTheme } from '../context/themecontext';
import PropTypes from 'prop-types';
import { FaUsers, FaLock } from 'react-icons/fa';
import UserAvatar from '../components/UserAvatar';

const RoomList = ({
  rooms = [],
  isLoading: isLoadingRooms,
  showOnlyMyRooms,
  isDeleteMode,
  selectedRooms,
  setSelectedRooms,
}) => {
  const userEmail = localStorage.getItem('userEmail');
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();

  const handleRoomSelect = (roomId) => {
    setSelectedRooms((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  };

  const { data: joinedRoomIds = [], isLoading: isLoadingJoined } = useQuery({
    queryKey: ['userJoinedRooms', userEmail],
    queryFn: async () => {
      const filterjoinedRooms = await api.get(\`/api/user-rooms/\${userEmail}\`);
      return Array.isArray(filterjoinedRooms.data.roomIds)
        ? filterjoinedRooms.data.roomIds.filter((id) => !!id)
        : [];
    },
    enabled: !!userEmail,
  });

  // filter ห้องที่ user ยังไม่ได้ join
  const filteredRooms = useMemo(() => {
    if (showOnlyMyRooms) {
      return rooms.filter((room) => joinedRoomIds.includes(room._id));
    }
    return rooms;
  }, [rooms, showOnlyMyRooms, joinedRoomIds]);

  const isJoined = (roomId) => joinedRoomIds.includes(roomId);

  const handleAddCommunity = async (roomId, roomName, password = null) => {
    try {
      const res = await api.post(\`/api/join-community\`, {
        userEmail,
        roomId,
        roomName,
        password,
      });
      if (res.status === 200 || res.status === 201) {
        toast.success('เข้าร่วมห้องสําเร็จ!');
        navigate(\`/chat/\${roomId}\`);
      }
    } catch (error) {
      if (error.response && error.response.status === 409) {
        navigate(\`/chat/\${roomId}\`);
        return;
      }
      console.error('Error adding community:', error);
      toast.error(error.response?.data?.error || 'ไม่สามารถเข้าร่วมห้องได้');
    }
  };

  const handleRoomClick = (room) => {
    if (isDeleteMode) {
      handleRoomSelect(room._id);
    } else if (showOnlyMyRooms || isJoined(room._id)) {
      navigate(\`/chat/\${room._id}\`);
    } else {
      if (room.type === 'private') {
        const password = window.prompt('ห้องนี้เป็นห้องส่วนตัว กรุณาระบุรหัสผ่าน:');
        if (password === null) return; // User cancelled
        if (password === '') {
          toast.error('กรุณาระบุรหัสผ่าน');
          return;
        }
        handleAddCommunity(room._id, room.name, password);
      } else {
        handleAddCommunity(room._id, room.name);
      }
    }
  };

  const isLoading = isLoadingRooms || isLoadingJoined;

  return (
    <section className={\`roomlist-section \${isDarkMode ? 'dark-mode' : ''}\`}>
      <header className="roomlist-header"></header>
      <div className="room-list">
        {isLoading ? (
          <div className="roomlist-empty-loading">
            <div className="roomlist-empty-spinner">
              <div className="roomlist-empty-bar"></div>
              <div className="roomlist-empty-bar"></div>
              <div className="roomlist-empty-bar"></div>
              <div className="roomlist-empty-bar"></div>
            </div>
            <div className="roomlist-empty-text">กำลังโหลดห้อง...</div>
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="roomlist-empty-loading">
            <div className="roomlist-empty-text">ยังไม่มีห้องในขณะนี้</div>
          </div>
        ) : (
          filteredRooms.map((room) => (
            <div
              key={room._id}
              className={\`room-container card-room \${
                selectedRooms.includes(room._id) ? 'selected' : ''
              }\`}
              onClick={() => handleRoomClick(room)}
            >
              <div className="room-image-wrap">
                <UserAvatar src={room.image} alt="room" className="room-image" />

                {isDeleteMode && (
                  <div className="room-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRooms.includes(room._id)}
                      onChange={() => handleRoomSelect(room._id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
                
                {room.type === 'private' && (
                  <div className="room-private-badge" title="ห้องส่วนตัว">
                    <FaLock />
                  </div>
                )}
              </div>
              <>
                <h4 className="room-name">{room.name}</h4>
                <p className="room-desc">{room.description}</p>
                <div className="room-actions">
                  <div className="room-member-count">
                    <FaUsers />
                    <span>{room.memberCount || 0}</span>
                  </div>
                  {!showOnlyMyRooms && (
                    <button
                      className={\`join-button \${isJoined(room._id) ? 'joined' : ''}\`}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click
                        handleRoomClick(room);
                      }}
                    >
                      {isJoined(room._id) ? 'Joined' : 'Join'}
                    </button>
                  )}
                </div>
              </>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default RoomList;

RoomList.propTypes = {
  rooms: PropTypes.array,
  isLoading: PropTypes.bool,
  showOnlyMyRooms: PropTypes.bool.isRequired,
  isDeleteMode: PropTypes.bool.isRequired,
  selectedRooms: PropTypes.array.isRequired,
  setSelectedRooms: PropTypes.func.isRequired,
};
