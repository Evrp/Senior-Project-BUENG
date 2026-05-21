import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { db } from '../firebase/firebase';
import RequireLogin from '../components/RequireLogin';
import { FaSearch } from 'react-icons/fa';
import { RiRobot2Fill } from 'react-icons/ri';
import { MdClose } from 'react-icons/md';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  updateDoc,
  query,
  orderBy,
  doc,
} from 'firebase/firestore';

import { useNotifications } from '../context/notificationContext';
import { useTheme } from '../context/themecontext';

import ChatContainerAI from './components/javascript/ChatContainerAI';
import ListUser from './components/javascript/userlist';
import CommunityList from './components/javascript/communitylist';
import ChatPanel from './components/javascript/ChatPanel';
import MatchList from './components/javascript/matchlist';
import ShowTitle from './components/javascript/showtitle';
import ProfileModal from './components/javascript/ProfileModal';

import './components/css/ChatAI.css';
import './css/ListItems.css';
import './css/DropdownMenu.css';
import './css/OnlineStatus.css';

// Helper Functions
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
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

const formatChatDate = (date) => {
  const now = new Date();
  const diffInMs = now - date;
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

  if (diffInDays <= 7) {
    return date.toLocaleString('en-GB', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } else {
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
};

// Child Components
const LoadingIndicator = ({ isDarkMode }) => (
  <div
    className={`main-container ${isDarkMode ? 'dark-mode' : ''}`}
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
    }}
  >
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>⏳</div>
      <p style={{ marginTop: '1rem', color: isDarkMode ? '#fff' : '#333' }}>กำลังโหลด...</p>
    </div>
  </div>
);

LoadingIndicator.propTypes = {
  isDarkMode: PropTypes.bool.isRequired,
};

const ChatSidebar = ({
  openchat,
  searchTerm,
  setSearchTerm,
  sortedFriends,
  lastMessages,
  setOpenchat,
  setActiveUser,
  isOpen,
  setIsOpen,
  setIsGroupChat,
  dropdownRefs,
  getnickName,
  setSelectedTab,
  selectedTab,
  setUserImage,
  setFriends,
  formatOnlineStatus,
  isOpencom,
  setIsOpencom,
  setRoombar,
  openMenuFor,
  setOpenMenuFor,
  isOpenMatch,
  setIsOpenMatch,
  handleProfileClick,
  users,
  userMatchData,
  allEvents,
}) => (
  <div className={`user-container ${openchat ? 'mobile-layout-mode' : ''}`}>
    <div className="chat">
      <h2>Chat</h2>
    </div>
    <div className="search-con">
      <FaSearch className="search-icon" />
      <input
        type="text"
        placeholder="Search"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value.toLowerCase())}
        className="search-input-chat"
      />
    </div>
    <div className="slide-chat">
      <ListUser
        sortedFriends={sortedFriends}
        searchTerm={searchTerm}
        lastMessages={lastMessages}
        setOpenchat={setOpenchat}
        setActiveUser={setActiveUser}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        setIsGroupChat={setIsGroupChat}
        dropdownRefs={dropdownRefs}
        getnickName={getnickName}
        setSelectedTab={setSelectedTab}
        selectedTab={selectedTab}
        setUserImage={setUserImage}
        setFriends={setFriends}
        formatOnlineStatus={formatOnlineStatus}
        users={users}
      />
      <CommunityList
        searchTerm={searchTerm}
        isOpencom={isOpencom}
        setUserImage={setUserImage}
        setIsOpen={setIsOpen}
        setOpenchat={setOpenchat}
        setSelectedTab={setSelectedTab}
        selectedTab={selectedTab}
        setIsOpencom={setIsOpencom}
        setActiveUser={(roomId) => {
          setActiveUser(roomId);
          setIsGroupChat(true);
        }}
        setIsGroupChat={setIsGroupChat}
        dropdownRefs={dropdownRefs}
        getnickName={getnickName}
        setFriends={setFriends}
        setRoombar={setRoombar}
        openMenuFor={openMenuFor}
        setOpenMenuFor={setOpenMenuFor}
        users={users}
        allEvents={allEvents}
      />
      <MatchList
        searchTerm={searchTerm}
        isOpenMatch={isOpenMatch}
        setOpenchat={setOpenchat}
        setSelectedTab={setSelectedTab}
        selectedTab={selectedTab}
        setIsOpenMatch={setIsOpenMatch}
        setActiveUser={setActiveUser}
        handleProfileClick={handleProfileClick}
        setRoombar={setRoombar}
        setIsGroupChat={setIsGroupChat}
        openMenuFor={openMenuFor}
        setOpenMenuFor={setOpenMenuFor}
        dropdownRefs={dropdownRefs}
        getnickName={getnickName}
        setFriends={setFriends}
        setUserImage={setUserImage}
        users={users}
        userMatchData={userMatchData}
      />
    </div>
  </div>
);

