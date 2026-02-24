import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import { PrismaClient } from "@prisma/client";
import * as cheerio from "cheerio";
import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";
import cron from "node-cron";
import nodemailer from "nodemailer";
import cors from "cors";

let _prisma: PrismaClient;

function getPrisma() {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

const prisma = new Proxy({} as PrismaClient, {
  get: (target, prop) => {
    const db = getPrisma();
    const value = (db as any)[prop];
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  }
});

const app = express();
const PORT = 3000;

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check and DB connection test
app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ 
      status: "ok", 
      database: "connected",
      env: process.env.NODE_ENV,
      hasDbUrl: !!process.env.DATABASE_URL
    });
  } catch (err: any) {
    console.error("Health check failed:", err);
    res.status(500).json({ 
      status: "error", 
      message: err.message,
      hasDbUrl: !!process.env.DATABASE_URL 
    });
  }
});

app.use(cors()); // Enable CORS for all routes
app.use(express.json());
app.use(cookieParser());

// Session Middleware to ensure each user has a unique ID
const sessionMiddleware = async (req: any, res: Response, next: NextFunction) => {
  try {
    let sessionId = req.cookies.sessionId;
    
    if (!sessionId) {
      sessionId = uuidv4();
      res.cookie("sessionId", sessionId, { 
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        httpOnly: true,
        sameSite: 'none',
        secure: true
      });
    }
    
    // Ensure user exists in DB
    let user = await prisma.user.findUnique({ where: { sessionId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          sessionId,
          email: `${sessionId.substring(0, 8)}@anonymous.com`,
        },
      });
    }
    
    req.userId = user.id;
    next();
  } catch (error) {
    console.error("Session middleware error:", error);
    next(error);
  }
};

