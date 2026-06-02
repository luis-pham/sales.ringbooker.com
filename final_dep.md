# Final Deployment Notes - sales.ringbooker.com

Ngày tổng hợp: 2026-06-02

Repo hiện tại: `https://github.com/luis-pham/sales.ringbooker.com.git`

Commit hiện tại: `833f713 Initial sales RingBooker implementation`

## 1. Trạng thái hiện tại của dự án

Dự án `sales.ringbooker.com` đã được dựng thành một app Next.js riêng, tách khỏi `ringbooker.com` production chính.

Stack hiện tại:

| Phần | Đang dùng |
| --- | --- |
| Frontend/API | Next.js `16.2.7`, React `19.2.7`, App Router |
| Styling | Tailwind CSS `4.3.0`, component UI nội bộ |
| Database/Auth/Storage | Supabase |
| Queue/job storage | Supabase table `jobs` + RPC claim/release |
| Worker dài hạn | Railway, qua `railway.toml` và `npm run worker` |
| Serverless UI/API deploy | Vercel |
| Search provider | Serper |
| Place details | Google Places |
| Instagram enrichment | Apify |
| Demo bridge | Optional RingBooker internal API |

Các command chính:

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run worker
```

Trước khi commit/push lần gần nhất, các command sau đã pass:

```bash
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

## 2. Hiện tại đã làm được gì

### 2.1 Auth và phân quyền

Đã có:

| Module | File chính |
| --- | --- |
| Login Google OAuth | `src/app/(auth)/login/page.tsx` |
| Auth callback | `src/app/auth/callback/route.ts` |
| Invite accept page | `src/app/(auth)/invite/[token]/page.tsx` |
| Middleware bảo vệ route | `middleware.ts` |
| Session/profile helper | `src/lib/auth/helpers.ts` |
| Resource access guard | `src/lib/auth/access.ts` |

Hành vi hiện tại:

- Người dùng chưa đăng nhập bị redirect về `/login`.
- Email ngoài domain allowlist bị chặn, trừ khi đã có invitation accepted.
- User inactive bị sign out và redirect `/unauthorized`.
- Admin-only pages gồm `/team`, `/analytics`, `/search`.
- Role chính: `admin`, `outreacher`, `viewer`.

Sau khi deploy Supabase/Auth, tài khoản đầu tiên thường cần được set admin thủ công:

```sql
update profiles
set role = 'admin', is_active = true
where email = 'YOUR_ADMIN_EMAIL@ringbooker.com';
```

### 2.2 Dashboard/UI

Đã có layout và các trang chính:

| Trang | File |
| --- | --- |
| Pipeline | `src/app/(dashboard)/page.tsx` |
| Leads list | `src/app/(dashboard)/leads/page.tsx` |
| Lead detail | `src/app/(dashboard)/leads/[id]/page.tsx` |
| Search | `src/app/(dashboard)/search/page.tsx` |
| Search run detail | `src/app/(dashboard)/search/[id]/page.tsx` |
| Demos | `src/app/(dashboard)/demos/page.tsx` |
| Analytics | `src/app/(dashboard)/analytics/page.tsx` |
| Team | `src/app/(dashboard)/team/page.tsx` |

Đã có component layout:

- `src/components/layout/Sidebar.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/MobileNav.tsx`

Đã có component domain:

- `DemoCard`
- `ScoreBadge`
- `ScoreBreakdown`
- `StatusBadge`
- `TierBadge`
- `OutreachTimeline`
- `LogEventForm`

### 2.3 Supabase database, RLS và storage

Đã có migration từ `001` đến `013`:

