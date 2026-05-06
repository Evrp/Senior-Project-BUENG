import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import './AccordionList.css';
import {
  FaTimes,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaSearch,
  FaFilter,
  FaChevronDown,
} from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import api from '../../server/api';

const MAX_SELECTIONS = 2;

const fetchInitialFilters = async (email) => {
  try {
    const res = await api.get(`/api/filters/${encodeURIComponent(email)}`);
    return res.data;
  } catch (err) {
    return null;
  }
};

const extractEventsFromResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.events)) return payload.events;
  return [];
};

const GenreItem = React.memo(
  ({ genre, itemIdx, genreIdx, selectedLabels, onTabSelect, searchTerm }) => {
    const filteredTabs = useMemo(() => {
      if (!searchTerm) return genre.tabs || [];
      return (genre.tabs || []).filter((tab) => {
        const label = typeof tab === 'string' ? tab : tab.label;
        return label.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }, [genre.tabs, searchTerm]);

    if (filteredTabs.length === 0) return null;

    return (
      <div className="accordion-genre-section">
        <span className="accordion-genre-title">{genre.title}</span>
        <div className="accordion-tabs">
          {filteredTabs.map((tab) => {
            const label = typeof tab === 'string' ? tab : tab.label;
            const icon = typeof tab === 'string' ? null : tab.icon;
            const isSelected = selectedLabels.some(
              (sel) => sel.key === `${itemIdx}-${genreIdx}` && sel.label === label
            );
            return (
              <button
                key={label}
                className={`accordion-tab ${isSelected ? 'selected' : ''}`}
                onClick={() => onTabSelect(itemIdx, genreIdx, label)}
                type="button"
              >
                {icon && <span className="tab-icon">{icon}</span>}
                <span>{label}</span>
                {isSelected && <FaTimes style={{ fontSize: '10px', marginLeft: '4px' }} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

GenreItem.displayName = 'GenreItem';

const DATE_OPTIONS = [
  { label: 'Anytime', value: '' },
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'This Week', value: 'week' },
  { label: 'Next Week', value: 'next_week' },
  { label: 'This Month', value: 'month' },
  { label: 'Next Month', value: 'next_month' },
];

const AccordionList = ({ items, setWaiting }) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [dateFilter, setDateFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [genreSearch, setGenreSearch] = useState('');
  const [debouncedDate, setDebouncedDate] = useState('');
  const [debouncedLocation, setDebouncedLocation] = useState('');

  const containerRef = useRef(null);
  const hydratedFiltersRef = useRef(null);

  const queryClient = useQueryClient();
  const email = localStorage.getItem('userEmail');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDate(dateFilter);
      setDebouncedLocation(locationFilter);
    }, 800);
    return () => clearTimeout(timer);
  }, [dateFilter, locationFilter]);

  const { data: initialFilters } = useQuery({
    queryKey: ['filters', email],
    queryFn: () => fetchInitialFilters(email),
    enabled: !!email,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!email || !initialFilters?.subGenres) return;

    const hydrationKey = `${email}:${JSON.stringify(initialFilters.subGenres)}`;
    if (hydratedFiltersRef.current === hydrationKey) return;

    const newSelectedLabels = [];
    items.forEach((item, itemIdx) => {
      if (item.genres && Array.isArray(item.genres)) {
        item.genres.forEach((genre, genreIdx) => {
          if (initialFilters.subGenres[genre.title]) {
            initialFilters.subGenres[genre.title].forEach((sub) => {
              newSelectedLabels.push({ key: `${itemIdx}-${genreIdx}`, label: sub });
            });
          }
        });
      }
    });

    hydratedFiltersRef.current = hydrationKey;

    setSelectedLabels(newSelectedLabels);
  }, [email, initialFilters, items]);

  const { mutate: mutateSave } = useMutation({
    mutationFn: (variables) => api.post(`/api/update-genres`, variables),
    onSuccess: async (res, variables) => {
      queryClient.setQueryData(['events', email], extractEventsFromResponse(res.data));
      queryClient.setQueryData(['filters', email], {
        email,
        genres: variables.genres,
        subGenres: variables.subGenres,
      });
      setWaiting(false);
    },
    onError: () => {
      toast.error('บันทึกข้อมูลล้มเหลว');
      setWaiting(false);
    },
  });

  const handleSave = useCallback(
    (showSkeletons = false) => {
      if (!email || (selectedLabels.length === 0 && !debouncedLocation && !debouncedDate)) return;

      const subGenresObj = {};
      selectedLabels.forEach((sel) => {
        if (sel.key === 'custom-keyword') {
          const cat = 'Search';
          if (!subGenresObj[cat]) subGenresObj[cat] = [];
          if (!subGenresObj[cat].includes(sel.label)) subGenresObj[cat].push(sel.label);
          return;
        }
        const [itemIdx, genreIdx] = sel.key.split('-').map(Number);
        const item = items[itemIdx];
        if (item && item.genres && item.genres[genreIdx]) {
          const genreTitle = item.genres[genreIdx].title;
          if (!subGenresObj[genreTitle]) subGenresObj[genreTitle] = [];
          if (!subGenresObj[genreTitle].includes(sel.label))
            subGenresObj[genreTitle].push(sel.label);
        }
      });

      if (showSkeletons) setWaiting(true);

      mutateSave({
        email,
        genres: Object.keys(subGenresObj),
        subGenres: subGenresObj,
        location: debouncedLocation,
        date: debouncedDate,
        updatedAt: new Date().toISOString(),
      });
    },
    [email, selectedLabels, debouncedDate, debouncedLocation, items, mutateSave, setWaiting]
  );


  const handleTabSelect = useCallback((itemIdx, genreIdx, label) => {
    const key = `${itemIdx}-${genreIdx}`;
    setSelectedLabels((prev) => {
      const exists = prev.some((sel) => sel.key === key && sel.label === label);
      if (exists) return prev.filter((sel) => !(sel.key === key && sel.label === label));
      if (prev.length >= MAX_SELECTIONS) {
        toast.warn(`เลือกได้สูงสุด ${MAX_SELECTIONS}`);
        return prev;
      }
      return [...prev, { key, label }];
    });
  }, []);

  const handleRemoveLabel = useCallback((key, label) => {
    setSelectedLabels((prev) => prev.filter((sel) => !(sel.key === key && sel.label === label)));
  }, []);

  const genreSections = useMemo(() => {
    return items.map((item, itemIdx) => (
      <div key={itemIdx}>
        {item.genres?.map((genre, genreIdx) => (
          <GenreItem
            key={`${itemIdx}-${genreIdx}`}
            genre={genre}
            itemIdx={itemIdx}
            genreIdx={genreIdx}
            selectedLabels={selectedLabels}
            onTabSelect={handleTabSelect}
            searchTerm={genreSearch}
          />
        ))}
      </div>
    ));
  }, [items, selectedLabels, handleTabSelect, genreSearch]);

  const hasMatches = useMemo(() => {
    if (!genreSearch || !items) return true;
    return items.some((item) =>
      item.genres?.some((genre) =>
        genre.tabs?.some((tab) => {
          const label = typeof tab === 'string' ? tab : tab.label;
          return label.toLowerCase().includes(genreSearch.toLowerCase());
        })
      )
    );
  }, [items, genreSearch]);

  return (
    <div className="filter-bar-container" ref={containerRef}>
      <ToastContainer position="bottom-right" autoClose={2000} hideProgressBar />

      {/* Compact Top Bar */}
      <div className="compact-filter-bar">
        <div className="filter-item search-box">
          <FaSearch className="icon" />
          <input
            type="text"
            placeholder="Interests..."
            value={genreSearch}
            onChange={(e) => {
              setGenreSearch(e.target.value);
              if (!isDrawerOpen) setIsDrawerOpen(true);
            }}
          />
        </div>

        <div className="filter-divider" />

        <div className="filter-item">
          <FaCalendarAlt className="icon" />
          <select
            className="filter-select"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          >
            {DATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-divider" />

        <div className="filter-item">
          <FaMapMarkerAlt className="icon" />
          <input
            type="text"
            placeholder="Location..."
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          />
        </div>

        <div className="filter-actions-group">
          <button
            className="manual-search-btn"
            onClick={() => handleSave(true)}
            disabled={selectedLabels.length === 0 && !locationFilter.trim() && !dateFilter}
            title={
              selectedLabels.length === 0 && !locationFilter.trim() && !dateFilter
                ? 'Please select a category, location, or date'
                : 'Search with current filters'
            }
          >
            <FaSearch />
          </button>

          <button
            className={`drawer-toggle-btn ${selectedLabels.length > 0 ? 'active' : ''}`}
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
          >
            <FaFilter />
            <span className="btn-label">
              {selectedLabels.length > 0 ? `${selectedLabels.length}` : 'Categories'}
            </span>
            <FaChevronDown className={`chevron ${isDrawerOpen ? 'up' : ''}`} />
          </button>
        </div>
      </div>

      {/* Selected Pills (Visible even when drawer closed) */}
      {selectedLabels.length > 0 && !isDrawerOpen && (
        <div className="mini-selected-pills">
          {selectedLabels.map((sel) => (
            <span className="mini-pill" key={sel.key + sel.label}>
              {sel.label}
              <FaTimes className="remove" onClick={() => handleRemoveLabel(sel.key, sel.label)} />
            </span>
          ))}
        </div>
      )}

      {/* Fullscreen/Overlay Drawer for Categories */}
      {isDrawerOpen && (
        <>
          <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)} />
          <div className="categories-drawer">
            <div className="drawer-header">
              <h3>Personalize Your Experience</h3>
              <button className="close-drawer" onClick={() => setIsDrawerOpen(false)}>
                <FaTimes />
              </button>
            </div>

            <div className="drawer-search-inner">
              <FaSearch />
              <input
                type="text"
                placeholder="Search specific interest..."
                value={genreSearch}
                onChange={(e) => setGenreSearch(e.target.value)}
              />
            </div>

            <div className="drawer-scroll-content">
              {genreSearch && !hasMatches && (
                <div className="no-matches-suggestion">
                  <p>ไม่พบหมวดหมู่ที่ตรงกัน</p>
                  <button
                    className="custom-keyword-search-btn"
                    onClick={() => {
                      if (!selectedLabels.some((s) => s.label === genreSearch)) {
                        setSelectedLabels((prev) => [
                          ...prev.slice(0, 1),
                          { key: 'custom-keyword', label: genreSearch },
                        ]);
                      }
                      setGenreSearch('');
                      setIsDrawerOpen(false);
                    }}
                  >
                    <FaSearch style={{ marginRight: '8px' }} />
                    ค้นหา {`"${genreSearch}"`} บน Google Events
                  </button>
                </div>
              )}
              {genreSections}
            </div>

            <div className="drawer-footer">
              <button
                className="clear-all"
                onClick={() => {
                  setSelectedLabels([]);
                  setIsDrawerOpen(false);
                }}
              >
                Clear All
              </button>
              <button className="apply-btn" onClick={() => setIsDrawerOpen(false)}>
                Show Events
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AccordionList;