ChatSidebar.propTypes = {
  openchat: PropTypes.bool.isRequired,
  searchTerm: PropTypes.string.isRequired,
  setSearchTerm: PropTypes.func.isRequired,
  sortedFriends: PropTypes.array.isRequired,
  lastMessages: PropTypes.object.isRequired,
  setOpenchat: PropTypes.func.isRequired,
  setActiveUser: PropTypes.func.isRequired,
  isOpen: PropTypes.bool.isRequired,
  setIsOpen: PropTypes.func.isRequired,
  setIsGroupChat: PropTypes.func.isRequired,
  dropdownRefs: PropTypes.object.isRequired,
  getnickName: PropTypes.array,
  setSelectedTab: PropTypes.func.isRequired,
  selectedTab: PropTypes.string,
  setUserImage: PropTypes.func.isRequired,
  setFriends: PropTypes.func.isRequired,
  formatOnlineStatus: PropTypes.func.isRequired,
  isOpencom: PropTypes.bool.isRequired,
  setIsOpencom: PropTypes.func.isRequired,
  setRoombar: PropTypes.func.isRequired,
  openMenuFor: PropTypes.string,
  setOpenMenuFor: PropTypes.func.isRequired,
  isOpenMatch: PropTypes.bool.isRequired,
  setIsOpenMatch: PropTypes.func.isRequired,
  handleProfileClick: PropTypes.func.isRequired,
  users: PropTypes.array,
  userMatchData: PropTypes.array,
  allEvents: PropTypes.array,
};

const ChatWindow = ({
  openchat,
  messages,
  userEmail,
  userPhoto,
  userName,
  RoomsBar,
  input,
  isOpencom,
  isOpenMatch,
  setFriends,
  userImage,
  sortedFriends,
  setInput,
  handleSend,
  setOpenchat,
  endOfMessagesRef,
  defaultProfileImage,
  loadingMessages,
  isDefaultRoom,
}) => {
  const [isMobileInfoOpen, setIsMobileInfoOpen] = useState(false);

  useEffect(() => {
    setIsMobileInfoOpen(false);
  }, [RoomsBar?.roomId]);

  return (
    <div className={`bg-chat-con ${openchat ? 'mobile-layout-mode' : ''}`}>
      <ChatPanel
        messages={messages}
        userEmail={userEmail}
        userPhoto={userPhoto}
        userName={userName}
        RoomsBar={RoomsBar}
        input={input}
        isOpencom={isOpencom}
        isOpenMatch={isOpenMatch}
        setFriends={setFriends}
        userImage={userImage}
        sortedFriends={sortedFriends}
        openchat={openchat}
        setInput={setInput}
        handleSend={handleSend}
        setOpenchat={setOpenchat}
        endOfMessagesRef={endOfMessagesRef}
        defaultProfileImage={defaultProfileImage}
        formatChatDate={formatChatDate}
        disabled={isDefaultRoom}
        onToggleInfo={() => setIsMobileInfoOpen((prev) => !prev)}
      />
      <div className={`tabright ${isMobileInfoOpen ? 'mobile-active' : ''}`}>
        {isMobileInfoOpen && (
          <button
            className="close-info-mobile"
            onClick={() => setIsMobileInfoOpen(false)}
            title="ปิดข้อมูล"
          >
            <MdClose />
          </button>
        )}
        <ShowTitle userimage={userImage} openchat={openchat} />
        <ChatContainerAI
          loadingMessages={loadingMessages}
          messages={messages}
          openchat={openchat}
          isAiChatOpen={false} // This ChatContainerAI is embedded, not the modal
          userEmail={userEmail}
          roomId={RoomsBar.roomId} // Pass the current roomId
          defaultProfileImage={defaultProfileImage}
          formatChatDate={formatChatDate}
          endOfMessagesRef={endOfMessagesRef}
          input={input}
          setInput={setInput}
          handleSend={handleSend}
          disabled={isDefaultRoom}
        />
      </div>
    </div>
  );
};