| Migration | Nội dung |
| --- | --- |
| `001_profiles.sql` | Profiles, trigger tạo profile từ auth user, RLS |
| `002_invitations.sql` | Invitations, token invite, RLS |
| `003_search_runs.sql` | Search runs |
| `004_salon_leads.sql` | Lead chính |
| `005_snapshots.sql` | Source/website/Instagram snapshots |
| `006_scores.sql` | Lead scores |
| `007_demos.sql` | RingBooker demos |
| `008_outreach.sql` | Outreach events |
| `009_evidence.sql` | Outreach evidence metadata |
| `010_follow_ups.sql` | Follow-ups |
| `011_jobs.sql` | Jobs table, RPC worker functions |
| `012_storage_evidence.sql` | Private evidence bucket + storage policies |
| `013_security_hardening.sql` | Hardening bổ sung sau audit |

Đã harden các điểm chính:

- RLS bật trên bảng domain.
- `jobs` chỉ service role thao tác.
- Evidence bucket là private.
- Evidence upload/read/delete theo user folder ownership.
- RPC functions có `security definer` và `set search_path = public`.
- Invitation token public select đã bị bỏ, invite lookup qua server admin client.

Nếu Supabase đã chạy `001-012` trước khi hardening, chạy thêm `013_security_hardening.sql`.

Nếu là project Supabase mới hoàn toàn, chạy migrations theo thứ tự:

```text
001_profiles.sql
002_invitations.sql
003_search_runs.sql
004_salon_leads.sql
005_snapshots.sql
006_scores.sql
007_demos.sql
008_outreach.sql
009_evidence.sql
010_follow_ups.sql
011_jobs.sql
012_storage_evidence.sql
013_security_hardening.sql
```

### 2.4 Search pipeline

Đã có:

| Phần | File |
| --- | --- |
| Search API | `src/app/api/search/route.ts` |
| Search handler | `src/lib/jobs/handlers/search.ts` |
| Serper provider | `src/lib/providers/serper.ts` |
| Google Places provider | `src/lib/providers/google-places.ts` |

Flow hiện tại:

1. Admin tạo search run ở UI/API.
2. API insert row vào `lead_search_runs`.
3. API enqueue job type `search_run`.
4. Worker lấy job.
5. Worker gọi Serper Google Maps search.
6. Filter chain salons, duplicate, thiếu data.
7. Insert lead vào `salon_leads`.
8. Insert raw source snapshot.
9. Enqueue tiếp `enrich_lead`.

### 2.5 Enrichment pipeline

Đã có:

| Phần | File |
| --- | --- |
| Website crawler | `src/lib/enrichment/website-crawler.ts` |
| Platform detector | `src/lib/enrichment/platform-detector.ts` |
| Instagram provider | `src/lib/enrichment/instagram-provider.ts` |
| Enrich lead job | `src/lib/jobs/handlers/enrich.ts` |
| Instagram job | `src/lib/jobs/handlers/instagram.ts` |

Enrichment hiện xử lý:

- Website snapshot.
- Booking URLs.
- CTA strength.
- Platform hits.
- Instagram handle/profile enrichment qua Apify nếu có token.
- Google Places details nếu có place id và API key.

### 2.6 Scoring engine

Đã có scoring engine tại:

```text
src/lib/scoring/scoring-engine.ts
src/lib/jobs/handlers/score.ts
```

Các factor hiện tại:

- No online booking.
- Business age từ source snapshot/review dates.
- Rating.
- Review count.
- After-hours gap.
- Instagram activity.
- Has website.
- Responds to reviews.

Kết quả score gồm:

- `score`
- `priority`
- `tier`
- `tier_platform`
- `tier_reason`
- `recommended_pitch`
- `scoring_version`

### 2.7 Demo service

Đã có:

| Phần | File |
| --- | --- |
| Demo service | `src/lib/demo/demo-service.ts` |
| Lead create demo API | `src/app/api/leads/[id]/demo/route.ts` |
| Demo bulk API | `src/app/api/demos/bulk/route.ts` |
| Demo status API | `src/app/api/demos/[id]/status/route.ts` |
| RingBooker webhook | `src/app/api/webhooks/ringbooker/route.ts` |

Flow hiện tại:

