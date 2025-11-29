# COMPLETE DEPLOYMENT & IMPLEMENTATION GUIDE
# AmbuLink AI - Emergency Healthcare Communication Platform

## 📋 TABLE OF CONTENTS
1. Quick Start
2. Local Development Setup
3. Production Deployment
4. API Integration
5. Testing & Validation
6. Monitoring & Maintenance
7. Troubleshooting

---

## 🚀 QUICK START (5 MINUTES)

### Prerequisites Check
```bash
# Verify installations
python --version          # 3.10+
node --version           # 16+
docker --version         # 20.10+
postgresql --version     # 12+
```

### Clone & Setup
```bash
# Clone repository
git clone https://github.com/yourusername/ambulink-ai.git
cd ambulink-ai

# Create environment file
cat > .env << EOF
DATABASE_URL=postgresql://ambulink:password@localhost:5432/ambulink_db
REDIS_URL=redis://localhost:6379
SECRET_KEY=your-super-secret-key-here
HIPAA_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
MAPBOX_TOKEN=your_mapbox_token_here
ENVIRONMENT=development
EOF

# Start with Docker Compose
docker-compose up -d

# Wait for services to start
sleep 10

# Initialize database
docker-compose exec backend flask db upgrade

# Verify all services
docker-compose ps
```

### Access Dashboard
- 🏥 Hospital Dashboard: http://localhost:3000
- 📱 API Docs: http://localhost:5000/api/docs
- 🗄️ Database Admin: pgAdmin on localhost:5050

---

## 🛠️ LOCAL DEVELOPMENT SETUP

### Backend Setup (Python/Flask)

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file in backend directory
cat > .env << EOF
DATABASE_URL=postgresql://user:password@localhost:5432/ambulink_db
FLASK_ENV=development
DEBUG=True
SECRET_KEY=dev-secret-key
HIPAA_ENCRYPTION_KEY=your-encryption-key
EOF

# Initialize database
flask db init          # First time only
flask db migrate -m "Initial migration"
flask db upgrade

# Create admin user
python -c "
from ambulink.models import User, db
from ambulink.app import app

with app.app_context():
    admin = User(
        username='admin',
        email='admin@ambulink.ai',
        password_hash='hashed_password',
        role='admin'
    )
    db.session.add(admin)
    db.session.commit()
    print('Admin user created')
"

# Run development server
flask run
# Server running on http://localhost:5000
```

### Frontend Setup (React)

```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Create environment file
cat > .env.local << EOF
REACT_APP_API_URL=http://localhost:5000
REACT_APP_MAPBOX_TOKEN=your_mapbox_token
REACT_APP_ENVIRONMENT=development
EOF

# Start development server
npm run dev
# Dashboard running on http://localhost:5173
```

### Mobile App Setup (React Native)

```bash
# Navigate to mobile
cd mobile

# Install dependencies
npm install

# For iOS
npm run ios

# For Android
npm run android

# Or use Expo (recommended for development)
npx expo start
# Scan QR code with Expo Go app
```

---

## 🌐 PRODUCTION DEPLOYMENT

### AWS Deployment (Recommended)

#### 1. Setup AWS Infrastructure

```bash
# Install AWS CLI and Terraform
pip install awscli
terraform --version

# Configure AWS credentials
aws configure

# Navigate to infrastructure
cd infrastructure/terraform

# Initialize Terraform
terraform init

# Plan deployment
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan
```

#### 2. Environment Configuration (Production)

```bash
# Create .env.production in backend/
cat > backend/.env.production << EOF
DATABASE_URL=postgresql://user:pwd@ambulink-rds.xxxxx.rds.amazonaws.com:5432/ambulink
REDIS_URL=ambulink-redis.xxxxx.ng.0001.use1.cache.amazonaws.com:6379
SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
HIPAA_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
ENVIRONMENT=production
LOG_LEVEL=INFO
HIPAA_MODE=strict
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
SENTRY_DSN=your_sentry_dsn
EOF
```

#### 3. Build & Push Docker Images

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build images
docker build -t ambulink-backend:latest -f backend/Dockerfile ./backend
docker build -t ambulink-frontend:latest -f frontend/Dockerfile ./frontend

# Tag images for ECR
docker tag ambulink-backend:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/ambulink-backend:latest
docker tag ambulink-frontend:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/ambulink-frontend:latest

# Push to ECR
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/ambulink-backend:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/ambulink-frontend:latest
```

#### 4. Deploy to ECS/EKS

```bash
# Update task definition
aws ecs update-service \
  --cluster ambulink-prod \
  --service ambulink-backend \
  --force-new-deployment

# Monitor deployment
aws ecs describe-services \
  --cluster ambulink-prod \
  --services ambulink-backend
```

