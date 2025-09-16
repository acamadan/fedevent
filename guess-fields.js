export function guessFields(text) {
  const out = {};
  const t = (text || '').replace(/\s+/g, ' ').trim();
  const num = s => (s && (s.match(/-?\d[\d,\.]*/)?.[0] || '').replace(/,/g,'')) || '';

  const email = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) out.email = email[0];

  const phone = t.match(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  if (phone) out.phone = phone[0];

  const web = t.match(/\b(?:https?:\/\/|www\.)[^\s/$.?#].[^\s)]+/i);
  if (web) out.website = web[0].replace(/[,.)]+$/, '');

  const csz = t.match(/\b([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);
  if (csz) { out.city = csz[1]; out.state = csz[2]; out.postal_code = csz[3]; }

  let m = t.match(/([\d,\.]+)\s*(?:sq(?:\.|uare)?\s*ft|sf)\s*(?:of\s*)?(?:total\s*)?(?:meeting|event|function)\s*(?:space|area)/i);
  if (m) out.meeting_space_sqft = num(m[1]);
  if (!out.meeting_space_sqft) {
    m = t.match(/(?:total\s*)?(?:meeting|event|function)\s*(?:space|area)[^.\d]{0,40}([\d,\.]+)\s*(?:sq(?:\.|uare)?\s*ft|sf)/i);
    if (m) out.meeting_space_sqft = num(m[1]);
  }

  m = t.match(/\b(\d{2,4})\s*(?:guest\s*rooms|guestrooms|rooms|keys)\b/i);
  if (m) out.rooms_total = num(m[1]);

  m = t.match(/\bballroom\b[^.\d]{0,80}?([\d,\.]+)\s*(?:sq(?:\.|uare)?\s*ft|sf)\b/i);
  if (m) out.ballroom_sqft = num(m[1]);

  m = t.match(/\b(max(?:imum)?\s*capacity|largest\s*(?:room|space).{0,20}capacity)[^.\d]{0,20}(\d{2,4})\b/i);
  if (m) out.largest_room_capacity = num(m[2]);

  m = t.match(/([\d\.]+)\s*(mi|miles|km)\s*(?:to|from)?\s*(?:the\s*)?airport/i);
  if (m) out.airport_distance = num(m[1]);

  const has = kw => new RegExp(`\\b${kw}\\b`, 'i').test(t);
  if (has('spa')) out.spa = 'Yes';
  if (has('pool')) out.pool = 'Yes';
  if (has('fitness center') || has('gym')) out.gym = 'Yes';
  if (has('business center')) out.business_center = 'Yes';
  if (has('valet parking') || has('self parking') || has('parking')) out.parking = 'Yes';

  return out;
}
