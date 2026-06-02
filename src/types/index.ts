export type UserRole = "admin" | "outreacher" | "viewer";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadStatus =
  | "new"
  | "enriching"
  | "enriched"
  | "scored"
  | "outreach_ready"
  | "dm_sent"
  | "replied"
  | "demo_shared"
  | "demo_viewed"
  | "demo_completed"
  | "follow_up_needed"
  | "converted"
  | "lost"
  | "disqualified";

export type SalonLead = {
  id: string;
  search_run_id: string | null;
  name: string;
  phone: string | null;
  website_url: string | null;
  instagram_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  rating: number | null;
  review_count: number | null;
  categories: string[] | null;
  hours_raw: Record<string, unknown> | null;
  is_open_sunday: boolean | null;
  closes_before_6pm: boolean | null;
  has_website: boolean;
  has_phone: boolean;
  status: LeadStatus;
  assigned_to: string | null;
  enriched_at: string | null;
  scored_at: string | null;
  last_outreach_at: string | null;
  converted_at: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type LeadSearchRun = {
  id: string;
  created_by: string | null;
  query: string;
  city: string;
  state: string;
  country: string;
  provider: "serper" | "google_places";
  max_results: number;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  total_found: number | null;
  total_imported: number | null;
  total_skipped: number | null;
  total_duplicate: number | null;
  estimated_cost_usd: number | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type WebsiteSnapshot = {
  id: string;
  lead_id: string;
  url: string;
  status: "pending" | "crawled" | "failed" | "skipped" | "blocked";
  phones: string[] | null;
  emails: string[] | null;
  booking_urls: string[] | null;
  platform_hits: PlatformHit[] | null;
  hours_detected: Record<string, unknown> | null;
  cta_strength: "strong" | "weak" | "none" | null;
  has_online_booking: boolean | null;
  has_phone_visible: boolean | null;
  instagram_links: string[] | null;
  response_status: number | null;
  error: string | null;
  crawl_duration_ms: number | null;
  crawled_at: string | null;
  created_at: string;
};

export type InstagramSnapshot = {
  id: string;
  lead_id: string;
  handle: string | null;
  profile_url: string | null;
  followers: number | null;
  bio: string | null;
  bio_links: string[] | null;
  last_post_at: string | null;
  post_count_30d: number | null;
  active_last_30_days: boolean | null;
  booking_link_in_bio: boolean | null;
  detected_platform: string | null;
  platform_confidence: number | null;
  status: "pending" | "fetched" | "failed" | "not_found" | "private";
  error: string | null;
  raw: Record<string, unknown> | null;
  fetched_at: string | null;
  created_at: string;
};

export type ScoringFactors = {
  noOnlineBooking: number;
  businessAge: number;
  ratingScore: number;
  reviewCount: number;
  afterHoursGap: number;
  instagramActive: number;
  hasWebsite: number;
  respondsToReviews: number;
};

export type LeadScore = {
  id: string;
  lead_id: string;
  score: number;
  priority: 1 | 2 | 3;
  factors: ScoringFactors;
  tier: "A" | "B" | "C" | null;
  tier_platform: string | null;
  tier_reason: string | null;
  recommended_pitch: string | null;
  scoring_version: string;
  scored_at: string;
  created_at: string;
};

export type OutreachEventType =
  | "dm_sent"
  | "email_sent"
  | "demo_created"
  | "demo_shared"
  | "demo_viewed"
  | "demo_completed"
  | "reply_received"
  | "follow_up_sent"
  | "call_completed"
  | "converted"
  | "lost"
  | "disqualified"
  | "note"
  | "status_changed"
  | "assigned";

export type OutreachEvent = {
  id: string;
  lead_id: string;
  demo_id: string | null;
  type: OutreachEventType;
  channel: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  prev_status: string | null;
  new_status: string | null;
  created_by: string | null;
  created_at: string;
};

export type RingbookerDemo = {
  id: string;
  lead_id: string;
  salon_name: string;
  demo_vertical: string;
  demo_config: Record<string, unknown> | null;
  demo_url: string | null;
  demo_url_params: Record<string, unknown> | null;
  status: "prepared" | "shared" | "viewed" | "completed" | "expired";
  share_count: number;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  created_by: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FollowUp = {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  scheduled_for: string;
  type: "dm_followup" | "share_demo" | "check_viewed" | "pricing_call" | "close";
  status: "pending" | "completed" | "cancelled" | "overdue";
  notes: string | null;
  completed_at: string | null;
  completed_by: string | null;
  outcome: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type JobType =
  | "search_run"
  | "enrich_lead"
  | "enrich_instagram"
  | "score_lead"
  | "score_batch"
  | "auto_create_demo"
  | "cleanup";

export type Job = {
  id: string;
  type: JobType;
  status: "pending" | "processing" | "completed" | "failed" | "dead";
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  locked_at: string | null;
  locked_by: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
};

export type PlatformHit = {
  platform: string;
  confidence: number;
  evidence: string;
  tier: "A" | "B" | "C";
};

export type ApiSuccess<T> = { data: T; error?: never };
export type ApiError = { data?: never; error: string; code?: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};