// Email Transporter Setup
// Note: In a real app, you would use real SMTP credentials from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendPriceDropEmail(to: string, productTitle: string, oldPrice: number, newPrice: number, currency: string, url: string) {
  if (!to) return;
  
  try {
    const info = await transporter.sendMail({
      from: '"Price Watcher" <notifications@pricewatcher.com>',
      to: to,
      subject: `Price Drop Alert: ${productTitle}`,
      text: `Good news! The price for "${productTitle}" has dropped from ${currency}${oldPrice} to ${currency}${newPrice}.\n\nCheck it out here: ${url}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #10b981;">Price Drop Alert!</h2>
          <p>Good news! The price for <strong>${productTitle}</strong> has dropped.</p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #6b7280;">Old Price: <del>${currency}${oldPrice}</del></p>
            <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; color: #10b981;">New Price: ${currency}${newPrice}</p>
          </div>
          <a href="${url}" style="display: inline-block; background: #10b981; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Product</a>
          <p style="margin-top: 20px; font-size: 12px; color: #9ca3af;">You are receiving this because you tracked this product on Price Watcher.</p>
        </div>
      `,
    });
    console.log("Email sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

// Background Job: Check all products every 6 hours
cron.schedule("0 */6 * * *", async () => {
  console.log("Running background price check...");
  const products = await prisma.product.findMany({
    include: { user: true }
  });
  
  for (const product of products) {
    try {
      const { price, currency } = await scrapePrice(product.url);
      if (price > 0) {
        const oldPrice = product.currentPrice;
        
        await prisma.product.update({
          where: { id: product.id },
          data: {
            currentPrice: price,
            currency: currency,
            priceHistory: {
              create: {
                price: price,
              },
            },
          },
        });

        // Send email if price dropped and user has notification email set
        if (price < oldPrice && product.user.notificationEmail) {
          await sendPriceDropEmail(
            product.user.notificationEmail,
            product.title,
            oldPrice,
            price,
            currency,
            product.url
          );
        }
        
        console.log(`Updated price for: ${product.title}`);
      }
    } catch (err) {
      console.error(`Failed to background check ${product.url}:`, err);
    }
  }
});

// Scraper function refined with more robust detection and timeout
async function scrapeProductData(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    let title = "";
    let price = 0;
    let priceText = "";
    let currency = "₺"; // Default to TL for Trendyol/TR context, or detect

    // 1. Try JSON-LD (most reliable)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() || "{}");
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          if (item["@type"] === "Product" || item["@type"] === "http://schema.org/Product") {
            if (item.name) title = item.name;
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offers.price) {
                price = parseFloat(offers.price);
              }
              if (offers.priceCurrency) {
                currency = offers.priceCurrency === "TRY" ? "₺" : 
                           offers.priceCurrency === "USD" ? "$" : 
                           offers.priceCurrency === "EUR" ? "€" : offers.priceCurrency;
              }
              if (price > 0) return false;
            }
          }
        }
      } catch (e) {}
    });

    // 2. Try Meta Tags (OpenGraph / Twitter)
    if (!title) title = $('meta[property="og:title"]').attr("content") || $('meta[name="twitter:title"]').attr("content") || "";
    if (price === 0) {
      const metaPrice = $('meta[property="product:price:amount"]').attr("content") || 
                        $('meta[property="og:price:amount"]').attr("content") ||
                        $('meta[name="twitter:data1"]').attr("content");
      if (metaPrice) price = parseFloat(metaPrice.replace(/[^0-9.,]/g, "").replace(",", "."));
    }
    
    const metaCurrency = $('meta[property="product:price:currency"]').attr("content") || 
                         $('meta[property="og:price:currency"]').attr("content");
    if (metaCurrency) {
      currency = metaCurrency === "TRY" ? "₺" : 
                 metaCurrency === "USD" ? "$" : 
                 metaCurrency === "EUR" ? "€" : metaCurrency;
    }

    // 3. Try User requested selectors: h1.product-name and span.price
    if (!title) title = $("h1.product-name").text().trim();
    if (price === 0) {
      priceText = $("span.price").text().trim();
      if (priceText) {
        price = parseFloat(priceText.replace(/[^0-9.,]/g, "").replace(",", "."));
        if (priceText.includes("$")) currency = "$";
        else if (priceText.includes("€")) currency = "€";
        else if (priceText.includes("TL") || priceText.includes("₺")) currency = "₺";
      }
    }

    // 4. Site specific logic (Amazon & Trendyol)
    if (url.includes("amazon.com")) {
      // Amazon specific selectors are very consistent
      const amazonPriceWhole = $(".a-price-whole").first().text().trim();
      const amazonPriceFraction = $(".a-price-fraction").first().text().trim();
      const amazonOffscreen = $(".a-price .a-offscreen").first().text().trim();
      
      if (amazonOffscreen) {
        priceText = amazonOffscreen;
        // Clean up Turkish format: 3.871,45 -> replace . with nothing, then , with .
        const cleanPrice = priceText.replace(/[^-0-9,.]/g, "");
        if (cleanPrice.includes(",") && cleanPrice.includes(".")) {
          price = parseFloat(cleanPrice.replace(/\./g, "").replace(",", "."));
        } else if (cleanPrice.includes(",")) {
          price = parseFloat(cleanPrice.replace(",", "."));
        } else {
          price = parseFloat(cleanPrice);
        }
      } else if (amazonPriceWhole) {
        const whole = amazonPriceWhole.replace(/[^0-9]/g, "");
        const fraction = amazonPriceFraction.replace(/[^0-9]/g, "") || "00";
        price = parseFloat(`${whole}.${fraction}`);
      }
      
      if (price > 0) {
        currency = url.includes(".tr") ? "₺" : "$";
      }
    }

    if (url.includes("trendyol.com")) {
      currency = "₺";
      if (price === 0) {
        const trendyolPrice = $(".prc-dsc").text().trim();
        if (trendyolPrice) price = parseFloat(trendyolPrice.replace(/[^0-9.,]/g, "").replace(",", "."));
      }
    }

    // 5. Final Fallbacks (with discount exclusion)
    if (!title) {
      title = $("h1").first().text().trim() || $("title").text().trim() || "Unknown Product";
    }
    
    if (price === 0) {
      // Find all elements that might contain price, but filter out those that look like discounts
      $('[class*="price"], [id*="price"]').each((_, el) => {
        const text = $(el).text().trim();
        // Skip if it contains % (likely a discount) or is too short
        if (text.includes("%") || text.length < 2 || text.length > 20) return true;
        
        const detectedPrice = parseFloat(text.replace(/[^0-9.,]/g, "").replace(",", "."));
        if (detectedPrice > 0) {
          price = detectedPrice;
          priceText = text;
          if (text.includes("$")) currency = "$";
          else if (text.includes("€")) currency = "€";
          else if (text.includes("TL") || text.includes("₺")) currency = "₺";
          return false; // found it
        }
      });
    }

    if (title.length > 100) title = title.substring(0, 97) + "...";

    return { 
      success: true,
      title, 
      price: isNaN(price) ? 0 : price,
      currency,
      rawPrice: priceText 
    };
  } catch (error: any) {
    console.error("Scraping error:", error);
    return { 
      success: false, 
      error: error.message || "Failed to scrape product data" 
    };
  }
}

