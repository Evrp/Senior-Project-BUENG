import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../server/api';
import { toast } from 'react-toastify';
import {
  Shirt,
  Diamond,
  Palette,
  Trophy,
  Sparkles,
  Book,
  Coffee,
  Cake,
  Utensils,
  Monitor,
  Drum,
  GlassWater,
  Zap,
  Users,
  Gamepad2,
  Sprout,
  Music,
  Dumbbell,
  Wine,
  Pizza,
  Store,
  CodeXml,
  Camera,
  ShoppingCart,
  Waves,
  Plane,
  Cpu,
  HeartHandshake,
  Wrench,
  Accessibility,
  Search,
} from 'lucide-react';
import './GenreGrid.css';

const DEFAULT_GENRE_CATEGORY = 'All Categories';

const extractEventsFromResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
};

const genres = [
  { id: 'apparel', label: 'Apparel', icon: <Shirt size={20} /> },
  { id: 'accessories', label: 'Accessories', icon: <Diamond size={20} /> },
  { id: 'art', label: 'Art', icon: <Palette size={20} /> },
  { id: 'badminton', label: 'Badminton', icon: <Trophy size={20} /> },
  { id: 'beauty', label: 'Beauty', icon: <Sparkles size={20} /> },
  { id: 'books', label: 'Books', icon: <Book size={20} /> },
  { id: 'cafe', label: 'Cafe', icon: <Coffee size={20} /> },
  { id: 'cake', label: 'Cake', icon: <Cake size={20} /> },
  { id: 'coffee', label: 'Coffee', icon: <Coffee size={20} /> },
  { id: 'cooking', label: 'Cooking', icon: <Utensils size={20} /> },
  { id: 'computers', label: 'Computers', icon: <Monitor size={20} /> },
  { id: 'drum', label: 'Drum', icon: <Drum size={20} /> },
  { id: 'dinner', label: 'Dinner', icon: <GlassWater size={20} /> },
  { id: 'electronic', label: 'Electronic', icon: <Zap size={20} /> },
  { id: 'family', label: 'Family', icon: <Users size={20} /> },
  { id: 'football', label: 'Football', icon: <Trophy size={20} /> },
  { id: 'game', label: 'Game', icon: <Gamepad2 size={20} /> },
  { id: 'growth', label: 'Growth', icon: <Sprout size={20} /> },
  { id: 'guitar', label: 'Guitar', icon: <Music size={20} /> },
  { id: 'gym', label: 'Gym', icon: <Dumbbell size={20} /> },
  { id: 'hangout', label: 'Hangout', icon: <Wine size={20} /> },
  { id: 'junk_food', label: 'Junk Food', icon: <Pizza size={20} /> },
  { id: 'market', label: 'Market', icon: <Store size={20} /> },
  { id: 'music', label: 'Music', icon: <Music size={20} /> },
  { id: 'programming', label: 'Programming', icon: <CodeXml size={20} /> },
  { id: 'photo', label: 'Photo', icon: <Camera size={20} /> },
  { id: 'shopping', label: 'Shopping', icon: <ShoppingCart size={20} /> },
  { id: 'swimming', label: 'Swimming', icon: <Waves size={20} /> },
  { id: 'travel', label: 'Travel', icon: <Plane size={20} /> },
  { id: 'technology', label: 'Technology', icon: <Cpu size={20} /> },
  { id: 'volunteer', label: 'Volunteer', icon: <HeartHandshake size={20} /> },
  { id: 'workshop', label: 'Workshop', icon: <Wrench size={20} /> },
  { id: 'yoga', label: 'Yoga', icon: <Accessibility size={20} /> },
];

const GenreGrid = ({ setWaiting }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const email = localStorage.getItem('userEmail');
  const queryClient = useQueryClient();

  const toggleGenre = (genreId) => {
    setSelectedGenres((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const saveMutation = useMutation({
    mutationFn: async (genreData) => {
      const response = await api.post('/api/update-genres', genreData);
      return response.data;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(['events', email], extractEventsFromResponse(data));
      await queryClient.invalidateQueries({ queryKey: ['events', email] });
      toast.success('อัปเดตความสนใจเรียบร้อยแล้ว!');
      setWaiting(false);
    },
    onError: (error) => {
      console.error('Error updating genres:', error);
      toast.error(error.response?.data?.message || 'เกิดข้อผิดพลาดในการอัปเดตความสนใจ');
      setWaiting(false);
    },
  });

  const handleSearchEvents = () => {
    if (selectedGenres.length === 0) {
      toast.warning('กรุณาเลือกความสนใจอย่างน้อย 1 อย่าง');
      return;
    }
    setWaiting(true);
    saveMutation.mutate({
      email,
      genres: [DEFAULT_GENRE_CATEGORY],
      subGenres: { [DEFAULT_GENRE_CATEGORY]: selectedGenres },
      updatedAt: new Date().toISOString(),
    });
  };

  const filteredGenres = genres.filter((g) =>
    g.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="genre-grid-container">
      <div className="search-bar-wrapper">
        <Search className="search-icon" size={20} />
        <input
          type="text"
          placeholder="Search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="genre-search-input"
        />
      </div>

      <div className="genres-scroll-area">
        <div className="genres-grid">
          {filteredGenres.map((genre) => (
            <div
              key={genre.id}
              className={`genre-item ${selectedGenres.includes(genre.label) ? 'selected' : ''}`}
              onClick={() => toggleGenre(genre.label)}
            >
              <div className="genre-icon">{genre.icon}</div>
              <span className="genre-label">{genre.label}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        className="search-events-btn"
        onClick={handleSearchEvents}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? 'กำลังค้นหา...' : 'ค้นหากิจกรรม'}
      </button>
    </div>
  );
};

export default GenreGrid;
