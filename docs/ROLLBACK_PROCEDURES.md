# Rollback Procedures

This document provides detailed rollback procedures for the HFT Trading System deployment.

## Overview

Rollback procedures allow you to revert to a previous known-good state in case of deployment failures, critical bugs, or performance issues.

## Prerequisites

- Backup directory must exist with valid backups
- Deployment scripts must be available
- Sufficient permissions to stop/start services
- Access to configuration files

## Automated Rollback

### Using Deployment Scripts

**Linux/Mac:**
```bash
# Rollback to specific backup
./scripts/deploy.sh rollback 20231201_120000

# Rollback with specific mode
DEPLOYMENT_MODE=docker ./scripts/deploy.sh rollback 20231201_120000
```

**Windows:**
```cmd
# Rollback to specific backup
scripts\deploy.bat rollback 20231201_120000

# Rollback with specific mode
set DEPLOYMENT_MODE=docker
scripts\deploy.bat rollback 20231201_120000
```

### Available Backups

List available backups:
```bash
# Linux/Mac
ls -la backup/config/
ls -la backup/database/
ls -la backup/audit/

# Windows
dir backup\config\
dir backup\database\
dir backup\audit\
```

## Manual Rollback Procedures

### Scenario 1: Configuration Rollback

**When to use:** Configuration changes caused issues

**Steps:**
1. Stop all services
2. Restore configuration files
3. Restart services

```bash
# Stop services
docker-compose down

# Restore configuration
tar -xzf backup/config/config_20231201_120000.tar.gz

# Restart services
docker-compose up -d
```

### Scenario 2: Database Rollback

**When to use:** Database corruption or data loss

**Steps:**
1. Stop all services
2. Backup current database
3. Restore from backup
4. Restart services

```bash
# Stop services
docker-compose down

# Backup current database
cp -r exchange_simulator/data backup/database/data_current

# Restore from backup
rm -rf exchange_simulator/data
cp -r backup/database/data_20231201_120000 exchange_simulator/data

# Restart services
docker-compose up -d
```

### Scenario 3: Audit Log Rollback

**When to use:** Audit log corruption or issues

**Steps:**
1. Stop services
2. Restore audit logs
3. Restart services

```bash
# Stop services
docker-compose down

# Restore audit logs
rm -rf exchange_simulator/logs/audit
cp -r backup/audit/audit_20231201_120000 exchange_simulator/logs/audit

# Restart services
docker-compose up -d
```

### Scenario 4: Full System Rollback

**When to use:** Complete system failure

**Steps:**
1. Stop all services
2. Restore configurations
3. Restore databases
4. Restore audit logs
5. Restart services
6. Verify health

```bash
# Stop services
docker-compose down

# Restore configurations
tar -xzf backup/config/config_20231201_120000.tar.gz

# Restore databases
rm -rf exchange_simulator/data ai-signal-bot/data
cp -r backup/database/data_20231201_120000 exchange_simulator/data
cp -r backup/database/ai_data_20231201_120000 ai-signal-bot/data

# Restore audit logs
rm -rf exchange_simulator/logs/audit
cp -r backup/audit/audit_20231201_120000 exchange_simulator/logs/audit

# Restart services
docker-compose up -d

# Verify health
curl http://localhost:8765/health
curl http://localhost:8766/health
curl http://localhost:9091/health
```

## Git-Based Rollback

### Rollback Code Changes

**When to use:** Code changes caused issues

**Steps:**
1. Check current git status
2. Identify previous stable commit
3. Checkout stable commit
4. Rebuild and redeploy

```bash
# Check current status
git status
git log --oneline -10

# Checkout previous stable commit
git checkout <stable-commit-hash>

# Rebuild and redeploy
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Rollback to Previous Tag

```bash
# List available tags
git tag

# Checkout previous tag
git checkout v3.0.0

# Rebuild and redeploy
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Docker-Specific Rollback

### Rollback Docker Images

**When to use:** Docker image issues

**Steps:**
1. Stop containers
2. Remove current images
3. Pull previous images
4. Restart containers

```bash
# Stop containers
docker-compose down

# Remove current images
docker rmi hft-exchange-simulator hft-ai-signal-bot hft-hft-trade-bot hft-web-ui

# Pull previous images (if tagged)
docker pull hft-exchange-simulator:v3.0.0
docker pull hft-ai-signal-bot:v3.0.0
docker pull hft-hft-trade-bot:v3.0.0
docker pull hft-web-ui:v3.0.0

# Update docker-compose.yml to use specific tags
# Then restart
docker-compose up -d
```

### Rollback Docker Volumes

**When to use:** Volume corruption

**Steps:**
1. Stop containers
2. Backup current volumes
3. Restore from backup
4. Restart containers

```bash
# Stop containers
docker-compose down

# Backup current volumes
docker run --rm -v hft-sim-data:/data -v $(pwd)/backup:/backup alpine tar czf /backup/data_backup.tar.gz /data

# Restore from backup
docker run --rm -v hft-sim-data:/data -v $(pwd)/backup:/backup alpine tar xzf /backup/data_20231201_120000.tar.gz -C /

# Restart containers
docker-compose up -d
```

## Native Deployment Rollback

### Rollback Native Services

