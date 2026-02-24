import React, { useState, useEffect } from "react";
import { Plus, RefreshCw, ExternalLink, TrendingDown, TrendingUp, Trash2, LineChart, Package, Search, Mail } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LineChart as ReLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PriceHistory {
  id: number;
  price: number;
  checkedAt: string;
}

interface Product {
  id: number;
  url: string;
  title: string;
  currentPrice: number;
  currency: string;
  createdAt: string;
  priceHistory: PriceHistory[];
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [user, setUser] = useState<{ notificationEmail: string | null } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsEmail, setSettingsEmail] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/user");
      const data = await res.json();
      setUser(data);
      if (data.notificationEmail) setSettingsEmail(data.notificationEmail);
    } catch (err) {
      console.error("Failed to fetch user", err);
    }
  };

  const updateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationEmail: settingsEmail }),
      });
      if (res.ok) {
        setStatus({ type: 'success', message: "Settings updated successfully!" });
        fetchUser();
        setShowSettings(false);
      } else {
        setStatus({ type: 'error', message: "Failed to update settings." });
      }
    } catch (err) {
      setStatus({ type: 'error', message: "Network error while updating settings." });
    } finally {
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (Array.isArray(data)) {
        setProducts(data);
      } else {
        console.error("Products response is not an array:", data);
        setProducts([]);
      }
    } catch (err) {
      console.error("Failed to fetch products", err);
      setProducts([]);
    }
  };

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setStatus(null);
    
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setUrl("");
        setStatus({ type: 'success', message: `Successfully tracking: ${data.title}` });
        fetchProducts();
      } else {
        setStatus({ type: 'error', message: data.error || "Failed to add product" });
      }
    } catch (err: any) {
      console.error("Failed to add product", err);
      let errorMessage = "Connection error. Please check your internet.";
      
      if (err.name === 'SyntaxError') {
        errorMessage = "Server error: Invalid response format.";
      } else if (err.message) {
        errorMessage = `Error: ${err.message}`;
      }
      
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setLoading(false);
      // Clear status after 5 seconds
      setTimeout(() => setStatus(null), 5000);
    }
  };

  const checkPrice = async (id: number) => {
    setCheckingId(id);
    try {
      const res = await fetch(`/api/products/${id}/check`, { method: "POST" });
      if (res.ok) {
        fetchProducts();
      }
    } catch (err) {
      console.error("Failed to check price", err);
    } finally {
      setCheckingId(null);
    }
  };

  const deleteProduct = async (id: number) => {
    // Remove confirm as requested to make it more responsive
    try {
      // Optimistically update UI
      setProducts(prev => prev.filter(p => p.id !== id));
      
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        setStatus({ type: 'success', message: "Product removed from tracking." });
      } else {
        setStatus({ type: 'error', message: "Failed to remove product from server." });
        fetchProducts(); // Revert on failure
      }
    } catch (err) {
      console.error("Failed to delete product", err);
      setStatus({ type: 'error', message: "Network error while removing product." });
      fetchProducts(); // Revert on failure
    } finally {
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const getPriceChange = (product: Product) => {
    if (product.priceHistory.length < 2) return null;
    const current = product.currentPrice;
    const previous = product.priceHistory[1].price;
    const diff = current - previous;
    const percent = (diff / previous) * 100;
    return { diff, percent };
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white">
              <Package size={18} />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">Price-Watcher</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium">
            <button 
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Dashboard
            </button>
            <button 
              onClick={() => setStatus({ type: 'error', message: "History feature coming soon!" })}
              className="text-black/40 hover:text-black/60 transition-colors"
            >
              History
            </button>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`${showSettings ? 'text-emerald-600' : 'text-black/40 hover:text-black/60'} transition-colors`}
            >
              Settings
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-12 overflow-hidden"
            >
              <div className="bg-white border border-black/5 rounded-2xl p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
                    <Mail size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Notification Settings</h2>
                    <p className="text-sm text-black/40">Get notified via email when prices drop.</p>
                  </div>
                </div>
                
                <form onSubmit={updateSettings} className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    value={settingsEmail}
                    onChange={(e) => setSettingsEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 bg-black/[0.02] border border-black/5 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-500/20"
                  >
                    Save Settings
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modern Centered Add Product Section */}
        <section className="mb-16 flex flex-col items-center text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl w-full"
          >
            <h2 className="text-4xl font-bold mb-4 tracking-tight text-black">Track Prices Effortlessly</h2>
            <p className="text-black/50 mb-8 text-lg">Paste a product URL below and we'll handle the rest. We'll track the price history and notify you of changes.</p>
            
            <form onSubmit={addProduct} className="relative group">
              <div className="flex flex-col md:flex-row gap-3 p-2 bg-white rounded-2xl shadow-xl shadow-black/5 border border-black/5 transition-all group-focus-within:border-emerald-500/30 group-focus-within:shadow-emerald-500/5">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={20} />
                  <input
                    type="url"
                    placeholder="Paste product link here (e.g. Amazon, Trendyol...)"
                    className="w-full bg-transparent border-none py-4 pl-12 pr-4 outline-none text-lg placeholder:text-black/20"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-600/20"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="animate-spin" size={20} />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown size={20} />
                      <span>Start Tracking</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            <AnimatePresence>
              {status && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`mt-4 p-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
                    status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                  }`}
                >
                  {status.type === 'success' ? <Package size={16} /> : <Trash2 size={16} />}
                  {status.message}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </section>

        {/* Products Grid */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-semibold tracking-tight">Active Trackers</h2>
            <span className="text-xs font-mono uppercase tracking-widest text-black/40 bg-black/5 px-2 py-1 rounded">
              {products.length} Products
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <AnimatePresence mode="popLayout">
              {Array.isArray(products) && products.map((product) => {
                const change = getPriceChange(product);
                const chartData = [...product.priceHistory].reverse().map(h => ({
                  time: new Date(h.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  price: h.price
                }));

                return (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl overflow-hidden shadow-sm border border-black/5 flex flex-col md:flex-row"
                  >
                    {/* Product Info */}
                    <div className="p-6 md:w-1/3 border-b md:border-b-0 md:border-r border-black/5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between mb-4">
                          <h3 className="font-semibold text-lg leading-tight line-clamp-2">{product.title}</h3>
                          <a href={product.url} target="_blank" rel="noopener noreferrer" className="text-black/20 hover:text-emerald-600 transition-colors">
                            <ExternalLink size={18} />
                          </a>
                        </div>
                        
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-3xl font-light tracking-tighter">
                            {product.currency}{product.currentPrice.toFixed(2)}
                          </span>
                          {change && (
                            <span className={`text-xs font-medium flex items-center gap-0.5 ${change.diff > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                              {change.diff > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              {Math.abs(change.percent).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono uppercase tracking-wider text-black/30">Current Price</p>
                      </div>

                      <div className="mt-8 flex gap-2">
                        <button
                          onClick={() => checkPrice(product.id)}
                          disabled={checkingId === product.id}
                          className="flex-1 bg-black/5 hover:bg-black/10 disabled:opacity-50 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          <RefreshCw className={checkingId === product.id ? "animate-spin" : ""} size={14} />
                          Check Now
                        </button>
                        <motion.button 
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => deleteProduct(product.id)}
                          className="p-2 text-black/20 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </motion.button>
                      </div>
                    </div>

                    {/* Chart Area */}
                    <div className="flex-1 p-6 bg-black/[0.01]">
                      <div className="flex items-center gap-2 mb-4">
                        <LineChart size={14} className="text-black/30" />
                        <span className="text-[10px] font-mono uppercase tracking-wider text-black/30">Price History (Last 10 checks)</span>
                      </div>
                      <div className="h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ReLineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis 
                              dataKey="time" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{fontSize: 10, fill: 'rgba(0,0,0,0.3)'}} 
                            />
                            <YAxis 
                              hide 
                              domain={['auto', 'auto']} 
                            />
                            <Tooltip 
                              formatter={(value: number) => [`${product.currency}${value.toFixed(2)}`, 'Price']}
                              contentStyle={{ 
                                borderRadius: '12px', 
                                border: 'none', 
                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
                                fontSize: '12px'
                              }} 
                            />
                            <Line 
                              type="monotone" 
                              dataKey="price" 
                              stroke="#059669" 
                              strokeWidth={2} 
                              dot={{ r: 3, fill: '#059669', strokeWidth: 0 }}
                              activeDot={{ r: 5, strokeWidth: 0 }}
                            />
                          </ReLineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {products.length === 0 && !loading && (
              <div className="py-20 text-center border-2 border-dashed border-black/5 rounded-3xl">
                <div className="w-12 h-12 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4 text-black/20">
                  <Package size={24} />
                </div>
                <h3 className="font-medium text-black/40">No products tracked yet</h3>
                <p className="text-sm text-black/20">Add your first product URL above to start monitoring.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-black/5 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-black/20">
          Price-Watcher &copy; 2024 &bull; Built with Prisma & Vite
        </p>
      </footer>
    </div>
  );
}