ChatWindow.propTypes = {
  openchat: PropTypes.bool.isRequired,
  messages: PropTypes.array.isRequired,
  userEmail: PropTypes.string,
  userPhoto: PropTypes.string,
  userName: PropTypes.string,
  RoomsBar: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
  input: PropTypes.string.isRequired,
  isOpencom: PropTypes.bool,
  isOpenMatch: PropTypes.bool,
  setFriends: PropTypes.func.isRequired,
  userImage: PropTypes.object,
  sortedFriends: PropTypes.array.isRequired,
  setInput: PropTypes.func.isRequired,
  handleSend: PropTypes.func.isRequired,
  setOpenchat: PropTypes.func.isRequired,
  endOfMessagesRef: PropTypes.object.isRequired,
  defaultProfileImage: PropTypes.string.isRequired,
  loadingMessages: PropTypes.bool,
  isDefaultRoom: PropTypes.bool,
};

const AIChatButtonAndModal = ({
  hasNewAiMessage,
  openAiChat,
  aiNotificationCount,
  isAiChatOpen,
  handleAiModalClick,
  closeAiChat,
  userEmail,
  defaultProfileImage,
}) => (
  <>
    <button
      className={`ai-chat-float-button ${hasNewAiMessage ? 'new-message' : ''}`}
      onClick={openAiChat}
      title="แชทกับ AI Assistant"
    >
      <RiRobot2Fill />
      {aiNotificationCount > 0 && (
        <span className="ai-chat-notification-badge">
          {aiNotificationCount > 9 ? '9+' : aiNotificationCount}
        </span>
      )}
    </button>

    {isAiChatOpen && (
      <div
        className={`ai-chat-overlay ${isAiChatOpen ? 'active' : ''}`}
        onClick={handleAiModalClick}
      >
        <div className="ai-chat-modal">
          <div className="ai-chat-modal-header">
            <h3 className="ai-chat-modal-title">
              <RiRobot2Fill />
              AI Assistant
            </h3>
            <button className="ai-chat-close-btn" onClick={closeAiChat} title="ปิด">
              <MdClose />
            </button>
          </div>
          <div className="ai-chat-modal-content">
            <ChatContainerAI
              openchat={false}
              userEmail={userEmail}
              defaultProfileImage={defaultProfileImage}
            />
          </div>
        </div>
      </div>
    )}
  </>
);

AIChatButtonAndModal.propTypes = {
  hasNewAiMessage: PropTypes.bool.isRequired,
  openAiChat: PropTypes.func.isRequired,
  aiNotificationCount: PropTypes.number.isRequired,
  isAiChatOpen: PropTypes.bool.isRequired,
  handleAiModalClick: PropTypes.func.isRequired,
  closeAiChat: PropTypes.func.isRequired,
  userEmail: PropTypes.string,
  defaultProfileImage: PropTypes.string.isRequired,
};

import { useQuery } from '@tanstack/react-query';
import {
  fetchUsers,
  fetchCurrentUser,
  fetchUserRooms,
  fetchInfoMatch,
  fetchAllRooms,
  fetchEvents,
  fetchInfos,
} from '../lib/queries';
import { useMemo } from 'react';

