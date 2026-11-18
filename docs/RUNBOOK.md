# VedaVoice Production Operations & Runbook

Operational procedures, incident response, rollback steps, and secret rotation for the VedaVoice platform on Azure & LiveKit Cloud.

---

## 1. Zero-Downtime Deployment & Verification

Deployments are triggered automatically when commits merge to `main`. To manually trigger a release:

```bash
# Trigger GitHub Actions deployment workflow
gh workflow run deploy.yml --ref main
```

### Verification Checklist:
1. Check Container Apps revision status:
   ```bash
   az containerapp revision list -n api -g rg-vagency-prod -o table
   ```
2. Run automated post-deployment smoke test:
   ```bash
   python scripts/smoke_test_prod.py --base-url "https://api.yourdomain.com"
   ```
3. Test a live inbound voice call:
   ```bash
   python scripts/test_live_call.py
   ```

---

## 2. Rollback Procedures

### Container Apps Revision Rollback
Azure Container Apps maintains revision history. If a new release exhibits errors:

1. List available active revisions:
   ```bash
   az containerapp revision list -n api -g rg-vagency-prod -o table
   ```
2. Direct 100% of traffic back to the previous stable revision:
   ```bash
   az containerapp ingress traffic set \
       -n api \
       -g rg-vagency-prod \
       --revision-weight <STABLE_REVISION_NAME>=100
   ```

### Database Migration Rollback (Alembic)
If a migration fails or must be rolled back:
1. Connect via Azure Cloud Shell or bastion:
   ```bash
   alembic -c api/alembic.ini downgrade -1
   ```
2. Verify table state and indexes.

### LiveKit Agent Rollback
If a voice worker deployment misbehaves:
```bash
cd agent
lk agent rollback
```

---

## 3. Secret Rotation Procedures

### Quarterly Key Rotation Schedule:
1. **LiveKit API Secret**:
   - Generate a secondary API key/secret in the LiveKit Cloud dashboard.
   - Update in Azure Key Vault:
     ```bash
     az keyvault secret set --vault-name kv-vagency-prod-xxxx --name LIVEKIT-API-SECRET --value "<NEW_SECRET>"
     ```
   - Restart the Container Apps to pick up the new secret:
     ```bash
     az containerapp revision restart -n api -g rg-vagency-prod
     ```
   - Revoke old API secret in LiveKit Cloud.

2. **Internal Service Signing Key**:
   - Update `INTERNAL_SIGNING_KEY` in Key Vault.
   - Restart `api`, `dialer`, and `notifier` simultaneously.

---

## 4. Incident Response & Alerts

| Alert | Immediate Action |
|---|---|
| **High API 5xx Rate (> 2%)** | Check App Insights traces (`requests \| where resultCode startswith '5'`). Inspect container logs: `az containerapp logs show -n api -g rg-vagency-prod --tail 100`. Roll back revision if needed. |
| **High Latency SLA (> 2.5s)** | Check database query performance in PostgreSQL Flexible Server metrics. Verify connection pool saturation in PgBouncer. |
| **PostgreSQL High CPU (> 75%)** | Inspect active queries in `pg_stat_activity`. Scale up SKU tier from `Standard_D2ds_v5` to `Standard_D4ds_v5` if sustained peak load. |
| **PostgreSQL High Storage (> 75%)** | Auto-grow is enabled. If approaching limit, trigger manual storage increase or prune old call audio files. |
| **Agent Disconnects / WebRTC Dropped** | Check LiveKit Cloud project status and approved concurrency limit. Request quota increase if approaching 80% ceiling. |