#### 5. SSL/TLS Certificate

```bash
# Request ACM certificate
aws acm request-certificate \
  --domain-name api.ambulink.ai \
  --validation-method DNS

# Validate DNS
# Add CNAME record to Route53

# Verify
aws acm describe-certificate --certificate-arn arn:aws:acm:...
```

### Azure Deployment Alternative

```bash
# Login to Azure
az login

# Create resource group
az group create --name ambulink --location eastus

# Deploy with Azure Container Instances
az container create \
  --resource-group ambulink \
  --name ambulink-backend \
  --image YOUR_ACR.azurecr.io/ambulink-backend:latest \
  --cpu 2 \
  --memory 4

# Create PostgreSQL flexible server
az postgres flexible-server create \
  --resource-group ambulink \
  --name ambulink-db \
  --location eastus \
  --admin-user ambulinkadmin
```

---

## 📊 DATABASE SETUP

### PostgreSQL Initialization

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE USER ambulink WITH PASSWORD 'strong_password';
CREATE DATABASE ambulink_db OWNER ambulink;
GRANT ALL PRIVILEGES ON DATABASE ambulink_db TO ambulink;

# Enable extensions (for UUID, PostGIS if needed)
\c ambulink_db
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

# Create tables
psql -U ambulink -d ambulink_db -f schema.sql
```

### Database Backup & Recovery

```bash
# Backup database
pg_dump -U ambulink ambulink_db > ambulink_db_backup.sql

# Compress backup
gzip ambulink_db_backup.sql

# Restore from backup
psql -U ambulink ambulink_db < ambulink_db_backup.sql

# Automated daily backup
0 2 * * * pg_dump -U ambulink ambulink_db | gzip > /backups/ambulink_$(date +\%Y\%m\%d).sql.gz
```

---

## 🔐 HIPAA COMPLIANCE CHECKLIST

### Pre-Launch Verification

- [ ] **Encryption**
  - [ ] TLS 1.3 enabled on all endpoints
  - [ ] AES-256 encryption for data at rest
  - [ ] Key management system configured
  
- [ ] **Access Control**
  - [ ] Role-based access control (RBAC) implemented
  - [ ] Multi-factor authentication enabled
  - [ ] Password policies enforced (min 12 chars, complexity)
  
- [ ] **Audit Logging**
  - [ ] All PHI access logged
  - [ ] Logs stored securely for 6+ years
  - [ ] Regular audit log reviews scheduled
  
- [ ] **Data Security**
  - [ ] No unencrypted PHI in logs
  - [ ] Regular penetration testing completed
  - [ ] Vulnerability scanning enabled
  - [ ] Security patches applied
  
- [ ] **Business Associate Agreements**
  - [ ] BAA signed with AWS/Cloud provider
  - [ ] BAA signed with any integrations
  - [ ] DUA signed with partners
  
- [ ] **Incident Response**
  - [ ] Breach notification procedures documented
  - [ ] Incident response team designated
  - [ ] Breach assessment process established
  - [ ] Communication template prepared

---

## 🧪 TESTING & VALIDATION

### Unit Tests

```bash
# Backend tests
cd backend
pytest tests/unit -v --cov=ambulink

# Frontend tests
cd ../frontend
npm test -- --coverage

# Mobile tests
cd ../mobile
npm test
```

### Integration Tests

```bash
# Start test environment
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
pytest tests/integration -v

# Load testing
k6 run tests/load/ambulink_load_test.js

# Security testing
pytest tests/security -v
```

### Manual Testing Scenarios

**Scenario 1: Normal Patient Flow**
```
1. Paramedic opens ambulance app
2. Fills patient demographics (2 min)
3. Captures vital signs (1 min)
4. Enters chief complaint (1 min)
5. Submits patient data
✓ Hospital receives alert immediately
✓ Physician sees pre-generated record
✓ Triage level displayed
```

**Scenario 2: Offline Scenario**
```
1. Paramedic opens app offline
2. Enters patient data (saves locally)
3. Connection restored
4. Data automatically syncs
✓ No data loss
✓ Hospital receives alert
✓ Correct timestamp maintained
```

**Scenario 3: Critical Patient**
```
1. Patient with ESI-1 triage level
2. Multiple critical vitals
✓ Red alert badge shown
✓ Notification sent to all ED staff
✓ ICU team automatically alerted
✓ Emergency resources mobilized
```

---

## 📈 MONITORING & MAINTENANCE

### Application Monitoring

```bash
# Install monitoring stack
docker run -d -p 9090:9090 prom/prometheus
docker run -d -p 3000:3000 grafana/grafana
docker run -d -p 9100:9100 prom/node-exporter

