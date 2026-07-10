// Using native fetch built-in in Node 18+

// Helper to slugify a string
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars (except -)
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

// Helper to convert TipTap JSON to HTML
function parseTipTapNode(node) {
  if (!node) return '';
  if (node.type === 'text') {
    return node.text || '';
  }
  let innerHTML = '';
  if (Array.isArray(node.content)) {
    innerHTML = node.content.map(parseTipTapNode).join('');
  }
  
  if (node.type === 'paragraph') {
    return `<p>${innerHTML}</p>`;
  }
  if (node.type === 'heading') {
    const level = node.attrs?.level || 3;
    return `<h${level}>${innerHTML}</h${level}>`;
  }
  if (node.type === 'bulletList') {
    return `<ul>${innerHTML}</ul>`;
  }
  if (node.type === 'orderedList') {
    return `<ol>${innerHTML}</ol>`;
  }
  if (node.type === 'listItem') {
    return `<li>${innerHTML}</li>`;
  }
  return innerHTML;
}

function convertTipTapToHtml(description) {
  if (!description) return '';
  if (typeof description === 'string' && description.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(description);
      if (obj.type === 'doc' && Array.isArray(obj.content)) {
        return obj.content.map(parseTipTapNode).join('');
      }
    } catch (e) {
      // ignore
    }
  }
  return description;
}

async function scrapeTicketsMinistry() {
  try {
    const url = 'https://api.ticketsministry.com/api/events?status%5B%5D=ongoing&status%5B%5D=pre-registration&status%5B%5D=soldout&status%5B%5D=closed&status%5B%5D=postponed&status%5B%5D=pending&type=concerts';
    console.log('[TicketsMinistry Scraper] Fetching from API...');
    
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const json = await response.json();
    const docs = Array.isArray(json.data) ? json.data : [];

    console.log(`[TicketsMinistry Scraper] Found ${docs.length} raw events.`);

    return docs.map(doc => {
      // Calculate min and max price from ticket packages
      let minPrice = 0;
      let maxPrice = 0;
      const packages = doc.ticket_packages || [];
      if (packages.length > 0) {
        const prices = packages.map(pkg => parseFloat(pkg.price)).filter(p => !isNaN(p));
        if (prices.length > 0) {
          minPrice = Math.min(...prices);
          maxPrice = Math.max(...prices);
        }
      }

      // Format date and time
      // start_date: "2026-07-17 19:00"
      let startIso = null;
      let friendlyDate = '';
      if (doc.start_date) {
        const dateObj = new Date(doc.start_date.replace(' ', 'T') + ':00'); // Ensure format YYYY-MM-DDTxx:xx:00
        if (!isNaN(dateObj.getTime())) {
          startIso = dateObj.toISOString();
          friendlyDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Colombo'
          });
        }
      }

      const slug = slugify(doc.name || '');
      const uid = doc.uid || doc.id;
      const ticketLink = `https://www.ticketsministry.com/concerts/${slug}/${uid}`;

      // Determine status
      let status = 'active';
      if (doc.status === 'soldout') {
        status = 'sold-out';
      } else if (doc.status === 'closed') {
        status = 'sold-out';
      }

      // Collect tags
      const tags = ['Concert'];
      if (doc.sub_type) {
        tags.push(doc.sub_type);
      }
      if (doc.featured) {
        tags.push('Featured');
      }

      const venueName = doc.venue?.name || 'TBA';
      const city = doc.venue?.city || doc.venue?.district || 'Colombo';

      return {
        id: `ticketsministry-${doc.id}`,
        source: 'TicketsMinistry',
        name: doc.name || 'Untitled Concert',
        description: convertTipTapToHtml(doc.description) || convertTipTapToHtml(doc.policy) || '',
        bannerUrl: doc.banner_img || doc.thumbnail_img || '',
        posterUrl: doc.thumbnail_img || doc.banner_img || '',
        venue: venueName,
        city: city,
        dateTime: startIso || doc.start_date,
        originalDateStr: friendlyDate || doc.start_date,
        priceCurrency: doc.currency || 'LKR',
        minPrice,
        maxPrice,
        ticketLink,
        status,
        tags: [...new Set(tags)],
        embedUrl: doc.venue?.embed_url || '',
        lat: parseFloat(doc.venue?.lat) || 0,
        lng: parseFloat(doc.venue?.long) || 0
      };
    });
  } catch (error) {
    console.error('[TicketsMinistry Scraper] Error scraping:', error.message);
    return [];
  }
}

// Support running directly as a script for testing
if (require.main === module) {
  scrapeTicketsMinistry().then(concerts => {
    console.log('Scraped result count:', concerts.length);
    if (concerts.length > 0) {
      console.log('Sample concert:', JSON.stringify(concerts[0], null, 2));
    }
  });
}

module.exports = scrapeTicketsMinistry;