1. Từ lead tạo payload demo.
2. Nếu có `RINGBOOKER_INTERNAL_API_URL` và `RINGBOOKER_INTERNAL_API_KEY`, app gọi RingBooker internal API.
3. Nếu chưa cấu hình internal API, app fallback tạo demo URL dạng:

```text
https://ringbooker.com/demo/hair?salon=...&city=...
```

4. Demo được lưu vào `ringbooker_demos`.
5. Outreach event `demo_created` được ghi lại.

Webhook RingBooker hiện được bảo vệ bằng header:

```text
x-ringbooker-webhook-secret
```

Nếu `RINGBOOKER_WEBHOOK_SECRET` chưa set, webhook fail closed với `503`.

### 2.8 Outreach, evidence và follow-ups

Đã có:

| Phần | File |
| --- | --- |
| Outreach service | `src/lib/outreach/outreach-service.ts` |
| Evidence service | `src/lib/outreach/evidence-service.ts` |
| Outreach API | `src/app/api/outreach/[leadId]/route.ts` |
| Evidence API | `src/app/api/evidence/route.ts` |
| Follow-ups API | `src/app/api/follow-ups/route.ts` |
| Timeline UI | `src/components/outreach/OutreachTimeline.tsx` |
| Log event form | `src/components/outreach/LogEventForm.tsx` |

Đã hỗ trợ:

- Log DM/call/email/demo event.
- Upload evidence ảnh vào Supabase private storage.
- Signed URL cho evidence.
- Schedule/complete follow-up.
- Ownership check cho outreacher.

### 2.9 Team management và analytics

Đã có:

| Phần | File |
| --- | --- |
| Team API | `src/app/api/team/route.ts` |
| Team user update API | `src/app/api/team/[id]/route.ts` |
| Team page | `src/app/(dashboard)/team/page.tsx` |
| Team client | `src/app/(dashboard)/team/TeamClient.tsx` |
| Pipeline analytics API | `src/app/api/analytics/pipeline/route.ts` |
| Team analytics API | `src/app/api/analytics/team/route.ts` |

Admin có thể quản lý team/invitation/role theo API hiện tại.

## 3. Vercel đang áp dụng ở đâu

Vercel được dùng cho phần Next.js UI + API route.

Các phần chạy trên Vercel:

| Phần | Chi tiết |
| --- | --- |
| Web UI | Toàn bộ `src/app/(dashboard)` và auth pages |
| API routes | Toàn bộ `src/app/api/**/route.ts` |
| Middleware auth | `middleware.ts` |
| Security headers | `next.config.ts` |
| Cron backup worker | `vercel.json` gọi `/api/jobs/worker` mỗi 5 phút |

`vercel.json` hiện tại:

```json
{
  "crons": [
    {
      "path": "/api/jobs/worker",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Route cron backup:

```text
src/app/api/jobs/worker/route.ts
```

Route này:

- Chỉ nhận request có `x-internal-secret` hoặc `Authorization: Bearer ...`.
- So sánh secret với `INTERNAL_API_SECRET` hoặc `CRON_SECRET`.
- Release stale jobs.
- Claim 1 job pending.
- Dispatch job.
- Complete hoặc fail job.

Kết luận: Vercel hiện không chỉ là frontend. Nó cũng host API route và có thể chạy worker backup qua cron.

Điểm cần chú ý:

- Với schedule `*/5 * * * *`, Vercel plan phải hỗ trợ cron tần suất này. Theo docs Vercel hiện tại, Hobby bị giới hạn lịch cron rất thấp, còn Pro hỗ trợ tần suất cao hơn. Xem:
  - https://vercel.com/docs/cron-jobs
  - https://vercel.com/docs/cron-jobs/usage-and-pricing
- Nếu không muốn dùng Vercel Pro, nên dùng Railway worker làm primary worker và đổi hoặc tắt Vercel cron.
- Nếu vẫn giữ Vercel cron, bắt buộc set `CRON_SECRET` trong Vercel Environment Variables.

## 4. Railway có được dùng không?

Có. Dự án đã chuẩn bị để dùng Railway cho worker dài hạn.

File cấu hình:

```text
railway.toml
```

Nội dung hiện tại:

```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm run worker"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

