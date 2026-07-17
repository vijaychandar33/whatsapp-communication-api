# Production Deployment (Coolify)

Deployment date: **July 17, 2026**  
Region: **Central India (centralindia)**  
Subscription: **Azure subscription 1** (`1430951b-2576-4461-8c34-f0d88afb5971`)

---

## Quick Access

| Item | Value |
|------|-------|
| **Public IP** | `74.225.185.16` |
| **SSH** | `ssh azureuser@74.225.185.16` |
| **Coolify URL** | http://74.225.185.16:8000 |
| **Coolify Version** | v4.1.2 |
| **Admin Status** | Registered |

### Application (whatsapp-api)

| Item | Value |
|------|-------|
| **App URL** | http://uaakcbe6tb68ol5bb6x0fqyr.74.225.185.16.sslip.io |
| **API Health** | http://uaakcbe6tb68ol5bb6x0fqyr.74.225.185.16.sslip.io/admin/v1/health |
| **Swagger** | http://uaakcbe6tb68ol5bb6x0fqyr.74.225.185.16.sslip.io/docs |
| **GitHub Repo** | https://github.com/vijaychandar33/whatsapp-communication-api |
| **Coolify Project** | Communication Platform → production → whatsapp-api |
| **Compose File** | `Deployment/Production/docker-compose.yml` |
| **Login** | `admin@local` / `Admin123!` |

> **Note:** `http://74.225.185.16:8000` is the **Coolify dashboard** (PaaS admin). Your app runs on **port 80** via Traefik at the sslip.io URL above.

## Files

| File | Purpose |
|------|---------|
| `README.md` | Azure + Coolify infrastructure and app access details |
| `docker-compose.yml` | Production compose stack for Coolify |
| `.env.example` | Environment variables reference for Coolify |

SSH authentication uses key-only access (`~/.ssh/id_rsa`). Password authentication is disabled.

---

## Azure Resource Group

| Property | Value |
|----------|-------|
| **Name** | `Playground` |
| **Location** | `centralindia` |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground` |

---

## Virtual Machine

| Property | Value |
|----------|-------|
| **Name** | `Coolify` |
| **OS** | Ubuntu Server 24.04 LTS Gen2 |
| **Image URN** | `Canonical:ubuntu-24_04-lts:server:latest` |
| **Size** | `Standard_B2ms` (2 vCPU, 8 GB RAM) |
| **Admin Username** | `azureuser` |
| **Private IP** | `10.0.1.4` |
| **Security Type** | Trusted Launch |
| **Secure Boot** | Enabled |
| **vTPM** | Enabled |
| **Boot Diagnostics** | Enabled |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Compute/virtualMachines/Coolify` |

### OS Disk

| Property | Value |
|----------|-------|
| **Size** | 100 GB |
| **Type** | Premium SSD (`Premium_LRS`) |
| **Name** | `Coolify_OsDisk_1_f6a602d2de7544efa96487a11ca87bff` |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Compute/disks/Coolify_OsDisk_1_f6a602d2de7544efa96487a11ca87bff` |

---

## Networking

### Virtual Network

| Property | Value |
|----------|-------|
| **Name** | `coolify-vnet` |
| **Address Space** | `10.0.0.0/16` |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/virtualNetworks/coolify-vnet` |

### Subnet

| Property | Value |
|----------|-------|
| **Name** | `coolify-subnet` |
| **Address Prefix** | `10.0.1.0/24` |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/virtualNetworks/coolify-vnet/subnets/coolify-subnet` |

### Public IP

| Property | Value |
|----------|-------|
| **Name** | `coolify-pip` |
| **IP Address** | `74.225.185.16` |
| **Allocation** | Static |
| **SKU** | Standard |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/publicIPAddresses/coolify-pip` |

### Network Interface

| Property | Value |
|----------|-------|
| **Name** | `coolify-nic` |
| **Private IP** | `10.0.1.4` |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/networkInterfaces/coolify-nic` |

### Network Security Group

| Property | Value |
|----------|-------|
| **Name** | `coolify-nsg` |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/networkSecurityGroups/coolify-nsg` |

#### Inbound Rules

| Rule | Port | Protocol | Priority |
|------|------|----------|----------|
| Allow-SSH | 22 | TCP | 122 |
| Allow-HTTP | 80 | TCP | 180 |
| Allow-HTTPS | 443 | TCP | 543 |
| Allow-Coolify | 8000 | TCP | 200 |

---

## Boot Diagnostics Storage

| Property | Value |
|----------|-------|
| **Name** | `playgroundbootdiag01` |
| **Endpoint** | `https://playgroundbootdiag01.blob.core.windows.net/` |
| **Resource ID** | `/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Storage/storageAccounts/playgroundbootdiag01` |

---

## Installed Software

| Component | Version |
|-----------|---------|
| **Docker Engine** | 29.6.2 |
| **Docker Compose Plugin** | v5.3.1 |
| **Coolify** | 4.1.2 |

### Coolify Containers

| Container | Status | Ports |
|-----------|--------|-------|
| `coolify` | Healthy | `0.0.0.0:8000->8080/tcp` |
| `coolify-db` | Healthy | `5432/tcp` |
| `coolify-redis` | Healthy | `6379/tcp` |
| `coolify-realtime` | Healthy | `6001-6002/tcp` |

Default server in Coolify dashboard: **`localhost`** (do not delete).

---

## Authentication

- **SSH:** Key-based only (`id_rsa` public key installed at provisioning)
- **Password auth:** Disabled (`PasswordAuthentication no`)
- **Coolify:** Admin account registered via web UI

---

## Important Paths on VM

| Path | Description |
|------|-------------|
| `/data/coolify/source/.env` | Coolify environment variables (backup this) |
| `/data/coolify/source/installation-20260717-095613.log` | Installation log |
| `/data/coolify/source/upgrade-2026-07-17-09-56-17.log` | Upgrade log |

---

## Useful Commands

```bash
# SSH into VM
ssh azureuser@74.225.185.16

# Check Coolify containers
docker ps

# View Coolify logs
docker logs coolify -f

# Backup Coolify env file
sudo cp /data/coolify/source/.env ~/coolify-env-backup-$(date +%Y%m%d).env
```

### Azure CLI

```bash
# VM status
az vm show -g Playground -n Coolify -d --query "{powerState:powerState, publicIp:publicIps}" -o json

# List all resources
az resource list -g Playground -o table

# Restart VM
az vm restart -g Playground -n Coolify
```

---

## Next Steps

1. Back up `/data/coolify/source/.env` to a secure location
2. Configure a custom domain and enable HTTPS in Coolify
3. Consider restricting NSG source IPs for SSH (port 22) in production

---

## All Resource IDs

```
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/virtualNetworks/coolify-vnet
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/virtualNetworks/coolify-vnet/subnets/coolify-subnet
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/publicIPAddresses/coolify-pip
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/networkSecurityGroups/coolify-nsg
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Network/networkInterfaces/coolify-nic
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Compute/virtualMachines/Coolify
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Compute/disks/Coolify_OsDisk_1_f6a602d2de7544efa96487a11ca87bff
/subscriptions/1430951b-2576-4461-8c34-f0d88afb5971/resourceGroups/Playground/providers/Microsoft.Storage/storageAccounts/playgroundbootdiag01
```
