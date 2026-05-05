import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../server/api';
import './Eventlist.css';
import { useTheme } from '../../context/themecontext';
// import { useSocket } from '../../context/make.com'; // Removed for direct flow
import { MdFavorite, MdFavoriteBorder, MdStar } from 'react-icons/md';
import { FiCalendar, FiX, FiMapPin } from 'react-icons/fi';
import { TbFileDescription, TbTicket } from 'react-icons/tb';
import { toast } from 'react-toastify';
import PropTypes from 'prop-types';
import SocialProof from './SocialProof';

// Helper function to fetch events
const fetchEvents = async (email) => {
  try {
    const res = await api.get(`/api/events/${encodeURIComponent(email)}`, {
      params: { limit: 100 },
    });
    return res.data.events || []; // Assuming res.data is { events: [], ... }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      toast.success('ไม่มีกิจกรรมในขณะนี้');
      return []; // Return empty array on 404
    }
    toast.error('เกิดข้อผิดพลาดในการโหลดกิจกรรม');
    throw new Error(error.response?.data?.message || error.message); // Re-throw for React Query to handle
  }
};

// Helper function to fetch favorite events
const fetchFavoriteEvents = async (email) => {
  const res = await api.get(`/api/likes/${email}`);
  return Array.isArray(res.data) ? res.data.map((like) => like.eventId) : [];
};