**When to use:** Native deployment issues

**Steps:**
1. Stop all processes
2. Restore files
3. Restart processes

```bash
# Stop processes
pkill -f exchange_simulator
pkill -f ai_signal_bot
pkill -f hft_trade_bot
pkill -f vite

# Restore configurations
tar -xzf backup/config/config_20231201_120000.tar.gz

# Restore databases
rm -rf exchange_simulator/data ai-signal-bot/data
cp -r backup/database/data_20231201_120000 exchange_simulator/data
cp -r backup/database/ai_data_20231201_120000 ai-signal-bot/data

# Restart processes
cd exchange_simulator
python -m exchange_simulator --no-visualizer &
cd ..

cd ai-signal-bot
python run.py &
cd ..

cd hft-trade-bot
./build/hft_trade_bot config/config.yaml &
cd ..

cd web-ui
npm run preview &
cd ..
```

## Verification After Rollback

### Health Checks

```bash
# Check exchange simulator
curl http://localhost:8765/health

# Check AI signal bot
curl http://localhost:8766/health

# Check HFT trade bot
curl http://localhost:9091/health

# Check web UI
curl http://localhost:3000
```

### Log Verification

```bash
# Check logs for errors
docker-compose logs exchange-simulator | grep -i error
docker-compose logs ai-signal-bot | grep -i error
docker-compose logs hft-trade-bot | grep -i error
docker-compose logs web-ui | grep -i error
```

### Functionality Verification

1. Verify WebSocket connections
2. Verify order submission
3. Verify price updates
4. Verify signal generation
5. Verify audit logging

## Emergency Rollback

### Immediate Shutdown

```bash
# Emergency stop all services
docker-compose down --remove-orphans

# Or kill all processes
pkill -9 -f exchange_simulator
pkill -9 -f ai_signal_bot
pkill -9 -f hft_trade_bot
pkill -9 -f vite
```

### Emergency Restore

```bash
# Restore last known good backup
./scripts/deploy.sh rollback $(ls -t backup/config/ | head -1 | sed 's/config_//;s/.tar.gz//')
```

## Rollback Decision Tree

```
Issue Detected
    |
    v
Is it critical?
    |
    +-- Yes --> Emergency Rollback
    |              |
    |              v
    |         Immediate Shutdown
    |              |
    |              v
    |         Restore Last Known Good
    |
    +-- No --> Identify Affected Component
                   |
                   v
              Is it configuration?
                   |
                   +-- Yes --> Configuration Rollback
                   |
                   +-- No --> Is it database?
                              |
                              +-- Yes --> Database Rollback
                              |
                              +-- No --> Is it code?
                                         |
                                         +-- Yes --> Git Rollback
                                         |
                                         +-- No --> Full System Rollback
```

## Post-Rollback Actions

### 1. Document the Rollback

Create a rollback report:
```markdown
# Rollback Report

**Date:** 2023-12-01
**Time:** 12:00:00
**Reason:** Critical bug in order execution
**Backup Used:** 20231201_120000
**Rollback Method:** Automated script
**Duration:** 5 minutes
**Status:** Success

**Issues Found:**
- Order execution latency exceeded 100ms
- Some orders were not being filled

**Root Cause:**
- Recent change to order matching logic

**Prevention:**
- Add more comprehensive testing
- Implement canary deployment
```

### 2. Investigate Root Cause

- Review logs from failed deployment
- Analyze configuration changes
- Review code changes
- Test in staging environment

### 3. Fix the Issue

- Implement fix in development
- Test thoroughly
- Deploy to staging
- Verify fix works

### 4. Redeploy

```bash
# After fix is verified
./scripts/deploy.sh deploy
```

## Best Practices

### 1. Regular Backups

- Schedule automated backups
- Keep multiple backup versions
- Test backup restoration regularly

### 2. Test Rollback Procedures

- Practice rollback in staging
- Document rollback times
- Identify and fix rollback issues

### 3. Monitor After Rollback

- Watch for errors
- Monitor performance
- Verify functionality

### 4. Communication

- Notify team of rollback
- Communicate status updates
- Document lessons learned

## Troubleshooting Rollback Issues

### Backup Not Found

**Issue:** Specified backup does not exist

**Solution:**
```bash
# List available backups
ls -la backup/config/

# Use most recent backup
LATEST=$(ls -t backup/config/ | head -1 | sed 's/config_//;s/.tar.gz//')
./scripts/deploy.sh rollback $LATEST
```

### Rollback Fails

**Issue:** Rollback process fails

**Solution:**
1. Check error logs
2. Verify backup integrity
3. Check file permissions
4. Try manual rollback

### Services Won't Start After Rollback

**Issue:** Services fail to start after rollback

**Solution:**
1. Check service logs
2. Verify configuration syntax
3. Check dependencies
4. Try starting services individually

### Data Inconsistency After Rollback

**Issue:** Data is inconsistent after rollback

**Solution:**
1. Verify database integrity
2. Check for partial restores
3. Consider full system rollback
4. Restore from earlier backup if needed

## References

- [Deployment Guide](DEPLOYMENT.md)
- [Monitoring Setup](MONITORING_SETUP.md)
- [Configuration Reference](CONFIGURATION_REFERENCE.md)