# Monitor key metrics
- API response time: target < 100ms
- Database query time: target < 20ms
- System CPU usage: target < 70%
- Memory usage: target < 80%
- Disk space: target > 20% free
- Uptime: target 99.9%
```

### Health Check Endpoints

```bash
# Backend health
curl http://localhost:5000/health

# Database status
curl http://localhost:5000/api/status/database

# Cache status
curl http://localhost:5000/api/status/cache

# Full system status
curl http://localhost:5000/api/status
```

### Log Monitoring

```bash
# View backend logs
docker-compose logs -f backend

# View frontend logs
docker-compose logs -f frontend

# Search logs for errors
docker-compose logs backend | grep ERROR

# Export logs
docker-compose logs > ambulink_logs_$(date +%Y%m%d).txt
```

### Performance Optimization

```bash
# Database optimization
VACUUM ANALYZE;
REINDEX DATABASE ambulink_db;

# Redis cache optimization
INFO memory

# Review slow queries
SELECT query, calls, mean_time FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;
```

---

## 🐛 TROUBLESHOOTING

### Common Issues

**Issue 1: Database Connection Failed**
```
Error: could not connect to server

Solution:
1. Check PostgreSQL is running: pg_isready
2. Verify credentials in .env
3. Check network connectivity: ping db_host
4. Verify firewall rules
5. Check disk space on database server
```

**Issue 2: WebSocket Connection Timeout**
```
Error: WebSocket connection timeout

Solution:
1. Check firewall allows WebSocket ports (80, 443, 5000)
2. Verify Socket.IO is running: netstat -an | grep 5000
3. Check browser console for CORS errors
4. Verify load balancer has WebSocket enabled
5. Increase timeout in client config
```

**Issue 3: High Memory Usage**
```
Error: Memory usage exceeding 80%

Solution:
1. Restart containers: docker-compose restart
2. Clear Redis cache: redis-cli FLUSHALL
3. Increase container memory limits
4. Review code for memory leaks
5. Scale to multiple replicas
```

**Issue 4: Slow API Response**
```
Error: API responses > 500ms

Solution:
1. Check database query performance: EXPLAIN ANALYZE
2. Verify indexes are created
3. Check Redis cache hit rate
4. Profile code with cProfile
5. Add database read replicas
6. Implement query caching
```

**Issue 5: Patient Data Not Syncing**
```
Error: Offline data not syncing to server

Solution:
1. Check network connectivity
2. Verify API endpoint is accessible
3. Check auth token validity
4. Review app logs for errors
5. Clear app cache and retry
6. Update app to latest version
```

---

## 📱 MOBILE APP SPECIFIC

### iOS Build

```bash
# Install dependencies
cd mobile
npm install

# Build for iOS
npm run ios

# Or build release
cd ios
xcodebuild -workspace ambulink.xcworkspace \
  -scheme ambulink \
  -configuration Release \
  -archivePath build/ambulink.xcarchive

# Export IPA
xcodebuild -exportArchive \
  -archivePath build/ambulink.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ExportOptions.plist
```

### Android Build

```bash
# Build Android release
cd mobile
npm run android -- --release

# Or build APK
cd android
./gradlew assembleRelease

# Sign APK
jarsigner -verbose -sigalg MD5withRSA -digestalg SHA1 \
  -keystore my-release-key.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  alias_name
```

---

## 📞 SUPPORT & RESOURCES

### Documentation Files
- `/docs/API.md` - Complete API reference
- `/docs/ARCHITECTURE.md` - System architecture
- `/docs/HIPAA_COMPLIANCE.md` - Security details
- `/docs/DEPLOYMENT.md` - Deployment guide
- `/docs/TROUBLESHOOTING.md` - Common issues

### Contact & Support
- 📧 Email: support@ambulink.ai
- 💬 Slack: #ambulink-support
- 🐛 Issues: GitHub Issues
- 📞 Emergency: +1-XXX-XXX-XXXX

### Useful Links
- [Flask Documentation](https://flask.palletsprojects.com/)
- [React Documentation](https://react.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [HIPAA Compliance Guide](https://www.hhs.gov/hipaa/)
- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)

---

## ✅ CHECKLIST FOR GO-LIVE

- [ ] All environment variables configured
- [ ] Database backups tested
- [ ] SSL/TLS certificates installed
- [ ] Firewall rules configured
- [ ] HIPAA compliance audit completed
- [ ] Performance tested under load
- [ ] Disaster recovery plan in place
- [ ] Staff training completed
- [ ] Support team on-call scheduled
- [ ] Monitoring and alerts configured
- [ ] Documentation prepared
- [ ] Launch date scheduled
- [ ] Press release prepared
- [ ] Customer notifications sent
- [ ] Go-live meeting scheduled

---

**Last Updated:** November 29, 2025
**Version:** 1.0.0
**Status:** Production Ready