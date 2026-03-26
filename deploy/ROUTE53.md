# Route 53 setup for `app.<your-domain>`

The ALB template (`cloudformation-alb-https.yaml`) creates:

1. **ACM certificate** — DNS validation records in the hosted zone you pass as `HostedZoneId`.
2. **Alias A record** — `DomainName` → your Application Load Balancer.

## Requirements

| Item | Detail |
|------|--------|
| **Hosted zone** | Must be the **public** hosted zone for the **parent** domain (e.g. `fourwalls-trading.biz`), not a random zone ID. |
| **DomainName** | Full hostname, e.g. `app.fourwalls-trading.biz`. Must be a name you can create **inside** that zone. |
| **Registrar** | At your domain registrar, **name servers** must be the **four NS records** from this Route 53 hosted zone. If they still point to GoDaddy/Cloudflare/etc., Route 53 records (including the ALB alias) **will not** be used on the public internet. |

## Common mistakes

1. **Wrong `HostedZoneId`** — Pasted a zone for another domain or a **private** hosted zone.
2. **No delegation** — Domain registered elsewhere; NS never updated to Route 53.
3. **Manual duplicate** — An old **A** or **CNAME** for `app` conflicts with the stack; remove duplicates or let CloudFormation own the record.
4. **Subdomain elsewhere** — DNS for `fourwalls-trading.biz` hosted on Cloudflare while you only created a record in Route 53; traffic never hits Route 53.

## Verify

```powershell
.\deploy\verify-route53.ps1 `
  -DomainName "app.fourwalls-trading.biz" `
  -HostedZoneId "Z09530791VWENDU111DCC" `
  -AlbStackName "livetrading-alb-https" `
  -Region "ap-south-1"
```

CLI:

```bash
aws route53 get-hosted-zone --id Z09530791VWENDU111DCC
aws route53 list-resource-record-sets --hosted-zone-id Z09530791VWENDU111DCC --query "ResourceRecordSets[?contains(Name, 'app.')]"
```

Public check: `nslookup app.fourwalls-trading.biz` should eventually match the ALB DNS name from the stack output (alias resolution).

## Redeploy / fix record only

Re-run `deploy-alb-https.ps1` with the **same** `DomainName` and **correct** `HostedZoneId`, or update the stack in the CloudFormation console (Route 53 record is the `DnsRecord` resource).