// Dedicated Scrape Endpoint
app.post("/api/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  const result = await scrapeProductData(url);
  res.json(result);
});

// Update existing scrapePrice to use the new logic
async function scrapePrice(url: string) {
  const result = await scrapeProductData(url);
  // Remove random fallback, return 0 if failed so user knows it's not working
  return { 
    price: result.success && result.price > 0 ? result.price : 0, 
    title: result.success ? result.title : "Unknown Product",
    currency: result.success ? result.currency : "₺"
  };
}

// API Routes
app.get("/api/user", sessionMiddleware, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { email: true, notificationEmail: true }
  });
  res.json(user);
});

app.post("/api/user/settings", sessionMiddleware, async (req: any, res) => {
  const { notificationEmail } = req.body;
  
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { notificationEmail }
    });
    res.json({ success: true, notificationEmail: user.notificationEmail });
  } catch (error) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

app.get("/api/products", sessionMiddleware, async (req: any, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { userId: req.userId },
      include: { priceHistory: { orderBy: { checkedAt: "desc" }, take: 10 } },
      orderBy: { createdAt: "desc" },
    });
    res.json(products);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

app.post("/api/products", sessionMiddleware, async (req: any, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    const { price, title, currency } = await scrapePrice(url);

    const product = await prisma.product.create({
      data: {
        url,
        title,
        currentPrice: price,
        currency: currency,
        userId: req.userId,
        priceHistory: {
          create: {
            price: price,
          },
        },
      },
    });

    res.json(product);
  } catch (error: any) {
    console.error("Failed to add product:", error);
    res.status(500).json({ error: "Failed to add product. Please try again." });
  }
});

app.post("/api/products/:id/check", sessionMiddleware, async (req: any, res) => {
  const id = parseInt(req.params.id);
  const product = await prisma.product.findFirst({ 
    where: { id, userId: req.userId } 
  });

  if (!product) return res.status(404).json({ error: "Product not found or access denied" });

  const { price, currency } = await scrapePrice(product.url);

  const updatedProduct = await prisma.product.update({
    where: { id },
    data: {
      currentPrice: price,
      currency: currency,
      priceHistory: {
        create: {
          price: price,
        },
      },
    },
    include: { priceHistory: { orderBy: { checkedAt: "desc" }, take: 10 } },
  });

  res.json(updatedProduct);
});

app.delete("/api/products/:id", sessionMiddleware, async (req: any, res) => {
  const id = parseInt(req.params.id);
  
  const product = await prisma.product.findFirst({ 
    where: { id, userId: req.userId } 
  });

  if (!product) return res.status(404).json({ error: "Product not found or access denied" });

  // Delete price history first due to relations
  await prisma.priceHistory.deleteMany({ where: { productId: id } });
  await prisma.product.delete({ where: { id } });
  
  res.json({ success: true });
});

// Vercel Cron Job Endpoint
app.get("/api/cron/check", async (req, res) => {
  // Security check: Vercel sends a specific header
  // if (req.headers['x-vercel-cron'] !== 'true') {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  console.log("Running scheduled price check via Vercel Cron...");
  const products = await prisma.product.findMany({
    include: { user: true }
  });
  
  let updatedCount = 0;
  for (const product of products) {
    try {
      const { price, currency } = await scrapePrice(product.url);
      if (price > 0) {
        const oldPrice = product.currentPrice;
        
        await prisma.product.update({
          where: { id: product.id },
          data: {
            currentPrice: price,
            currency: currency,
            priceHistory: {
              create: {
                price: price,
              },
            },
          },
        });

        if (price < oldPrice && product.user.notificationEmail) {
          await sendPriceDropEmail(
            product.user.notificationEmail,
            product.title,
            oldPrice,
            price,
            currency,
            product.url
          );
        }
        updatedCount++;
      }
    } catch (err) {
      console.error(`Cron failed for ${product.url}:`, err);
    }
  }
  
  res.json({ success: true, updated: updatedCount });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Global Error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ 
    error: "Internal Server Error", 
    message: err.message, // Expose error message for debugging
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      configFile: "./vite.config.ts",
    });
    app.use(vite.middlewares);
  }
  // Note: On Vercel, we don't serve static files via Express. 
  // Vercel handles the 'dist' folder automatically.

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "production") {
  startServer();
}

export default app;
