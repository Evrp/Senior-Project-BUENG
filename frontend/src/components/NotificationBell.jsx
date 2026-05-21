import { useRef, useEffect } from "react";
import { useNotifications } from "../context/notificationContext";
import "./NotificationBell.css";

const NotificationBell = () => {
  const { 
    notifications, 
    showNotificationDropdown, 
    toggleNotificationDropdown,
    markNotificationAsRead,
    clearReadNotifications,
    handleFriendRequestResponse,
    handleDeleteFriendRequest,
    handleRoomInviteResponse
  } = useNotifications();

  const notificationDropdownRef = useRef(null);
  const bellButtonRef = useRef(null);

  // Close the notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showNotificationDropdown &&
        notificationDropdownRef.current &&
        !notificationDropdownRef.current.contains(event.target) &&
        bellButtonRef.current &&
        !bellButtonRef.current.contains(event.target)
      ) {
        toggleNotificationDropdown(false);
      }
    };

    const handleScroll = () => {
      if (showNotificationDropdown) {
        toggleNotificationDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [showNotificationDropdown, toggleNotificationDropdown]);

  // ตรวจสอบว่าเป็นเพื่อนกันหรือไม่
  const isFriend = (email) => {
    // ในกรณีจริงควรตรวจสอบจาก API หรือ state แต่ในตัวอย่างนี้จะใช้วิธีง่ายๆ
    // อาจต้องปรับให้เหมาะกับ logic ของคุณ
    const friends = JSON.parse(localStorage.getItem("friends") || "[]");
    return friends.some(friend => friend.email === email);
  };

  return (
    <div className="notification-container">
      <button
        ref={bellButtonRef}
        className="bell-btn"
        aria-label="Notifications"
        onClick={() => toggleNotificationDropdown()}
      >
        <span className="bell-icon">&#128276;</span>
        {notifications.filter((n) => !n.read).length > 0 && (
          <span className="notification-badge">
            {notifications.filter((n) => !n.read).length}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {showNotificationDropdown && (
        <div
          className="notification-dropdown"
          ref={notificationDropdownRef}
        >
          <div className="notification-header">
            <h3 className="notification-title">การแจ้งเตือน</h3>
            <button
              className="mark-all-read"
              onClick={clearReadNotifications}
            >
              ล้างที่อ่านแล้ว
            </button>
          </div>

          {notifications && notifications.length > 0 ? (
            <>
              <ul className="notification-list">
                {/* 1. Grouped Match Notification (Summary) */}
                {notifications.filter(n => n.type === "match" && !n.read).length > 0 && (
                  <li className="notification-item unread summary-match">
                    <div className="notification-content">
                      <div className="notification-icon-wrapper">
                        <div className="match-noti-icon summary">🔥</div>
                      </div>
                      <div className="notification-details">
                        <p className="notification-message">
                          <strong>ยินดีด้วย!</strong> มี {notifications.filter(n => n.type === "match" && !n.read).length} คนที่สนใจแมตช์กับคุณ
                        </p>
                      </div>
                    </div>
                  </li>
                )}

                {/* 2. Friend Request and Room Invite Notifications (Individual) */}
                {notifications.map((notif) => {
                  if (notif.type !== "friend-request" && notif.type !== "room-invite") return null;

                  if (notif.type === "room-invite") {
                    return (
                      <li
                        key={notif.id}
                        data-notification-id={notif.id}
                        className={`notification-item unread`}
                      >
                        <div className="notification-content">
                          <div className="notification-icon-wrapper">
                            <div className="room-invite-icon" style={{ fontSize: "1.3rem", display: "flex", alignItems: "center", justifyContent: "center", width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(99, 102, 241, 0.1)" }}>✉️</div>
                          </div>
                          <div className="notification-details">
                            <p className="notification-message" style={{ margin: 0, fontSize: "0.9rem" }}>
                              <strong>{notif.senderNickname || notif.senderEmail}</strong> เชิญคุณเข้าห้อง <strong>{notif.roomName}</strong>
                            </p>
                            <span className="notification-time" style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                              {new Date(notif.timestamp).toLocaleString("th-TH")}
                            </span>
                            
                            <div className="notification-actions" style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                              <button
                                className="notification-button accept"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleRoomInviteResponse(notif.id, "accept");
                                }}
                              >
                                ยอมรับ
                              </button>
                              <button
                                className="notification-button reject"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleRoomInviteResponse(notif.id, "reject");
                                }}
                              >
                                ปฏิเสธ
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={notif.id}
                      data-notification-id={notif.id}
                      className={`notification-item ${notif.read ? "read" : "unread"}`}
                    >
                      <div className="notification-content" onClick={() => markNotificationAsRead(notif.id)}>
                        <div className="notification-icon-wrapper">
                          <img
                            src={
                              notif.from?.photoURL ||
                              "https://via.placeholder.com/40"
                            }
                            alt={notif.from?.displayName || "ผู้ใช้"}
                            className="notification-avatar"
                          />
                        </div>
                        <div className="notification-details">
                          <p className="notification-message">
                            <strong>{notif.from?.displayName || "ผู้ใช้"}</strong>{" "}
                            {isFriend(notif.from?.email) ? "เป็นเพื่อนกันแล้ว" : "ส่งคำขอเป็นเพื่อน"}
                          </p>
                          <span className="notification-time">
                            {new Date(notif.timestamp).toLocaleString("th-TH")}
                          </span>
                          
                          {!isFriend(notif.from?.email) && (
                            <div className="notification-actions">
                              <button
                                className="notification-button accept"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleFriendRequestResponse(notif.id, "accept");
                                }}
                              >
                                ยอมรับ
                              </button>
                              <button
                                className="notification-button reject"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFriendRequest(notif.id);
                                }}
                              >
                                ปฏิเสธ
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="no-notifications">ไม่มีการแจ้งเตือนใหม่</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
