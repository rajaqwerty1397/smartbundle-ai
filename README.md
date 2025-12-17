# SmartBundle AI - Shopify App

AI-powered product bundles and upsells to boost your average order value.

## 🌟 Features

- **Dashboard** - Overview of bundles, analytics, and quick actions
- **Bundles** - Create fixed, mix & match, volume, and BOGO bundles
- **AI Suggestions** - Let AI analyze your catalog and suggest optimal bundles
- **Analytics** - Track views, clicks, purchases, and revenue
- **Settings** - Configure AI model, feature toggles, and more
- **GDPR Compliant** - Built-in webhooks for data requests and deletion

## 🚀 Quick Start

### Prerequisites

- Node.js 20 LTS (⚠️ Do NOT use Node 24)
- Docker Desktop running with smartbundle containers
- Shopify Partner account
- Groq API key (free at https://console.groq.com)

### 1. Verify Docker Containers are Running

Your Docker containers should be running:
- `smartbundle-postgres` on port **5433**
- `smartbundle-redis` on port **6380**

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Edit `.env` file and add your Groq API key:

```env
GROQ_API_KEY=your_actual_groq_api_key_here
```

The database connection is already configured:
```env
DATABASE_URL="postgresql://smartbundle:smartbundle123@localhost:5433/smartbundle_dev?schema=public"
```

### 4. Setup Database

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (creates new tables)
npx prisma migrate dev --name smartbundle_init
```

### 5. Start Development

```bash
npm run dev
```

This will:
- Start the development server
- Create a tunnel to your local server
- Connect to your development store

## 📁 Project Structure

```
app/
├── routes/
│   ├── app._index.tsx           # Dashboard
│   ├── app.bundles._index.tsx   # Bundles list
│   ├── app.bundles.new.tsx      # Create bundle
│   ├── app.bundles.$id.tsx      # Edit bundle
│   ├── app.bundles.ai-suggest.tsx # AI suggestions
│   ├── app.analytics.tsx        # Analytics
│   ├── app.settings.tsx         # Settings
│   ├── app.upsells.tsx          # Upsells (coming soon)
│   ├── app.tsx                  # App layout with nav
│   └── webhooks.tsx             # Webhook handlers
├── shopify.server.ts            # Shopify authentication
└── root.tsx                     # Root layout
prisma/
└── schema.prisma                # Database schema (PostgreSQL)
```

## 🐳 Docker Commands

```bash
# Check running containers
docker ps

# Connect to PostgreSQL
docker exec -it smartbundle-postgres psql -U smartbundle -d smartbundle_dev

# View PostgreSQL logs
docker logs smartbundle-postgres

# Connect to Redis
docker exec -it smartbundle-redis redis-cli
```

## 💰 AI Cost (Groq)

| Model | Input (per M) | Output (per M) | Use Case |
|-------|---------------|----------------|----------|
| Llama 3.1 8B | $0.05 | $0.08 | Default, fastest |
| Llama 3.3 70B | $0.59 | $0.79 | Most capable |
| Qwen3 32B | $0.29 | $0.59 | Balanced |

## 🏆 Built for Shopify Compliance

- ✅ Embedded in Shopify Admin
- ✅ Polaris UI components
- ✅ Session token authentication
- ✅ GDPR webhooks (data request, redact)
- ✅ Clean uninstall

## 🔧 Troubleshooting

**Database connection error:**
```bash
# Check if Docker is running
docker ps

# Verify PostgreSQL container is healthy
docker logs smartbundle-postgres
```

**Migration fails:**
```bash
# Reset and recreate database
npx prisma migrate reset
```

**View database tables:**
```bash
npx prisma studio
```

## 📝 Next Steps

After this step is working:

1. **Step 2**: Add Theme App Extension for storefront bundle display
2. **Step 3**: Implement storefront API for bundle recommendations
3. **Step 4**: Add A/B testing
4. **Step 5**: Add more AI features