const Chat = () => {
  const { socket, onlineUsers } = useNotifications();
  const { isDarkMode } = useTheme();
  const [isOpencom, setIsOpencom] = useState(false);
  const { roomId } = useParams();
  const isDefaultRoom = roomId === 'some-default-room';
  const userPhoto = localStorage.getItem('userPhoto');
  const userName = localStorage.getItem('userName');
  const [searchTerm, setSearchTerm] = useState('');
  const [input, setInput] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeUser, setActiveUser] = useState(null);
  const userEmail = localStorage.getItem('userEmail');
  const messagesRef = useMemo(() => collection(db, 'messages'), []);
  const [isOpen, setIsOpen] = useState(false);
  const endOfMessagesRef = useRef(null);
  const isInitialLoad = useRef(true);
  const dropdownRefs = useRef({});
  const processedMessageIds = useRef(new Set());
  const [RoomsBar, setRoomBar] = useState({});
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [lastMessages, setLastMessages] = useState({});
  const [loadingMessages] = useState(false);
  const [isOpenMatch, setIsOpenMatch] = useState(false);
  const [userImage, setUserImage] = useState({});
  const [selectedTab, setSelectedTab] = useState(null);
  const [openchat, setOpenchat] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiNotificationCount, setAiNotificationCount] = useState(0);
  const [hasNewAiMessage, setHasNewAiMessage] = useState(false);
  const displayName = localStorage.getItem('userName');
  const photoURL = localStorage.getItem('userPhoto');
  const defaultProfileImage = 'https://cdn.pixabay.com/photo/2023/02/18/11/00/icon-7797704_640.png';

  // React Query Data Fetching
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const { data: currentUser, isLoading: isLoadingCurrentUser } = useQuery({
    queryKey: ['currentUser', userEmail],
    queryFn: () => fetchCurrentUser(userEmail),
    enabled: !!userEmail,
  });

  const { isLoading: isLoadingCommunityData } = useQuery({
    queryKey: ['userRooms', userEmail],
    queryFn: () => fetchUserRooms(userEmail),
    enabled: !!userEmail,
  });

  const { data: userMatchData = [], isLoading: isLoadingUserMatchData } = useQuery({
    queryKey: ['infoMatch'],
    queryFn: fetchInfoMatch,
  });

  const { data: allRooms = [], isLoading: isLoadingAllRooms } = useQuery({
    queryKey: ['allRooms'],
    queryFn: fetchAllRooms,
  });

  const { data: allEvents = [], isLoading: isLoadingAllEvents } = useQuery({
    queryKey: ['events', userEmail],
    queryFn: () => fetchEvents(userEmail),
    enabled: !!userEmail,
  });

  const { data: infos = [], isLoading: isLoadingInfos } = useQuery({
    queryKey: ['infos'],
    queryFn: fetchInfos,
  });

  const [friends, setFriends] = useState([]);

  const isLoading =
    isLoadingUsers ||
    isLoadingCurrentUser ||
    isLoadingCommunityData ||
    isLoadingUserMatchData ||
    isLoadingAllRooms ||
    isLoadingAllEvents ||
    isLoadingInfos;
  // Derived state for friends list

  const processedFriends = useMemo(() => {
    if (currentUser && Array.isArray(currentUser) && users.length > 0) {
      const friendEmails = currentUser.map((f) => f.email);
      return users
        .filter((user) => friendEmails.includes(user.email))
        .map((user) => {
          const userInfo = infos.find((info) => info.email === user.email);
          return {
            photoURL: user.photoURL,
            email: user.email,
            displayName: user.displayName,
            nickname: userInfo?.nickname,
            _id: user._id,
            isOnline: user.isOnline || false,
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    return [];
  }, [currentUser, users, infos]);

  useEffect(() => {
    if (processedFriends && processedFriends.length > 0) {
      setFriends(processedFriends);
    }
  }, [processedFriends]);

  // Handle direct navigation via URL /chat/:roomId (e.g. from join-community)
  const communityInitRef = useRef(null);
  useEffect(() => {
    if (!roomId || isDefaultRoom || !allRooms || allRooms.length === 0) return;
    // Only initialize once per roomId
    if (communityInitRef.current === roomId) return;

    // Check if the roomId belongs to a community room
    const communityRoom = allRooms.find((r) => r._id === roomId);
    if (communityRoom) {
      communityInitRef.current = roomId;
      setIsGroupChat(true);
      setActiveUser(communityRoom.name);
      setSelectedTab(communityRoom.name);
      setRoomBar({ roomImage: communityRoom.image, roomName: communityRoom.name, roomId: communityRoom._id });
      setUserImage(communityRoom);
      setIsOpencom(true);
      setOpenchat(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, allRooms]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleProfileClick = (user) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const scrollToBottom = (behavior = 'smooth') => {
    if (endOfMessagesRef.current) {
      endOfMessagesRef.current.scrollIntoView({ behavior });
    }
  };

  const openAiChat = () => {
    setIsAiChatOpen(true);
    setAiNotificationCount(0);
    setHasNewAiMessage(false);
    if (window.navigator?.vibrate) {
      window.navigator.vibrate(50);
    }
  };

  const closeAiChat = () => {
    setIsAiChatOpen(false);
    if (window.navigator?.vibrate) {
      window.navigator.vibrate([30, 50, 30]);
    }
  };

  const handleAiModalClick = (e) => {
    if (e.target.classList.contains('ai-chat-overlay')) {
      closeAiChat();
    }
  };

  useEffect(() => {
    const handleEscKey = (e) => {
      if (e.key === 'Escape' && isAiChatOpen) {
        closeAiChat();
      }
    };
    document.addEventListener('keydown', handleEscKey);
    return () => document.removeEventListener('keydown', handleEscKey);
  }, [isAiChatOpen]);

  useEffect(() => {
    if (!isAiChatOpen) {
      const interval = setInterval(() => {
        const shouldShowNotification = Math.random() > 0.8;
        if (shouldShowNotification) {
          setAiNotificationCount((prev) => prev + 1);
          setHasNewAiMessage(true);
        }
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isAiChatOpen]);

  const handleSend = async () => {
    if (input.trim() === '') return;
    if (!isGroupChat && !selectedUser && !activeUser) {
      console.warn('ไม่สามารถส่งข้อความได้: ไม่มีผู้รับที่ระบุ');
      return;
    }

    const messageData = {
      sender: userEmail,
      receiver: null, // Default to null
      content: input,
      timestamp: serverTimestamp(),
      roomId: roomId || 'direct',
      isSeen: false,
    };

    if (isGroupChat === true) {
      messageData.type = 'group';
    } else if (selectedUser && selectedUser.email) {
      messageData.receiver = selectedUser.email;
    } else if (activeUser) {
      messageData.receiver = typeof activeUser === 'string' ? activeUser : activeUser.email;
    } else {
      console.error('ไม่สามารถส่งข้อความได้: ไม่มีผู้รับ');
      return;
    }

    try {
      await addDoc(messagesRef, messageData);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const setRoombar = (roomImage, roomName, targetRoomId) => {
    setRoomBar({ roomImage, roomName, roomId: targetRoomId || roomId }); // Store roomId as well
  };

  useEffect(() => {
    if (!userEmail) return;

    socket.emit('user-online', { displayName, photoURL, email: userEmail });

    const pingInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('user-ping', { email: userEmail });
      }
    }, 30000);

    socket.on('update-users', (_data) => {
      // Note: This is a side-effect that is hard to manage with React Query
      // For now, we will leave this as is, but a better solution would be
      // to use the queryClient to update the user data in the cache.
    });

    socket.on('user-offline', (_userData) => {
      // Similar to above, this should ideally update the cache
    });

    socket.on('user-online', (_userData) => {
      // Similar to above, this should ideally update the cache
    });

    socket.on('connect', () => {
      socket.emit('user-online', { displayName, photoURL, email: userEmail });
    });

    return () => {
      socket.emit('user-offline', { email: userEmail });
      socket.off('update-users');
      socket.off('user-offline');
      socket.off('user-online');
      socket.off('connect');
      clearInterval(pingInterval);
    };
  }, [userEmail, displayName, photoURL, socket]);

  useEffect(() => {
    if (!roomId) return;
    setMessages([]); // Clear messages to prevent ghost content during switch
    isInitialLoad.current = true; // Reset initial load state
    processedMessageIds.current.clear(); // Clear lock cache on room change

    // Determine if this is a group chat by checking allRooms directly
    // This avoids timing issues with isGroupChat state
    const isCommunityRoom = allRooms?.some((r) => r._id === roomId);
    const isGroup = isGroupChat || isCommunityRoom;

    const q = query(messagesRef, orderBy('timestamp'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMessages = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((msg) => msg.roomId === roomId);

      const filteredMessages = isGroup
        ? allMessages.filter((msg) => msg.type === 'group' && msg.roomId === roomId)
        : allMessages.filter((msg) => {
            const isMyMsg = msg.sender === userEmail && msg.receiver === activeUser;
            const isTheirMsg =
              msg.sender === activeUser && (msg.receiver === userEmail || !msg.receiver);
            return isMyMsg || isTheirMsg;
          });

      setMessages(filteredMessages);

      // Mark unread messages as seen with memory lock
      filteredMessages.forEach(async (msg) => {
        if (
          !msg.isSeen &&
          msg.sender !== userEmail &&
          (!msg.receiver || msg.receiver === userEmail) &&
          !processedMessageIds.current.has(msg.id)
        ) {
          processedMessageIds.current.add(msg.id);
          try {
            await updateDoc(doc(db, 'messages', msg.id), { isSeen: true });
          } catch (err) {
            console.error('Error marking message as seen:', err);
            processedMessageIds.current.delete(msg.id); // Try again on error
          }
        }
      });
    });

    return () => unsubscribe();
  }, [roomId, userEmail, isGroupChat, activeUser, messagesRef, allRooms]);

  useEffect(() => {
    if (messages.length > 0) {
      // Use 'auto' (instant) for initial load to prevent sliding effect
      const behavior = isInitialLoad.current ? 'auto' : 'smooth';
      scrollToBottom(behavior);
      isInitialLoad.current = false;
    }
  }, [messages]);

  useEffect(() => {
    if (!userEmail) return;
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const latest = {};
      newMessages.forEach((msg) => {
        const otherEmail = msg.sender === userEmail ? msg.receiver : msg.sender;
        if (
          (msg.sender === userEmail || msg.receiver === userEmail || msg.receiver === null) &&
          !latest[otherEmail]
        ) {
          latest[otherEmail] = msg;
        }
      });
      setLastMessages(latest);
    });
    return () => unsubscribe();
  }, [userEmail]);

  const isOnline = (email) => email && onlineUsers && onlineUsers[email]?.online;
  const formatOnlineStatus = (user) => {
    if (!user || !user.email) return '';
    if (isOnline(user.email)) return 'ออนไลน์';
    if (onlineUsers[user.email]?.lastActive) {
      return `ออฟไลน์ - ${formatRelativeTime(new Date(onlineUsers[user.email].lastActive))}`;
    }
    return 'ออฟไลน์';
  };
  const friendsWithOnlineStatus = friends.map((friend) => ({
    ...friend,
    isOnline: isOnline(friend?.email),
    lastSeen: onlineUsers[friend?.email]?.lastActive,
  }));

  const sortedFriends = [...friendsWithOnlineStatus].sort((a, b) => {
    if (a?.email && b?.email) {
      if (isOnline(a.email) && !isOnline(b.email)) return -1;
      if (!isOnline(a.email) && isOnline(b.email)) return 1;
      const timeA = lastMessages[a.email]?.timestamp?.toDate()?.getTime() || 0;
      const timeB = lastMessages[b.email]?.timestamp?.toDate()?.getTime() || 0;
      return timeB - timeA;
    }
    return 0;
  });

  if (isLoading) {
    return <LoadingIndicator isDarkMode={isDarkMode} />;
  }

  return (
    <RequireLogin>
      <div className={`main-container ${isDarkMode ? 'dark-mode' : ''}`}>
        <ChatSidebar
          openchat={openchat}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          sortedFriends={sortedFriends}
          lastMessages={lastMessages}
          setOpenchat={setOpenchat}
          setActiveUser={setActiveUser}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          setIsGroupChat={setIsGroupChat}
          dropdownRefs={dropdownRefs}
          getnickName={infos}
          setSelectedTab={setSelectedTab}
          selectedTab={selectedTab}
          setUserImage={setUserImage}
          setFriends={setFriends}
          formatOnlineStatus={formatOnlineStatus}
          isOpencom={isOpencom}
          setIsOpencom={setIsOpencom}
          setRoombar={setRoombar}
          openMenuFor={openMenuFor}
          setOpenMenuFor={setOpenMenuFor}
          userMatchData={userMatchData}
          allEvents={Array.isArray(allEvents) ? allEvents : []}
          users={users}
          isOpenMatch={isOpenMatch}
          setIsOpenMatch={setIsOpenMatch}
          handleProfileClick={handleProfileClick}
        />
        <ChatWindow
          openchat={openchat}
          messages={messages}
          userEmail={userEmail}
          userPhoto={userPhoto}
          userName={userName}
          RoomsBar={RoomsBar}
          input={input}
          isOpencom={isOpencom}
          isOpenMatch={isOpenMatch}
          setFriends={setFriends}
          userImage={userImage}
          sortedFriends={sortedFriends}
          setInput={setInput}
          handleSend={handleSend}
          setOpenchat={setOpenchat}
          endOfMessagesRef={endOfMessagesRef}
          defaultProfileImage={defaultProfileImage}
          loadingMessages={loadingMessages}
          isDefaultRoom={isDefaultRoom}
        />
        {isModalOpen && selectedUser && (
          <ProfileModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            user={selectedUser}
            userImage={selectedUser}
            users={users}
            isCom={false}
          />
        )}
      </div>
      <AIChatButtonAndModal
        hasNewAiMessage={hasNewAiMessage}
        openAiChat={openAiChat}
        aiNotificationCount={aiNotificationCount}
        isAiChatOpen={isAiChatOpen}
        handleAiModalClick={handleAiModalClick}
        closeAiChat={closeAiChat}
        userEmail={userEmail}
        defaultProfileImage={defaultProfileImage}
      />
    </RequireLogin>
  );
};

export default Chat;