// Helper function to fetch matched events ids
const fetchMatchedEventIds = async (email) => {
  try {
    const res = await api.get(`/api/infomatch/matched-events/${email}`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    console.error('Failed to fetch matched events', error);
    return [];
  }
};

// Moved EventListContent outside of EventList to prevent re-mounting on re-renders.
const EventListContent = ({
  isDarkMode,
  events,
  favoriteEvents,
  matchedEventIds,
  filterType,
  setFilterType,
  handleUnlike,
  handleLike,
  handleDelete,
  handleDeleteAll,
}) => {
  const filteredEvents = (Array.isArray(events) ? events : []).filter((event) => {
    if (filterType === 'liked') {
      return favoriteEvents.includes(event._id) && !matchedEventIds.includes(event._id);
    } else if (filterType === 'matched') {
      return favoriteEvents.includes(event._id) && matchedEventIds.includes(event._id);
    }
    return true; // 'all'
  });

  return (
    <div className={`event-container ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Filter Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setFilterType('all')}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: '1px solid #ccc',
            background: filterType === 'all' ? '#000' : 'transparent',
            color: filterType === 'all' ? '#fff' : 'inherit',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          ทั้งหมด
        </button>
        <button
          onClick={() => setFilterType('liked')}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: '1px solid #ccc',
            background: filterType === 'liked' ? '#000' : 'transparent',
            color: filterType === 'liked' ? '#fff' : 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 'bold',
          }}
        >
          <MdFavoriteBorder size={18} /> ถูกใจ
        </button>
        <button
          onClick={() => setFilterType('matched')}
          style={{
            padding: '8px 16px',
            borderRadius: '20px',
            border: '1px solid #ccc',
            background: filterType === 'matched' ? '#ff4b4b' : 'transparent',
            color: filterType === 'matched' ? '#fff' : 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 'bold',
          }}
        >
          <MdFavorite size={18} color={filterType === 'matched' ? '#fff' : '#ff4b4b'} /> Match
        </button>
      </div>

      {filteredEvents.length === 0 ? ( // Fixed bug: was events.length < 0
        <div className="eventlist-empty-loading">
          <div className="eventlist-empty-text">ไม่พบกิจกรรมในหมวดหมู่นี้</div>
        </div>
      ) : (
        <div className="event-list">
          {filteredEvents.map((event) => (
            <div key={event._id} className="event-card">
              <img
                className="event-image"
                src={event.image || event.thumbnail}
                alt={event.title}
                width="200"
                loading="lazy"
              />
              {/* Match Compatibility Badge */}
              {event.matchScore > 0 && (
                <div className="match-badge" title={event.matchReason}>
                  <div className="match-badge-content">
                    <span className="match-percent">{event.matchScore}%</span>
                    <span className="match-text">Match</span>
                  </div>
                </div>
              )}
              {/* Social Proof: Show friends who liked this event */}
              {localStorage.getItem('userEmail') && (
                <SocialProof eventId={event._id} email={localStorage.getItem('userEmail')} />
              )}
              <div className="row-favorite">
                <h3 className="event-name">{event.title}</h3>
                <button
                  className="favorite-button"
                  onClick={() => {
                    const isFav = favoriteEvents.includes(event._id);
                    if (isFav) {
                      handleUnlike(event._id);
                    } else {
                      handleLike(event._id);
                    }
                  }}
                  aria-label={favoriteEvents.includes(event._id) ? 'Unfavorite' : 'Favorite'}
                >
                  {favoriteEvents.includes(event._id) ? (
                    <MdFavorite size={30} color="red" />
                  ) : (
                    <MdFavoriteBorder size={30} />
                  )}
                </button>
              </div>
              <div className="event-info">
                {event.date && (
                  <p className="event-date" style={{ marginBottom: '0.5rem' }}>
                    <FiCalendar style={{ marginRight: '0.5rem', verticalAlign: 'text-bottom' }} />
                    {event.date?.when
                      ? event.date.when
                      : !isNaN(new Date(event.date).getTime())
                        ? new Date(event.date).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : 'N/A'}
                  </p>
                )}
                {(event.venue || (event.address && event.address.length > 0)) && (
                  <div
                    className="event-venue"
                    style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start' }}
                  >
                    <FiMapPin style={{ marginRight: '0.5rem', marginTop: '4px', flexShrink: 0 }} />
                    <div>
                      {event.venue && (
                        <div style={{ fontWeight: 'bold' }}>
                          {event.venue.link ? (
                            <a
                              href={event.venue.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'inherit', textDecoration: 'none' }}
                            >
                              {event.venue.name}
                            </a>
                          ) : (
                            event.venue.name
                          )}
                          {event.venue.rating && (
                            <span
                              style={{ marginLeft: '0.5rem', fontSize: '0.9em', color: '#f5c518' }}
                            >
                              <MdStar style={{ verticalAlign: 'text-bottom' }} />{' '}
                              {event.venue.rating}
                              {event.venue.reviews ? ` (${event.venue.reviews})` : ''}
                            </span>
                          )}
                        </div>
                      )}
                      {event.address && (
                        <div style={{ fontSize: '0.9em', opacity: 0.8 }}>
                          {Array.isArray(event.address) ? event.address.join(', ') : event.address}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {event.event_location_map?.image && (
                  <div className="event-map-snapshot" style={{ marginBottom: '0.5rem' }}>
                    <a
                      href={event.event_location_map.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {/* <img
                      src={event.event_location_map.image}
                      alt="Map"
                      style={{ width: "100%", borderRadius: "8px", border: "1px solid #ddd", maxHeight: "150px", objectFit: "cover" }}
                      loading="lazy"
                    /> */}
                    </a>
                  </div>
                )}
                {event.ticket_info && event.ticket_info.length > 0 && (
                  <div
                    className="event-tickets"
                    style={{
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <TbTicket />
                    <span className="category-label">Tickets:</span>
                    {event.ticket_info.map((ticket, idx) => (
                      <a
                        key={idx}
                        href={ticket.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="genre-border"
                        style={{ textDecoration: 'none', cursor: 'pointer' }}
                      >
                        {ticket.source || 'Buy'}
                      </a>
                    ))}
                  </div>
                )}
                <div>
                  <span className="category-label">Category:</span>
                  {(event.genre ? Object.values(event.genre) : [])
                    .flat()
                    .map((subcategory, index) => (
                      <span key={index} className="genre-border">
                        {subcategory}
                      </span>
                    ))}
                </div>
              </div>
              <div className="event-description">
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <TbFileDescription style={{ marginRight: '0.5rem' }} />
                  <span className="category-label">Description:</span>
                </div>
                <p style={{ margin: 0 }}>{event.description || 'No description available.'}</p>
              </div>
              <div className="bottom-event">
                <a
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="event-link"
                >
                  Info more
                </a>
                <button onClick={() => handleDelete(event._id)} className="delete-button">
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
          <div className="btn-delete-all">
            <button
              onClick={handleDeleteAll}
              className="delete-button-all"
              title="ลบกิจกรรมทั้งหมด"
            >
              <span role="img" aria-label="delete">
                🗑️
              </span>{' '}
              Delete all
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const SkeletonCard = () => (
  <div className="event-card">
    <div className="skeleton skeleton-image" />
    <div className="skeleton skeleton-title" />
    <div className="event-info">
      <div className="skeleton skeleton-text" />
      <div className="skeleton skeleton-text short" />
    </div>
    <div className="event-description">
      <div className="skeleton skeleton-text" />
      <div className="skeleton skeleton-text" />
      <div className="skeleton skeleton-text" />
    </div>
    <div className="bottom-event">
      <div className="skeleton skeleton-button" />
      <div className="skeleton skeleton-button" />
    </div>
  </div>
);

const EventList = ({ waiting }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const email = localStorage.getItem('userEmail');
  const { isDarkMode } = useTheme();
  // const socket = useSocket(); // Removed for direct flow
  const queryClient = useQueryClient();

  const {
    data: events = [],
    isLoading: isLoadingEvents,
    isError: isErrorEvents,
  } = useQuery({
    queryKey: ['events', email],
    queryFn: () => fetchEvents(email),
    enabled: !!email,
    staleTime: 1000 * 60 * 2,
  });

  const { data: favoriteEvents = [] } = useQuery({
    queryKey: ['favorites', email],
    queryFn: () => fetchFavoriteEvents(email),
    enabled: !!email,
    staleTime: 1000 * 60 * 2,
  });

  const { data: matchedEventIds = [] } = useQuery({
    queryKey: ['matchedEvents', email],
    queryFn: () => fetchMatchedEventIds(email),
    enabled: !!email,
    staleTime: 1000 * 60 * 2,
  });

  const [filterType, setFilterType] = useState('all');

  // Socket listener removed as per direct API response refactor
  // -----------------------------------------------------------
  // useEffect(() => {
  //   if (!socket) return;
  //
  //   const handleEventsUpdated = () => {
  //     setWaiting(false);
  //     queryClient.invalidateQueries({ queryKey: ["events", email] });
  //   };
  //
  //   socket.on("events_updated", handleEventsUpdated);
  //
  //   return () => {
  //     socket.off("events_updated", handleEventsUpdated);
  //   };
  // }, [socket, queryClient, email, setWaiting]);

  const likeMutation = useMutation({
    mutationFn: (variables) => api.post(`/api/like`, variables),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: ['favorites', email] });
      const previousFavorites = queryClient.getQueryData(['favorites', email]);
      queryClient.setQueryData(['favorites', email], (old = []) => [...old, newData.eventId]);
      return { previousFavorites };
    },
    onSuccess: () => {
      toast.success('เพิ่มในรายการโปรดสำเร็จ');
    },
    onError: (err, newData, context) => {
      queryClient.setQueryData(['favorites', email], context.previousFavorites);
      console.error('❌ Error: เกิดข้อผิดพลาดในการกดไลค์', err);
      toast.error('เกิดข้อผิดพลาดในการกดไลค์');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', email] });
    },
  });

  const unlikeMutation = useMutation({
    mutationFn: ({ eventId }) => api.delete(`/api/like/${email}/${eventId}`),
    onMutate: async ({ eventId }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites', email] });
      const previousFavorites = queryClient.getQueryData(['favorites', email]);
      queryClient.setQueryData(['favorites', email], (old = []) =>
        old.filter((id) => id !== eventId)
      );
      return { previousFavorites };
    },
    onSuccess: () => {
      // Optional: Can show a success toast if desired, but UI is already updated.
    },
    onError: (err, newData, context) => {
      queryClient.setQueryData(['favorites', email], context.previousFavorites);
      console.error('❌ Error: เกิดข้อผิดพลาดในการยกเลิกไลค์', err);
      toast.error('เกิดข้อผิดพลาดในการยกเลิกไลค์');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', email] });
    },
  });

  const useListRefetchingMutation = (mutationFn, successMessage, errorMessage) => {
    return useMutation({
      // This is the line that needs to be moved
      mutationFn,
      onSuccess: () => {
        toast.success(successMessage);
        queryClient.invalidateQueries({ queryKey: ['events', email] });
        queryClient.invalidateQueries({ queryKey: ['favorites', email] });
      },
      onError: (error) => {
        console.error(`❌ Error: ${errorMessage}`, error);
        toast.error(errorMessage);
      },
    });
  };

  const deleteMutation = useListRefetchingMutation(
    (eventId) => api.delete(`/api/events/${eventId}`, { data: { email: email } }), // Pass email in request body
    'ลบกิจกรรมสำเร็จ',
    'เกิดข้อผิดพลาดในการลบกิจกรรม'
  );

  const deleteAllMutation = useListRefetchingMutation(
    () => api.delete(`/api/events/user/${email}`),
    'ลบกิจกรรมทั้งหมดสำเร็จ',
    'เกิดข้อผิดพลาดในการลบกิจกรรมทั้งหมด'
  );

  const handleLike = (eventId) => {
    // Ensure events is an array before using it
    likeMutation.mutate({ userEmail: email, eventId });
  };

  const handleUnlike = (eventId) => {
    unlikeMutation.mutate({ eventId });
  };

  const handleDelete = (id) => {
    deleteMutation.mutate(id);
    unlikeMutation.mutate({ eventId: id });
  };

  const handleDeleteAll = () => {
    if (window.confirm('คุณแน่ใจว่าต้องการลบกิจกรรมทั้งหมดหรือไม่?')) {
      deleteAllMutation.mutate();
    }
  };

  if (waiting || isLoadingEvents) {
    return (
      <div className={`event-container ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="event-list">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }
  if (isErrorEvents) return <p className="loading-text">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>;

  return (
    <>
      <button
        className={`eventlist-modal-toggle-btn ${isDarkMode ? 'dark-mode' : ''}`}
        onClick={() => setIsModalOpen(true)}
        aria-label="Open Events"
      >
        <FiCalendar />
      </button>
      <div className="eventlist-desktop-view">
        {/* Ensure events is an array before passing to content */}
        <EventListContent
          isDarkMode={isDarkMode}
          events={Array.isArray(events) ? events : []}
          favoriteEvents={favoriteEvents}
          matchedEventIds={matchedEventIds}
          filterType={filterType}
          setFilterType={setFilterType}
          handleUnlike={handleUnlike}
          handleLike={handleLike}
          handleDelete={handleDelete}
          handleDeleteAll={handleDeleteAll}
        />
      </div>
      <div
        className={`eventlist-modal-overlay ${isModalOpen ? 'active' : ''}`}
        onClick={() => setIsModalOpen(false)}
      >
        <div
          className={`eventlist-modal-sheet ${isModalOpen ? 'active' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="eventlist-modal-header">
            <div className="eventlist-modal-handle"></div>
            <button
              className="eventlist-modal-close"
              onClick={() => setIsModalOpen(false)}
              aria-label="Close Events"
            >
              <FiX />
            </button>
          </div>
          <div className="eventlist-modal-content">
            <EventListContent
              // Ensure events is an array before passing to content
              isDarkMode={isDarkMode}
              events={Array.isArray(events) ? events : []}
              favoriteEvents={favoriteEvents}
              matchedEventIds={matchedEventIds}
              filterType={filterType}
              setFilterType={setFilterType}
              handleUnlike={handleUnlike}
              handleLike={handleLike}
              handleDelete={handleDelete}
              handleDeleteAll={handleDeleteAll}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default EventList;

EventListContent.propTypes = {
  isDarkMode: PropTypes.bool.isRequired,
  events: PropTypes.array.isRequired,
  favoriteEvents: PropTypes.array.isRequired,
  handleUnlike: PropTypes.func.isRequired,
  handleLike: PropTypes.func.isRequired,
  handleDelete: PropTypes.func.isRequired,
  handleDeleteAll: PropTypes.func.isRequired,
};

EventList.propTypes = {
  waiting: PropTypes.bool.isRequired,
};