Worker script:

```text
scripts/worker.ts
```

Worker chạy vòng lặp:

1. `releaseStaleJobs(15)`
2. `claimNextJob(workerId)`
3. `dispatchJob(job)`
4. `completeJob(...)` hoặc `failJob(...)`
5. Sleep theo `WORKER_POLL_INTERVAL_MS`

Kết luận:

- Railway đã có cấu hình trong code.
- Railway là nơi phù hợp nhất để chạy worker liên tục.
- Repo không tự chứng minh service Railway đã được tạo trên dashboard hay chưa. Cần connect repo lên Railway và set env thì mới thật sự chạy production.
- Nếu Railway đã deploy, app có worker 24/7.
- Nếu Railway chưa deploy, job chỉ chạy khi Vercel cron gọi `/api/jobs/worker`, hoặc khi gọi API route đó thủ công với secret hợp lệ.

Khuyến nghị production:

| Mục | Khuyến nghị |
| --- | --- |
| UI/API | Vercel |
| Worker primary | Railway |
| Vercel cron | Backup hoặc tắt nếu dùng Railway ổn định |
| Job locking | Đã có `for update skip locked`, nên nhiều worker không claim cùng một job |

## 5. Environment variables cần set

Không commit secret thật. Chỉ set trong `.env.local`, Vercel và Railway dashboard.

### 5.1 Biến chung

| Biến | Vercel | Railway | Ghi chú |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Có | Có | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Có | Có | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Có | Có | Server-only, không expose client |
| `ALLOWED_EMAIL_DOMAINS` | Có | Không bắt buộc | Middleware dùng trên Vercel |
| `INTERNAL_API_SECRET` | Có | Không bắt buộc | Dùng để gọi internal worker API |
| `CRON_SECRET` | Có | Không bắt buộc | Dùng cho Vercel cron |
| `WORKER_ID` | Không bắt buộc | Có | Ví dụ `railway-worker-1` |
| `WORKER_POLL_INTERVAL_MS` | Không bắt buộc | Có | Ví dụ `2000` hoặc `5000` |

### 5.2 Provider keys

| Biến | Vercel | Railway | Khi nào cần |
| --- | --- | --- | --- |
| `SERPER_API_KEY` | Có nếu bật Vercel cron | Có | Search job |
| `GOOGLE_PLACES_API_KEY` | Có nếu bật Vercel cron | Có | Place details enrichment |
| `APIFY_API_TOKEN` | Có nếu bật Vercel cron | Có | Instagram enrichment |

Nếu Railway là worker duy nhất, provider keys quan trọng nhất nằm ở Railway. Nhưng nếu Vercel cron cũng xử lý job, Vercel cũng cần đủ keys.

### 5.3 RingBooker integration

| Biến | Vercel | Railway | Ghi chú |
| --- | --- | --- | --- |
| `RINGBOOKER_INTERNAL_API_URL` | Có | Có nếu worker tạo demo | URL internal RingBooker API |
| `RINGBOOKER_INTERNAL_API_KEY` | Có | Có nếu worker tạo demo | Header `X-Internal-Api-Key` |
| `RINGBOOKER_WEBHOOK_SECRET` | Có | Không bắt buộc | Bảo vệ webhook `/api/webhooks/ringbooker` |

Nếu chưa có RingBooker internal API thật, demo service vẫn fallback sang public demo URL.

## 6. Supabase deployment checklist

### 6.1 Tạo project

1. Tạo Supabase project riêng cho `sales.ringbooker.com`.
2. Lấy:
   - Project URL.
   - Anon key.
   - Service role key.
3. Không dùng chung DB production của `ringbooker.com` chính.

### 6.2 Chạy SQL migrations

Trong Supabase SQL Editor, chạy lần lượt:

```text
supabase/migrations/001_profiles.sql
supabase/migrations/002_invitations.sql
supabase/migrations/003_search_runs.sql
supabase/migrations/004_salon_leads.sql
supabase/migrations/005_snapshots.sql
supabase/migrations/006_scores.sql
supabase/migrations/007_demos.sql
supabase/migrations/008_outreach.sql
supabase/migrations/009_evidence.sql
supabase/migrations/010_follow_ups.sql
supabase/migrations/011_jobs.sql
supabase/migrations/012_storage_evidence.sql
supabase/migrations/013_security_hardening.sql
```

Sau đó kiểm tra:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Kiểm tra jobs RPC:

```sql
select release_stale_jobs(15);
select claim_next_job('test-worker');
```

### 6.3 Auth provider

Trong Supabase:

1. Enable Google OAuth.
2. Set callback URL local:

```text
http://localhost:3000/auth/callback
```

3. Set callback URL production:

```text
https://sales.ringbooker.com/auth/callback
```

4. Trong Google Cloud OAuth credentials, cũng add redirect URL Supabase auth callback theo project Supabase.

### 6.4 Storage

Migration `012_storage_evidence.sql` tạo bucket:

```text
evidence
```

Bucket này:

- Private.
- Max file size 10MB.
- MIME allowed: jpeg/png/webp/gif.
- Upload path phải bắt đầu bằng user id.

## 7. Vercel deployment checklist

1. Import GitHub repo:

```text
https://github.com/luis-pham/sales.ringbooker.com.git
```

2. Framework preset: Next.js.

3. Build command:

```bash
npm run build
```

4. Install command:

```bash
npm install
```

5. Output: để Vercel tự nhận Next.js.

6. Set Environment Variables:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ALLOWED_EMAIL_DOMAINS
INTERNAL_API_SECRET
CRON_SECRET
SERPER_API_KEY
GOOGLE_PLACES_API_KEY
APIFY_API_TOKEN
RINGBOOKER_INTERNAL_API_URL
RINGBOOKER_INTERNAL_API_KEY
RINGBOOKER_WEBHOOK_SECRET
```

7. Add domain:

```text
sales.ringbooker.com
```

8. Sau deploy, test:

```text
https://sales.ringbooker.com/login
https://sales.ringbooker.com/auth/callback
https://sales.ringbooker.com/api/jobs/worker
```

Endpoint `/api/jobs/worker` phải trả `401` nếu không có secret. Test thủ công với secret:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://sales.ringbooker.com/api/jobs/worker
```

Nếu đúng, response sẽ là `idle`, `completed`, hoặc lỗi job cụ thể.

## 8. Railway deployment checklist

Railway dùng để chạy worker liên tục.

1. Tạo Railway project.
2. Connect GitHub repo `luis-pham/sales.ringbooker.com`.
3. Railway sẽ đọc `railway.toml`.
4. Builder: Nixpacks.
5. Start command:

```bash
npm run worker
```

