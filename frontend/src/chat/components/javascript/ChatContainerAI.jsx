import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MdSend, MdLightbulbOutline, MdAutoAwesome } from 'react-icons/md';
import { RiRobot2Fill } from 'react-icons/ri';
import api from '../../../server/api';
import { toast } from 'react-toastify';
import UserAvatar from '../../../components/UserAvatar';
import { fetchUserPhotos } from '../../../lib/queries';
import '../css/ChatAI.css';
import PropTypes from 'prop-types';

// Helper function to fetch AI chat history
const fetchAiChatHistory = async (roomId) => {
  if (!roomId) return [];
  try {
    const { data } = await api.get(`/api/aichat/${roomId}`);
    return data.data || [];
  } catch (error) {
    console.error('Error fetching AI chat history:', error);
    return [];
  }
};

const ChatContainerAI = ({ isAiChatOpen, defaultProfileImage, roomId, disabled, userEmail }) => {
  const [input, setInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const endOfMessagesRef = useRef(null);
  const inputRef = useRef(null);
  const isInitialLoad = useRef(true);
  const queryClient = useQueryClient();
  const aiProfileImage = 'https://cdn-icons-png.flaticon.com/512/10829/10829273.png';

  // Query the current user's profile photos to get the main picture
  const { data: photoUsers = [] } = useQuery({
    queryKey: ['userPhotos', userEmail],
    queryFn: () => fetchUserPhotos(userEmail),
    enabled: !!userEmail,
  });

  // Use the provided roomId, or fallback to a user-specific global AI room ID
  const activeRoomId = roomId || (userEmail ? `ai-global-${userEmail}` : null);

  // Fetch chat history using React Query
  const { data: messages = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['aiChat', activeRoomId],
    queryFn: () => fetchAiChatHistory(activeRoomId),
    enabled: !!activeRoomId, // Only run query if activeRoomId exists
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Focus input field when component mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    isInitialLoad.current = true;
  }, [activeRoomId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const behavior = isInitialLoad.current ? 'auto' : 'smooth';
      endOfMessagesRef.current?.scrollIntoView({ behavior });
      isInitialLoad.current = false;
    }
  }, [messages]);

  // Format date to display in chat
  const formatMessageDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  };

  const mutation = useMutation({
    mutationFn: async ({ content, history }) => {
      // Use the unified endpoint that handles context, generation, and saving
      const { data } = await api.post(`/api/aichat/${activeRoomId}`, { content, history });
      return data.data; // Returns the saved AI message
    },
    onSuccess: (aiMessage) => {
      // Update cache with the real AI response
      queryClient.setQueryData(['aiChat', activeRoomId], (oldData = []) => [...oldData, aiMessage]);
    },
    onError: (error) => {
      console.error('Error sending message to AI:', error);
      // Optionally show a toast notification
    },
  });

  const handleSend = async () => {
    if (!input.trim()) return;

    const userInput = input;
    setInput(''); // Clear input immediately

    // Optimistically add user's message
    const userMessage = {
      _id: `temp-${Date.now()}`,
      roomId: activeRoomId,
      sender: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
    };

    queryClient.setQueryData(['aiChat', activeRoomId], (oldData = []) => [...oldData, userMessage]);

    setIsAiThinking(true);

    try {
      // Prepare history for context (limit to last few messages if needed, but backend handles it too)
      const history = messages.map((msg) => ({
        role: msg.sender === 'ai' ? 'assistant' : 'user',
        content: msg.content,
      })).filter((msg) => msg.content && typeof msg.content === 'string' && msg.content.trim() !== '');

      await mutation.mutateAsync({ content: userInput, history });
    } catch (error) {
      console.error('Failed to get AI response:', error);
      // Optionally, remove the optimistic update or show an error message in the chat
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleDailyRecommend = async () => {
    if (isAiThinking) return;
    setIsAiThinking(true);
    try {
      const { data } = await api.post('/api/aichat/daily-recommendation');
      const recs = data.data.recommendations;
      
      // Format the recommendation as a message
      const formattedContent = "📅 **กิจกรรมแนะนำประจำวัน (Daily Picks)**\n\n" + 
        recs.map((r, idx) => `${idx + 1}. **${r.title}**\n   ${r.reason}`).join('\n\n');

      // Add as a local AI message (ephemeral or we could save it if we want)
      const aiMsg = {
        _id: `daily-${Date.now()}`,
        roomId: activeRoomId,
        sender: 'ai',
        content: formattedContent,
        timestamp: new Date().toISOString(),
      };
      
      queryClient.setQueryData(['aiChat', activeRoomId], (oldData = []) => [...oldData, aiMsg]);
    } catch (error) {
      console.error("Failed to fetch recommendations", error);
      toast.error("ไม่สามารถดึงข้อมูลแนะนำได้ในขณะนี้ กรุณาลองใหม่ภายหลัง");
    } finally {
      setIsAiThinking(false);
    }
  };

  const handlePromptClick = (promptText) => {
    setInput(promptText);
    // Focus the input field after setting the text
    inputRef.current?.focus();
  };

  // Prompt ตัวอย่าง
  const examplePrompts = [
    'แนะนำกิจกรรมน่าสนใจหน่อย',
    'วิธีหาเพื่อนใหม่ทำยังไง?',
    'แอพนี้ใช้งานยังไง?',
  ];

  return (
    <div className={`chat-container-ai ${isAiChatOpen ? 'mobile-active' : ''}`}>
      {!isAiChatOpen && (
        <div className="header-chat-ai">
          <div className="chat-header">
            <h1>
              <RiRobot2Fill /> AI Assistant
              <span className="ai-status">Online</span>
            </h1>
          </div>
        </div>
      )}
      <div className="chat-box-ai">
        {isLoadingHistory && messages.length === 0 && (
          <div className="empty-list">
            <RiRobot2Fill size={36} />
            <span>เริ่มต้นสนทนากับ AI Assistant</span>
            <p>ถามเกี่ยวกับแอพ กิจกรรม หรือการค้นหาเพื่อนที่มีความสนใจเดียวกันได้เลย</p>
          </div>
        )}
        {messages.map((msg) => {
          const isAI = msg.sender === 'ai';
          return (
            <div key={msg._id} className={`chat-message ${isAI ? 'other-message' : 'my-message'}`}>
              {isAI ? (
                <UserAvatar src={aiProfileImage} alt="AI" className="message-avatar" />
              ) : (
                <UserAvatar src={photoUsers.length > 0 ? photoUsers[0].url : (localStorage.getItem('userPhoto') || defaultProfileImage)} alt="User" className="message-avatar" />
              )}
              <div className={`message-content ${isAI ? 'other' : 'current'}`}>
                <div className="colum-message">
                  {isAI && <div className="message-sender">AI Assistant</div>}
                  <div className={`message-bubble ${isAI ? 'other' : 'current'}`}>
                    {msg.content}
                  </div>
                  {msg.timestamp && (
                    <div className="message-time">{formatMessageDate(msg.timestamp)}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {(isAiThinking || mutation.isPending) && (
          <div className="chat-message other-message">
            <UserAvatar src={aiProfileImage} alt="AI" className="message-avatar" />
            <div className="message-content other">
              <div className="colum-message">
                <div className="message-bubble other">
                  <div className="thinking">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>
      
      {/* Daily Recommendation Button */}
      <div className="ai-actions-bar">
        <button className="action-chip" onClick={handleDailyRecommend} disabled={isAiThinking || disabled}>
          <MdAutoAwesome /> Daily Picks
        </button>
      </div>
      {messages.length === 0 && !isLoadingHistory && (
        <div className="prompt-suggestions">
          {examplePrompts.map((prompt, i) => (
            <button key={i} className="prompt-chip" onClick={() => handlePromptClick(prompt)}>
              <MdLightbulbOutline size={16} />
              {prompt}
            </button>
          ))}
        </div>
      )}
      <div className="chat-input-container-ai">
        <div className="chat-border">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              disabled
                ? 'กรุณาเลือกห้องแชท'
                : isAiThinking || mutation.isPending
                  ? 'กำลังรอคำตอบ...'
                  : 'พิมพ์คำถามของคุณ...'
            }
            disabled={isAiThinking || mutation.isPending || !activeRoomId || disabled}
            className="chat-input-ai"
            style={{
              cursor:
                isAiThinking || mutation.isPending || !activeRoomId || disabled ? 'not-allowed' : 'text',
            }}
            // disabled={mutation.isPending || !activeRoomId}
          />
          <button
            onClick={handleSend}
            className="chat-send-button"
            disabled={isAiThinking || mutation.isPending || !input.trim() || !activeRoomId || disabled}
          >
            <MdSend /> ส่ง
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatContainerAI;

ChatContainerAI.propTypes = {
  openchat: PropTypes.bool,
  isAiChatOpen: PropTypes.bool,
  userEmail: PropTypes.string,
  defaultProfileImage: PropTypes.string,
  roomId: PropTypes.string,
  disabled: PropTypes.bool,
};
