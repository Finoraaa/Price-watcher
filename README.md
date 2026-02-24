# 📦 Price-Watcher

**Price-Watcher** is a smart, full-stack e-commerce price tracking application. It allows users to monitor product prices across various platforms (Amazon, Trendyol, etc.), visualize price history through interactive charts, and receive automated email alerts when prices drop.

![Price-Watcher Dashboard](https://picsum.photos/seed/pricewatcher/1200/600)

## ✨ Features

- 🚀 **Smart Web Scraping**: Advanced logic to extract real prices, handling currency symbols and avoiding discount percentages (optimized for Amazon & Trendyol).
- 📊 **Price History Charts**: Interactive data visualization using Recharts to track price trends over time.
- 📧 **Email Notifications**: Automated alerts sent via Nodemailer when a price drop is detected.
- 👤 **Anonymous Sessions**: Unique tracking for every user using secure, cookie-based sessions.
- 🔄 **Automated Background Checks**: Built-in cron jobs that automatically refresh product prices every 6 hours.
- 🎨 **Modern UI/UX**: Crafted with Tailwind CSS and Framer Motion for a smooth, responsive, and "premium" feel.
- 🗄️ **Robust Backend**: Powered by Express and Prisma, with support for PostgreSQL (Neon Tech) and SQLite.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion, Lucide React.
- **Backend**: Node.js, Express.
- **Database**: PostgreSQL (via Prisma ORM).
- **Automation**: Node-cron for background tasks.
- **Scraping**: Cheerio & Fetch API.
- **Email**: Nodemailer.

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A PostgreSQL database (e.g., [Neon.tech](https://neon.tech))
- SMTP credentials for email notifications (optional)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/price-watcher.git
   cd price-watcher
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory and add your credentials:
   ```env
   DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"
   
   # Optional: Email Settings
   SMTP_HOST="smtp.example.com"
   SMTP_PORT=587
   SMTP_USER="your-email@example.com"
   SMTP_PASS="your-password"
   ```

4. **Initialize the database**:
   ```bash
   npx prisma db push
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```

## 📖 Usage

1. Open the app in your browser.
2. Paste a product URL from Amazon or Trendyol into the search bar.
3. Click **"Track Product"**.
4. Go to **Settings** to add your email address if you want to receive price drop alerts.
5. Watch the **Dashboard** for price updates and history charts!

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

Built with ❤️ by [Finora]