6. Set Environment Variables trên Railway:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
WORKER_ID=railway-worker-1
WORKER_POLL_INTERVAL_MS=2000
SERPER_API_KEY
GOOGLE_PLACES_API_KEY
APIFY_API_TOKEN
RINGBOOKER_INTERNAL_API_URL
RINGBOOKER_INTERNAL_API_KEY
```

7. Deploy.

8. Log Railway phải thấy:

```text
[Worker] Starting railway-worker-1
[Worker] Poll interval: 2000ms
```

9. Test bằng cách tạo search run trong UI. Job mới phải được worker claim và xử lý.

Railway docs tham khảo:

- https://docs.railway.com/guides/start-command
- https://nixpacks.com/docs/deploying/railway

## 9. Production security notes

Đã có các phần tốt:

- Service role key chỉ dùng server-side.
- Middleware chặn unauthenticated user.
- API route có role/resource checks.
- Mutation route có same-origin guard.
- API route có in-memory rate limit.
- Worker API yêu cầu secret.
- Webhook RingBooker fail closed nếu chưa set secret.
- Evidence storage private.
- Security headers trong `next.config.ts`.

Điểm cần lưu ý trước production traffic thật:

| Vấn đề | Hiện trạng | Khuyến nghị |
| --- | --- | --- |
| Rate limit | In-memory per runtime | Dùng Redis/Upstash nếu traffic cao hoặc nhiều instance |
| Vercel cron | `*/5 * * * *` | Cần plan hỗ trợ hoặc tắt nếu Railway là primary |
| Worker retry | Có retry/backoff/dead job | Cần dashboard hoặc alert cho dead jobs |
| Provider cost | Có estimated cost cho Serper search | Nên thêm budget/usage guard nếu scale |
| Webhook signature | Shared secret header | Tốt cho nội bộ, có thể nâng cấp HMAC nếu payload quan trọng |
| Tests | Đã pass lint/typecheck/build trước commit | Nên thêm integration tests cho RLS/API critical paths |

## 10. Recommended production topology

Production nên chạy như sau:

```text
User/Admin
  -> Vercel Next.js UI
  -> Vercel API routes
  -> Supabase Auth/DB/Storage

Railway Worker
  -> Supabase jobs table
  -> Serper / Google Places / Apify
  -> Supabase snapshots/scores/demos

RingBooker main app
  -> Optional internal demo API
  -> Optional webhook back to sales.ringbooker.com
```

Vercel:

- Host UI.
- Host API.
- Handle login/auth callback.
- Receive webhook.
- Optional backup cron.

Railway:

- Run queue worker 24/7.
- Process search/enrichment/scoring/demo jobs.

Supabase:

- Auth.
- Postgres.
- RLS.
- Storage evidence.

## 11. Sau khi deploy xong cần test gì

### Auth

- Truy cập `/` khi chưa login phải redirect `/login`.
- Login Google domain hợp lệ vào được dashboard.
- Email không hợp lệ bị đưa về `/unauthorized`.
- Set user `role = admin` thì thấy `/search`, `/team`, `/analytics`.

### Search/job

- Admin tạo search run.
- Supabase `lead_search_runs.status` chuyển từ `pending` sang `running/completed`.
- `jobs` có job `search_run`, sau đó `enrich_lead`, `score_lead`.
- Railway logs có worker claim job.

### Lead detail

- Mở lead detail.
- Trigger enrich.
- Trigger score.
- Tạo demo.
- Log outreach event.
- Upload evidence.
- Schedule follow-up.

### Demo/webhook

- Tạo demo xong có row trong `ringbooker_demos`.
- Nếu RingBooker internal API chưa set, demo URL fallback vẫn được tạo.
- Gọi webhook thiếu secret phải trả `401` hoặc `503`.
- Gọi webhook đúng secret update status demo.

### Security

- Gọi `/api/jobs/worker` không secret phải `401`.
- Gọi mutation API từ origin lạ phải bị chặn.
- User outreacher không xem/sửa lead không assigned.
- Evidence private, không public URL trực tiếp.

## 12. Kết luận ngắn

Dự án hiện đã là một MVP production-structured, không còn chỉ là skeleton.

Đã có đủ:

- Next.js app.
- Auth.
- Dashboard.
- Supabase schema/RLS/storage.
- Lead search.
- Enrichment.
- Scoring.
- Demo generation.
- Outreach tracking.
- Follow-ups.
- Team/admin.
- Job queue.
- Vercel deploy config.
- Railway worker config.
- Security hardening cơ bản.

Vercel đang được dùng cho UI/API và cron backup.

Railway đã được chuẩn bị để dùng làm worker dài hạn. Muốn worker thật sự chạy production thì phải deploy Railway service và set env trên Railway dashboard.

Khuyến nghị vận hành: dùng Vercel cho UI/API, dùng Railway làm worker primary, còn Vercel cron chỉ giữ làm backup hoặc tắt để tránh giới hạn plan/cost.
