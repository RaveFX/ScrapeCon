import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Calendar, 
  MapPin, 
  RefreshCw, 
  SlidersHorizontal, 
  AlertCircle, 
  ExternalLink, 
  X, 
  DollarSign, 
  Radio, 
  Sparkles,
  Grid,
  Map
} from 'lucide-react';

export default function App() {
  const [concerts, setConcerts] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Selected Concert for Detail Modal
  const [selectedConcert, setSelectedConcert] = useState(null);

  // View Mode: 'grid' or 'map'
  const [viewMode, setViewMode] = useState('grid');

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSources, setSelectedSources] = useState({
    MyTickets: true,
    OneTicket: true,
    TicketsMinistry: true
  });
  const [selectedVenue, setSelectedVenue] = useState('All');
  const [sortBy, setSortBy] = useState('dateAsc'); // 'dateAsc', 'priceAsc', 'priceDesc'

  // Refs for Leaflet Map
  const mapRef = useRef(null);
  const markersGroupRef = useRef(null);

  // Fetch static data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch combined concerts json directly from Vercel static asset path
      const res = await fetch('/data/concerts.json');
      if (!res.ok) throw new Error('Failed to load concerts cache data.');
      
      const data = await res.json();
      setConcerts(data.concerts || []);
      setSyncStatus({
        lastSyncTime: data.lastSyncTime,
        counts: data.counts,
        status: 'success'
      });
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Get unique venues for the filter dropdown
  const uniqueVenues = ['All', ...new Set(concerts.map(c => c.venue).filter(Boolean))].sort();

  // Filter & Sort Logic
  const filteredConcerts = concerts
    .filter(concert => {
      // 1. Search filter
      const matchesSearch = 
        concert.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        concert.venue.toLowerCase().includes(searchTerm.toLowerCase()) ||
        concert.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        concert.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));

      // 2. Source filter
      const matchesSource = selectedSources[concert.source];

      // 3. Venue filter
      const matchesVenue = selectedVenue === 'All' || concert.venue === selectedVenue;

      return matchesSearch && matchesSource && matchesVenue;
    })
    .sort((a, b) => {
      // 4. Sort logic
      if (sortBy === 'dateAsc') {
        if (!a.dateTime) return 1;
        if (!b.dateTime) return -1;
        return new Date(a.dateTime) - new Date(b.dateTime);
      } else if (sortBy === 'priceAsc') {
        return a.minPrice - b.minPrice;
      } else if (sortBy === 'priceDesc') {
        return b.minPrice - a.minPrice;
      }
      return 0;
    });

  // Map Initialization & Updates Effect
  useEffect(() => {
    if (viewMode !== 'map' || filteredConcerts.length === 0 || !window.L) return;
    
    // 1. Initialize map if it doesn't exist
    if (!mapRef.current) {
      const map = window.L.map('concert-map', {
        center: [7.8731, 80.7718], // Center of Sri Lanka
        zoom: 8,
        zoomControl: true
      });
      
      // Add Dark themed CartoDB tiles
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);
      
      mapRef.current = map;
      markersGroupRef.current = window.L.layerGroup().addTo(map);
    }
    
    // 2. Clear old markers
    markersGroupRef.current.clearLayers();
    
    // 3. Draw filtered markers
    const bounds = [];
    filteredConcerts.forEach(concert => {
      const coords = [concert.latitude || 6.9271, concert.longitude || 79.8612];
      
      // Custom Neon dot marker
      const markerHtml = `<div style="
        width: 14px; 
        height: 14px; 
        background-color: var(--accent-pink); 
        border: 2px solid white; 
        border-radius: 50%; 
        box-shadow: 0 0 12px var(--accent-pink);
      "></div>`;
      
      const customIcon = window.L.divIcon({
        html: markerHtml,
        className: 'custom-map-marker',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });

      const popupHtml = `
        <div class="map-popup-card">
          <img src="${concert.posterUrl}" class="map-popup-img" onerror="this.src='https://images.unsplash.com/photo-1506157786151-b8491531f063?q=80&w=500'" />
          <div class="map-popup-body">
            <h4 class="map-popup-title">${concert.name}</h4>
            <div class="map-popup-meta">
              <div class="map-popup-meta-item">📅 ${concert.originalDateStr || 'TBA'}</div>
              <div class="map-popup-meta-item">📍 ${concert.venue}</div>
              <div class="map-popup-meta-item">💵 ${concert.minPrice > 0 ? `${concert.priceCurrency || 'LKR'} ${concert.minPrice.toLocaleString()}` : 'Free'}</div>
            </div>
            <button class="map-popup-btn" id="popup-btn-${concert.id.replace(/[^a-zA-Z0-9]/g, '_')}">View Details</button>
          </div>
        </div>
      `;

      const marker = window.L.marker(coords, { icon: customIcon })
        .bindPopup(popupHtml, { closeButton: false })
        .addTo(markersGroupRef.current);
      
      // Bind click handler inside Popup on open
      marker.on('popupopen', () => {
        const btnId = `popup-btn-${concert.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.onclick = () => {
            setSelectedConcert(concert);
          };
        }
      });

      bounds.push(coords);
    });

    // 4. Fit bounds
    if (bounds.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [viewMode, filteredConcerts]);

  // Clean up map ref on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Manual Scrape Alert Info
  const handleManualRefreshAlert = () => {
    alert(
      'Serverless Sync Active!\n\nLankaVibe is deployed as a static site. Event listings are re-fetched and updated automatically every 2 hours via GitHub Actions.\n\nTo trigger an immediate manual refresh, please run the "Sync Concert Schedules" workflow in your GitHub repository Actions panel.'
    );
  };


  const toggleSource = (source) => {
    setSelectedSources(prev => ({
      ...prev,
      [source]: !prev[source]
    }));
  };

  const getSourceBadgeClass = (source) => {
    switch (source) {
      case 'MyTickets': return 'source-mytickets';
      case 'OneTicket': return 'source-oneticket';
      case 'TicketsMinistry': return 'source-ticketsministry';
      default: return '';
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'sold-out') {
      return <span className="card-status-badge status-soldout">Sold Out</span>;
    }
    if (status === 'cancelled') {
      return <span className="card-status-badge status-cancelled">Cancelled</span>;
    }
    return null;
  };

  return (
    <div className="app-container">
      {/* Header / Hero */}
      <header className="hero">
        <div className="hero-badge">
          <Sparkles size={14} /> Live Lankan Concerts
        </div>
        <h1>LANKAVIBE</h1>
        <p>Your premium gateway to discover and sync all upcoming concerts, musical shows, and gigs in Sri Lanka.</p>
      </header>

      {/* Sync Status Bar */}
      <section className="sync-bar glass-panel">
        <div className="sync-info">
          <div className="sync-status">
            <span className="sync-dot success"></span>
            <span>
              {syncStatus?.lastSyncTime 
                ? `Updated: ${new Date(syncStatus.lastSyncTime).toLocaleDateString()} ${new Date(syncStatus.lastSyncTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                : 'Reading schedules...'}
            </span>
          </div>
          <div className="sync-counts">
            <span className="count-badge">Total: {syncStatus?.counts?.Total || concerts.length}</span>
            <span className="count-badge">MyTickets: {syncStatus?.counts?.MyTickets || 0}</span>
            <span className="count-badge">OneTicket: {syncStatus?.counts?.OneTicket || 0}</span>
            <span className="count-badge">TicketsMinistry: {syncStatus?.counts?.TicketsMinistry || 0}</span>
          </div>
        </div>
        <button 
          className="btn btn-secondary" 
          onClick={handleManualRefreshAlert}
        >
          <RefreshCw size={16} />
          Sync Info
        </button>
      </section>

      {/* Filters Panel */}
      <section className="filters-panel glass-panel">
        <div className="filter-group">
          <span className="filter-label">Search Concerts</span>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              className="input-search" 
              placeholder="Search by artist name, show name, venue or tags..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
          </div>
        </div>

        <div className="filters-row">
          {/* Checkboxes for sources */}
          <div className="filter-group">
            <span className="filter-label">Filter Sources</span>
            <div className="source-checkboxes">
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  className="checkbox-custom" 
                  checked={selectedSources.MyTickets}
                  onChange={() => toggleSource('MyTickets')}
                />
                MyTickets
              </label>
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  className="checkbox-custom" 
                  checked={selectedSources.OneTicket}
                  onChange={() => toggleSource('OneTicket')}
                />
                OneTicket
              </label>
              <label className="checkbox-label">
                <input 
                  type="checkbox" 
                  className="checkbox-custom" 
                  checked={selectedSources.TicketsMinistry}
                  onChange={() => toggleSource('TicketsMinistry')}
                />
                TicketMinistry
              </label>
            </div>
          </div>

          {/* Venue Dropdown */}
          <div className="filter-group">
            <span className="filter-label">Venue</span>
            <select 
              className="select-filter" 
              value={selectedVenue} 
              onChange={(e) => setSelectedVenue(e.target.value)}
            >
              {uniqueVenues.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div className="filter-group">
            <span className="filter-label">Sort By</span>
            <select 
              className="select-filter" 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="dateAsc">Date: Soonest First</option>
              <option value="priceAsc">Price: Low to High</option>
              <option value="priceDesc">Price: High to Low</option>
            </select>
          </div>
        </div>
      </section>

      {/* View Mode Toggle Bar */}
      <section className="view-toggle-bar">
        <button 
          className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
          onClick={() => setViewMode('grid')}
        >
          <Grid size={16} />
          Grid View
        </button>
        <button 
          className={`toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
          onClick={() => setViewMode('map')}
        >
          <Map size={16} />
          Map View
        </button>
      </section>

      {/* Main Content Area */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Tuning up the Lankan vibe...</p>
        </div>
      ) : error ? (
        <div className="empty-state">
          <AlertCircle className="empty-icon" style={{ color: 'var(--accent-pink)' }} />
          <p style={{ color: 'var(--accent-pink)' }}>Error loading concert details: {error}</p>
          <button className="btn btn-secondary" onClick={() => fetchData()} style={{ marginTop: '1rem' }}>Retry</button>
        </div>
      ) : filteredConcerts.length === 0 ? (
        <div className="empty-state">
          <AlertCircle className="empty-icon" />
          <h2>No Concerts Found</h2>
          <p>Try resetting your filters or search tags to find active shows.</p>
        </div>
      ) : viewMode === 'map' ? (
        /* Leaflet Map Display */
        <div id="concert-map" className="map-container"></div>
      ) : (
        /* Standard Grid Display */
        <main className="concert-grid">
          {filteredConcerts.map(concert => (
            <article 
              key={concert.id} 
              className="concert-card glass-panel"
              onClick={() => setSelectedConcert(concert)}
            >
              <div className="card-media">
                <img src={concert.posterUrl} alt={concert.name} className="card-img" onError={(e) => {
                  e.target.src = 'https://images.unsplash.com/photo-1506157786151-b8491531f063?q=80&w=1000'; // fallback
                }} />
                <span className={`card-source-badge ${getSourceBadgeClass(concert.source)}`}>
                  {concert.source}
                </span>
                {getStatusBadge(concert.status)}
              </div>
              <div className="card-body">
                <h2 className="card-title">{concert.name}</h2>
                <div className="card-meta">
                  <div className="meta-item">
                    <Calendar size={14} className="meta-icon" />
                    <span>{concert.originalDateStr || 'TBA'}</span>
                  </div>
                  <div className="meta-item">
                    <MapPin size={14} className="meta-icon" />
                    <span>{concert.venue}</span>
                  </div>
                </div>
                <div className="card-footer">
                  <div className="card-price">
                    <span className="price-label">Tickets Start</span>
                    <span className="price-value">
                      {concert.minPrice > 0 
                        ? `${concert.priceCurrency || 'LKR'} ${concert.minPrice.toLocaleString()}` 
                        : 'Free Entry'}
                    </span>
                  </div>
                  <span className="btn btn-secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}>
                    View Event
                  </span>
                </div>
              </div>
            </article>
          ))}
        </main>
      )}

      {/* Detail Modal */}
      {selectedConcert && (
        <div className="modal-overlay" onClick={() => setSelectedConcert(null)}>
          <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedConcert(null)}>
              <X size={18} />
            </button>
            <div className="modal-header-img">
              <img src={selectedConcert.bannerUrl} alt={selectedConcert.name} className="modal-banner" onError={(e) => {
                e.target.src = 'https://images.unsplash.com/photo-1506157786151-b8491531f063?q=80&w=1000'; // fallback
              }} />
            </div>
            <div className="modal-body">
              <h2 className="modal-title">{selectedConcert.name}</h2>
              <div className="modal-quick-meta">
                <div className="meta-item">
                  <Calendar size={16} className="meta-icon" />
                  <span>{selectedConcert.originalDateStr || 'TBA'}</span>
                </div>
                <div className="meta-item">
                  <MapPin size={16} className="meta-icon" />
                  <span>{selectedConcert.venue} {selectedConcert.city && `(${selectedConcert.city})`}</span>
                </div>
                <div className="meta-item">
                  <Radio size={16} className="meta-icon" />
                  <span className={`card-source-badge ${getSourceBadgeClass(selectedConcert.source)}`} style={{ position: 'static', padding: '0.2rem 0.5rem' }}>
                    {selectedConcert.source}
                  </span>
                </div>
              </div>

              <h3 className="modal-desc-title">Show Details</h3>
              <div 
                className="modal-description"
                dangerouslySetInnerHTML={{ __html: selectedConcert.description }}
              />

              <div className="modal-action-bar">
                <div className="modal-price-box">
                  <span className="price-label">Ticket Range</span>
                  <span className="price-value" style={{ fontSize: '1.75rem' }}>
                    {selectedConcert.minPrice > 0 
                      ? `${selectedConcert.priceCurrency || 'LKR'} ${selectedConcert.minPrice.toLocaleString()}` 
                      : 'Free Entry'}
                    {selectedConcert.maxPrice > selectedConcert.minPrice && ` - ${selectedConcert.maxPrice.toLocaleString()}`}
                  </span>
                </div>
                <a 
                  href={selectedConcert.ticketLink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={`btn btn-primary ${selectedConcert.status !== 'active' ? 'disabled' : ''}`}
                  onClick={(e) => {
                    if (selectedConcert.status !== 'active') {
                      e.preventDefault();
                    }
                  }}
                >
                  {selectedConcert.status === 'sold-out' ? 'Sold Out' : selectedConcert.status === 'cancelled' ? 'Cancelled' : 'Buy Tickets'}
                  <ExternalLink size={16} />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
