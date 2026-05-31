KiedyObiad.pl - Smart AI Culinary Assistant 🍳🤖

![Architecture: Serverless](https://img.shields.io/badge/Architecture-Serverless-orange)
![Frontend: Vanilla JS](https://img.shields.io/badge/Frontend-Vanilla_JS-yellow)
![Styling: Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-blue)
![Backend: Vercel](https://img.shields.io/badge/Backend-Vercel_Functions-black)
![Database: Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E)
![AI: Gemini](https://img.shields.io/badge/AI-Google_Gemini-4285F4)

**KiedyObiad.pl** (meaning "When is dinner?") is an advanced, AI-powered SaaS application designed to eliminate meal planning stress. It acts as a personal culinary assistant that generates custom recipes based on available ingredients, specific dietary styles, and user skill levels, while automatically managing smart shopping lists.

🌐 **Live Demo:** [kiedyobiad.pl](https://kiedyobiad.pl)

---

## ✨ Key Features

* **AI Recipe Generation (Prompt Matrix):** Uses Google Gemini AI to generate recipes tailored to specific "Cooking Styles" (e.g., KETO, Eco-Pure, High Protein, Meal Prep, Pro Chef) and difficulty levels.
* **Smart Shopping Lists:** Intelligently parses and aggregates ingredients from multiple saved recipes into categorized shopping lists.
* **Family Ecosystem:** Features a custom `Family ID` system allowing households to share a unified recipe dashboard and collaborate on live shopping lists.
* **OTP Authentication:** Passwordless login system using One-Time Passwords via email.
* **Progressive Web App (PWA):** Fully installable on iOS and Android devices with a custom, mobile-first UI.
* **SaaS Capabilities:** Built-in "Soft Paywall" enforcing premium limits, dynamic AI model routing, and automated email distribution of recipes and shopping lists.

---

## 🛠️ Tech Stack & Architecture

This project was built with a strong emphasis on **performance, minimal dependencies, and enterprise-grade security**.

### **Frontend (Client-Side)**
* **Approach:** Hybrid (Multi-page landing + Single Page Application for the core app).
* **Tech:** Vanilla JavaScript (`main.js`), HTML5, precompiled Tailwind CSS.
* **Rendering:** Uses `DocumentFragment` for optimized, batched DOM rendering.
* **Session Management:** Built-in fetch interceptor for silent, asynchronous JWT token refreshing in the background.

### **Backend (Serverless)**
* **Hosting:** Vercel Serverless Functions (`/api/*`).
* **AI Engine:** Google AI Studio (Gemini 2.5 Flash / Flash-Lite). Includes **Graceful Degradation** — automatically falls back to a lighter model if the premium API is rate-limited.
* **Email Service:** Resend API for transactional emails (OTP, recipe sharing).

### **Database & Auth (Supabase)**
* **Database:** PostgreSQL.
* **Authentication:** Supabase Auth (OTP).

---

## 🔒 Security First: "Zero Trust" Architecture

Security is the cornerstone of this application. The backend completely distrusts client inputs regarding identity.

1. **HttpOnly Cookies & Universal Parser:** All authentication relies on secure `HttpOnly` cookies. The backend ignores `req.body.email` or `req.query.familyId` and cryptographically verifies the immutable `user.id` (UUID) directly from the JWT.
2. **Strict Row Level Security (RLS):** * Read/Write policies are strictly tied to `auth.uid()` and verified `family_id`.
   * Public access is completely blocked.
3. **Custom Auth Hooks (N+1 Query Fix):** A PostgreSQL custom hook injects the user's `family_id` directly into the encrypted JWT `app_metadata` during login, preventing redundant database lookups on every API call.
4. **Isolated Billing State:** Sensitive SaaS subscription limits (daily AI generations, premium status) are extracted into a hermetic `users_billing` table. Users have `SELECT` access only. Updates are performed strictly via a secure Vercel microservice using the Supabase `SERVICE_ROLE_KEY`.
5. **GDPR Compliant Deletion:** A native PostgreSQL `ON DELETE CASCADE` setup tied to the user's UUID ensures that deleting an account perfectly eradicates all associated recipes, lists, and billing data without leaving orphaned records.

---

## 🗄️ Database Schema Overview

* \`public.users\`: Core user data, default preferences, and `family_id`.
* \`public.users_billing\`: Hermetic table for SaaS limits, daily generation tracking, and premium flags.
* \`public.recipes\`: Stores AI-generated recipes, metadata, calories, and author relationships.
* \`public.shopping_lists\`: Stores aggregated shopping lists in JSONB format, shared via `family_id`.

---

## 🚀 Local Environment Setup

To run this project locally, you need to set up the following `.env` variables:

```env
# SUPABASE
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# APIS
GEMINI_API_KEY=your_google_ai_studio_key
RESEND_API_KEY=your_resend_api_key

# AI LIMITS & CONFIG
GEMINI_MODEL_PREMIUM=gemini-2.5-flash
GEMINI_MODEL_FREE=gemini-2.5-flash-lite
DAILY_FREE_LIMIT=5
DAILY_PREMIUM_LIMIT=50

# EMAIL LIMITS
DAILY_FREE_EMAIL_LIMIT=5
DAILY_PREMIUM_EMAIL_LIMIT=30
