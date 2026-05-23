import React, { useEffect, useState } from 'react';
import { IoIosArrowBack, IoMdSend } from 'react-icons/io';
import { FaUsers, FaUser, FaCalendarAlt } from 'react-icons/fa';
import PropTypes from 'prop-types';
import ProfileModal from './ProfileModal';
import { useQuery } from '@tanstack/react-query';
import { fetchFollowInfo, fetchInfos, fetchUsers } from '../../../lib/queries';
import UserAvatar from '../../../components/UserAvatar';

const ChatPanel = ({
  messages,
  userEmail,
  sortedFriends,
  RoomsBar,
  openchat,
  input,
  setInput,
  handleSend,
  userImage,
  setOpenchat,
  endOfMessagesRef,
  setFriends,

  formatChatDate,
  disabled,
  onToggleInfo,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isCom, setIscom] = useState(false);

  // Fetch data using React Query
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });
  const { data: getnickName = [] } = useQuery({
    queryKey: ['infos'],
    queryFn: fetchInfos,
  });

  const { data: followInfo } = useQuery({
    queryKey: ['followInfo', userImage?.email],
    queryFn: () => fetchFollowInfo(userImage?.email),
    enabled: !!userImage?.email, // Only run query if userImage.email exists
  });

  const followers = followInfo?.followers || [];
  const following = followInfo?.following || [];

  const handleProfileClick = (userObject) => {
    if (!userObject) return;
    setSelectedUser(userObject);
    setModalVisible(true);
  };

  useEffect(() => {
    if (!userImage) return;
    if (userImage.name || userImage.usermatch) {
      setIscom(true);
    } else if (userImage.email) {
      setIscom(false);
    }
  }, [userImage]);
  return (
    <div className={`chat-container ${openchat ? 'mobile-layout-mode' : ''}`}>
      <div className={`show-info ${openchat ? 'mobile-layout-mode' : ''}`}>
        <button
          className={`back-button-mobile ${openchat ? 'mobile-layout-mode' : ''}`}
          onClick={() => setOpenchat(false)}
          style={{
            WebkitTapHighlightColor: 'transparent',
            userSelect: 'none',
          }}
        >
          <IoIosArrowBack />
        </button>
        <div className="center-mobile">
          <UserAvatar
            src={(() => {
              if (!userImage || !users) return null;
              // For group chats/communities
              if (userImage.photoURL || userImage.image)
                return userImage.photoURL || userImage.image;

              // For 1-on-1 chats (friends or matches)
              const partnerEmail = userImage.usermatch
                ? userImage.email === userEmail
                  ? userImage.usermatch
                  : userImage.email
                : userImage.email;
              const partnerUser = users.find((u) => u.email === partnerEmail);
              return partnerUser?.photoURL;
            })()}
            alt="User"
            className={`chat-profile ${openchat ? 'mobile-layout-mode' : ''}`}
            onClick={() => {
              if (!userImage || !users) return;
              const userObject =
                users.find((u) => u.email === userImage?.usermatch) ||
                users.find((u) => u.email === userImage?.email) ||
                userImage;
              handleProfileClick(userObject);
            }}
          />
        </div>
        <h2 className={`chat-title ${openchat ? 'mobile-layout-mode' : ''}`}>
          {(() => {
            const partnerEmail = userImage?.usermatch
              ? userImage.email === userEmail
                ? userImage.usermatch
                : userImage.email
              : userImage?.email;

            const nickname =
              partnerEmail &&
              Array.isArray(getnickName) &&
              getnickName.find((u) => u.email === partnerEmail)?.nickname;

            const displayName =
              partnerEmail &&
              Array.isArray(users) &&
              users.find((u) => u.email === partnerEmail)?.displayName;

            return (
              nickname ||
              displayName ||
              (RoomsBar && RoomsBar.roomName) ||
              userImage?.name ||
              userImage?.displayName ||
              'Chat'
            );
          })()}
        </h2>
        {!disabled && (() => {
          const isMatchRoom = !!(userImage?.usermatch || userImage?.eventId);
          const isCommunityRoom = !!(userImage?.name || userImage?.roomName);
          return (
            <button
              className="info-button-mobile"
              onClick={onToggleInfo}
              title={
                isCommunityRoom 
                  ? "ดูข้อมูลกลุ่มและสมาชิก" 
                  : isMatchRoom 
                    ? "ดูข้อมูลกิจกรรมที่แมตช์" 
                    : "ดูโปรไฟล์เพื่อน"
              }
            >
              {isCommunityRoom ? <FaUsers /> : isMatchRoom ? <FaCalendarAlt /> : <FaUser />}
            </button>
          );
        })()}
      </div>
      <div className="chat-box">
        {messages.length === 0 ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <span style={{ color: '#888', fontSize: '1.1rem' }}>ยังไม่มีข้อความ</span>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isCurrentUser = msg.sender === userEmail;
            const senderInfo = users.find(
              (user) => user.email?.toLowerCase() === msg.sender?.toLowerCase()
            );
            const messageDate = msg.timestamp?.toDate();
            const previousMessageDate = index > 0 ? messages[index - 1].timestamp?.toDate() : null;
            const isNewDay =
              !previousMessageDate ||
              messageDate?.toDateString() !== previousMessageDate?.toDateString();

            return (
              <React.Fragment key={msg.id}>
                {isNewDay && (
                  <div className="chat-date-divider">
                    {messageDate && formatChatDate(messageDate)}
                  </div>
                )}
                <div className={`chat-message ${isCurrentUser ? 'my-message' : 'other-message'}`}>
                  {!isCurrentUser && (
                    <UserAvatar
                      src={senderInfo?.photoURL}
                      alt="Sender"
                      className="message-avatar"
                      onClick={() => handleProfileClick(senderInfo)}
                      style={{ cursor: 'pointer' }}
                    />
                  )}
                  <div className={`message-content ${isCurrentUser ? 'current' : 'other'}`}>
                    <div className="colum-message">
                      <div className={`message-bubble ${isCurrentUser ? 'current' : 'other'}`}>
                        {msg.content || msg.text}
                      </div>
                      {isCurrentUser && index === messages.length - 1 && (
                        <div className="seen-status">{msg.isSeen ? 'Seen' : ''}</div>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={endOfMessagesRef} />
      </div>
      <div className="chat-input-container">
        <div className="chat-border">
          <div className="emoji-right"></div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !disabled) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={disabled ? 'กรุณาเลือกห้องแชท' : 'Writing something...'}
            className="chat-input"
            disabled={disabled}
            style={{
              opacity: disabled ? 0.6 : 1,
              cursor: disabled ? 'not-allowed' : 'text',
            }}
          />
          <div className="emoji">{/* <MdAttachFile /> */}</div>
          <div className="emoji-left">
            <IoMdSend
              onClick={!disabled ? handleSend : undefined}
              style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={modalVisible}
        onClose={() => setModalVisible(false)}
        user={selectedUser}
        isCom={isCom}
        userImage={userImage}
        setFriends={setFriends}
        sortedFriends={sortedFriends}
        followers={followers}
        following={following}
        users={users}
      />
    </div>
  );
};

export default ChatPanel;

ChatPanel.propTypes = {
  messages: PropTypes.array.isRequired,
  userEmail: PropTypes.string.isRequired,
  userPhoto: PropTypes.string,
  sortedFriends: PropTypes.array.isRequired,
  RoomsBar: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  openchat: PropTypes.bool.isRequired,
  input: PropTypes.string.isRequired,
  setInput: PropTypes.func.isRequired,
  handleSend: PropTypes.func.isRequired,
  userImage: PropTypes.object,
  setOpenchat: PropTypes.func.isRequired,
  endOfMessagesRef: PropTypes.object.isRequired,
  defaultProfileImage: PropTypes.string.isRequired,
  formatChatDate: PropTypes.func.isRequired,
  setFriends: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  onToggleInfo: PropTypes.func,
};
