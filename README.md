# Migoo.OS - Multi-Tenant E-Commerce SaaS Platform

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![React](https://img.shields.io/badge/React-18.3.1-61dafb.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-blue.svg)
![Vite](https://img.shields.io/badge/Vite-6.3.5-646cff.svg)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1.12-38bdf8.svg)

A comprehensive e-commerce platform built for the **Burmese market**, featuring multi-tenant architecture where Migoo acts as the super admin platform aggregating data from all vendors, while each vendor gets their own isolated admin portal and storefront.

> 🚀 **Auto-sync enabled** - All changes sync to GitHub automatically!
> 🔧 **Fixed Recharts production build issue** - Dashboard now loads correctly!

## 🌟 Key Features

### **Multi-Tenant Architecture**
- 🏢 **Super Admin Dashboard** - Migoo platform aggregates ALL vendor data
- 🏪 **Vendor Admin Portals** - Isolated management for each vendor
- 🛍️ **Vendor Storefronts** - Individual vendor profile pages

### **Product Management**
- 📦 Unique SKU system (M001/ME001 with variants: ME001-Black, ME001-Brown)
- 🖼️ Image upload with compression
- 📊 Inventory tracking
- 🏷️ Category management
- 💰 Pricing and discount management

### **Order Processing**
- 📋 Complete order lifecycle management
- 🧾 **Thermal label printing** (100mm × 150mm)
- 📄 Professional invoices with Inter font
- 📦 Single and bulk order printing
- 🚚 Logistics integration
- 📊 Order analytics

### **Bilingual Support** 🌐
- 🇬🇧 English / 🇨🇳 中文
- ⚡ **Instant language switching** (Chrome-like)
- 🎯 **700+ translation keys**
- 📱 All UI elements translated

### **Advanced Features**
- 💬 Live chat system
- 📺 Live streaming
- 📝 Blog management with rich text editor
- 💳 Multiple payment methods (KBZ Pay, Wave Money, True Money)
- 📈 Financial reporting
- 🤝 Collaborator management
- ⚙️ Comprehensive settings

### **Myanmar Market Optimized**
- 📞 Phone format: **+95 9 XXX XXX XXX**
- 💵 Currency: **Myanmar Kyat (K)**
- 🇲🇲 Built for Burmese e-commerce

## 🚀 Tech Stack

### **Frontend**
- **React 18.3.1** with TypeScript
- **Vite 6.3.5** for blazing fast builds
- **Tailwind CSS v4** with custom theme system
- **Radix UI** components for accessibility
- **Recharts** for data visualization
- **Lucide React** for icons
- **Motion** (formerly Framer Motion) for animations
- **Inter font** for professional typography

### **Backend**
- **Supabase** for backend-as-a-service
- **PostgreSQL** database with KV store
- **Hono** web server on Deno Edge Functions
- **Supabase Auth** for authentication
- **Supabase Storage** for file uploads

## 📦 Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/migoo-os.git
cd migoo-os

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev

# Build for production
npm run build
```

## 🔐 Environment Variables

Create a `.env.local` file with:

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_DB_URL=your_supabase_database_url
```

> ⚠️ **Never commit** `.env.local` to Git!

## 🚀 Deployment

### **Deploy to Vercel** (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Vercel auto-detects configuration
   - Click "Deploy"

3. **Add Environment Variables**
   - In Vercel Dashboard → Settings → Environment Variables
   - Add all 4 Supabase variables
   - Redeploy

📖 See **[VERCEL_DEPLOYMENT_READY_FINAL.md](./VERCEL_DEPLOYMENT_READY_FINAL.md)** for detailed instructions.

For **any host** (Netlify, Cloudflare Pages, VPS, etc.), see **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** and copy **`.env.example`** to `.env` for local development.

## 📁 Project Structure

```
migoo-os/
├── src/
│   ├── app/
│   │   ├── components/         # React components
│   │   │   ├── ui/            # Reusable UI components
│   │   │   ├── vendor-admin/  # Vendor portal components
│   │   │   └── *.tsx          # Feature components
│   │   ├── contexts/          # React contexts
│   │   │   ├── LanguageContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── hooks/             # Custom React hooks
│   │   └── utils/             # Utility functions
│   ├── styles/                # Global styles
│   │   ├── fonts.css          # Font imports
│   │   ├── theme.css          # Design tokens
│   │   └── tailwind.css       # Tailwind config
│   └── main.tsx               # App entry point
├── supabase/
│   └── functions/
│       └── server/            # Edge function server
├── utils/
│   └── supabase/
│       └── info.tsx           # Supabase config
├── vercel.json                # Vercel deployment config
├── vite.config.ts             # Vite configuration
└── package.json               # Dependencies
```

## 🎯 Core Sections

1. **🏠 Home** - Dashboard with analytics
2. **📦 Products** - Product CRUD with SKU management
3. **📋 Orders** - Order processing with thermal printing
4. **📢 Marketing** - Campaigns and promotions
5. **📺 Live Stream** - Live streaming management
6. **📝 Blog** - Content management system
7. **⚙️ Settings** - System configuration
8. **🏪 Vendor** - Multi-tenant vendor management
9. **🤝 Collaborator** - Team collaboration
10. **💰 Finances** - Financial reporting
11. **🚚 Logistics** - Shipping and delivery

## 🖨️ Invoice Printing

Optimized for **100mm × 150mm thermal labels**:
- Professional Inter font
- Barcode generation
- Myanmar phone format
- Single and bulk printing
- Print-optimized CSS

## 🌐 Bilingual System

**Instant language switching** - like Chrome's "Translate to..." feature:
- Switch between English and Chinese
- **ALL text** updates instantly
- 700+ translation keys
- Comprehensive coverage

## 📱 Responsive Design

- Mobile-first approach
- Tablet optimization
- Desktop layouts
- Touch-friendly interfaces

## 🔒 Security

- JWT authentication via Supabase
- Row-level security in database
- Service role key protected (server-side only)
- CORS configuration
- Input validation

## ⚡ Performance

- Code splitting for optimal loading
- Lazy loading for routes
- Image compression
- Asset caching (1 year)
- Bundle optimization
- Tree shaking

## 🤝 Contributing

This is a private project for demonstration purposes. Not accepting contributions at this time.

## 📄 License

Proprietary - All rights reserved

## 🙏 Acknowledgments

- Built with React and TypeScript
- Styled with Tailwind CSS v4
- UI components from Radix UI
- Icons from Lucide React
- Backend powered by Supabase
- Deployed on Vercel

---

**Built with ❤️ for the Burmese Market**

For deployment help, see:
- 📘 [VERCEL_DEPLOYMENT_READY_FINAL.md](./VERCEL_DEPLOYMENT_READY_FINAL.md)
- ✅ [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)